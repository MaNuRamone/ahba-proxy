const https = require('https');
const crypto = require('crypto');

const API_HOST = 'api.tournamenttracker.buenosaireshockey.ar';
const PASSPHRASE = 'uweoEVNeycw7CFBXtHNCy3nbJZmUPl0EosXGRrNDgdU=';
const AES_KEY = Buffer.from(PASSPHRASE, 'base64');

function decrypt(hexStr) {
  const colonIdx = hexStr.indexOf(':');
  const iv = Buffer.from(hexStr.substring(0, colonIdx), 'hex');
  const cipher = Buffer.from(hexStr.substring(colonIdx + 1), 'hex');
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

  // Test endpoint
  if (req.query.test) {
    return res.status(200).json({ version: 'v4', key_len: AES_KEY.length, key_prefix: AES_KEY.toString('hex').substring(0,8) });
  }

  const path = req.query.path || '/';

  try {
    const { status, body } = await apiRequest(path);
    const trimmed = body.trim();

    let parsed;
    try { parsed = JSON.parse(trimmed); } catch(_) {
      return res.status(200).json({ error: 'not_json', preview: trimmed.substring(0,50) });
    }

    const keys = Object.keys(parsed);

    // Debug: mostrar info del objeto recibido
    if (req.query.debug) {
      return res.status(200).json({
        total_keys: keys.length,
        first_keys: keys.slice(0,5),
        last_keys: keys.slice(-5),
        first_values: keys.slice(0,5).map(k => parsed[k]),
        sample_reconstructed: keys.slice(0,80).map(k => parsed[k]).join('')
      });
    }

    // Reconstruir hex en orden numérico
    if (keys.length > 100 && !isNaN(keys[0])) {
      const numKeys = keys.map(Number).sort((a,b) => a-b);
      const hexStr = numKeys.map(k => parsed[k]).join('');

      try {
        const decrypted = decrypt(hexStr);
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).send(decrypted);
      } catch (e) {
        return res.status(200).json({
          error: 'decrypt_failed',
          message: e.message,
          hex_len: hexStr.length,
          colon_at: hexStr.indexOf(':'),
          iv_hex: hexStr.substring(0, 32),
          cipher_sample: hexStr.substring(33, 65)
        });
      }
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(status).send(trimmed);

  } catch (e) {
    return res.status(502).json({ error: 'proxy_error', message: e.message });
  }
};
