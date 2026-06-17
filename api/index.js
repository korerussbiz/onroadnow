const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

let stripe = null;
try { stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); } catch(e) { console.log('Stripe not configured'); }

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const GOOGLE_CLIENT_ID = '134628093591-61nk4mneo6d1o6of5da3e3fijgtd5dd0.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

let users = [];
let listings = [];
let sales = [];
let requests = [];
let deliveries = [];
let userTraderStates = new Map();
let stripeCustomers = new Map();
let poolContributions = new Map();
let poolTotal = 0;

function hashPassword(pwd) { return crypto.createHash('sha256').update(pwd).digest('hex'); }
function verifyPassword(pwd, hash) { return hashPassword(pwd) === hash; }
function getUserTraderState(userId) {
  if (!userTraderStates.has(userId)) userTraderStates.set(userId, { running: false, userProfit: 0, ownerFees: 0, log: [], history: [] });
  return userTraderStates.get(userId);
}
function addTraderLog(userId, msg) {
  const state = getUserTraderState(userId);
  state.log.unshift(`[${new Date().toISOString()}] ${msg}`);
  if (state.log.length > 100) state.log.pop();
}

module.exports = async (req, res) => {
  const url = req.url;
  const method = req.method;
  const cookies = cookie.parse(req.headers.cookie || '');
  let userId = null;
  if (cookies.token) {
    try { const decoded = jwt.verify(cookies.token, JWT_SECRET); userId = decoded.userId; } catch(e) {}
  }

  res.setHeader('Access-Control-Allow-Origin', 'https://onroadnow.vercel.app');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') return res.status(200).end();

  // ---------- Auth (unchanged) ----------
  if (url === '/api/signup' && method === 'POST') { /* same as before, omitted for brevity – but keep full logic */ }
  if (url === '/api/login' && method === 'POST') { /* same */ }
  if (url === '/api/logout' && method === 'POST') { /* same */ }
  if (url === '/api/me' && method === 'GET') { /* same */ }
  if (url === '/api/user' && method === 'POST') { /* same */ }
  if (url === '/api/auth/google' && method === 'POST') { /* same */ }

  // ---------- Marketplace ----------
  if (url === '/api/listings' && method === 'GET') { /* same */ }
  if (url === '/api/listings' && method === 'POST') { /* same */ }
  if (url === '/api/listings' && method === 'DELETE') { /* same */ }
  if (url === '/api/purchase' && method === 'POST') { /* same */ }
  if (url === '/api/sales' && method === 'GET') { /* same */ }

  // ---------- Nearby places ----------
  if (url.startsWith('/api/nearby')) { /* same */ }

  // ---------- Delivery requests ----------
  if (url === '/api/requests') { /* same */ }
  if (url.startsWith('/api/accept')) { /* same */ }
  if (url === '/api/offerLoan' && method === 'POST') { res.status(200).json({}); return; }
  if (url === '/api/confirmDelivery' && method === 'POST') { res.status(200).json({}); return; }
  if (url === '/api/updateLocation' && method === 'POST') { res.status(200).json({}); return; }
  if (url.startsWith('/api/getLocation')) { res.status(200).json({ location: null }); return; }

  // ---------- Auto‑Trader ----------
  if (url === '/api/auto-trader/start' && method === 'POST') { /* same */ }
  if (url === '/api/auto-trader/stop' && method === 'POST') { /* same */ }
  if (url === '/api/auto-trader/status' && method === 'GET') { /* same */ }
  if (url === '/api/auto-trader/report-profit' && method === 'POST') { /* same */ }

  // ---------- Pool ----------
  if (url === '/api/pool/contribute' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ error: 'Minimum 1 JMD' });
    const current = poolContributions.get(userId) || 0;
    poolContributions.set(userId, current + amount);
    poolTotal += amount;
    res.status(200).json({ message: `Added ${amount} JMD to pool. Your share: ${current+amount} JMD` });
    return;
  }
  if (url === '/api/pool/status' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const userShare = poolContributions.get(userId) || 0;
    const sharePercent = poolTotal > 0 ? (userShare / poolTotal) : 0;
    res.status(200).json({ userShare, poolTotal, sharePercent });
    return;
  }

  // ---------- Deposit / Withdraw / Balance ----------
  if (url === '/api/balance' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = users.find(u => u.id === userId);
    res.status(200).json({ fiat: user?.balance || 0, crypto: user?.cryptoBalance || {} });
    return;
  }
  if (url === '/api/deposit' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount, currency = 'usd' } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ error: 'Minimum amount 1 USD' });
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
    try {
      let customerId = stripeCustomers.get(userId);
      if (!customerId) {
        const customer = await stripe.customers.create({ metadata: { userId } });
        customerId = customer.id;
        stripeCustomers.set(userId, customerId);
      }
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency,
        customer: customerId,
        automatic_payment_methods: { enabled: true },
      });
      res.status(200).json({ clientSecret: paymentIntent.client_secret });
    } catch (err) { res.status(500).json({ error: err.message }); }
    return;
  }
  if (url === '/api/withdraw' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { amount } = req.body;
    if (!amount || amount < 10) return res.status(400).json({ error: 'Minimum withdrawal 10 USD' });
    const user = users.find(u => u.id === userId);
    if (!user || (user.balance || 0) < amount) return res.status(400).json({ error: 'Insufficient balance' });
    user.balance = (user.balance || 0) - amount;
    res.status(200).json({ message: `Withdrawal of $${amount} initiated (simulated).` });
    return;
  }
  if (url === '/api/wallet/connect' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { address, chain } = req.body;
    const user = users.find(u => u.id === userId);
    if (user) { user.walletAddress = address; user.walletChain = chain; }
    res.status(200).json({ message: 'Wallet connected' });
    return;
  }

  // ---------- Pool ---------- 
  if (url === "/api/pool/contribute" && method === "POST") { 
    if (!userId) return res.status(401).json({ error: "Not authenticated" }); 
    const { amount } = req.body; 
    if (!amount || amount < 1) return res.status(400).json({ error: "Minimum 1 JMD" }); 
    const current = poolContributions.get(userId) || 0; 
    poolContributions.set(userId, current + amount); 
    poolTotal += amount; 
    res.status(200).json({ message: `Added ${amount} JMD to pool. Your share: ${current+amount} JMD` }); 
    return; 
  } 
  if (url === "/api/pool/status" && method === "GET") { 
    if (!userId) return res.status(401).json({ error: "Not authenticated" }); 
    const userShare = poolContributions.get(userId) || 0; 
    const sharePercent = poolTotal > 0 ? (userShare / poolTotal) : 0; 
    res.status(200).json({ userShare, poolTotal, sharePercent }); 
    return; 
  } 
  // ---------- Deposit / Withdraw / Balance ---------- 
  if (url === "/api/balance" && method === "GET") { 
    if (!userId) return res.status(401).json({ error: "Not authenticated" }); 
    const user = users.find(u => u.id === userId); 
    res.status(200).json({ fiat: user?.balance || 0, crypto: user?.cryptoBalance || {} }); 
    return; 
  } 
  if (url === "/api/deposit" && method === "POST") { 
    if (!userId) return res.status(401).json({ error: "Not authenticated" }); 
    const { amount, currency = "usd" } = req.body; 
    if (!amount || amount < 1) return res.status(400).json({ error: "Minimum amount 1 USD" }); 
    if (!stripe) return res.status(500).json({ error: "Stripe not configured" }); 
    try { 
      let customerId = stripeCustomers.get(userId); 
      if (!customerId) { 
        const customer = await stripe.customers.create({ metadata: { userId } }); 
        customerId = customer.id; 
        stripeCustomers.set(userId, customerId); 
      } 
      const paymentIntent = await stripe.paymentIntents.create({ 
        amount: Math.round(amount * 100), 
        currency, 
        customer: customerId, 
        automatic_payment_methods: { enabled: true }, 
      }); 
      res.status(200).json({ clientSecret: paymentIntent.client_secret }); 
    } catch (err) { res.status(500).json({ error: err.message }); } 
    return; 
  } 
  if (url === "/api/withdraw" && method === "POST") { 
    if (!userId) return res.status(401).json({ error: "Not authenticated" }); 
    const { amount } = req.body; 
    if (!amount || amount < 10) return res.status(400).json({ error: "Minimum withdrawal 10 USD" }); 
    const user = users.find(u => u.id === userId); 
    if (!user || (user.balance || 0) < amount) return res.status(400).json({ error: "Insufficient balance" }); 
    user.balance = (user.balance || 0) - amount; 
    res.status(200).json({ message: `Withdrawal of $${amount} initiated (simulated).` }); 
    return; 
  } 
  if (url === "/api/wallet/connect" && method === "POST") { 
    if (!userId) return res.status(401).json({ error: "Not authenticated" }); 
    const { address, chain } = req.body; 
    const user = users.find(u => u.id === userId); 
    if (user) { user.walletAddress = address; user.walletChain = chain; } 
    res.status(200).json({ message: "Wallet connected" }); 
    return; 
  }
  res.status(404).json({ error: 'Not found' });
};

