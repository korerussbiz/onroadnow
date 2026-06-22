const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const crypto = require('crypto');

// ---------- CONFIGURATION ----------
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-me';

// ---------- FALLBACK RPCs ----------
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

// ---------- FALLBACK PRICE SOURCES ----------
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

// ---------- STATE ----------
let users = [];
let trades = [];
let userStates = {};

function getUserState(userId) {
  if (!userStates[userId]) {
    userStates[userId] = { profit: 0, fees: 0, log: [] };
  }
  return userStates[userId];
}

// ---------- SMART PRICE FETCHER ----------
async function getCryptoPrice(symbol) {
  const errors = [];
  for (const source of PRICE_SOURCES) {
    try {
      const url = source.url(symbol);
      const response = await axios.get(url, { timeout: 5000 });
      const price = source.parse(response.data, symbol);
      if (price && !isNaN(price) && price > 0) {
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
    // Use Yahoo Finance (if installed) – fallback to Alpha Vantage
    const yahoo = require('yahoo-finance2').default;
    const quote = await yahoo.quote(symbol);
    return quote.regularMarketPrice;
  } catch (e) {
    if (process.env.ALPHA_VANTAGE_KEY) {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
      const res = await axios.get(url, { timeout: 5000 });
      const price = parseFloat(res.data['Global Quote']['05. price']);
      if (!isNaN(price)) return price;
    }
    throw new Error(`Could not fetch stock price for ${symbol}`);
  }
}

// ---------- HEALTH CHECK ----------
async function checkHealth() {
  const results = {
    cryptoPrice: { status: 'unknown' },
    stockPrice: { status: 'unknown' },
    evm: { status: 'unknown' },
    solana: { status: 'unknown' }
  };
  try {
    await getCryptoPrice('bitcoin');
    results.cryptoPrice = { status: 'ok' };
  } catch (e) {
    results.cryptoPrice = { status: 'error', message: e.message };
  }
  try {
    await getStockPrice('AAPL');
    results.stockPrice = { status: 'ok' };
  } catch (e) {
    results.stockPrice = { status: 'error', message: e.message };
  }
  // EVM
  const { ethers } = require('ethers');
  for (const rpc of ETH_RPCS) {
    try {
      const provider = new ethers.providers.JsonRpcProvider(rpc);
      await provider.getBlockNumber();
      results.evm = { status: 'ok', rpc };
      break;
    } catch (e) {}
  }
  if (results.evm.status === 'unknown') {
    results.evm = { status: 'error', message: 'All EVM RPCs failed' };
  }
  // Solana
  const { Connection } = require('@solana/web3.js');
  for (const rpc of SOLANA_RPCS) {
    try {
      const connection = new Connection(rpc);
      await connection.getSlot();
      results.solana = { status: 'ok', rpc };
      break;
    } catch (e) {}
  }
  if (results.solana.status === 'unknown') {
    results.solana = { status: 'error', message: 'All Solana RPCs failed' };
  }
  return results;
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

  // ---------- HEALTH ----------
  if (url === '/api/health' && method === 'GET') {
    const health = await checkHealth();
    return res.status(200).json({ status: 'ok', health, timestamp: new Date().toISOString() });
  }

  // ---------- STATUS ----------
  if (url === '/api/status' && method === 'GET') {
    const status = await checkHealth();
    return res.status(200).json(status);
  }

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

  // ---------- TRADING ----------
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
      const state = getUserState(userId);
      state.profit += userGain;
      state.fees += fee;
      trades.push({ userId, symbol, price, amountUSD, units, tradeType, profit, fee });
      return res.status(200).json({ price, units, profit, fee, userGain });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (url === '/api/trade/history' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userTrades = trades.filter(t => t.userId === userId);
    return res.status(200).json(userTrades);
  }

  // ---------- 404 ----------
  res.status(404).json({ error: 'Not found' });
};
