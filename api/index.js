const admin = require('firebase-admin');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { OAuth2Client } = require('google-auth-library');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const GOOGLE_CLIENT_ID = '134628093591-61nk4mneo6d1o6of5da3e3fijgtd5dd0.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// In-memory fallback (Firestore optional)
let users = [];
let listings = [];
let sales = [];
let requests = [];
let deliveries = [];

module.exports = async (req, res) => {
  const url = req.url;
  const method = req.method;
  const cookies = cookie.parse(req.headers.cookie || '');
  let userId = null;
  if (cookies.token) {
    try {
      const decoded = jwt.verify(cookies.token, JWT_SECRET);
      userId = decoded.userId;
    } catch(e) {}
  }

  res.setHeader('Access-Control-Allow-Origin', 'https://onroadnow.vercel.app');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') return res.status(200).end();

  // ---------- Google OAuth ----------
  if (url === '/api/auth/google' && method === 'POST') {
    const { credential } = req.body;
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const email = payload.email;
      const name = payload.name;
      let user = users.find(u => u.email === email);
      if (!user) {
        const id = Date.now().toString();
        user = { id, email, name, phone: '', role: 'user', createdAt: Date.now() };
        users.push(user);
      }
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      res.setHeader('Set-Cookie', cookie.serialize('token', token, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 604800 }));
      res.status(200).json({ user });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
    return;
  }

  // ---------- Email/Password auth (simplified) ----------
  if (url === '/api/signup' && method === 'POST') {
    const { email, password, name } = req.body;
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'User exists' });
    const id = Date.now().toString();
    users.push({ id, email, passwordHash: 'dummy', name, phone: '', role: 'user', createdAt: Date.now() });
    const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', cookie.serialize('token', token, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 604800 }));
    res.status(200).json({ user: { id, email, name } });
    return;
  }
  if (url === '/api/login' && method === 'POST') {
    const { email } = req.body;
    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', cookie.serialize('token', token, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 604800 }));
    res.status(200).json({ user });
    return;
  }
  if (url === '/api/logout' && method === 'POST') {
    res.setHeader('Set-Cookie', cookie.serialize('token', '', { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 0 }));
    res.status(200).json({ message: 'Logged out' });
    return;
  }
  if (url === '/api/me' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.status(200).json({ id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role });
    return;
  }
  if (url === '/api/user' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const user = users.find(u => u.id === userId);
    if (user) Object.assign(user, req.body);
    res.status(200).json({ message: 'Profile updated' });
    return;
  }

  // ---------- Marketplace listings ----------
  if (url === '/api/listings' && method === 'GET') {
    res.status(200).json(listings.filter(l => l.status === 'active'));
    return;
  }
  if (url === '/api/listings' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Login required' });
    const { title, description, price, feePercent } = req.body;
    const newListing = {
      id: Date.now(),
      sellerId: userId,
      title, description,
      price: parseFloat(price),
      feePercent: feePercent || 2,
      status: 'active',
      createdAt: Date.now()
    };
    listings.push(newListing);
    res.status(200).json(newListing);
    return;
  }
  if (url === '/api/listings' && method === 'DELETE') {
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const currentUser = users.find(u => u.id === userId);
    if (currentUser?.email !== 'admin@korerussbiz.com') return res.status(403).json({ error: 'Admin only' });
    const { id } = req.body;
    const index = listings.findIndex(l => l.id === parseInt(id));
    if (index === -1) return res.status(404).json({ error: 'Listing not found' });
    listings.splice(index, 1);
    res.status(200).json({ message: 'Listing removed' });
    return;
  }
  if (url === '/api/purchase' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Login required' });
    const { listingId } = req.body;
    const listing = listings.find(l => l.id === parseInt(listingId));
    if (!listing || listing.status !== 'active') return res.status(404).json({ error: 'Not available' });
    const feeAmount = (listing.price * listing.feePercent) / 100;
    const sale = {
      saleId: Date.now(),
      listingId: listing.id,
      sellerId: listing.sellerId,
      buyerId: userId,
      amount: listing.price,
      fee: feeAmount,
      timestamp: Date.now()
    };
    sales.push(sale);
    listing.status = 'sold';
    res.status(200).json(sale);
    return;
  }
  if (url === '/api/sales' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Login required' });
    const userSales = sales.filter(s => s.sellerId === userId || s.buyerId === userId);
    res.status(200).json(userSales);
    return;
  }

  // ---------- Nearby places proxy ----------
  if (url.startsWith('/api/nearby')) {
    const { lat, lon, radius = 2000 } = req.query;
    const query = `[out:json];(node["shop"](around:${radius},${lat},${lon});node["amenity"="restaurant"](around:${radius},${lat},${lon});node["amenity"="cafe"](around:${radius},${lat},${lon});node["amenity"="pharmacy"](around:${radius},${lat},${lon});node["shop"="supermarket"](around:${radius},${lat},${lon}););out body;`;
    try {
      const response = await axios.post('https://overpass-api.de/api/interpreter', `data=${query}`, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      res.status(200).json(response.data);
    } catch (err) { res.status(500).json({ error: err.message }); }
    return;
  }

  // ---------- Delivery requests ----------
  if (url === '/api/requests') {
    if (method === 'POST') {
      if (!userId) return res.status(401).json({ error: 'Login required' });
      const request = { id: Date.now(), ...req.body, userId, status: 'open' };
      requests.push(request);
      res.status(200).json(request);
    } else if (method === 'GET') {
      res.status(200).json(requests);
    } else res.status(405).end();
    return;
  }
  if (url.startsWith('/api/accept')) {
    const id = parseInt(req.query.id);
    const request = requests.find(r => r.id === id);
    if (!request) return res.status(404).json({ error: 'Not found' });
    request.status = 'accepted';
    request.delivererId = req.body.delivererId;
    request.delivererName = req.body.delivererName;
    res.status(200).json(request);
    return;
  }
  if (url === '/api/offerLoan' && method === 'POST') { res.status(200).json({}); return; }
  if (url === '/api/confirmDelivery' && method === 'POST') { res.status(200).json({}); return; }
  if (url === '/api/updateLocation' && method === 'POST') { res.status(200).json({}); return; }
  if (url.startsWith('/api/getLocation')) { res.status(200).json({ location: null }); return; }


// ---------- Per‑user Auto‑Trader endpoints ----------
if (url === '/api/auto-trader/start' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const state = getUserTraderState(userId);
  state.running = true;
  addTraderLog(userId, 'Trader started');
  res.status(200).json({ message: 'started' });
  return;
}
if (url === '/api/auto-trader/stop' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const state = getUserTraderState(userId);
  state.running = false;
  addTraderLog(userId, 'Trader stopped');
  res.status(200).json({ message: 'stopped' });
  return;
}
if (url === '/api/auto-trader/status' && method === 'GET') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const state = getUserTraderState(userId);
  res.status(200).json({ running: state.running, userProfit: state.userProfit, ownerFees: state.ownerFees, log: state.log });
  return;
}
if (url === '/api/auto-trader/report-profit' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { profitJMD, feePercent } = req.body;
  if (!profitJMD || profitJMD <= 0) return res.status(400).json({ error: 'Invalid profit' });
  const fee = profitJMD * (Math.min(10, Math.max(3, feePercent)) / 100);
  const userGain = profitJMD - fee;
  const state = getUserTraderState(userId);
  state.userProfit += userGain;
  state.ownerFees += fee;
  addTraderLog(userId, `Trade: profit ${profitJMD} JMD, fee ${feePercent}% → user +${userGain}, owner +${fee}`);
  res.status(200).json({ userGain, fee, newUserBalance: state.userProfit, newOwnerFees: state.ownerFees });
  return;
}

  res.status(404).json({ error: 'Not found' });
};

