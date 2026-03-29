const https = require('https');
const crypto = require('crypto');

const API_HOST = 'api.tournamenttracker.buenosaireshockey.ar';
const PASSPHRASE = 'uweoEVNeycw7CFBXtHNCy3nbJZmUPl0EosXGRrNDgdU=';
const AES_KEY = Buffer.from(PASSPHRASE, 'base64'); // 32 bytes

function decrypt(hexStr) {
  // Formato: "ivHex:cipherHex"
  const colonIdx = hexStr.indexOf(':');
  if (colonIdx === 32) {
    const iv = Buffer.from(hexStr.substring(0, 32), 'hex');
    const cipher = Buffer.from(hexStr.substring(33), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', AES_KEY, iv);
    decipher.setAutoPadding(true);
    return Buffer.concat([decipher.update(cipher), decipher.final()]).toString('utf8');
  }
  // Fallback: sin IV, usar zeros
  const iv = Buffer.alloc(16, 0);
  const cipher = Buffer.from(hexStr, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', AES_KEY, iv);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(cipher), decipher.final()]).toString('utf8');
}

function apiRequest(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST, port: 443, path,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Origin': 'https://tournamenttracker.buenosaireshockey.ar',
        'Referer': 'https://tournamenttracker.buenosaireshockey.ar/',
        'User-Agent': 'Mozilla/5.0',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const path = req.query.path || '/';

  try {
    const { status, body } = await apiRequest(path);
    const trimmed = body.trim();

    // Intentar parsear como JSON
    try {
      const parsed = JSON.parse(trimmed);
      const keys = Object.keys(parsed);

      // Array de chars hex (keys 0,1,2,...) → reconstruir y desencriptar
      if (keys.length > 100 && keys[0] === '0' && keys[1] === '1') {
        const hexStr = Object.values(parsed).join('');
        try {
          const decrypted = decrypt(hexStr);
          res.setHeader('Content-Type', 'application/json');
          return res.status(200).send(decrypted);
        } catch (e) {
          return res.status(200).json({
            error: 'decrypt_failed', message: e.message,
            hex_sample: hexStr.substring(0, 64)
          });
        }
      }

      // JSON normal — devolver tal cual
      res.setHeader('Content-Type', 'application/json');
      return res.status(status).send(trimmed);
    } catch (_) {}

    // Raw text
    res.setHeader('Content-Type', 'text/plain');
    return res.status(status).send(trimmed);

  } catch (e) {
    return res.status(502).json({ error: 'proxy_error', message: e.message });
  }
};
