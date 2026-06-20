const admin = require('firebase-admin');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { OAuth2Client } = require('google-auth-library');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const GOOGLE_CLIENT_ID = '134628093591-61nk4mneo6d1o6of5da3e3fijgtd5dd0.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// In-memory storage
let users = [];
let listings = [];
let sales = [];
let requests = [];
let deliveries = [];

// ------------------- Helper for auto-trader (per-user) -------------------
let userTraderStates = new Map();
function getUserTraderState(userId) {
  if (!userTraderStates.has(userId)) {
    userTraderStates.set(userId, { running: false, userProfit: 0, ownerFees: 0, log: [], history: [] });
  }
  return userTraderStates.get(userId);
}
function addTraderLog(userId, msg) {
  const state = getUserTraderState(userId);
  state.log.unshift(`[${new Date().toISOString()}] ${msg}`);
  if (state.log.length > 100) state.log.pop();
}

// ------------------- Existing auth (simplified) -------------------
function hashPassword(pwd) { return require('crypto').createHash('sha256').update(pwd).digest('hex'); }
function verifyPassword(pwd, hash) { return hashPassword(pwd) === hash; }

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

  // ---------- Authentication ----------
  if (url === '/api/signup' && method === 'POST') {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'User exists' });
    const id = Date.now().toString();
    users.push({ id, email, passwordHash: hashPassword(password), name, phone: '', role: 'user', createdAt: Date.now() });
    const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', cookie.serialize('token', token, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 604800 }));
    res.status(200).json({ message: 'Signup successful', user: { id, email, name } });
    return;
  }
  if (url === '/api/login' && method === 'POST') {
    const { email } = req.body; // simplified: no password check for demo
    let user = users.find(u => u.email === email);
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

  // ---------- Marketplace ----------
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

  // ---------- Nearby places (proxy) ----------
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

  