// ---------- Accept Terms (record acceptance) ----------
if (url === '/api/accept-terms' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = users.find(u => u.id === userId);
  if (user) {
    user.termsAccepted = Date.now();
    res.status(200).json({ message: 'Terms accepted' });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
  return;
}

// ---------- Auto‑Trader API ----------
// In-memory status (replace with Firestore later)
let botStatus = {
  running: false,
  lastRun: null,
  earnings: 0,
  users: [] // list of user IDs who have paid for access
};

// Check if user has paid for bot access
async function hasBotAccess(userId) {
  if (!userId) return false;
  // For now, check if user email is admin (free) or if they have a 'bot_access' field
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return false;
  const user = userDoc.data();
  return user.botAccess === true || user.email === 'admin@korerussbiz.com';
}

// Endpoint to get bot status (public, but we can restrict later)
if (url === '/api/bot/status' && method === 'GET') {
  res.status(200).json({ running: botStatus.running, lastRun: botStatus.lastRun, earnings: botStatus.earnings });
  return;
}

// Endpoint to start/stop bot (requires payment or admin)
if (url === '/api/bot/control' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Login required' });
  const hasAccess = await hasBotAccess(userId);
  if (!hasAccess) return res.status(403).json({ error: 'Access denied. Please purchase bot access.' });
  const { action } = req.body;
  if (action === 'start') {
    if (botStatus.running) return res.status(400).json({ error: 'Bot already running' });
    // Here you would actually start the bot process (e.g., spawn a child process)
    // For demo, just set flag
    botStatus.running = true;
    botStatus.lastRun = Date.now();
    res.status(200).json({ message: 'Bot started' });
  } else if (action === 'stop') {
    botStatus.running = false;
    res.status(200).json({ message: 'Bot stopped' });
  } else {
    res.status(400).json({ error: 'Invalid action' });
  }
  return;
}

// Endpoint to grant bot access after payment (webhook or manual)
if (url === '/api/bot/grant' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { paymentId, amount } = req.body;
  // In production, verify payment with PayPal/Stripe
  // For now, just grant access
  await db.collection('users').doc(userId).set({ botAccess: true }, { merge: true });
  res.status(200).json({ message: 'Access granted' });
  return;
}

// ---------- Auto-Trader endpoint with fee (3-10%) and earnings to Korey D. Russell ----------
// This is a simulation; real trading would require external bot and payment processing.
if (url === '/api/auto-trader/start' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { amount } = req.body;
  if (!amount || amount < 100) return res.status(400).json({ error: 'Minimum amount 100 JMD' });
  
  // Simulate a trading run (in real implementation, you'd call an external bot)
  // Fee is between 3% and 10% (random for simulation)
  const feePercent = Math.floor(Math.random() * (10 - 3 + 1) + 3);
  const fee = (amount * feePercent) / 100;
  const netAfterFee = amount - fee;
  // Simulated profit (could be negative, but for demo we'll assume small gain)
  const profit = netAfterFee * 0.05; // 5% profit
  const totalEarned = netAfterFee + profit;
  const earningsToKorey = totalEarned * 0.8; // 80% to user, 20% to platform (already took fee, but for demo)
  // In reality, you'd store the earnings in a user's wallet and send to your address.

  // For demonstration, we'll just return a summary.
  // The actual transfer of funds would require a payment processor (Stripe, etc.) or crypto.
  console.log(`Auto-trader activated for user ${userId}, invested ${amount} JMD, fee ${feePercent}% (${fee} JMD), total earned ${totalEarned} JMD`);
  
  // Here you would trigger a real payment to your wallet (Korey D. Russell)
  // For now, we log it.
  res.status(200).json({
    message: "Auto‑trader simulation complete.",
    invested: amount,
    feePercent,
    fee,
    netAfterFee,
    profit,
    totalEarned,
    note: "Earnings will be sent to Korey D. Russell's wallet (simulated). In production, you would integrate Stripe/PayPal/crypto."
  });
  return;
}

// ---------- Auto‑Trader start (real fee, no simulation) ----------
if (url === '/api/auto-trader/start' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { amount, currency } = req.body;
  if (!amount || amount < 10) return res.status(400).json({ error: 'Minimum 10 JMD' });
  
  // For now, return a fake payment URL – replace with Stripe/PayPal integration later
  // The fee will be deducted from the profit after the trade (handled by worker).
  const paymentUrl = `https://buy.stripe.com/test_000`; // Placeholder
  res.status(200).json({ message: `Investment of ${amount} ${currency} accepted. Trading will start after payment.`, paymentUrl });
  // In real implementation, you would create a Stripe checkout session and return the URL.
  return;
}

// ---------- Auto‑Trader state (in‑memory; replace with DB later) ----------
let traderState = {
  running: false,
  userProfit: 0,      // profit earned by the current user (JMD)
  ownerFees: 0,       // fees collected for platform owner
  log: []
};

// Helper to add log entry
function addLog(msg) {
  traderState.log.unshift(`[${new Date().toISOString()}] ${msg}`);
  if (traderState.log.length > 100) traderState.log.pop();
}

// ---------- Start Auto‑Trader (real trading) ----------
if (url === '/api/auto-trader/start' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  if (traderState.running) return res.status(400).json({ error: 'Already running' });
  traderState.running = true;
  addLog(`Trader started by user ${userId}`);

  // Simulate real trading loop (replace with actual bot logic)
  // In a real implementation, this would run a separate thread/process.
  // For demo, we use a setInterval (but careful – Vercel doesn't support long-running).
  // We'll store a flag and use a background worker or external cron.
  // Since Vercel is serverless, we recommend using a separate VPS or a cron job that calls an API.
  // For now, we'll just mark as running and let an external process handle trades.
  res.status(200).json({ message: 'Auto‑trader started (background process will handle trades).' });
  return;
}

// ---------- Stop Auto‑Trader ----------
if (url === '/api/auto-trader/stop' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  traderState.running = false;
  addLog(`Trader stopped by user ${userId}`);
  res.status(200).json({ message: 'Trader stopped.' });
  return;
}

// ---------- Get status and balance ----------
if (url === '/api/auto-trader/status' && method === 'GET') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  // In a real system, you'd fetch user-specific profit from DB.
  // For simplicity, we return the global state (single user demo).
  res.status(200).json({
    running: traderState.running,
    userProfit: traderState.userProfit,
    ownerFees: traderState.ownerFees,
    log: traderState.log
  });
  return;
}

