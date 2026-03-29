const https = require('https');

const API_BASE = 'api.tournamenttracker.buenosaireshockey.ar';

module.exports = async (req, res) => {
  // CORS — permitir cualquier origen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // El path que se pasa como query: /api/proxy?path=/torneos/00000461
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
        res.setHeader('Content-Type', 'application/json');
        res.status(apiRes.statusCode).send(data);
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
