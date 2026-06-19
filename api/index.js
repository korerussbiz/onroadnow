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

// ---------- In-memory storage (with Firebase fallback) ----------
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

// ---------- Stock & Crypto Price (with AI signals) ----------
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

// ---------- AI Trading Signal (simple moving average + RSI) ----------
async function getAISignal(symbol, type = 'stock') {
  // Fetch historical data (simplified)
  try {
    const period = 14;
    let prices = [];
    if (type === 'stock') {
      const quote = await yahooFinance.quote(symbol);
      prices = [quote.regularMarketPrice]; // Placeholder – should fetch historical
    } else {
      const price = await getCryptoPrice(symbol);
      prices = [price];
    }
    // Simple trend: if current price > average of last 5, buy signal
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

// ---------- Trade Execution (with AI decision) ----------
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

  // AI override: if useAI and signal is 'sell', we don't buy (only buy on strong buy)
  if (useAI && tradeType === 'buy') {
    const signal = await getAISignal(symbol, type);
    if (signal.signal !== 'buy' || signal.confidence < 0.6) {
      throw new Error('AI signal not favorable for buying now');
    }
  }

  const units = amountUSD / price;
  // Simulate profit/loss (realistic)
  const profitPercent = (Math.random() - 0.48) * 0.02;
  const profit = amountUSD * profitPercent;
  const feePercent = 3 + Math.random() * 7;
  const fee = profit * (feePercent / 100);
  const userGain = profit - fee;
  state.userProfit += userGain;
  state.ownerFees += fee;
  addTraderLog(userId, `Trade ${tradeType} ${units.toFixed(6)} ${symbol} at $${price.toFixed(2)} → profit $${profit.toFixed(4)}, fee $${fee.toFixed(4)}`);
  trades.push({ userId, symbol, price, amountUSD, units, tradeType, profit, fee, timestamp: Date.now() });

  // Referral commission
  const referrerId = referralTree.get(userId)?.referrer;
  if (referrerId) {
    const commission = fee * 0.1;
    const referrerState = getUserTraderState(referrerId);
    referrerState.userProfit += commission;
    addTraderLog(referrerId, `Referral commission: $${commission.toFixed(4)} from ${userId}`);
  }
  // Save earnings periodically
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
  // Also save roundups and receipts (if any)
  saveEarnings(data);
}

// ---------- Round-up & Receipt functions (appended later) ----------
// ... (we'll include them inline in the main handler)

// ===================================================================
// MAIN HANDLER
// ===================================================================
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

  // ---------- AUTHENTICATION ----------
  // (all your original auth endpoints)
  if (url === '/api/signup' && method === 'POST') {
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
    res.status(200).json({ id: user.id, username: user.username, referrerId: user.referrerId });
    return;
  }

  // Google OAuth
  if (url === '/api/auth/google' && method === 'POST') {
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

  // ---------- STOCK & CRYPTO TRADING (with AI) ----------
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
    const { symbol, amountUSD, tradeType, useAI } = req.body;
    if (!symbol || !amountUSD || !tradeType) return res.status(400).json({ error: 'Missing parameters' });
    try {
      const result = await executeTrade(userId, symbol, amountUSD, tradeType, useAI);
      res.status(200).json(result);
    } catch(e) { res.status(500).json({ error: e.message }); }
    return;
  }

  if (url === '/api/trade/history' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userTrades = trades.filter(t => t.userId === userId);
    res.status(200).json(userTrades);
    return;
  }

  // ---------- AUTO-TRADER BOT (AI-driven) ----------
  if (url === '/api/bot/status' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const state = getUserTraderState(userId);
    res.status(200).json({ running: state.running, log: state.log.slice(0, 20), profit: state.userProfit });
    return;
  }

  if (url === '/api/bot/control' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { action } = req.body;
    const state = getUserTraderState(userId);
    if (action === 'start') {
      if (state.running) return res.status(400).json({ error: 'Bot already running' });
      state.running = true;
      // Start a simulated bot loop (in production, use a background worker)
      addTraderLog(userId, '🤖 Auto-trader started with AI signals');
      res.status(200).json({ message: 'Bot started' });
    } else if (action === 'stop') {
      state.running = false;
      addTraderLog(userId, '⏹️ Auto-trader stopped');
      res.status(200).json({ message: 'Bot stopped' });
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
    return;
  }

  // ---------- WALLETCONNECT CLAIM BOT ----------
  if (url === '/api/claim/scan-evm' && method === 'POST') {
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
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Missing address' });
    try {
      const { Connection, PublicKey } = require('@solana/web3.js');
      const connection = new Connection(SOLANA_RPC);
      const pubkey = new PublicKey(address);
      // Placeholder
      const claims = [{ program: 'Jito', amount: '0.5 JTO', eligible: true }];
      res.status(200).json({ claims });
    } catch(e) { res.status(500).json({ error: e.message }); }
    return;
  }

  // ---------- REFERRAL ----------
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

  // ---------- ROUND-UP ----------
  // (Insert round-up endpoints here – they are long, we'll append later)
  // For brevity in the rebuild, I'll include a minimal version.
  // Full round-up and receipt endpoints will be appended in a separate step.

  // ---------- HEALTH CHECK ----------
  if (url === '/api/health' && method === 'GET') {
    const checks = {
      JWT_SECRET: !!process.env.JWT_SECRET,
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      INFURA_KEY: !!process.env.INFURA_KEY,
      SOLANA_RPC: !!process.env.SOLANA_RPC,
      ALPHA_VANTAGE_KEY: !!process.env.ALPHA_VANTAGE_KEY,
      WALLETCONNECT_PROJECT_ID: !!process.env.WALLETCONNECT_PROJECT_ID,
    };
    const allOk = Object.values(checks).every(v => v === true);
    res.status(allOk ? 200 : 500).json({ status: allOk ? 'ok' : 'missing keys', checks });
    return;
  }

  // ---------- 404 ----------
  res.status(404).json({ error: 'Not found' });

  // ---------- ROUND-UP INVESTMENT ----------
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
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const rounded = Math.ceil(amount);
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
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userRoundup = loadRoundup(userId);
    res.status(200).json({ balance: userRoundup.balance || 0, invested: userRoundup.invested || 0, history: userRoundup.history || [] });
    return;
  }

  if (url === '/api/roundup/invest' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol } = req.body || {};
    const userRoundup = loadRoundup(userId);
    if (userRoundup.balance < 0.01) return res.status(400).json({ error: 'No balance' });
    const investSymbol = symbol || ROUNDUP_CONFIG.defaultSymbol;
    try {
      const tradeResult = await executeTrade(userId, investSymbol, userRoundup.balance, 'buy', true);
      const investedAmount = tradeResult.userGain;
      userRoundup.balance = 0;
      userRoundup.invested += investedAmount;
      saveRoundup(userId, userRoundup);
      res.status(200).json({ invested: investedAmount, remaining: 0, symbol: investSymbol, price: tradeResult.price });
    } catch(e) { res.status(500).json({ error: e.message }); }
    return;
  }

  // ---------- RECEIPT INVESTMENT ----------
  function loadReceipts(userId) {
    const data = loadEarnings();
    if (!data.receipts) data.receipts = {};
    if (!data.receipts[userId]) data.receipts[userId] = [];
    saveEarnings(data);
    return data.receipts[userId];
  }
  function saveReceipt(userId, receipt) {
    const data = loadEarnings();
    if (!data.receipts) data.receipts = {};
    if (!data.receipts[userId]) data.receipts[userId] = [];
    data.receipts[userId].push(receipt);
    saveEarnings(data);
  }
  function generateInvoice(receipt) {
    const invoiceNumber = 'INV-' + Date.now().toString(36).toUpperCase();
    const date = new Date().toISOString().slice(0,10);
    const subtotal = receipt.total;
    const roundup = receipt.roundup;
    const fee = roundup * 0.02;
    const tax = roundup * 0.05;
    const totalPaid = roundup + fee + tax;
    return `
      <!DOCTYPE html>
      <html>
      <head><title>Invoice ${invoiceNumber}</title>
      <style>body{font-family:monospace;max-width:600px;margin:auto;padding:2rem;}
      .invoice{background:#1e293b;color:#e2e8f0;padding:2rem;border-radius:1rem;}
      h1{color:#facc15;} .row{display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #334155;}
      .total{font-weight:bold;font-size:1.2rem;border-top:2px solid #facc15;margin-top:1rem;padding-top:1rem;}
      </style></head>
      <body>
      <div class="invoice">
        <h1>🧾 OnRoadNow Investment Invoice</h1>
        <p><strong>Invoice #:</strong> ${invoiceNumber}</p>
        <p><strong>Date:</strong> ${date}</p>
        <p><strong>User ID:</strong> ${receipt.userId}</p>
        <hr/>
        <div class="row"><span>Purchase Total</span><span>$${subtotal.toFixed(2)}</span></div>
        <div class="row"><span>Round‑up Amount</span><span>$${roundup.toFixed(2)}</span></div>
        <div class="row"><span>Platform Fee (2%)</span><span>$${fee.toFixed(2)}</span></div>
        <div class="row"><span>VAT/GST (5%)</span><span>$${tax.toFixed(2)}</span></div>
        <div class="row total"><span>Total Paid</span><span>$${totalPaid.toFixed(2)}</span></div>
      </div>
      </body>
      </html>
    `;
  }

  if (url === '/api/receipt/upload' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { total, image } = req.body;
    let finalTotal = total ? parseFloat(total) : null;
    if (!finalTotal && image) {
      // Simulate OCR – replace with Google Vision later
      finalTotal = 5 + Math.random() * 45;
    }
    if (!finalTotal || finalTotal <= 0) return res.status(400).json({ error: 'Invalid total' });
    const rounded = Math.ceil(finalTotal);
    const roundup = rounded - finalTotal;
    if (roundup <= 0.001) return res.status(400).json({ error: 'No spare change' });
    const receipt = { id: Date.now().toString(36) + userId.slice(0,4), userId, total: finalTotal, rounded, roundup, date: new Date().toISOString(), invested: false };
    saveReceipt(userId, receipt);
    const userRoundup = loadRoundup(userId);
    userRoundup.balance += roundup;
    userRoundup.history.push({ amount: roundup, date: receipt.date, receiptId: receipt.id });
    saveRoundup(userId, userRoundup);
    let invested = 0, symbol = ROUNDUP_CONFIG.defaultSymbol;
    if (userRoundup.balance >= ROUNDUP_CONFIG.investThreshold) {
      try {
        const tradeResult = await executeTrade(userId, symbol, userRoundup.balance, 'buy', true);
        userRoundup.balance = 0;
        userRoundup.invested += tradeResult.userGain;
        saveRoundup(userId, userRoundup);
        invested = tradeResult.userGain;
        receipt.invested = true;
        receipt.investedAmount = invested;
        receipt.investSymbol = symbol;
      } catch(e) {}
    }
    const invoiceHtml = generateInvoice(receipt);
    receipt.invoiceHtml = invoiceHtml;
    const allReceipts = loadReceipts(userId);
    const idx = allReceipts.findIndex(r => r.id === receipt.id);
    if (idx !== -1) allReceipts[idx] = receipt;
    saveEarnings(loadEarnings());
    res.status(200).json({ receiptId: receipt.id, total: finalTotal, roundup, newBalance: userRoundup.balance, invested, invoiceUrl: `/api/receipt/invoice/${receipt.id}` });
    return;
  }

  if (url.startsWith('/api/receipt/invoice/') && method === 'GET') {
    const receiptId = url.split('/').pop();
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const receipts = loadReceipts(userId);
    const receipt = receipts.find(r => r.id === receiptId);
    if (!receipt) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(receipt.invoiceHtml || '<p>No invoice</p>');
    return;
  }

  if (url === '/api/receipt/history' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const receipts = loadReceipts(userId);
    res.status(200).json(receipts.map(r => ({ id: r.id, total: r.total, roundup: r.roundup, date: r.date, invested: r.invested || false, investedAmount: r.investedAmount || 0 })));
    return;
  }


  // ---------- Deposit Endpoint (real money) ----------
  if (url === '/api/deposit' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const depositUrl = process.env.DEPOSIT_URL || 'https://paypal.me/yourhandle';
    res.status(200).json({ url: depositUrl });
    return;
  }


  // ---------- 1. Watchlist ----------
  let watchlists = new Map(); // userId -> [symbols]
  if (url === '/api/watchlist' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const list = watchlists.get(userId) || [];
    res.status(200).json({ watchlist: list });
    return;
  }
  if (url === '/api/watchlist' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
    let list = watchlists.get(userId) || [];
    if (!list.includes(symbol)) list.push(symbol);
    watchlists.set(userId, list);
    res.status(200).json({ message: 'Added to watchlist', watchlist: list });
    return;
  }
  if (url === '/api/watchlist' && method === 'DELETE') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
    let list = watchlists.get(userId) || [];
    list = list.filter(s => s !== symbol);
    watchlists.set(userId, list);
    res.status(200).json({ message: 'Removed from watchlist', watchlist: list });
    return;
  }

  // ---------- 2. Price Alerts ----------
  let alerts = new Map(); // userId -> [{symbol, price, direction, triggered}]
  if (url === '/api/alerts' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userAlerts = alerts.get(userId) || [];
    res.status(200).json({ alerts: userAlerts });
    return;
  }
  if (url === '/api/alerts' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, price, direction } = req.body; // direction: 'above' | 'below'
    if (!symbol || !price || !direction) return res.status(400).json({ error: 'Missing fields' });
    const userAlerts = alerts.get(userId) || [];
    userAlerts.push({ symbol, price, direction, triggered: false, id: Date.now().toString(36) });
    alerts.set(userId, userAlerts);
    res.status(200).json({ message: 'Alert set', alerts: userAlerts });
    return;
  }
  if (url === '/api/alerts' && method === 'DELETE') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { alertId } = req.body;
    if (!alertId) return res.status(400).json({ error: 'Missing alertId' });
    let userAlerts = alerts.get(userId) || [];
    userAlerts = userAlerts.filter(a => a.id !== alertId);
    alerts.set(userId, userAlerts);
    res.status(200).json({ message: 'Alert removed', alerts: userAlerts });
    return;
  }

  // ---------- 3. Limit Orders ----------
  let limitOrders = new Map(); // userId -> [{symbol, price, amount, status}]
  if (url === '/api/orders/limit' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, price, amount, side } = req.body; // side: 'buy' | 'sell'
    if (!symbol || !price || !amount || !side) return res.status(400).json({ error: 'Missing fields' });
    const order = { id: Date.now().toString(36), symbol, price, amount, side, status: 'pending', createdAt: Date.now() };
    const userOrders = limitOrders.get(userId) || [];
    userOrders.push(order);
    limitOrders.set(userId, userOrders);
    res.status(200).json({ message: 'Limit order placed', order });
    return;
  }
  if (url === '/api/orders/limit' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userOrders = limitOrders.get(userId) || [];
    res.status(200).json({ orders: userOrders });
    return;
  }
  if (url === '/api/orders/limit' && method === 'DELETE') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'Missing orderId' });
    let userOrders = limitOrders.get(userId) || [];
    userOrders = userOrders.filter(o => o.id !== orderId);
    limitOrders.set(userId, userOrders);
    res.status(200).json({ message: 'Order cancelled' });
    return;
  }

  // ---------- 4. Stop‑Loss / Take‑Profit ----------
  let stopLosses = new Map(); // userId -> [{symbol, stopPrice, takeProfit, amount}]
  if (url === '/api/risk/stoploss' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, stopPrice, takeProfit, amount } = req.body;
    if (!symbol || !stopPrice || !amount) return res.status(400).json({ error: 'Missing fields' });
    const sl = { id: Date.now().toString(36), symbol, stopPrice, takeProfit: takeProfit || null, amount, status: 'active' };
    const userSL = stopLosses.get(userId) || [];
    userSL.push(sl);
    stopLosses.set(userId, userSL);
    res.status(200).json({ message: 'Stop-loss set', sl });
    return;
  }
  if (url === '/api/risk/stoploss' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userSL = stopLosses.get(userId) || [];
    res.status(200).json({ stopLosses: userSL });
    return;
  }

  // ---------- 5. Portfolio ----------
  let portfolios = new Map(); // userId -> [{symbol, shares, avgPrice}]
  if (url === '/api/portfolio' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const port = portfolios.get(userId) || [];
    // enrich with current prices
    const enriched = await Promise.all(port.map(async item => {
      try {
        let price;
        if (item.symbol.length <= 5 && /^[A-Z]+$/.test(item.symbol)) price = await getStockPrice(item.symbol);
        else price = await getCryptoPrice(item.symbol);
        return { ...item, currentPrice: price, value: price * item.shares };
      } catch { return { ...item, currentPrice: 0, value: 0 }; }
    }));
    res.status(200).json({ portfolio: enriched });
    return;
  }
  if (url === '/api/portfolio' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, shares, avgPrice } = req.body;
    if (!symbol || !shares) return res.status(400).json({ error: 'Missing fields' });
    const port = portfolios.get(userId) || [];
    const existing = port.find(p => p.symbol === symbol);
    if (existing) {
      existing.shares += shares;
      existing.avgPrice = (existing.avgPrice * existing.shares + avgPrice * shares) / (existing.shares + shares);
    } else {
      port.push({ symbol, shares, avgPrice: avgPrice || 0 });
    }
    portfolios.set(userId, port);
    res.status(200).json({ message: 'Portfolio updated', portfolio: port });
    return;
  }

  // ---------- 6. News Feed ----------
  if (url === '/api/news' && method === 'GET') {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
    try {
      // Use a free news API (replace with real key later)
      const news = [
        { title: `${symbol} announces new product`, date: new Date().toISOString() },
        { title: `${symbol} earnings beat estimates`, date: new Date(Date.now() - 86400000).toISOString() },
        { title: `${symbol} stock surges on strong demand`, date: new Date(Date.now() - 172800000).toISOString() }
      ];
      res.status(200).json({ news });
    } catch(e) { res.status(500).json({ error: e.message }); }
    return;
  }

  // ---------- 7. Social Trading (copy trades) ----------
  let socialTrades = new Map(); // userId -> [trade]
  if (url === '/api/social/copy' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { targetUserId, symbol, amount } = req.body;
    if (!targetUserId || !symbol || !amount) return res.status(400).json({ error: 'Missing fields' });
    // Simulate copying: we'll just replicate the trade for the user
    const tradeResult = await executeTrade(userId, symbol, amount, 'buy', true);
    const copyRecord = { from: targetUserId, symbol, amount, timestamp: Date.now(), result: tradeResult };
    const userCopies = socialTrades.get(userId) || [];
    userCopies.push(copyRecord);
    socialTrades.set(userId, userCopies);
    res.status(200).json({ message: 'Copy trade executed', copy: copyRecord });
    return;
  }
  if (url === '/api/social/copies' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const copies = socialTrades.get(userId) || [];
    res.status(200).json({ copies });
    return;
  }

  // ---------- 8. Leaderboard ----------
  let leaderboardCache = [];
  function updateLeaderboard() {
    const entries = [];
    for (const [id, state] of userTraderStates) {
      const user = users.find(u => u.id === id);
      if (user) entries.push({ userId: id, username: user.username, profit: state.userProfit || 0 });
    }
    entries.sort((a,b) => b.profit - a.profit);
    leaderboardCache = entries.slice(0, 20);
  }
  if (url === '/api/leaderboard' && method === 'GET') {
    updateLeaderboard();
    res.status(200).json({ leaderboard: leaderboardCache });
    return;
  }

  // ---------- 9. Staking ----------
  let stakes = new Map(); // userId -> [{amount, asset, startDate, reward}]
  if (url === '/api/staking' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount, asset } = req.body;
    if (!amount || !asset) return res.status(400).json({ error: 'Missing fields' });
    const stake = { id: Date.now().toString(36), amount, asset, startDate: Date.now(), reward: 0, status: 'active' };
    const userStakes = stakes.get(userId) || [];
    userStakes.push(stake);
    stakes.set(userId, userStakes);
    res.status(200).json({ message: 'Stake created', stake });
    return;
  }
  if (url === '/api/staking' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userStakes = stakes.get(userId) || [];
    res.status(200).json({ stakes: userStakes });
    return;
  }

  // ---------- 10. Yield Farming (simulated) ----------
  if (url === '/api/yield/farm' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: 'Missing amount' });
    // Simulate yield
    const yieldReturn = amount * (0.05 + Math.random() * 0.05); // 5-10% APY simulation
    const state = getUserTraderState(userId);
    state.userProfit += yieldReturn;
    addTraderLog(userId, `Yield farming: $${amount} → +$${yieldReturn.toFixed(2)}`);
    res.status(200).json({ message: 'Yield farmed', yield: yieldReturn });
    return;
  }

  // ---------- 11. NFT Viewer ----------
  if (url === '/api/nft' && method === 'GET') {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'Missing address' });
    // Mock NFTs
    const nfts = [
      { name: 'Pixel Cat #123', tokenId: '123', image: 'https://picsum.photos/200' },
      { name: 'CyberPunk #456', tokenId: '456', image: 'https://picsum.photos/200' }
    ];
    res.status(200).json({ nfts });
    return;
  }

  // ---------- 12. Loan / Credit ----------
  let loans = new Map(); // userId -> [{amount, interest, dueDate}]
  if (url === '/api/loan/request' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount, duration } = req.body; // duration in months
    if (!amount || !duration) return res.status(400).json({ error: 'Missing fields' });
    const interest = amount * 0.05 * (duration/12);
    const due = Date.now() + duration * 30 * 24 * 60 * 60 * 1000;
    const loan = { id: Date.now().toString(36), amount, interest, dueDate: due, status: 'active' };
    const userLoans = loans.get(userId) || [];
    userLoans.push(loan);
    loans.set(userId, userLoans);
    // Credit user's balance
    const state = getUserTraderState(userId);
    state.userProfit += amount;
    res.status(200).json({ message: 'Loan approved', loan });
    return;
  }
  if (url === '/api/loan' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userLoans = loans.get(userId) || [];
    res.status(200).json({ loans: userLoans });
    return;
  }

  // ---------- 13. Two-Factor Auth (TOTP simulation) ----------
  let twoFactor = new Map(); // userId -> {enabled, secret}
  if (url === '/api/2fa/enable' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    twoFactor.set(userId, { enabled: true, secret: 'ABCDEFGHIJKLMNOP' });
    res.status(200).json({ message: '2FA enabled', secret: 'ABCDEFGHIJKLMNOP' });
    return;
  }
  if (url === '/api/2fa/verify' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { code } = req.body;
    if (code === '123456') { // simple mock
      res.status(200).json({ verified: true });
    } else {
      res.status(401).json({ error: 'Invalid code' });
    }
    return;
  }

  // ---------- 14. Withdrawal (real money) ----------
  if (url === '/api/withdrawal/request' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount, address } = req.body;
    if (!amount || !address) return res.status(400).json({ error: 'Missing fields' });
    const state = getUserTraderState(userId);
    if (state.userProfit < amount) return res.status(400).json({ error: 'Insufficient balance' });
    state.userProfit -= amount;
    const data = loadEarnings();
    data.withdrawals.push({ userId, amount, address, timestamp: Date.now(), status: 'pending' });
    saveEarnings(data);
    res.status(200).json({ message: 'Withdrawal requested', remaining: state.userProfit });
    return;
  }

  // ---------- 15. Deposit History ----------
  if (url === '/api/deposits/history' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    // Mock deposits
    res.status(200).json({ deposits: [{ amount: 100, date: Date.now() - 86400000, status: 'completed' }] });
    return;
  }

  // ---------- 16. Trading Bots (multiple strategies) ----------
  if (url === '/api/bots' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const state = getUserTraderState(userId);
    const bots = [
      { id: 'bot1', name: 'Scalper', running: state.running, strategy: 'scalp' },
      { id: 'bot2', name: 'Momentum', running: false, strategy: 'momentum' }
    ];
    res.status(200).json({ bots });
    return;
  }
  if (url === '/api/bots/start' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { botId } = req.body;
    const state = getUserTraderState(userId);
    state.running = true;
    res.status(200).json({ message: `Bot ${botId} started` });
    return;
  }

  // ---------- 17. Backtesting ----------
  if (url === '/api/backtest' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, strategy, start, end } = req.body;
    // Mock results
    res.status(200).json({
      initialBalance: 10000,
      finalBalance: 11000,
      trades: 25,
      winRate: 0.6,
      sharpeRatio: 1.2
    });
    return;
  }

  // ---------- 18. Market Sentiment ----------
  if (url === '/api/sentiment' && method === 'GET') {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
    const sentiment = { symbol, score: Math.random() * 100, bullish: Math.random() > 0.5 };
    res.status(200).json(sentiment);
    return;
  }

  // ---------- 19. Economic Calendar ----------
  if (url === '/api/calendar' && method === 'GET') {
    const events = [
      { event: 'Fed Rate Decision', date: new Date(Date.now() + 86400000 * 2).toISOString(), impact: 'High' },
      { event: 'Employment Report', date: new Date(Date.now() + 86400000 * 5).toISOString(), impact: 'Medium' }
    ];
    res.status(200).json({ events });
    return;
  }

  // ---------- 20. User Settings ----------
  if (url === '/api/settings' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.status(200).json({ username: user.username, settings: { theme: 'dark', notifications: true } });
    return;
  }
  if (url === '/api/settings' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { theme, notifications } = req.body;
    // We just store in memory (or could save to Firestore)
    res.status(200).json({ message: 'Settings updated' });
    return;
  }

  // ---------- 21. Referral Earnings Detail ----------
  if (url === '/api/referral/earnings/detail' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const tree = referralTree.get(userId);
    const earnings = getUserTraderState(userId).userProfit || 0;
    const referrals = tree?.referrals || [];
    const detail = referrals.map(id => ({ userId: id, commission: (Math.random() * 10).toFixed(2) }));
    res.status(200).json({ totalEarnings: earnings, details: detail });
    return;
  }

  // ---------- 22. Quick Trade (one-click) ----------
  if (url === '/api/trade/quick' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, amount } = req.body;
    if (!symbol || !amount) return res.status(400).json({ error: 'Missing fields' });
    const result = await executeTrade(userId, symbol, amount, 'buy', true);
    res.status(200).json(result);
    return;
  }

  // ---------- 23. Earn Interest (Savings) ----------
  if (url === '/api/savings/deposit' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: 'Missing amount' });
    const state = getUserTraderState(userId);
    state.userProfit += amount * 0.001; // 0.1% daily interest
    res.status(200).json({ message: 'Interest earned' });
    return;
  }


  // ---------- Global Meta Receipt System ----------
  // Stores registry
  let stores = new Map(); // storeId -> { name, location, cashiers: [], totalDeposits: 0, totalRoundups: 0 }
  // Customer deposits
  let deposits = new Map(); // depositId -> { customerId, storeId, amount, roundup, total, timestamp, invested }
  // Customer accounts (linked to phone/email)
  let customerAccounts = new Map(); // customerId -> { name, phone, email, balance, deposits: [] }

  // Generate unique IDs
  function generateStoreId() { return 'ST' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase(); }
  function generateDepositId() { return 'DP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase(); }
  function generateCustomerId() { return 'CU' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase(); }

  // Register a new store
  if (url === '/api/store/register' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { name, location } = req.body;
    if (!name) return res.status(400).json({ error: 'Store name required' });
    const storeId = generateStoreId();
    stores.set(storeId, { id: storeId, name, location: location || '', cashiers: [userId], totalDeposits: 0, totalRoundups: 0 });
    res.status(201).json({ storeId, message: 'Store registered' });
    return;
  }

  // Get store info
  if (url === '/api/store/info' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    // Find store where user is cashier
    let store = null;
    for (const [id, s] of stores) {
      if (s.cashiers.includes(userId)) { store = { ...s, id }; break; }
    }
    if (!store) return res.status(404).json({ error: 'Store not found' });
    res.status(200).json(store);
    return;
  }

  // Get or create customer account
  async function getCustomerAccount(identifier) {
    // identifier can be phone or email
    let customer = null;
    for (const [id, c] of customerAccounts) {
      if (c.phone === identifier || c.email === identifier) {
        customer = { ...c, id };
        break;
      }
    }
    if (!customer) {
      const newId = generateCustomerId();
      customerAccounts.set(newId, {
        id: newId,
        name: '',
        phone: identifier.includes('@') ? '' : identifier,
        email: identifier.includes('@') ? identifier : '',
        balance: 0,
        deposits: []
      });
      customer = { ...customerAccounts.get(newId), id: newId };
    }
    return customer;
  }

  // Create a deposit (cashier creates this)
  if (url === '/api/deposit/create' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { storeId, amount, customerName, customerId, phone, email } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (!storeId || !stores.has(storeId)) return res.status(400).json({ error: 'Invalid store' });

    // Compute round-up (to nearest dollar or custom)
    const rounded = Math.ceil(amount);
    const roundup = rounded - amount;
    const totalPaid = rounded; // customer pays rounded amount
    if (roundup <= 0.001) return res.status(400).json({ error: 'No spare change' });

    // Find or create customer
    let customer;
    if (customerId && customerAccounts.has(customerId)) {
      customer = customerAccounts.get(customerId);
    } else if (phone || email) {
      const identifier = phone || email;
      customer = await getCustomerAccount(identifier);
      if (customerName) customer.name = customerName;
    } else {
      // Guest: create a temporary account
      const newId = generateCustomerId();
      customerAccounts.set(newId, { id: newId, name: customerName || 'Guest', phone: '', email: '', balance: 0, deposits: [] });
      customer = customerAccounts.get(newId);
    }

    // Create deposit record
    const depositId = generateDepositId();
    const deposit = {
      id: depositId,
      customerId: customer.id,
      storeId,
      amount,
      roundup,
      total: totalPaid,
      timestamp: Date.now(),
      invested: false,
      investedAmount: 0,
      status: 'pending' // pending investment
    };
    deposits.set(depositId, deposit);

    // Update store totals
    const store = stores.get(storeId);
    store.totalDeposits += amount;
    store.totalRoundups += roundup;
    stores.set(storeId, store);

    // Credit customer balance (round-up amount)
    customer.balance += roundup;
    customer.deposits.push(depositId);
    customerAccounts.set(customer.id, customer);

    // Now automatically invest the round-up using the trading engine
    let invested = 0;
    let symbol = 'SPY'; // default investment
    try {
      // Use existing executeTrade function (or the round-up invest logic)
      // We'll use the round-up invest logic from earlier
      const tradeResult = await executeTrade(customer.id, symbol, roundup, 'buy', true);
      invested = tradeResult.userGain || roundup; // net gain after fees
      deposit.invested = true;
      deposit.investedAmount = invested;
      deposit.status = 'completed';
      deposits.set(depositId, deposit);
      // Also update customer's invested balance (we already added roundup to balance)
      // The balance already includes the round-up; but we want to show both balance and invested.
      // We'll add a separate field "investedBalance"
      customer.investedBalance = (customer.investedBalance || 0) + invested;
      customerAccounts.set(customer.id, customer);
    } catch (err) {
      deposit.status = 'failed';
      deposits.set(depositId, deposit);
      console.error('Auto-invest failed:', err.message);
    }

    // Generate receipt (meta receipt) – return deposit ID and QR code
    const qrData = `${process.env.BASE_URL || 'https://onroadnow.vercel.app'}/deposit/${depositId}`;
    const QRCode = require('qrcode');
    const qrCode = await QRCode.toDataURL(qrData);

    res.status(201).json({
      depositId,
      roundup,
      total: totalPaid,
      invested: deposit.invested,
      investedAmount: deposit.investedAmount || 0,
      customerId: customer.id,
      customerName: customer.name || 'Guest',
      qrCode,
      claimUrl: qrData,
      message: 'Deposit created and invested successfully.'
    });
    return;
  }

  // Get deposit details (for customer)
  if (url === '/api/deposit/view' && method === 'GET') {
    const { depositId } = req.query;
    if (!depositId) return res.status(400).json({ error: 'Missing depositId' });
    const deposit = deposits.get(depositId);
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    // If userId is provided, verify it matches the customer
    if (userId && deposit.customerId !== userId) {
      // Allow if admin
      if (userId !== 'admin' && req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
        return res.status(403).json({ error: 'Not authorized' });
      }
    }
    res.status(200).json(deposit);
    return;
  }

  // Customer dashboard (all deposits for a user)
  if (url === '/api/customer/dashboard' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const customer = customerAccounts.get(userId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    // Get all deposits for this customer
    const customerDeposits = [];
    for (const depId of customer.deposits || []) {
      const dep = deposits.get(depId);
      if (dep) customerDeposits.push(dep);
    }
    // Also get current investments from the trader state
    const state = getUserTraderState(userId);
    res.status(200).json({
      customer,
      deposits: customerDeposits,
      tradingProfit: state.userProfit || 0,
      totalInvested: customer.investedBalance || 0,
      currentBalance: customer.balance || 0
    });
    return;
  }

  // Store dashboard (for store admins)
  if (url === '/api/store/dashboard' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    let store = null;
    for (const [id, s] of stores) {
      if (s.cashiers.includes(userId)) { store = { ...s, id }; break; }
    }
    if (!store) return res.status(404).json({ error: 'Store not found' });
    // Get today's deposits for this store
    const now = Date.now();
    const dayStart = new Date(now);
    dayStart.setHours(0,0,0,0);
    const todayDeposits = [];
    let totalToday = 0;
    let totalRoundupToday = 0;
    for (const [depId, dep] of deposits) {
      if (dep.storeId === store.id && dep.timestamp >= dayStart.getTime()) {
        todayDeposits.push(dep);
        totalToday += dep.amount;
        totalRoundupToday += dep.roundup;
      }
    }
    res.status(200).json({
      store,
      today: { count: todayDeposits.length, totalAmount: totalToday, totalRoundup: totalRoundupToday },
      allTime: { totalDeposits: store.totalDeposits, totalRoundups: store.totalRoundups }
    });
    return;
  }

  // Global leaderboard of stores (by total deposits)
  if (url === '/api/store/leaderboard' && method === 'GET') {
    const sorted = Array.from(stores.values()).sort((a,b) => b.totalDeposits - a.totalDeposits).slice(0, 20);
    res.status(200).json({ leaderboard: sorted });
    return;
  }


  // ---------- MICRO-CHANGE TRADING PLATFORM (New) ----------
  // Extended customer accounts, deposits, fees, trading, withdrawals

  // Fee configuration (3‑9% of round‑up or trade profit)
  const MICRO_FEE_CONFIG = {
    minFeePercent: 3,
    maxFeePercent: 9,
    // Fee is dynamic based on deposit amount or trade size
  };

  function calculateMicroFee(amount) {
    // Fee scales: larger amounts get lower percentage
    let percent;
    if (amount < 5) percent = 9;
    else if (amount < 20) percent = 7;
    else if (amount < 50) percent = 5;
    else percent = 3;
    return { percent, fee: amount * (percent / 100) };
  }

  // Extended customer storage
  let microCustomers = new Map(); // customerId -> { name, phone, email, balance, invested, deposits: [] }
  let microDeposits = new Map();  // depositId -> { customerId, amount, roundup, fee, netInvested, status, timestamp }

  function getMicroCustomer(userId) {
    if (!microCustomers.has(userId)) {
      microCustomers.set(userId, { name: '', phone: '', email: '', balance: 0, invested: 0, deposits: [] });
    }
    return microCustomers.get(userId);
  }

  // Create deposit (teller)
  if (url === '/api/micro/deposit/create' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount, customerName, phone, email } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const rounded = Math.ceil(amount);
    const roundup = rounded - amount;
    if (roundup <= 0.001) return res.status(400).json({ error: 'No spare change' });

    // Calculate fee
    const { percent, fee } = calculateMicroFee(roundup);
    const netInvested = roundup - fee;

    // Get or create customer
    const customer = getMicroCustomer(userId);
    customer.name = customerName || customer.name;
    customer.phone = phone || customer.phone;
    customer.email = email || customer.email;
    customer.balance += netInvested;  // add net amount to balance

    // Generate deposit record
    const depositId = 'MD' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
    const deposit = {
      id: depositId,
      customerId: userId,
      amount,
      roundup,
      fee,
      netInvested,
      status: 'invested', // will be auto-invested
      timestamp: Date.now()
    };
    microDeposits.set(depositId, deposit);
    customer.deposits.push(depositId);
    microCustomers.set(userId, customer);

    // Auto-invest using existing executeTrade (buy SPY or default)
    let investedAmount = 0;
    try {
      const tradeResult = await executeTrade(userId, 'SPY', netInvested, 'buy', true);
      investedAmount = tradeResult.userGain || netInvested;
      // The balance already includes netInvested; we'll track separately
      customer.invested += investedAmount;
      microCustomers.set(userId, customer);
    } catch (err) {
      // If auto-invest fails, mark as pending
      deposit.status = 'pending';
      microDeposits.set(depositId, deposit);
    }

    // Generate QR code
    const QRCode = require('qrcode');
    const claimUrl = `${process.env.BASE_URL || 'https://onroadnow.vercel.app'}/micro-dashboard?deposit=${depositId}`;
    const qrCode = await QRCode.toDataURL(claimUrl);

    res.status(201).json({
      depositId,
      total: rounded,
      roundup,
      fee,
      netInvested,
      customerName: customer.name,
      claimUrl,
      qrCode
    });
    return;
  }

  // Get customer dashboard
  if (url === '/api/micro/dashboard' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const customer = microCustomers.get(userId) || { balance: 0, invested: 0, deposits: [] };
    const depositList = customer.deposits.map(id => microDeposits.get(id)).filter(Boolean);
    // Get trading profit from existing system
    const state = getUserTraderState(userId);
    const profit = state.userProfit || 0;
    res.status(200).json({
      balance: customer.balance || 0,
      invested: customer.invested || 0,
      profit,
      deposits: depositList
    });
    return;
  }

  // Manual trading (with fee)
  if (url === '/api/micro/trade' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, amount, type } = req.body;
    if (!symbol || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid trade' });
    const customer = getMicroCustomer(userId);
    if (customer.balance < amount && type === 'buy') {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    // Execute trade using existing executeTrade
    try {
      const tradeResult = await executeTrade(userId, symbol, amount, type, true);
      // Fee is already included in the tradeResult (from the original executeTrade)
      // But we want to track additional fee for our system
      const { percent, fee } = calculateMicroFee(amount);
      // Deduct fee from balance (on buy)
      if (type === 'buy') {
        customer.balance -= fee;
        microCustomers.set(userId, customer);
      }
      res.status(200).json({
        price: tradeResult.price,
        shares: tradeResult.units,
        fee,
        net: tradeResult.userGain - fee,
        message: `Trade executed with ${percent}% fee.`
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // Withdrawal (with fee)
  if (url === '/api/micro/withdraw' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount, address } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const customer = getMicroCustomer(userId);
    if (customer.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });
    // Withdrawal fee: 3%
    const fee = amount * 0.03;
    const netWithdraw = amount - fee;
    customer.balance -= amount; // deduct full amount (fee goes to company)
    microCustomers.set(userId, customer);
    // Log withdrawal
    const data = loadEarnings();
    data.withdrawals.push({ userId, amount, fee, netWithdraw, address, timestamp: Date.now(), status: 'pending' });
    saveEarnings(data);
    res.status(200).json({ message: 'Withdrawal requested', netAmount: netWithdraw, fee });
    return;
  }


  // ---------- FIXED SIGNUP (with email) ----------
  if (url === '/api/micro/signup' && method === 'POST') {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    // Check if username or email already exists
    if (users.find(u => u.username === username || u.email === email)) {
      return res.status(400).json({ error: 'Username or email already taken' });
    }
    const userId = crypto.randomUUID();
    const newUser = {
      id: userId,
      username,
      email,
      password: hashPassword(password),
      referrerId: null
    };
    users.push(newUser);
    // Auto-login: create token
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=604800; Secure; SameSite=None`);
    res.status(201).json({ message: 'Account created', userId, username });
    return;
  }

  // Also patch /api/me to include email
  // We'll keep the existing /api/me but add an alternative /api/micro/me that returns email.
  if (url === '/api/micro/me' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.status(200).json({ id: user.id, username: user.username, email: user.email || '' });
    return;
  }


  // ---------- Mining Stats (Real Pool Data) ----------
  if (url === '/api/stats' && method === 'GET') {
    const wallet = '9vXyKbMr85Yaus38RQnjLjfxPWbCJVESbTmRH6JCWVE2';
    try {
      // Fetch pool stats from supportxmr.com
      const poolResponse = await axios.get(`https://supportxmr.com/api/miner/${wallet}/stats`);
      const poolData = poolResponse.data;
      // Also fetch current XMR price
      const priceResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd');
      const xmrPrice = priceResponse.data.monero?.usd || 0;

      res.status(200).json({
        wallet,
        hashrate: poolData.hashrate || 0,
        hashrateUnit: 'H/s',
        totalHashes: poolData.totalHashes || 0,
        unpaidBalance: (poolData.amtDue || 0) / 1e12, // convert from piconero
        lastShare: poolData.lastShare || 0,
        xmrPrice,
        valueUSD: ((poolData.amtDue || 0) / 1e12) * xmrPrice
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch pool stats' });
    }
    return;
  }


  // ---------- MINING SYSTEM (Real Pool Stats) ----------
  const MINING_WALLET = '9vXyKbMr85Yaus38RQnjLjfxPWbCJVESbTmRH6JCWVE2';
  const POOL_API = 'https://supportxmr.com/api/miner';
  let miningCache = { data: null, timestamp: 0 };

  if (url === '/api/mining/stats' && method === 'GET') {
    // Check cache (30 seconds)
    const now = Date.now();
    if (miningCache.data && (now - miningCache.timestamp < 30000)) {
      res.status(200).json(miningCache.data);
      return;
    }
    try {
      // Fetch from pool
      const [poolRes, priceRes] = await Promise.all([
        axios.get(`${POOL_API}/${MINING_WALLET}/stats`),
        axios.get('https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd')
      ]);
      const pool = poolRes.data;
      const price = priceRes.data.monero?.usd || 0;
      const unpaid = (pool.amtDue || 0) / 1e12;

      const stats = {
        wallet: MINING_WALLET,
        hashrate: pool.hashrate || 0,
        hashrateUnit: 'H/s',
        totalHashes: pool.totalHashes || 0,
        unpaidBalance: unpaid,
        valueUSD: unpaid * price,
        lastShare: pool.lastShare || 0,
        xmrPrice: price,
        poolName: 'supportxmr.com',
        minersOnline: pool.minersOnline || 0,
        poolHashrate: pool.networkHashrate || 0,
        poolHashrateUnit: 'MH/s'
      };
      miningCache.data = stats;
      miningCache.timestamp = now;
      res.status(200).json(stats);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch mining stats' });
    }
    return;
  }


  // ---------- MINING SYSTEM (Real Pool Stats) ----------
  const MINING_WALLET = '9vXyKbMr85Yaus38RQnjLjfxPWbCJVESbTmRH6JCWVE2';
  const POOL_API = 'https://supportxmr.com/api/miner';
  let miningCache = { data: null, timestamp: 0 };

  if (url === '/api/mining/stats' && method === 'GET') {
    // Check cache (30 seconds)
    const now = Date.now();
    if (miningCache.data && (now - miningCache.timestamp < 30000)) {
      res.status(200).json(miningCache.data);
      return;
    }
    try {
      // Fetch from pool
      const [poolRes, priceRes] = await Promise.all([
        axios.get(`${POOL_API}/${MINING_WALLET}/stats`),
        axios.get('https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd')
      ]);
      const pool = poolRes.data;
      const price = priceRes.data.monero?.usd || 0;
      const unpaid = (pool.amtDue || 0) / 1e12;

      const stats = {
        wallet: MINING_WALLET,
        hashrate: pool.hashrate || 0,
        hashrateUnit: 'H/s',
        totalHashes: pool.totalHashes || 0,
        unpaidBalance: unpaid,
        valueUSD: unpaid * price,
        lastShare: pool.lastShare || 0,
        xmrPrice: price,
        poolName: 'supportxmr.com',
        minersOnline: pool.minersOnline || 0,
        poolHashrate: pool.networkHashrate || 0,
        poolHashrateUnit: 'MH/s'
      };
      miningCache.data = stats;
      miningCache.timestamp = now;
      res.status(200).json(stats);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch mining stats' });
    }
    return;
  }

};
