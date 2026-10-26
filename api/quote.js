const { computePrice } = require('../lib/pricing.js');

const PRODUCTS = {
  'jerk-sauce-001': { name: 'Authentic Jamaican Jerk Sauce', baseCostJMD: 450,  packagingJMD: 80,  localDeliveryJMD: 200, weight_kg: 0.5, image: '/images/products/jerk-sauce.jpg' },
  'bmg-coffee-001': { name: 'Blue Mountain Coffee (454g)',   baseCostJMD: 3800, packagingJMD: 150, localDeliveryJMD: 200, weight_kg: 0.6, image: '/images/products/bmg-coffee.jpg' },
  'sea-moss-001':   { name: 'Wildcrafted Sea Moss Gel (4oz)',baseCostJMD: 1950, packagingJMD: 100, localDeliveryJMD: 200, weight_kg: 0.3, image: '/images/products/sea-moss.jpg' },
};

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { productId, destination } = req.body || {};
  const product = PRODUCTS[productId];
  if (!product) return res.status(404).json({ error: 'Unknown product' });
  if (!destination) return res.status(400).json({ error: 'Destination required' });
  try {
    res.json({ product: product.name, ...computePrice(product, destination) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
