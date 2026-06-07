const admin = require('firebase-admin');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { OAuth2Client } = require('google-auth-library');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const GOOGLE_CLIENT_ID = '134628093591-61nk4mneo6d1o6of5da3e3fijgtd5dd0.apps.googleusercontent.com';
const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

let db = null;
if (!admin.apps.length) {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    try { serviceAccount = require('./serviceAccountKey.json'); } catch(e) {}
  }
  if (serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
  }
}

// In-memory fallback
let users = [], listings = [], sales = [], requests = [], deliveries = [];

async function getUser(uid) {
  if (db) { const doc = await db.collection('users').doc(uid).get(); return doc.exists ? { id: doc.id, ...doc.data() } : null; }
  return users.find(u => u.id === uid);
}
async function setUser(uid, data) {
  if (db) await db.collection('users').doc(uid).set(data, { merge: true });
  else { const u = users.find(u => u.id === uid); if (u) Object.assign(u, data); else users.push({ id: uid, ...data }); }
}
async function getListings() {
  if (db) { const snap = await db.collection('listings').where('status', '==', 'active').get(); return snap.docs.map(d => ({ id: d.id, ...d.data() })); }
  return listings.filter(l => l.status === 'active');
}
async function addListing(data) {
  if (db) { const ref = await db.collection('listings').add(data); return { id: ref.id, ...data }; }
  const id = Date.now().toString(); listings.push({ id, ...data }); return { id, ...data };
}
async function deleteListing(id) {
  if (db) await db.collection('listings').doc(id).delete();
  else { const idx = listings.findIndex(l => l.id === id); if (idx !== -1) listings.splice(idx,1); }
}
async function addSale(sale) { if (db) await db.collection('sales').add(sale); else sales.push(sale); }
async function getSalesForUser(userId) {
  if (db) {
    const snap = await db.collection('sales').where('sellerId', '==', userId).get();
    const asSeller = snap.docs.map(d => d.data());
    const snap2 = await db.collection('sales').where('buyerId', '==', userId).get();
    const asBuyer = snap2.docs.map(d => d.data());
    return [...asSeller, ...asBuyer];
  }
  return sales.filter(s => s.sellerId === userId || s.buyerId === userId);
}
async function addRequest(req) {
  if (db) { const ref = await db.collection('requests').add(req); return { id: ref.id, ...req }; }
  const id = Date.now().toString(); requests.push({ id, ...req }); return { id, ...req };
}
async function getRequests() {
  if (db) { const snap = await db.collection('requests').get(); return snap.docs.map(d => ({ id: d.id, ...d.data() })); }
  return requests;
}
async function updateRequest(id, data) {
  if (db) await db.collection('requests').doc(id).update(data);
  else { const r = requests.find(r => r.id === id); if (r) Object.assign(r, data); }
}

function getUserFromCookies(cookies) {
  if (!cookies.token) return null;
  try { return jwt.verify(cookies.token, JWT_SECRET); } catch(e) { return null; }
}

