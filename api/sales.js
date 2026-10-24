// Standalone serverless function for /api/quote, /api/checkout, /api/webhook/stripe
const express = require('express');
const app = express();

const { computePrice } = require('../lib/pricing');
const { computeCommission } = require('../lib/commission');

const PRODUCTS = {
  'jerk-sauce-001': { name: 'Authentic Jamaican Jerk Sauce', baseCostJMD: 450,  packagingJMD: 80,  localDeliveryJMD: 200, weight_kg: 0.5, image: '/images/products/jerk-sauce.jpg' },
  'bmg-coffee-001': { name: 'Blue Mountain Coffee (454g)',   baseCostJMD: 3800, packagingJMD: 150, localDeliveryJMD: 200, weight_kg: 0.6, image: '/images/products/bmg-coffee.jpg' },
  'sea-moss-001':   { name: 'Wildcrafted Sea Moss Gel (4oz)',baseCostJMD: 1950, packagingJMD: 100, localDeliveryJMD: 200, weight_kg: 0.3, image: '/images/products/sea-moss.jpg' },
};

// WEBHOOK FIRST — Stripe needs the raw body for signature verification
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const order = {
      id: s.id,
      amount: (s.amount_total / 100).toFixed(2),
      currency: s.currency.toUpperCase(),
      customer_email: s.customer_details?.email,
      customer_name: s.customer_details?.name,
      destination: s.metadata?.destination,
      shipping: s.shipping_details?.address,
    };
    if (process.env.BREVO_API_KEY) {
      fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { email: 'orders@onroadnow.vercel.app', name: 'OnRoadNow Orders' },
          to: [{ email: 'korerussbiz@gmail.com' }],
          subject: `New order ${order.id} — ${order.amount} ${order.currency}`,
          htmlContent: `<h2>New order</h2><p><b>${order.amount} ${order.currency}</b></p><p>${order.customer_name} &lt;${order.customer_email}&gt;</p><p>Destination: ${order.destination}</p><pre>${JSON.stringify(order.shipping, null, 2)}</pre>`,
        }),
      }).catch(e => console.error('brevo:', e.message));
    }
    console.log('ORDER', JSON.stringify(order));
  }
  res.json({ received: true });
});

// JSON body for the rest
app.use(express.json());

app.post('/api/quote', (req, res) => {
  const { productId, destination } = req.body || {};
  const product = PRODUCTS[productId];
  if (!product) return res.status(404).json({ error: 'Unknown product' });
  if (!destination) return res.status(400).json({ error: 'Destination required' });
  try {
    res.json({ product: product.name, ...computePrice(product, destination) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/checkout', async (req, res) => {
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
    console.error('checkout:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sales/health', (_req, res) => res.json({ ok: true }));

module.exports = app;
