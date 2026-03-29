const https = require('https');
const crypto = require('crypto');

const API_HOST = 'api.tournamenttracker.buenosaireshockey.ar';
const PASSPHRASE = 'uweoEVMeycw7CFBXtHNCy3nb3ZmUPl0EosXGRrNDgdU=';

function evpBytesToKey(password, salt, keyLen, ivLen) {
  const pass = Buffer.from(password, 'utf8');
  let d = Buffer.alloc(0), di = Buffer.alloc(0);
  while (d.length < keyLen + ivLen) {
    di = crypto.createHash('md5').update(Buffer.concat([di, pass, salt])).digest();
    d = Buffer.concat([d, di]);
  }
  return { key: d.slice(0, keyLen), iv: d.slice(keyLen, keyLen + ivLen) };
}

function decryptHex(hexStr, passphrase) {
  const cipherBuf = Buffer.from(hexStr, 'hex');
  const header = cipherBuf.slice(0, 8).toString('ascii');
  let key, iv, encrypted;
  if (header === 'Salted__') {
    const salt = cipherBuf.slice(8, 16);
    encrypted = cipherBuf.slice(16);
    ({ key, iv } = evpBytesToKey(passphrase, salt, 32, 16));
  } else {
    ({ key, iv } = evpBytesToKey(passphrase, Buffer.alloc(8, 0), 32, 16));
    encrypted = cipherBuf;
  }
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
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

    // 1. ¿Ya es JSON válido?
    try {
      const parsed = JSON.parse(trimmed);

      // ¿Es el objeto con keys numéricas? → reconstruir hex y desencriptar
      const keys = Object.keys(parsed);
      if (keys.length > 100 && keys[0] === '0' && keys[1] === '1') {
        const hexStr = Object.values(parsed).join('');
        try {
          const decrypted = decryptHex(hexStr, PASSPHRASE);
          res.setHeader('Content-Type', 'application/json');
          return res.status(200).send(decrypted);
        } catch (e) {
          return res.status(200).json({ error: 'decrypt_failed', message: e.message, hex_preview: hexStr.substring(0, 80) });
        }
      }

      // JSON normal — devolver tal cual
      res.setHeader('Content-Type', 'application/json');
      return res.status(status).send(trimmed);
    } catch (_) {}

    // 2. ¿Es hex string directo?
    if (/^[0-9a-f]+$/i.test(trimmed)) {
      try {
        const decrypted = decryptHex(trimmed, PASSPHRASE);
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).send(decrypted);
      } catch (e) {
        return res.status(200).json({ error: 'decrypt_hex_failed', message: e.message });
      }
    }

    // 3. Devolver raw
    res.setHeader('Content-Type', 'text/plain');
    return res.status(status).send(trimmed);

  } catch (e) {
    return res.status(502).json({ error: 'proxy_error', message: e.message });
  }
};
