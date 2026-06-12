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
