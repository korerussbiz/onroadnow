const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const yahooFinance = require('yahoo-finance2');
const { ethers } = require('ethers');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '134628093591-61nk4mneo6d1o6of5da3e3fijgtd5dd0.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// In-memory storage (replace with database later)
let users = [];
let listings = [];
let sales = [];
let requests = [];
let deliveries = [];
let userTraderStates = new Map();
let referralTree = new Map(); // userId -> referrerId
let trades = []; // global trade log

// Helper functions
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
      balance: 0,
      receiptBalance: 0,
      receiptHistory: []
    });
  }
  return userTraderStates.get(userId);
}
function addTraderLog(userId, msg) {
  const state = getUserTraderState(userId);
  state.log.unshift(`[${new Date().toISOString()}] ${msg}`);
  if (state.log.length > 100) state.log.pop();
}

function getReferralTree(userId) {
  if (!referralTree.has(userId)) referralTree.set(userId, { referrer: null, referrals: [] });
  return referralTree.get(userId);
}

// ========== Stock and Crypto Price Fetching ==========
async function getStockPrice(symbol) {
  try {
    const quote = await yahooFinance.quote(symbol);
    return quote.regularMarketPrice;
  } catch(e) {
    // fallback to Alpha Vantage if available
    if (process.env.ALPHA_VANTAGE_KEY) {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
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

// ========== Trade Execution (paper trading) ==========
async function executeTrade(userId, symbol, amountUSD, tradeType) {
  const state = getUserTraderState(userId);
  let price;
  // Determine if symbol is stock or crypto
  if (symbol.length <= 5 && /^[A-Z]+$/.test(symbol)) {
    price = await getStockPrice(symbol);
  } else {
    price = await getCryptoPrice(symbol);
  }
  if (!price) throw new Error('Price not available');
  const units = amountUSD / price;
  // Simulate a small profit/loss for demonstration (will be replaced with real market)
  const profitPercent = (Math.random() - 0.48) * 0.02; // -1% to +1%
  const profit = amountUSD * profitPercent;
  const feePercent = 3 + Math.random() * 7; // 3-10% fee on profit
  const fee = profit * (feePercent / 100);
  const userGain = profit - fee;
  state.userProfit += userGain;
  state.ownerFees += fee;
  addTraderLog(userId, `Trade ${tradeType} ${units.toFixed(6)} ${symbol} at $${price.toFixed(2)} → profit $${profit.toFixed(4)}, fee $${fee.toFixed(4)}`);
  // Record trade
  trades.push({ userId, symbol, price, amountUSD, units, tradeType, profit, fee, timestamp: Date.now() });
  // MLM referral commission: if user has a referrer, give commission on fee
  const referrerId = referralTree.get(userId)?.referrer;
  if (referrerId) {
    const commission = fee * 0.1; // 10% of fee goes to referrer
    const referrerState = getUserTraderState(referrerId);
    referrerState.userProfit += commission;
    addTraderLog(referrerId, `Referral commission: $${commission.toFixed(4)} from ${userId}`);
  }
  return { price, units, profit, fee, userGain };
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

  // ---------- Authentication (unchanged) ----------
  // ... (keep all existing auth endpoints: /api/signup, /api/login, /api/logout, /api/me, /api/user, /api/auth/google)

  // ---------- Trading endpoints ----------
  if (url === '/api/trade/execute' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, amountUSD, tradeType } = req.body;
    if (!symbol || !amountUSD || !tradeType) return res.status(400).json({ error: 'Missing parameters' });
    try {
      const result = await executeTrade(userId, symbol, amountUSD, tradeType);
      res.status(200).json(result);
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (url === '/api/trade/history' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userTrades = trades.filter(t => t.userId === userId);
    res.status(200).json(userTrades);
    return;
  }

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
      res.status(200).json({ symbol, price });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // ---------- Referral (MLM) endpoints ----------
  if (url === '/api/referral/link' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { referrerId } = req.body;
    if (referrerId === userId) return res.status(400).json({ error: 'Cannot refer yourself' });
    if (!users.find(u => u.id === referrerId)) return res.status(404).json({ error: 'Referrer not found' });
    if (referralTree.has(userId) && referralTree.get(userId).referrer) return res.status(400).json({ error: 'Already has referrer' });
    const tree = getReferralTree(userId);
    tree.referrer = referrerId;
    const refTree = getReferralTree(referrerId);
    refTree.referrals.push(userId);
    res.status(200).json({ message: 'Referral linked' });
    return;
  }

  if (url === '/api/referral/tree' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const tree = getReferralTree(userId);
    res.status(200).json(tree);
    return;
  }

  // ---------- Receipt Investor (already added) ----------
  // ... (keep the existing /api/receipt/* endpoints)

  // ---------- Auto‑Trader status (already added) ----------
  // ... (keep the existing /api/auto-trader/* endpoints)

  // ---------- Claim Bot (already added) ----------
  // ... (keep the existing /api/claim/* endpoints)

  res.status(404).json({ error: 'Not found' });
};
// ---------- Real stock market data (Yahoo Finance) ----------
const yahooFinance = require('yahoo-finance2').default;

// ---------- MLM Referral System ----------
let referrals = new Map(); // userId -> { referrerId, earnings, downline: [] }

if (url === '/api/referral/register' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { referrerId } = req.body;
  if (referrerId && referrerId !== userId && !referrals.has(referrerId)) {
    return res.status(400).json({ error: 'Referrer not found' });
  }
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.referrerId = referrerId;
  if (referrerId) {
    const referrer = referrals.get(referrerId) || { earnings: 0, downline: [] };
    referrer.downline.push(userId);
    referrals.set(referrerId, referrer);
    // Add initial bonus (10% of referrer's first deposit? – we'll simulate)
    const bonus = 0.10;
    referrer.earnings += bonus;
    addTraderLog(referrerId, `💰 Referral bonus $${bonus} from ${userId}`);
  }
  res.status(200).json({ message: 'Referral registered' });
  return;
}

if (url === '/api/referral/earnings' && method === 'GET') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const data = referrals.get(userId) || { earnings: 0, downline: [] };
  res.status(200).json(data);
  return;
}

// ---------- Stock price endpoint (real-time) ----------
if (url === '/api/stock/price' && method === 'GET') {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
  try {
    const quote = await yahooFinance.quote(symbol);
    res.status(200).json({ symbol, price: quote.regularMarketPrice, currency: quote.currency });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  return;
}

// ---------- Trade stocks with change (micro-trades) ----------
if (url === '/api/stock/trade' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { symbol, amount } = req.body;
  if (!symbol || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid trade' });
  try {
    const quote = await yahooFinance.quote(symbol);
    const price = quote.regularMarketPrice;
    const shares = amount / price;
    // Simulated trade execution (paper trading) – replace with real exchange later
    const profit = amount * (Math.random() * 0.02 - 0.01); // ±1%
    const feePercent = 1; // fixed fee for stock trading (1%)
    const fee = amount * (feePercent / 100);
    const netGain = profit - fee;
    const state = getUserTraderState(userId);
    state.userProfit += netGain;
    addTraderLog(userId, `📈 Stock trade: ${symbol} $${amount} → ${shares.toFixed(4)} shares, profit $${profit.toFixed(4)}, fee $${fee.toFixed(4)}`);
    res.status(200).json({ shares, price, profit, fee, netGain });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  return;
}
// ---------- Real stock market data (Yahoo Finance) ----------
const yahooFinance = require('yahoo-finance2').default;

// ---------- MLM Referral System ----------
let referrals = new Map(); // userId -> { referrerId, earnings, downline: [] }

if (url === '/api/referral/register' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { referrerId } = req.body;
  if (referrerId && referrerId !== userId && !referrals.has(referrerId)) {
    return res.status(400).json({ error: 'Referrer not found' });
  }
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.referrerId = referrerId;
  if (referrerId) {
    const referrer = referrals.get(referrerId) || { earnings: 0, downline: [] };
    referrer.downline.push(userId);
    referrals.set(referrerId, referrer);
    // Add initial bonus (10% of referrer's first deposit? – we'll simulate)
    const bonus = 0.10;
    referrer.earnings += bonus;
    addTraderLog(referrerId, `💰 Referral bonus $${bonus} from ${userId}`);
  }
  res.status(200).json({ message: 'Referral registered' });
  return;
}

if (url === '/api/referral/earnings' && method === 'GET') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const data = referrals.get(userId) || { earnings: 0, downline: [] };
  res.status(200).json(data);
  return;
}

// ---------- Stock price endpoint (real-time) ----------
if (url === '/api/stock/price' && method === 'GET') {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
  try {
    const quote = await yahooFinance.quote(symbol);
    res.status(200).json({ symbol, price: quote.regularMarketPrice, currency: quote.currency });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  return;
}

// ---------- Trade stocks with change (micro-trades) ----------
if (url === '/api/stock/trade' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { symbol, amount } = req.body;
  if (!symbol || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid trade' });
  try {
    const quote = await yahooFinance.quote(symbol);
    const price = quote.regularMarketPrice;
    const shares = amount / price;
    // Simulated trade execution (paper trading) – replace with real exchange later
    const profit = amount * (Math.random() * 0.02 - 0.01); // ±1%
    const feePercent = 1; // fixed fee for stock trading (1%)
    const fee = amount * (feePercent / 100);
    const netGain = profit - fee;
    const state = getUserTraderState(userId);
    state.userProfit += netGain;
    addTraderLog(userId, `📈 Stock trade: ${symbol} $${amount} → ${shares.toFixed(4)} shares, profit $${profit.toFixed(4)}, fee $${fee.toFixed(4)}`);
    res.status(200).json({ shares, price, profit, fee, netGain });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  return;
}