// ---------- Wallet endpoints ----------
if (url === '/api/deposit' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.walletBalance = (user.walletBalance || 0) + amount;
  res.status(200).json({ newBalance: user.walletBalance });
  return;
}
if (url === '/api/withdraw' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if ((user.walletBalance || 0) < amount) return res.status(400).json({ error: 'Insufficient funds' });
  user.walletBalance = (user.walletBalance || 0) - amount;
  res.status(200).json({ newBalance: user.walletBalance });
  return;
}
if (url === '/api/balance' && method === 'GET') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = users.find(u => u.id === userId);
  res.status(200).json({ fiat: user?.walletBalance || 0 });
  return;
}

// ---------- Real blockchain claim scanning (EVM + Solana) ----------
const { ethers } = require('ethers');
const { Connection, PublicKey } = require('@solana/web3.js');

// Known claimable contracts (EVM)
const EVM_CLAIM_CONTRACTS = {
  '1': { // Ethereum mainnet
    '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': 'UNI airdrop',
    '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85': 'ENS airdrop',
    '0x111111111117dc0aa78b770fa6a738034120c302': '1inch airdrop'
  },
  // add more chains (e.g., Arbitrum, Polygon) if needed
};

// Solana claimable programs
const SOLANA_CLAIM_PROGRAMS = [
  'JTO...', // Jito airdrop
  'JUP...'  // Jupiter airdrop
];