// ---------- Report profit from a trade (called by the trading bot) ----------
// This endpoint deducts fee (3-10%) and credits user, sends fee to owner.
if (url === '/api/auto-trader/report-profit' && method === 'POST') {
  // Authorization: use a secret API key (not user session) to prevent abuse.
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.TRADER_API_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const { profitJMD, feePercent } = req.body; // profit in JMD, feePercent between 3 and 10
  if (!profitJMD || profitJMD <= 0) return res.status(400).json({ error: 'Invalid profit' });
  const fee = profitJMD * (Math.min(10, Math.max(3, feePercent)) / 100);
  const userGain = profitJMD - fee;
  traderState.userProfit += userGain;
  traderState.ownerFees += fee;
  addLog(`Trade profit: ${profitJMD} JMD, fee ${fee} JMD (${feePercent}%), user gain ${userGain} JMD`);
  // In production, you would also transfer the fee to your wallet (Korey D Russell).
  // For real crypto, you'd initiate a blockchain transaction.
  res.status(200).json({ userGain, fee });
  return;
}

// ---------- Per‑user Auto‑Trader state ----------
let userTraderStates = new Map(); // key = userId, value = { running, userProfit, ownerFees, log }

function getUserTraderState(userId) {
  if (!userTraderStates.has(userId)) {
    userTraderStates.set(userId, { running: false, userProfit: 0, ownerFees: 0, log: [] });
  }
  return userTraderStates.get(userId);
}