module.exports = async (req, res) => {
  const url = req.url;
  const method = req.method;
  const cookies = cookie.parse(req.headers.cookie || '');
  const tokenData = getUserFromCookies(cookies);
  let userId = tokenData ? tokenData.userId : null;

  res.setHeader('Access-Control-Allow-Origin', 'https://onroadnow.vercel.app');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') return res.status(200).end();

  // Google OAuth
  if (url === '/api/auth/google' && method === 'POST') {
    const { credential } = req.body;
    try {
      const ticket = await oauthClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const email = payload.email;
      const name = payload.name;
      let user = await getUser(email);
      if (!user) {
        const newUser = { id: email, email, name, phone: '', role: 'customer', createdAt: Date.now() };
        await setUser(email, newUser);
        user = newUser;
      }
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      res.setHeader('Set-Cookie', cookie.serialize('token', token, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 604800 }));
      res.status(200).json({ user });
    } catch (err) { res.status(401).json({ error: 'Invalid token' }); }
    return;
  }

  // Email/password (simplified)
  if (url === '/api/signup' && method === 'POST') {
    const { email, password, name } = req.body;
    if (await getUser(email)) return res.status(400).json({ error: 'User exists' });
    await setUser(email, { id: email, email, name, phone: '', role: 'customer', createdAt: Date.now() });
    const token = jwt.sign({ userId: email }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', cookie.serialize('token', token, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 604800 }));
    res.status(200).json({ user: { id: email, email, name } });
    return;
  }
  if (url === '/api/login' && method === 'POST') {
    const { email } = req.body;
    const user = await getUser(email);
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

  // User profile
  if (url === '/api/me' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const user = await getUser(userId);
    res.status(200).json(user || { id: userId });
    return;
  }
  if (url === '/api/user' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    await setUser(userId, req.body);
    res.status(200).json({});
    return;
  }

  // Listings
  if (url === '/api/listings' && method === 'GET') {
    const listings = await getListings();
    res.status(200).json(listings);
    return;
  }
  if (url === '/api/listings' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Login required' });
    const { title, description, price, feePercent } = req.body;
    const newListing = { sellerId: userId, title, description, price: parseFloat(price), feePercent: feePercent || 2, status: 'active', createdAt: Date.now() };
    const listing = await addListing(newListing);
    res.status(200).json(listing);
    return;
  }
  if (url === '/api/listings' && method === 'DELETE') {
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const user = await getUser(userId);
    if (user?.email !== 'admin@korerussbiz.com') return res.status(403).json({ error: 'Admin only' });
    const { id } = req.body;
    await deleteListing(id);
    res.status(200).json({});
    return;
  }
  if (url === '/api/purchase' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Login required' });
    const { listingId } = req.body;
    const listings = await getListings();
    const listing = listings.find(l => l.id === listingId);
    if (!listing || listing.status !== 'active') return res.status(404).json({ error: 'Not available' });
    const feeAmount = (listing.price * listing.feePercent) / 100;
    const sale = { listingId, sellerId: listing.sellerId, buyerId: userId, amount: listing.price, fee: feeAmount, timestamp: Date.now() };
    await addSale(sale);
    if (db) await db.collection('listings').doc(listingId).update({ status: 'sold' });
    else { const idx = listings.findIndex(l => l.id === listingId); if (idx !== -1) listings[idx].status = 'sold'; }
    res.status(200).json({});
    return;
  }
  if (url === '/api/sales' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Login required' });
    const userSales = await getSalesForUser(userId);
    res.status(200).json(userSales);
    return;
  }

  // Nearby places
  if (url.startsWith('/api/nearby')) {
    const { lat, lon, radius = 2000 } = req.query;
    const query = `[out:json];(node["shop"](around:${radius},${lat},${lon});node["amenity"="restaurant"](around:${radius},${lat},${lon});node["amenity"="cafe"](around:${radius},${lat},${lon});node["amenity"="pharmacy"](around:${radius},${lat},${lon});node["shop"="supermarket"](around:${radius},${lat},${lon}););out body;`;
    try {
      const response = await axios.post('https://overpass-api.de/api/interpreter', `data=${query}`, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      res.status(200).json(response.data);
    } catch (err) { res.status(500).json({ error: err.message }); }
    return;
  }

  // Delivery requests
  if (url === '/api/requests' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Login required' });
    const request = { ...req.body, userId, status: 'open', createdAt: Date.now() };
    const newReq = await addRequest(request);
    res.status(200).json(newReq);
    return;
  }
  if (url === '/api/requests' && method === 'GET') {
    const reqs = await getRequests();
    res.status(200).json(reqs);
    return;
  }
  if (url.startsWith('/api/accept')) {
    const id = req.query.id;
    const { delivererId, delivererName } = req.body;
    await updateRequest(id, { status: 'accepted', delivererId, delivererName });
    res.status(200).json({});
    return;
  }
  if (url === '/api/offerLoan' && method === 'POST') { res.status(200).json({}); return; }
  if (url === '/api/confirmDelivery' && method === 'POST') {
    const { requestId } = req.body;
    await updateRequest(requestId, { status: 'completed' });
    res.status(200).json({});
    return;
  }
  if (url === '/api/updateLocation' && method === 'POST') { res.status(200).json({}); return; }
  if (url.startsWith('/api/getLocation')) { res.status(200).json({ location: null }); return; }

  res.status(404).json({ error: 'Not found' });
};
