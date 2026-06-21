const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const crypto = require('crypto');

// ---------- BODY PARSER ----------
function parseBody(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ---------- CONFIG ----------
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const users = [];
const trades = [];
const userStates = {};

// ---------- HELPERS ----------
function getUserState(id) {
  if (!userStates[id]) userStates[id] = { profit: 0, fees: 0 };
  return userStates[id];
}

// ---------- PRICE FETCHERS (fallback) ----------
async function getCryptoPrice(symbol) {
  const sources = [
    { name: 'Binance', url: `https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`, parse: d => parseFloat(d.price) },
    { name: 'CoinGecko', url: `https://api.coingecko.com/api/v3/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd`, parse: (d, s) => d[s.toLowerCase()]?.usd },
  ];
  for (const src of sources) {
    try {
      const res = await axios.get(src.url, { timeout: 5000 });
      const price = src.parse(res.data, symbol);
      if (price && !isNaN(price) && price > 0) return price;
    } catch (e) {}
  }
  throw new Error('All price sources failed');
}

async function getStockPrice(symbol) {
  try {
    const yahoo = require('yahoo-finance2').default;
    const quote = await yahoo.quote(symbol);
    return quote.regularMarketPrice;
  } catch (e) {
    if (process.env.ALPHA_VANTAGE_KEY) {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
      const res = await axios.get(url, { timeout: 5000 });
      return parseFloat(res.data['Global Quote']['05. price']);
    }
    throw new Error('Stock price failed');
  }
}

// ---------- MAIN HANDLER ----------
module.exports = async (req, res) => {
  const url = req.url;
  const method = req.method;

  // Parse body (if any)
  let body = {};
  if (req.body) {
    body = req.body; // Vercel already parses JSON
  } else {
    // Fallback: read from raw body (if using node built-in)
    // But Vercel provides parsed body if content-type is json.
    // We'll assume req.body is already set.
  }

  // Parse cookies
  const cookies = cookie.parse(req.headers.cookie || '');
  let userId = null;
  if (cookies.token) {
    try {
      const decoded = jwt.verify(cookies.token, JWT_SECRET);
      userId = decoded.userId;
    } catch (e) {}
  }

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') return res.status(200).end();

  // ---------- ROUTES ----------
  if (url === '/api/health' && method === 'GET') {
    return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  if (url === '/api/signup' && method === 'POST') {
    const { username, password } = body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'User exists' });
    const newId = crypto.randomUUID();
    users.push({ id: newId, username, password });
    const token = jwt.sign({ userId: newId }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=604800; Secure; SameSite=None`);
    return res.status(201).json({ message: 'Signed up', userId: newId });
  }

  if (url === '/api/login' && method === 'POST') {
    const { username, password } = body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=604800; Secure; SameSite=None`);
    return res.status(200).json({ message: 'Logged in', userId: user.id });
  }

  if (url === '/api/logout' && method === 'POST') {
    res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0; Secure; SameSite=None');
    return res.status(200).json({ message: 'Logged out' });
  }

  if (url === '/api/me' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({ id: user.id, username: user.username });
  }

  if (url === '/api/trade/price' && method === 'GET') {
    const { symbol } = req.query || {};
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
    try {
      let price;
      if (symbol.length <= 5 && /^[A-Z]+$/.test(symbol)) {
        price = await getStockPrice(symbol);
      } else {
        price = await getCryptoPrice(symbol);
      }
      return res.status(200).json({ symbol, price });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (url === '/api/trade/execute' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, amountUSD, tradeType } = body;
    if (!symbol || !amountUSD || !tradeType) return res.status(400).json({ error: 'Missing params' });
    try {
      let price;
      if (symbol.length <= 5 && /^[A-Z]+$/.test(symbol)) {
        price = await getStockPrice(symbol);
      } else {
        price = await getCryptoPrice(symbol);
      }
      const units = amountUSD / price;
      const profit = amountUSD * (Math.random() - 0.48) * 0.02;
      const fee = profit * 0.05;
      const userGain = profit - fee;
      const state = getUserState(userId);
      state.profit += userGain;
      state.fees += fee;
      trades.push({ userId, symbol, price, amountUSD, units, tradeType, profit, fee });
      return res.status(200).json({ price, units, profit, fee, userGain });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (url === '/api/trade/history' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userTrades = trades.filter(t => t.userId === userId);
    return res.status(200).json(userTrades);
  }

  // ---------- DEFAULT 404 ----------
  res.status(404).json({ error: 'Not found' });
};
