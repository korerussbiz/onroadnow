const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const yahooFinance = require('yahoo-finance2').default;
const { ethers } = require('ethers');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'fallback-client-id';
const INFURA_KEY = process.env.INFURA_KEY || '';
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || '';

let users = [];
let userTraderStates = new Map();
let referralTree = new Map();
let trades = [];

function hashPassword(pwd) { return crypto.createHash('sha256').update(pwd).digest('hex'); }
function verifyPassword(pwd, hash) { return hashPassword(pwd) === hash; }

function getUserTraderState(userId) {
  if (!userTraderStates.has(userId)) {
    userTraderStates.set(userId, {
      running: false,
      userProfit: 0,
      ownerFees: 0,
      log: [],
      history: [],
      balance: 0
    });
  }
  return userTraderStates.get(userId);
}

async function getStockPrice(symbol) {
  try {
    const quote = await yahooFinance.quote(symbol);
    return quote.regularMarketPrice;
  } catch(e) {
    if (ALPHA_VANTAGE_KEY) {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
      const res = await axios.get(url);
      return parseFloat(res.data['Global Quote']['05. price']);
    }
    throw new Error(`Could not fetch price for ${symbol}`);
  }
}

async function getCryptoPrice(symbol) {
  const id = symbol.toLowerCase();
  try {
    const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    return res.data[id]?.usd;
  } catch(e) {
    throw new Error(`Could not fetch crypto price for ${symbol}`);
  }
}

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

  // ---------- AUTH ----------
  if (url === '/api/signup' && method === 'POST') {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'User exists' });
    const userId = crypto.randomUUID();
    users.push({ id: userId, username, password: hashPassword(password) });
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=604800; Secure; SameSite=None`);
    res.status(201).json({ message: 'Signed up', userId });
    return;
  }

  if (url === '/api/login' && method === 'POST') {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=604800; Secure; SameSite=None`);
    res.status(200).json({ message: 'Logged in', userId: user.id });
    return;
  }

  if (url === '/api/logout' && method === 'POST') {
    res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0; Secure; SameSite=None');
    res.status(200).json({ message: 'Logged out' });
    return;
  }

  if (url === '/api/me' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.status(200).json({ id: user.id, username: user.username });
    return;
  }

  // ---------- TRADING ----------
  if (url === '/api/trade/price' && method === 'GET') {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
    try {
      let price;
      if (symbol.length <= 5 && /^[A-Z]+$/.test(symbol)) price = await getStockPrice(symbol);
      else price = await getCryptoPrice(symbol);
      res.status(200).json({ symbol, price });
    } catch(e) { res.status(500).json({ error: e.message }); }
    return;
  }

  if (url === '/api/trade/execute' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, amountUSD, tradeType } = req.body;
    if (!symbol || !amountUSD || !tradeType) return res.status(400).json({ error: 'Missing parameters' });
    try {
      let price;
      if (symbol.length <= 5 && /^[A-Z]+$/.test(symbol)) price = await getStockPrice(symbol);
      else price = await getCryptoPrice(symbol);
      const units = amountUSD / price;
      const profit = amountUSD * (Math.random() - 0.48) * 0.02;
      const fee = profit * 0.05;
      const userGain = profit - fee;
      const state = getUserTraderState(userId);
      state.userProfit += userGain;
      state.ownerFees += fee;
      trades.push({ userId, symbol, price, amountUSD, units, tradeType, profit, fee });
      res.status(200).json({ price, units, profit, fee, userGain });
    } catch(e) { res.status(500).json({ error: e.message }); }
    return;
  }

  if (url === '/api/trade/history' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userTrades = trades.filter(t => t.userId === userId);
    res.status(200).json(userTrades);
    return;
  }

  // ---------- HEALTH ----------
  if (url === '/api/health' && method === 'GET') {
    const checks = {
      JWT_SECRET: !!process.env.JWT_SECRET,
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      INFURA_KEY: !!process.env.INFURA_KEY,
      SOLANA_RPC: !!process.env.SOLANA_RPC,
      ALPHA_VANTAGE_KEY: !!process.env.ALPHA_VANTAGE_KEY,
    };
    const missing = Object.keys(checks).filter(k => !checks[k]);
    res.status(200).json({ status: missing.length ? 'warning' : 'ok', checks, missing });
    return;
  }

  // ---------- 404 ----------
  res.status(404).json({ error: 'Not found' });
};
