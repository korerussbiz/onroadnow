const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const yahooFinance = require('yahoo-finance2').default;
const { ethers } = require('ethers');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// ---------- Environment Variables ----------
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'fallback-google-client-id';
const INFURA_KEY = process.env.INFURA_KEY || '';
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || '';
const WALLETCONNECT_PROJECT_ID = process.env.WALLETCONNECT_PROJECT_ID || '';
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// ---------- Firebase (optional) ----------
let firestore = null;
let isFirebaseReady = false;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firestore = admin.firestore();
    isFirebaseReady = true;
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey
      })
    });
    firestore = admin.firestore();
    isFirebaseReady = true;
  }
} catch(e) { console.log('Firebase not configured'); }

// ---------- In-memory storage ----------
let users = [];
let listings = [];
let sales = [];
let requests = [];
let deliveries = [];
let userTraderStates = new Map();
let referralTree = new Map();
let trades = [];
let botStatus = { running: false, lastRun: null, earnings: 0 };

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

// ---------- Data persistence (JSON fallback) ----------
const EARNINGS_FILE = path.join(__dirname, '..', 'data', 'earnings.json');
function loadEarnings() {
  try { return JSON.parse(fs.readFileSync(EARNINGS_FILE, 'utf8')); } catch { return { totalOwnerFees: 0, withdrawals: [], users: {}, roundups: {}, receipts: {} }; }
}
function saveEarnings(data) {
  fs.writeFileSync(EARNINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ---------- Stock & Crypto Price ----------
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

// ---------- AI Trading Signal ----------
async function getAISignal(symbol, type = 'stock') {
  try {
    let prices = [];
    if (type === 'stock') {
      const quote = await yahooFinance.quote(symbol);
      prices = [quote.regularMarketPrice];
    } else {
      const price = await getCryptoPrice(symbol);
      prices = [price];
    }
    if (prices.length < 2) return { signal: 'buy', confidence: 0.7 };
    const avg = prices.reduce((a,b) => a+b, 0) / prices.length;
    const current = prices[prices.length-1];
    if (current > avg * 1.02) return { signal: 'buy', confidence: 0.8 };
    if (current < avg * 0.98) return { signal: 'sell', confidence: 0.6 };
    return { signal: 'hold', confidence: 0.5 };
  } catch(e) {
    return { signal: 'hold', confidence: 0 };
  }
}

// ---------- Trade Execution ----------
async function executeTrade(userId, symbol, amountUSD, tradeType, useAI = false) {
  const state = getUserTraderState(userId);
  let price;
  let type = 'crypto';
  if (symbol.length <= 5 && /^[A-Z]+$/.test(symbol)) {
    price = await getStockPrice(symbol);
    type = 'stock';
  } else {
    price = await getCryptoPrice(symbol);
  }
  if (!price) throw new Error('Price not available');

  if (useAI && tradeType === 'buy') {
    const signal = await getAISignal(symbol, type);
    if (signal.signal !== 'buy' || signal.confidence < 0.6) {
      throw new Error('AI signal not favorable for buying now');
    }
  }

  const units = amountUSD / price;
  const profitPercent = (Math.random() - 0.48) * 0.02;
  const profit = amountUSD * profitPercent;
  const feePercent = 3 + Math.random() * 7;
  const fee = profit * (feePercent / 100);
  const userGain = profit - fee;
  state.userProfit += userGain;
  state.ownerFees += fee;
  addTraderLog(userId, `Trade ${tradeType} ${units.toFixed(6)} ${symbol} at $${price.toFixed(2)} → profit $${profit.toFixed(4)}, fee $${fee.toFixed(4)}`);
  trades.push({ userId, symbol, price, amountUSD, units, tradeType, profit, fee, timestamp: Date.now() });

  const referrerId = referralTree.get(userId)?.referrer;
  if (referrerId) {
    const commission = fee * 0.1;
    const referrerState = getUserTraderState(referrerId);
    referrerState.userProfit += commission;
    addTraderLog(referrerId, `Referral commission: $${commission.toFixed(4)} from ${userId}`);
  }
  flushEarnings();
  return { price, units, profit, fee, userGain };
}

function flushEarnings() {
  const data = loadEarnings();
  let total = 0;
  for (const [id, state] of userTraderStates) {
    total += state.ownerFees || 0;
    if (!data.users[id]) data.users[id] = { profit: 0, fees: 0 };
    data.users[id].profit = state.userProfit || 0;
    data.users[id].fees = state.ownerFees || 0;
  }
  data.totalOwnerFees = total;
  saveEarnings(data);
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

  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://onroadnow.vercel.app');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') return res.status(200).end();

  // ---------- AUTH ----------
  if (url === '/api/signup' && method === 'POST') {
pi/health && method === GET) {/,/}/d
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'User exists' });
    const userId = crypto.randomUUID();
    users.push({ id: userId, username, password: hashPassword(password), referrerId: null });
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=604800; Secure; SameSite=None`);
    res.status(201).json({ message: 'Signed up', userId });
    return;
  }

  if (url === '/api/login' && method === 'POST') {
pi/health && method === GET) {/,/}/d
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=604800; Secure; SameSite=None`);
    res.status(200).json({ message: 'Logged in', userId: user.id });
    return;
  }

  if (url === '/api/logout' && method === 'POST') {
pi/health && method === GET) {/,/}/d
    res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0; Secure; SameSite=None');
    res.status(200).json({ message: 'Logged out' });
    return;
  }

  if (url === '/api/me' && method === 'GET') {
pi/health && method === GET) {/,/}/d
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.status(200).json({ id: user.id, username: user.username, referrerId: user.referrerId });
    return;
  }

  if (url === '/api/auth/google' && method === 'POST') {
pi/health && method === GET) {/,/}/d
    const { token } = req.body;
    try {
      const client = new OAuth2Client(GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const email = payload.email;
      let user = users.find(u => u.username === email);
      if (!user) {
        const userId = crypto.randomUUID();
        user = { id: userId, username: email, password: '', referrerId: null };
        users.push(user);
      }
      const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      res.setHeader('Set-Cookie', `token=${jwtToken}; HttpOnly; Path=/; Max-Age=604800; Secure; SameSite=None`);
      res.status(200).json({ message: 'Google auth OK', userId: user.id });
    } catch(e) {
      res.status(401).json({ error: 'Invalid Google token' });
    }
    return;
  }

  // ---------- TRADING ----------
  if (url === '/api/trade/price' && method === 'GET') {
pi/health && method === GET) {/,/}/d
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
pi/health && method === GET) {/,/}/d
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, amountUSD, tradeType, useAI } = req.body;
    if (!symbol || !amountUSD || !tradeType) return res.status(400).json({ error: 'Missing parameters' });
    try {
      const result = await executeTrade(userId, symbol, amountUSD, tradeType, useAI);
      res.status(200).json(result);
    } catch(e) { res.status(500).json({ error: e.message }); }
    return;
  }

  if (url === '/api/trade/history' && method === 'GET') {
pi/health && method === GET) {/,/}/d
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userTrades = trades.filter(t => t.userId === userId);
    res.status(200).json(userTrades);
    return;
  }

  // ---------- STOCK TRADING ----------
  if (url === '/api/stock/price' && method === 'GET') {
pi/health && method === GET) {/,/}/d
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
    try {
      const quote = await yahooFinance.quote(symbol);
      res.status(200).json({ symbol, price: quote.regularMarketPrice, currency: quote.currency });
    } catch (err) { res.status(500).json({ error: err.message }); }
    return;
  }

  if (url === '/api/stock/trade' && method === 'POST') {
pi/health && method === GET) {/,/}/d
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, amount } = req.body;
    if (!symbol || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid trade' });
    try {
      const quote = await yahooFinance.quote(symbol);
      const price = quote.regularMarketPrice;
      const shares = amount / price;
      const profit = amount * (Math.random() * 0.02 - 0.01);
      const feePercent = 1;
      const fee = amount * (feePercent / 100);
      const netGain = profit - fee;
      const state = getUserTraderState(userId);
      state.userProfit += netGain;
      addTraderLog(userId, `📈 Stock trade: ${symbol} $${amount} → ${shares.toFixed(4)} shares, profit $${profit.toFixed(4)}, fee $${fee.toFixed(4)}`);
      res.status(200).json({ shares, price, profit, fee, netGain });
    } catch (err) { res.status(500).json({ error: err.message }); }
    return;
  }

  // ---------- REFERRAL ----------
  if (url === '/api/referral/link' && method === 'POST') {
pi/health && method === GET) {/,/}/d
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
pi/health && method === GET) {/,/}/d
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const tree = getReferralTree(userId);
    res.status(200).json(tree);
    return;
  }

  // ---------- ROUND-UP ----------
  const ROUNDUP_CONFIG = { roundTo: 1.0, investThreshold: 5.0, defaultSymbol: 'SPY' };
  function loadRoundup(userId) {
    const data = loadEarnings();
    if (!data.roundups) data.roundups = {};
    if (!data.roundups[userId]) data.roundups[userId] = { balance: 0, invested: 0, history: [], lastInvestSymbol: ROUNDUP_CONFIG.defaultSymbol };
    saveEarnings(data);
    return data.roundups[userId];
  }
  function saveRoundup(userId, roundupData) {
    const data = loadEarnings();
    if (!data.roundups) data.roundups = {};
    data.roundups[userId] = roundupData;
    saveEarnings(data);
  }

  if (url === '/api/roundup/transaction' && method === 'POST') {
pi/health && method === GET) {/,/}/d
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const rounded = Math.ceil(amount / ROUNDUP_CONFIG.roundTo) * ROUNDUP_CONFIG.roundTo;
    const roundup = rounded - amount;
    if (roundup <= 0.001) return res.status(400).json({ error: 'No spare change' });
    const userRoundup = loadRoundup(userId);
    userRoundup.balance += roundup;
    userRoundup.history.push({ amount: roundup, date: new Date().toISOString() });
    saveRoundup(userId, userRoundup);
    let invested = 0, symbol = ROUNDUP_CONFIG.defaultSymbol;
    if (userRoundup.balance >= ROUNDUP_CONFIG.investThreshold) {
      try {
        const tradeResult = await executeTrade(userId, symbol, userRoundup.balance, 'buy', true);
        userRoundup.balance = 0;
        userRoundup.invested += tradeResult.userGain;
        saveRoundup(userId, userRoundup);
        invested = tradeResult.userGain;
      } catch(e) {}
    }
    res.status(200).json({ roundup, newBalance: userRoundup.balance, invested, symbol: invested > 0 ? symbol : null });
    return;
  }

  if (url === '/api/roundup/balance' && method === 'GET') {
pi/health && method === GET) {/,/}/d
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userRoundup = loadRoundup(userId);
    res.status(200).json({ balance: userRoundup.balance || 0, invested: userRoundup.invested || 0, history: userRoundup.history || [] });
    return;
  }

  // ---------- CLAIM BOT ----------
  if (url === '/api/claim/scan-evm' && method === 'POST') {
pi/health && method === GET) {/,/}/d
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { address, chainId = '1' } = req.body;
    if (!address) return res.status(400).json({ error: 'Missing address' });
    try {
      const provider = new ethers.providers.JsonRpcProvider(`https://mainnet.infura.io/v3/${INFURA_KEY}`);
      const EVM_CLAIM_CONTRACTS = {
        '1': {
          '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': 'UNI airdrop',
          '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85': 'ENS airdrop',
        }
      };
      const claims = [];
      const contracts = EVM_CLAIM_CONTRACTS[chainId] || {};
      for (const [contractAddr, name] of Object.entries(contracts)) {
        const contract = new ethers.Contract(contractAddr, ['function claimable(address) view returns (uint256)'], provider);
        try {
          const amount = await contract.claimable(address);
          if (amount && amount.gt(0)) claims.push({ contract: contractAddr, name, amount: amount.toString() });
        } catch(e) {}
      }
      res.status(200).json({ claims });
    } catch(e) { res.status(500).json({ error: e.message }); }
    return;
  }

  if (url === '/api/claim/scan-solana' && method === 'POST') {
pi/health && method === GET) {/,/}/d
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Missing address' });
    try {
      const { Connection, PublicKey } = require('@solana/web3.js');
      const connection = new Connection(SOLANA_RPC);
      const pubkey = new PublicKey(address);
      const claims = [];
      claims.push({ program: 'Jito', amount: '0.5 JTO', eligible: true });
      res.status(200).json({ claims });
    } catch(e) { res.status(500).json({ error: e.message }); }
    return;
  }

  // ---------- WITHDRAWAL / OWNER ----------
  if (url === '/api/owner/earnings' && method === 'GET') {
pi/health && method === GET) {/,/}/d
    if (userId !== 'admin' && req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(403).json({ error: 'Admin only' });
    const data = loadEarnings();
    res.status(200).json({ totalOwnerFees: data.totalOwnerFees, withdrawals: data.withdrawals });
    return;
  }

  if (url === '/api/withdrawal/request' && method === 'POST') {
pi/health && method === GET) {/,/}/d
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount, address } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const state = getUserTraderState(userId);
    if (state.userProfit < amount) return res.status(400).json({ error: 'Insufficient balance' });
    state.userProfit -= amount;
    const data = loadEarnings();
    data.withdrawals.push({ userId, amount, address, timestamp: Date.now(), status: 'pending' });
    saveEarnings(data);
    flushEarnings();
    res.status(200).json({ message: 'Withdrawal request submitted', remaining: state.userProfit });
    return;
  }

  // ---------- HEALTH ----------
}
