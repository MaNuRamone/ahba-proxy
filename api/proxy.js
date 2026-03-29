const https = require('https');
const crypto = require('crypto');

const API_HOST = 'api.tournamenttracker.buenosaireshockey.ar';
const PASSPHRASE = 'uweoEVNeycw7CFBXtHNCy3nbJZmUPl0EosXGRrNDgdU=';
const AES_KEY = Buffer.from(PASSPHRASE, 'base64');

function decrypt(hexStr) {
  // Formato: 32 chars IV + ":" + cipherHex
  const iv = Buffer.from(hexStr.substring(0, 32), 'hex');
  const cipherHex = hexStr.substring(33); // skip the ":"
  const cipher = Buffer.from(cipherHex, 'hex');
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

    try {
      const parsed = JSON.parse(trimmed);
      const keys = Object.keys(parsed);

      // Array de chars hex — reconstruir EN ORDEN NUMÉRICO
      if (keys.length > 100 && !isNaN(keys[0])) {
        const maxKey = Math.max(...keys.map(Number));
        const chars = new Array(maxKey + 1);
        for (const k of keys) chars[Number(k)] = parsed[k];
        const hexStr = chars.join('');

        try {
          const decrypted = decrypt(hexStr);
          res.setHeader('Content-Type', 'application/json');
          return res.status(200).send(decrypted);
        } catch (e) {
          return res.status(200).json({
            error: 'decrypt_failed', message: e.message,
            hex_len: hexStr.length,
            hex_sample: hexStr.substring(0, 64)
          });
        }
      }

      res.setHeader('Content-Type', 'application/json');
      return res.status(status).send(trimmed);
    } catch (_) {}

    res.setHeader('Content-Type', 'text/plain');
    return res.status(status).send(trimmed);

  } catch (e) {
    return res.status(502).json({ error: 'proxy_error', message: e.message });
  }
};
