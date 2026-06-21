const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

// ---------- Configuration ----------
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'fallback-client-id';

// ---------- Fallback RPCs ----------
const ETH_RPCS = [
  'https://cloudflare-eth.com',
  'https://rpc.ankr.com/eth',
  'https://ethereum.publicnode.com',
  'https://eth-mainnet.g.alchemy.com/v2/demo',
  process.env.INFURA_KEY ? `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}` : null
].filter(Boolean);

const SOLANA_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-api.projectserum.com',
  'https://rpc.ankr.com/solana',
  process.env.SOLANA_RPC
].filter(Boolean);

// ---------- Fallback Price APIs ----------
const PRICE_SOURCES = [
  {
    name: 'CoinGecko',
    url: (symbol) => `https://api.coingecko.com/api/v3/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd`,
    parse: (data, symbol) => data[symbol.toLowerCase()]?.usd
  },
  {
    name: 'Binance',
    url: (symbol) => `https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`,
    parse: (data) => parseFloat(data.price)
  },
  {
    name: 'Kraken',
    url: (symbol) => `https://api.kraken.com/0/public/Ticker?pair=${symbol.toUpperCase()}USD`,
    parse: (data) => {
      const pair = Object.keys(data.result)[0];
      return parseFloat(data.result[pair].c[0]);
    }
  }
];

// ---------- State ----------
let users = [];
let userTraderStates = new Map();
let trades = [];

// ---------- Helpers ----------
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

// ---------- Smart Price Fetching ----------
async function getCryptoPrice(symbol) {
  const errors = [];
  for (const source of PRICE_SOURCES) {
    try {
      const url = source.url(symbol);
      const response = await axios.get(url, { timeout: 5000 });
      const price = source.parse(response.data, symbol);
      if (price && !isNaN(price)) {
        return price;
      }
    } catch (e) {
      errors.push(`${source.name}: ${e.message}`);
    }
  }
  throw new Error(`All price sources failed: ${errors.join('; ')}`);
}

async function getStockPrice(symbol) {
  try {
    // Try Yahoo Finance first
    const yahoo = require('yahoo-finance2').default;
    const quote = await yahoo.quote(symbol);
    return quote.regularMarketPrice;
  } catch (e) {
    // Fallback to Alpha Vantage if configured
    if (process.env.ALPHA_VANTAGE_KEY) {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
      const res = await axios.get(url, { timeout: 5000 });
      const price = parseFloat(res.data['Global Quote']['05. price']);
      if (!isNaN(price)) return price;
    }
    throw new Error(`Could not fetch stock price for ${symbol}`);
  }
}

// ---------- Smart RPC Provider ----------
async function getEvmProvider() {
  const { ethers } = require('ethers');
  for (const rpc of ETH_RPCS) {
    try {
      const provider = new ethers.providers.JsonRpcProvider(rpc);
      await provider.getBlockNumber();
      return provider;
    } catch (e) {}
  }
  throw new Error('All EVM RPCs failed');
}

async function getSolanaConnection() {
  const { Connection } = require('@solana/web3.js');
  for (const rpc of SOLANA_RPCS) {
    try {
      const connection = new Connection(rpc);
      await connection.getSlot();
      return connection;
    } catch (e) {}
  }
  throw new Error('All Solana RPCs failed');
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
      res.status(200).json({ symbol, price, source: 'auto' });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // ---------- TRADING ----------
  if (url === '/api/trade/execute' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { symbol, amountUSD, tradeType } = req.body;
    if (!symbol || !amountUSD || !tradeType) return res.status(400).json({ error: 'Missing parameters' });
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
      const state = getUserTraderState(userId);
      state.userProfit += userGain;
      state.ownerFees += fee;
      trades.push({ userId, symbol, price, amountUSD, units, tradeType, profit, fee });
      res.status(200).json({ price, units, profit, fee, userGain });
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

  // ---------- STATUS (endpoint health check) ----------
  if (url === '/api/status' && method === 'GET') {
    const results = {
      evm: { status: 'unknown' },
      solana: { status: 'unknown' },
      cryptoPrice: { status: 'unknown' },
      stockPrice: { status: 'unknown' }
    };
    try {
      await getEvmProvider();
      results.evm = { status: 'ok', rpcs: ETH_RPCS };
    } catch (e) { results.evm = { status: 'error', message: e.message }; }
    try {
      await getSolanaConnection();
      results.solana = { status: 'ok', rpcs: SOLANA_RPCS };
    } catch (e) { results.solana = { status: 'error', message: e.message }; }
    try {
      await getCryptoPrice('bitcoin');
      results.cryptoPrice = { status: 'ok', sources: PRICE_SOURCES.map(s => s.name) };
    } catch (e) { results.cryptoPrice = { status: 'error', message: e.message }; }
    try {
      await getStockPrice('AAPL');
      results.stockPrice = { status: 'ok' };
    } catch (e) { results.stockPrice = { status: 'error', message: e.message }; }
    res.status(200).json(results);
    return;
  }

  // ---------- HEALTH ----------
  if (url === '/api/health' && method === 'GET') {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    return;
  }

  // ---------- 404 ----------
  res.status(404).json({ error: 'Not found' });
};
