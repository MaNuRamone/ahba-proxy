const https = require('https');
const crypto = require('crypto');

const API_BASE = 'api.tournamenttracker.buenosaireshockey.ar';
const PASSPHRASE = 'uweoEVMeycw7CFBXtHNCy3nb3ZmUPl0EosXGRrNDgdU=';

function decryptAES(ciphertext, passphrase) {
  try {
    const ct = Buffer.from(ciphertext, 'base64');
    const salt = ct.slice(8, 16);
    const encrypted = ct.slice(16);
    const passphraseBuffer = Buffer.from(passphrase, 'utf8');

    let d = Buffer.alloc(0);
    let d_i = Buffer.alloc(0);
    while (d.length < 48) {
      d_i = crypto.createHash('md5').update(Buffer.concat([d_i, passphraseBuffer, salt])).digest();
      d = Buffer.concat([d, d_i]);
    }
    const key = d.slice(0, 32);
    const iv = d.slice(32, 48);

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    try {
      const key = crypto.createHash('sha256').update(passphrase).digest();
      const iv = Buffer.alloc(16, 0);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      const ct = Buffer.from(ciphertext, 'base64');
      const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
      return decrypted.toString('utf8');
    } catch(e2) {
      return null;
    }
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const path = req.query.path || '/';

  const options = {
    hostname: API_BASE,
    port: 443,
    path: path,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Origin': 'https://tournamenttracker.buenosaireshockey.ar',
      'Referer': 'https://tournamenttracker.buenosaireshockey.ar/',
      'User-Agent': 'Mozilla/5.0 (compatible)',
    },
  };

  return new Promise((resolve) => {
    const request = https.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        const trimmed = data.trim();
        let result = null;

        try {
          JSON.parse(trimmed);
          result = trimmed;
        } catch(_) {
          result = decryptAES(trimmed, PASSPHRASE);
        }

        res.setHeader('Content-Type', 'application/json');
        if (result) {
          res.status(200).send(result);
        } else {
          res.status(200).json({
            error: 'decrypt_failed',
            raw_length: trimmed.length,
            raw_preview: trimmed.substring(0, 120)
          });
        }
        resolve();
      });
    });

    request.on('error', (err) => {
      res.status(502).json({ error: 'Proxy error', detail: err.message });
      resolve();
    });

    request.end();
  });
};