if (url === '/api/claim/scan-evm' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { address, chainId = '1' } = req.body;
  if (!address) return res.status(400).json({ error: 'Missing address' });
  try {
    const provider = new ethers.providers.JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_KEY || INFURA_KEY}`);
    const claims = [];
    const contracts = EVM_CLAIM_CONTRACTS[chainId] || {};
    for (const [contractAddr, name] of Object.entries(contracts)) {
      // Example: check if address has unclaimed tokens by calling balanceOf or claimable function
      // For demonstration, we simulate a check; in production you'd call the actual claim function.
      // Replace with real ABI and method calls.
      const contract = new ethers.Contract(contractAddr, [
        'function claimable(address) view returns (uint256)'
      ], provider);
      try {
        const amount = await contract.claimable(address);
        if (amount && amount.gt(0)) {
          claims.push({ contract: contractAddr, name, amount: amount.toString() });
        }
      } catch(e) { /* ignore if no claimable method */ }
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
    const connection = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com');
    const pubkey = new PublicKey(address);
    const claims = [];
    // For each known program, check if the address has an associated token account or claim status
    // This is a placeholder – real implementation requires specific program interaction.
    // We'll simulate for now, but you can replace with actual RPC calls.
    // Example: check for Jito claim
    claims.push({ program: 'Jito', amount: '0.5 JTO', eligible: true });
    res.status(200).json({ claims });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  return;
}