function addTraderLog(userId, msg) {
  const state = getUserTraderState(userId);
  state.log.unshift(`[${new Date().toISOString()}] ${msg}`);
  if (state.log.length > 50) state.log.pop();
}

// Override the existing auto‑trader endpoints (remove previous simple ones and replace)
// We'll insert new endpoints before the final 404. For safety, we'll replace the whole block.
// Since we already have some, we'll use sed to delete old and add new.

// ---------- Stripe Checkout ----------
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
if (url === '/api/create-checkout-session' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'jmd',
          product_data: { name: 'Deposit to Auto‑Trader Balance' },
          unit_amount: 100, // example: 1 JMD = 100 cents (but Stripe expects smallest unit; adjust)
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://onroadnow.vercel.app/auto-trader?success=true',
      cancel_url: 'https://onroadnow.vercel.app/auto-trader?canceled=true',
    });
    res.status(200).json({ id: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  return;
}

// ---------- Stripe integration (for card payments) ----------
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'YOUR_SECRET_KEY');

// Create a checkout session for users to fund their trading balance
if (url === '/api/create-checkout-session' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { amount, currency = 'usd' } = req.body;
  if (!amount || amount < 1) return res.status(400).json({ error: 'Invalid amount' });
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'google_pay', 'apple_pay'],
      line_items: [{
        price_data: { currency, product_data: { name: 'Trading Balance' }, unit_amount: amount * 100 },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://onroadnow.vercel.app/auto-trader?success=1',
      cancel_url: 'https://onroadnow.vercel.app/auto-trader?cancel=1',
      metadata: { userId }
    });
    res.status(200).json({ id: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  return;
}

// Webhook to handle successful payments (add funds to user's trading balance)
if (url === '/api/stripe-webhook' && method === 'POST') {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.userId;
    const amountPaid = session.amount_total / 100;
    // Add amount to user's trading balance
    let state = userTraderStates.get(userId);
    if (!state) state = { running: false, userProfit: 0, ownerFees: 0, log: [], balance: 0 };
    state.balance = (state.balance || 0) + amountPaid;
    userTraderStates.set(userId, state);
    addTraderLog(userId, `💰 Added ${amountPaid} JMD to trading balance via card payment`);
  }
  res.status(200).json({ received: true });
  return;
}

