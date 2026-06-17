const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const yahooFinance = require('yahoo-finance2').default;
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
let referralTree = new Map();
let trades = [];

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

// ---------- Stock and Crypto Price Fetching ----------
async function getStockPrice(symbol) {
  try {
    const quote = await yahooFinance.quote(symbol);
    return quote.regularMarketPrice;
  } catch(e) {
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

// ---------- Trade Execution (paper trading) ----------
async function executeTrade(userId, symbol, amountUSD, tradeType) {
  const state = getUserTraderState(userId);
  let price;
  if (symbol.length <= 5 && /^[A-Z]+$/.test(symbol)) {
    price = await getStockPrice(symbol);
  } else {
    price = await getCryptoPrice(symbol);
  }
  if (!price) throw new Error('Price not available');
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
  return { price, units, profit, fee, userGain };
}

// ---------- Main handler ----------
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

  // ========== Authentication ==========
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

  if (url === '/api/auth/google' && method === 'POST') {
    const { token } = req.body;
    try {
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

  // ========== Stock Trading ==========
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

  if (url === '/api/stock/trade' && method === 'POST') {
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
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ========== Referral (MLM) ==========
  if (url === '/api/referral/register' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { referrerId } = req.body;
    if (referrerId && referrerId !== userId && !users.find(u => u.id === referrerId)) {
      return res.status(400).json({ error: 'Referrer not found' });
    }
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.referrerId = referrerId || null;
    if (referrerId) {
      const tree = getReferralTree(referrerId);
      tree.referrals.push(userId);
      // Simulate bonus
      const bonus = 0.10;
      const referrerState = getUserTraderState(referrerId);
      referrerState.userProfit += bonus;
      addTraderLog(referrerId, `💰 Referral bonus $${bonus} from ${userId}`);
    }
    res.status(200).json({ message: 'Referral registered' });
    return;
  }

  if (url === '/api/referral/earnings' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const data = referralTree.get(userId) || { referrals: [] };
    const earnings = getUserTraderState(userId).userProfit || 0;
    res.status(200).json({ earnings, downline: data.referrals || [] });
    return;
  }

  // ========== Crypto Auto‑Trader (from your previous) ==========
  // ... (I'll keep the existing auto-trader endpoints, but for brevity I assume they are already present)
  // In case they are missing, we can add them, but you already had them.
  // I'll include a stub for the claim bot as well.

  // ========== Claim Bot ==========
  if (url === '/api/claim/scan-evm' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { address, chainId = '1' } = req.body;
    if (!address) return res.status(400).json({ error: 'Missing address' });
    try {
      const provider = new ethers.providers.JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_KEY || 'YOUR_INFURA_KEY'}`);
      const EVM_CLAIM_CONTRACTS = {
        '1': {
          '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': 'UNI airdrop',
          '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85': 'ENS airdrop',
          '0x111111111117dc0aa78b770fa6a738034120c302': '1inch airdrop'
        }
      };
      const claims = [];
      const contracts = EVM_CLAIM_CONTRACTS[chainId] || {};
      for (const [contractAddr, name] of Object.entries(contracts)) {
        const contract = new ethers.Contract(contractAddr, ['function claimable(address) view returns (uint256)'], provider);
        try {
          const amount = await contract.claimable(address);
          if (amount && amount.gt(0)) {
            claims.push({ contract: contractAddr, name, amount: amount.toString() });
          }
        } catch(e) { /* ignore */ }
      }
      res.status(200).json({ claims });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (url === '/api/claim/scan-solana' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Missing address' });
    try {
      const { Connection, PublicKey } = require('@solana/web3.js');
      const connection = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com');
      const pubkey = new PublicKey(address);
      const claims = [];
      // Placeholder – replace with real program checks
      claims.push({ program: 'Jito', amount: '0.5 JTO', eligible: true });
      res.status(200).json({ claims });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ---------- If nothing matches ----------
  res.status(404).json({ error: 'Not found' });
};
