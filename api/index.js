const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-me';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'your-client-id';

let users = [];
let trades = [];
let userStates = {};

function getUserState(userId) {
  if (!userStates[userId]) {
    userStates[userId] = { profit: 0, fees: 0, log: [] };
  }
  return userStates[userId];
}

// ---------- PRICE FETCHING ----------
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
    throw new Error(`Could not fetch stock price for ${symbol}`);
  }
}

async function getCryptoPrice(symbol) {
  const sources = [
    { name: 'CoinGecko', url: () => `https://api.coingecko.com/api/v3/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd`, parse: (data) => data[symbol.toLowerCase()]?.usd },
    { name: 'Binance', url: () => `https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`, parse: (data) => parseFloat(data.price) },
    { name: 'Kraken', url: () => `https://api.kraken.com/0/public/Ticker?pair=${symbol.toUpperCase()}USD`, parse: (data) => { const pair = Object.keys(data.result)[0]; return parseFloat(data.result[pair].c[0]); } }
  ];
  for (const source of sources) {
    try {
      const res = await axios.get(source.url(), { timeout: 5000 });
      const price = source.parse(res.data);
      if (price && !isNaN(price) && price > 0) return price;
    } catch (e) {}
  }
  throw new Error(`Could not fetch crypto price for ${symbol}`);
}

// ---------- MAIN HANDLER ----------
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

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') return res.status(200).end();

  // ---------- AUTH ----------
  if (url === '/api/signup' && method === 'POST') {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'User exists' });
    const userId = crypto.randomUUID();
    users.push({ id: userId, username, password });
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=604800; Secure; SameSite=None`);
    return res.status(201).json({ message: 'Signed up', userId });
  }

  if (url === '/api/login' && method === 'POST') {
    const { username, password } = req.body;
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

  // ---------- PRICES ----------
  if (url === '/api/trade/price' && method === 'GET') {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
    try {
      let price;
      if (symbol.length <= 5 && /^[A-Z]+$/.test(symbol)) {
        price = await getStockPrice(symbol);
      } else {
        price = await getCryptoPrice(symbol);
      }
      return res.status(200).json({ symbol, price });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ---------- TRADING ----------
  if (url === '/api/trade/execute' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, amountUSD, tradeType } = req.body;
    if (!symbol || amountUSD == null || isNaN(Number(amountUSD)) || Number(amountUSD) <= 0) {
      return res.status(400).json({ error: 'Invalid amount or symbol' });
    }
    if (!tradeType || !['buy', 'sell'].includes(tradeType)) {
      return res.status(400).json({ error: 'Invalid trade type' });
    }
    try {
      let price;
      if (symbol.length <= 5 && /^[A-Z]+$/.test(symbol)) {
        price = await getStockPrice(symbol);
      } else {
        price = await getCryptoPrice(symbol);
      }
      const amount = Number(amountUSD);
      const units = amount / price;
      const profit = amount * (Math.random() - 0.48) * 0.02;
      const fee = profit * 0.05;
      const userGain = profit - fee;
      const state = getUserState(userId);
      state.profit += userGain;
      state.fees += fee;
      trades.push({ userId, symbol, price, amount, units, tradeType, profit, fee, timestamp: Date.now() });
      return res.status(200).json({ price, units, profit, fee, userGain });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ---------- HISTORY ----------
  if (url === '/api/trade/history' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userTrades = trades.filter(t => t.userId === userId);
    return res.status(200).json(userTrades);
  }

  // ---------- HEALTH ----------
  if (url === '/api/health' && method === 'GET') {
    return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  // ---------- 404 ----------
  res.status(404).json({ error: 'Not found' });
};