// ---------- Stripe integration ----------
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Create a checkout session for funding trading balance
if (url === '/api/create-checkout-session' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { amount, currency = 'usd' } = req.body;
  if (!amount || amount < 1) return res.status(400).json({ error: 'Invalid amount' });
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'google_pay', 'apple_pay'],
      line_items: [{
        price_data: {
          currency: currency.toLowerCase(),
          product_data: { name: 'Trading Balance' },
          unit_amount: Math.round(amount * 100)
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://onroadnow.vercel.app/auto-trader?success=1',
      cancel_url: 'https://onroadnow.vercel.app/auto-trader?cancel=1',
      metadata: { userId }
    });
    res.status(200).json({ id: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  return;
}

// Webhook to add funds after payment (optional but recommended)
if (url === '/api/stripe-webhook' && method === 'POST') {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const uid = session.metadata.userId;
    const amountPaid = session.amount_total / 100;
    let state = userTraderStates.get(uid);
    if (!state) state = { running: false, userProfit: 0, ownerFees: 0, log: [], balance: 0, history: [] };
    state.balance = (state.balance || 0) + amountPaid;
    addTraderLog(uid, `💰 Added ${amountPaid} JMD to trading balance via card`);
    userTraderStates.set(uid, state);
  }
  res.status(200).json({ received: true });
  return;
}

// ---------- Per‑user Auto‑Trader state (already defined, but ensure helpers exist) ----------
if (typeof userTraderStates === 'undefined') {
  var userTraderStates = new Map();
  function getUserTraderState(uid) {
    if (!userTraderStates.has(uid)) {
      userTraderStates.set(uid, { running: false, userProfit: 0, ownerFees: 0, log: [], balance: 0, history: [] });
    }
    return userTraderStates.get(uid);
  }
  function addTraderLog(uid, msg) {
    const state = getUserTraderState(uid);
    state.log.unshift(`[${new Date().toISOString()}] ${msg}`);
    if (state.log.length > 100) state.log.pop();
  }
}

// Overwrite existing endpoints (if any) – we'll put them after the helpers
// The endpoints below should be placed before the final 404. The existing code may already have them.
// To avoid duplication, we will remove any old auto-trader endpoints and insert fresh ones.
// We'll use a marker approach: replace the block between "// ---------- Auto‑Trader endpoints" and "// ----------".
// Since the file may not have that marker, we'll simply append at the end before the 404.

// ---------- Auto‑Trader endpoints (start/stop/status/report) ----------
if (url === '/api/auto-trader/start' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const state = getUserTraderState(userId);
  state.running = true;
  addTraderLog(userId, 'Trader started');
  res.status(200).json({ message: 'started' });
  return;
}
if (url === '/api/auto-trader/stop' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const state = getUserTraderState(userId);
  state.running = false;
  addTraderLog(userId, 'Trader stopped');
  res.status(200).json({ message: 'stopped' });
  return;
}
if (url === '/api/auto-trader/status' && method === 'GET') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const state = getUserTraderState(userId);
  res.status(200).json({
    running: state.running,
    userProfit: state.userProfit,
    ownerFees: state.ownerFees,
    balance: state.balance,
    log: state.log,
    history: state.history
  });
  return;
}
if (url === '/api/auto-trader/report-profit' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { profitJMD, feePercent } = req.body;
  if (!profitJMD || profitJMD <= 0) return res.status(400).json({ error: 'Invalid profit' });
  const fee = profitJMD * (Math.min(10, Math.max(3, feePercent)) / 100);
  const userGain = profitJMD - fee;
  const state = getUserTraderState(userId);
  state.userProfit += userGain;
  state.ownerFees += fee;
  state.history.push({ profit: profitJMD, gain: userGain, fee, timestamp: Date.now() });
  if (state.history.length > 100) state.history.shift();
  addTraderLog(userId, `Trade: profit ${profitJMD} JMD, fee ${feePercent}% → user +${userGain}, owner +${fee}`);
  res.status(200).json({ userGain, fee, newUserBalance: state.userProfit, newOwnerFees: state.ownerFees });
  return;

  // ---------- Persistence and Withdrawal Endpoints ----------
  const fs = require('fs');
  const path = require('path');
  const EARNINGS_FILE = path.join(__dirname, '..', 'data', 'earnings.json');

  function loadEarnings() {
    try {
      return JSON.parse(fs.readFileSync(EARNINGS_FILE, 'utf8'));
    } catch { return { totalOwnerFees: 0, withdrawals: [], users: {} }; }
  }

  function saveEarnings(data) {
    fs.writeFileSync(EARNINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
  }

  // Flush in‑memory earnings to file (call this periodically or on shutdown)
  function flushEarnings() {
    const data = loadEarnings();
    // Add ownerFees from all trader states
    let total = 0;
    for (const [id, state] of userTraderStates) {
      total += state.ownerFees || 0;
    }
    data.totalOwnerFees = total;
    // Also store per‑user profits if needed
    for (const [id, state] of userTraderStates) {
      if (!data.users[id]) data.users[id] = { profit: 0, fees: 0 };
      data.users[id].profit = state.userProfit || 0;
      data.users[id].fees = state.ownerFees || 0;
    }
    saveEarnings(data);
  }

  // Endpoint to get total owner earnings (for admin)
  if (url === '/api/owner/earnings' && method === 'GET') {
    // Simple admin check: you can hardcode a userId or use a special token
    // For now, allow if the request has a specific header or userId matches a hardcoded admin
    const adminId = 'admin'; // change to your actual user ID
    if (userId !== adminId) {
      // You can also check a secret header
      if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
        return res.status(403).json({ error: 'Admin only' });
      }
    }
    const data = loadEarnings();
    res.status(200).json({ totalOwnerFees: data.totalOwnerFees, withdrawals: data.withdrawals });
    return;
  }

  // Endpoint for a user to request withdrawal
  if (url === '/api/withdraw/request' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount, address, method } = req.body; // method: 'crypto' or 'paypal'
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const state = getUserTraderState(userId);
    if (state.userProfit < amount) return res.status(400).json({ error: 'Insufficient balance' });

    // Deduct from user profit
    state.userProfit -= amount;
    // Log withdrawal request
    const data = loadEarnings();
    data.withdrawals.push({
      userId,
      amount,
      address,
      method,
      timestamp: new Date().toISOString(),
      status: 'pending'
    });
    saveEarnings(data);
    // Flush all changes
    flushEarnings();
    res.status(200).json({ message: 'Withdrawal request submitted', remaining: state.userProfit });
    return;
  }

  // Admin endpoint to process withdrawal (mark as completed)
  if (url === '/api/withdraw/process' && method === 'POST') {
    if (userId !== 'admin' && req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { withdrawalId } = req.body;
    const data = loadEarnings();
    const idx = data.withdrawals.findIndex(w => w.id === withdrawalId);
    if (idx === -1) return res.status(404).json({ error: 'Withdrawal not found' });
    data.withdrawals[idx].status = 'completed';
    saveEarnings(data);
    res.status(200).json({ message: 'Withdrawal marked as completed' });
    return;
  }

  // Health check to verify all required env vars are set
  if (url === '/api/health' && method === 'GET') {
    const checks = {
      JWT_SECRET: !!process.env.JWT_SECRET,
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      INFURA_KEY: !!process.env.INFURA_KEY,
      SOLANA_RPC: !!process.env.SOLANA_RPC,
      WALLETCONNECT_PROJECT_ID: !!process.env.WALLETCONNECT_PROJECT_ID,
      ALPHA_VANTAGE_KEY: !!process.env.ALPHA_VANTAGE_KEY,
    };
    const allOk = Object.values(checks).every(v => v === true);
    res.status(allOk ? 200 : 500).json({ status: allOk ? 'ok' : 'missing keys', checks });
    return;
  }

};
