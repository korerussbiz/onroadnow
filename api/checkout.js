const { computePrice } = require('../lib/pricing');

const PRODUCTS = {
  'jerk-sauce-001': { name: 'Authentic Jamaican Jerk Sauce', baseCostJMD: 450,  packagingJMD: 80,  localDeliveryJMD: 200, weight_kg: 0.5, image: '/images/products/jerk-sauce.jpg' },
  'bmg-coffee-001': { name: 'Blue Mountain Coffee (454g)',   baseCostJMD: 3800, packagingJMD: 150, localDeliveryJMD: 200, weight_kg: 0.6, image: '/images/products/bmg-coffee.jpg' },
  'sea-moss-001':   { name: 'Wildcrafted Sea Moss Gel (4oz)',baseCostJMD: 1950, packagingJMD: 100, localDeliveryJMD: 200, weight_kg: 0.3, image: '/images/products/sea-moss.jpg' },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { items, destination } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No items' });

    const lineItems = items.map(({ productId, quantity }) => {
      const product = PRODUCTS[productId];
      if (!product) throw new Error(`Unknown product: ${productId}`);
      const q = computePrice(product, destination);
      return {
        price_data: {
          currency: q.currency.toLowerCase(),
          product_data: { name: product.name, images: [product.image] },
          unit_amount: Math.round(q.totalLocal * 100),
        },
        quantity: quantity || 1,
      };
    });

    const origin = req.headers.origin || 'https://onroadnow.vercel.app';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}/products?success=1`,
      cancel_url: `${origin}/products`,
      metadata: { destination, source: 'onroadnow-sales' },
      shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'JM'] },
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
