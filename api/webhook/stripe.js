module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  // Vercel parses JSON before this runs. For signature verification we need the raw body.
  // The cleanest fix: use Stripe's test helper to reconstruct from parsed JSON isn't reliable.
  // Instead, tell Vercel to skip body parsing by exporting config.
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
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
};

// Disable body parsing so Stripe signature verification works on raw bytes
module.exports.config = { api: { bodyParser: false } };
