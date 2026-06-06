const axios = require('axios');
let requests = [];
let users = []; // In-memory user store; replace with database later

module.exports = async (req, res) => {
  const url = req.url;
  const { method } = req;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') return res.status(200).end();

  // Nearby places (expanded to all shops, markets, restaurants)
  if (url.startsWith('/api/nearby')) {
    const { lat, lon, radius = 1000 } = req.query;
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const query = `
      [out:json];
      (
        node["shop"](around:${radius},${lat},${lon});
        node["amenity"="restaurant"](around:${radius},${lat},${lon});
        node["amenity"="cafe"](around:${radius},${lat},${lon});
        node["amenity"="pharmacy"](around:${radius},${lat},${lon});
        node["shop"="supermarket"](around:${radius},${lat},${lon});
        node["amenity"="marketplace"](around:${radius},${lat},${lon});
        node["shop"="mall"](around:${radius},${lat},${lon});
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

  // Create or list delivery requests
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

  // Accept a request
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

  // Save user profile (ID, TRN, etc.)
  if (url === '/api/user' && method === 'POST') {
    const { uid, displayName, email, idNumber, trn, role } = req.body;
    const existing = users.find(u => u.uid === uid);
    if (existing) {
      Object.assign(existing, { idNumber, trn, role });
      res.status(200).json(existing);
    } else {
      const newUser = { uid, displayName, email, idNumber, trn, role, verified: false };
      users.push(newUser);
      res.status(200).json(newUser);
    }
    return;
  }

  res.status(404).json({ error: 'Not found' });
};
