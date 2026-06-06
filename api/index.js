const axios = require('axios');
let requests = [];

module.exports = async (req, res) => {
  const url = req.url;
  const { method } = req;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') return res.status(200).end();

  if (url.startsWith('/api/nearby')) {
    const { lat, lon, radius = 500 } = req.query;
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const query = `
      [out:json];
      (
        node["amenity"="restaurant"](around:${radius},${lat},${lon});
        node["shop"](around:${radius},${lat},${lon});
        node["amenity"="cafe"](around:${radius},${lat},${lon});
        node["amenity"="pharmacy"](around:${radius},${lat},${lon});
        node["shop"="supermarket"](around:${radius},${lat},${lon});
      );
      out body;
    `;
    try {
      const response = await axios.post(overpassUrl, `data=${query}`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      res.status(200).json(response.data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (url === '/api/requests') {
    if (method === 'POST') {
      const request = { id: Date.now(), ...req.body, status: 'open' };
      requests.push(request);
      res.status(200).json(request);
    } else if (method === 'GET') {
      res.status(200).json(requests);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
    return;
  }

  if (url.startsWith('/api/accept')) {
    const id = parseInt(req.query.id);
    const request = requests.find(r => r.id === id);
    if (!request) return res.status(404).json({ error: 'Not found' });
    if (request.paymentMethod === 'deliverer_fronts') {
      request.status = 'accepted_by_deliverer';
    } else {
      request.status = 'accepted';
    }
    res.status(200).json(request);
    return;
  }

  res.status(404).json({ error: 'Not found' });
};
