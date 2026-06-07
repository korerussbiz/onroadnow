const axios = require('axios');

module.exports = async (req, res) => {
  const url = req.url;
  const method = req.method;

  res.setHeader('Access-Control-Allow-Origin', 'https://onroadnow.vercel.app');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') return res.status(200).end();

  // Only keep the nearby places proxy
  if (url.startsWith('/api/nearby')) {
    const { lat, lon, radius = 2000 } = req.query;
    const query = `[out:json];(node["shop"](around:${radius},${lat},${lon});node["amenity"="restaurant"](around:${radius},${lat},${lon});node["amenity"="cafe"](around:${radius},${lat},${lon});node["amenity"="pharmacy"](around:${radius},${lat},${lon});node["shop"="supermarket"](around:${radius},${lat},${lon}););out body;`;
    try {
      const response = await axios.post('https://overpass-api.de/api/interpreter', `data=${query}`, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      res.status(200).json(response.data);
    } catch (err) { res.status(500).json({ error: err.message }); }
    return;
  }

  res.status(404).json({ error: 'Not found' });
};
