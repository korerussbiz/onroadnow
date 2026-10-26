const axios = require("axios");
const jwt = require("jsonwebtoken");
const cookie = require("cookie");
const crypto = require("crypto");

// Keys with fallbacks (so the API never crashes)
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-change-me";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "fallback-client-id";
const INFURA_KEY = process.env.INFURA_KEY || "demo";
const SOLANA_RPC =
  process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const WALLETCONNECT_PROJECT_ID = process.env.WALLETCONNECT_PROJECT_ID || "demo";
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || "";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const DEPOSIT_URL = process.env.DEPOSIT_URL || "https://paypal.me/yourhandle";

// In-memory storage
let users = [];
let trades = [];
let userStates = {};

function getUserState(userId) {
  if (!userStates[userId]) {
    userStates[userId] = { profit: 0, fees: 0, log: [] };
  }
  return userStates[userId];
}

async function getPrice(symbol) {
  // Try multiple sources
  const sources = [
    {
      name: "CoinGecko",
      url: `https://api.coingecko.com/api/v3/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd`,
      parse: (d) => d[symbol.toLowerCase()]?.usd,
    },
    {
      name: "Binance",
      url: `https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`,
      parse: (d) => parseFloat(d.price),
    },
    {
      name: "Kraken",
      url: `https://api.kraken.com/0/public/Ticker?pair=${symbol.toUpperCase()}USD`,
      parse: (d) => {
        const k = Object.keys(d.result)[0];
        return parseFloat(d.result[k].c[0]);
      },
    },
  ];
  for (const source of sources) {
    try {
      const res = await axios.get(source.url, { timeout: 5000 });
      const price = source.parse(res.data);
      if (price && !isNaN(price) && price > 0) return price;
    } catch (e) {}
  }
  throw new Error("Could not fetch price");
}

module.exports = async (req, res) => {
  const url = req.url;
  const method = req.method;
  const cookies = cookie.parse(req.headers.cookie || "");
  let userId = null;
  if (cookies.token) {
    try {
      const decoded = jwt.verify(cookies.token, JWT_SECRET);
      userId = decoded.userId;
    } catch (e) {}
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (method === "OPTIONS") return res.status(200).end();

  // Health – always returns 200
  if (url === "/api/health" && method === "GET") {
    const checks = {
      JWT_SECRET: !!process.env.JWT_SECRET,
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      INFURA_KEY: !!process.env.INFURA_KEY,
      SOLANA_RPC: !!process.env.SOLANA_RPC,
      WALLETCONNECT_PROJECT_ID: !!process.env.WALLETCONNECT_PROJECT_ID,
      ALPHA_VANTAGE_KEY: !!process.env.ALPHA_VANTAGE_KEY,
      GOOGLE_MAPS_API_KEY: !!process.env.GOOGLE_MAPS_API_KEY,
    };
    const missing = Object.keys(checks).filter((k) => !checks[k]);
    return res
      .status(200)
      .json({ status: missing.length ? "warning" : "ok", checks, missing });
  }

  // Signup
  if (url === "/api/signup" && method === "POST") {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Missing fields" });
    if (users.find((u) => u.username === username))
      return res.status(400).json({ error: "User exists" });
    const userId = crypto.randomUUID();
    users.push({ id: userId, username, password });
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
    res.setHeader(
      "Set-Cookie",
      `token=${token}; HttpOnly; Path=/; Max-Age=604800; Secure; SameSite=None`,
    );
    return res.status(201).json({ message: "Signed up", userId });
  }

  // Login
  if (url === "/api/login" && method === "POST") {
    const { username, password } = req.body;
    const user = users.find(
      (u) => u.username === username && u.password === password,
    );
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "7d",
    });
    res.setHeader(
      "Set-Cookie",
      `token=${token}; HttpOnly; Path=/; Max-Age=604800; Secure; SameSite=None`,
    );
    return res.status(200).json({ message: "Logged in", userId: user.id });
  }

  // Logout
  if (url === "/api/logout" && method === "POST") {
    res.setHeader(
      "Set-Cookie",
      "token=; HttpOnly; Path=/; Max-Age=0; Secure; SameSite=None",
    );
    return res.status(200).json({ message: "Logged out" });
  }

  // Me
  if (url === "/api/me" && method === "GET") {
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const user = users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.status(200).json({ id: user.id, username: user.username });
  }

  // Price
  if (url === "/api/trade/price" && method === "GET") {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: "Missing symbol" });
    try {
      const price = await getPrice(symbol);
      return res.status(200).json({ symbol, price });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Execute trade
  if (url === "/api/trade/execute" && method === "POST") {
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const { symbol, amountUSD, tradeType } = req.body;
    if (!symbol || isNaN(amountUSD) || amountUSD <= 0)
      return res.status(400).json({ error: "Invalid amount" });
    try {
      const price = await getPrice(symbol);
      const units = amountUSD / price;
      const profit = amountUSD * (Math.random() - 0.48) * 0.02;
      const fee = profit * 0.05;
      const userGain = profit - fee;
      const state = getUserState(userId);
      state.profit += userGain;
      state.fees += fee;
      trades.push({
        userId,
        symbol,
        price,
        amountUSD,
        units,
        tradeType,
        profit,
        fee,
        timestamp: Date.now(),
      });
      return res.status(200).json({ price, units, profit, fee, userGain });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // History
  if (url === "/api/trade/history" && method === "GET") {
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const userTrades = trades.filter((t) => t.userId === userId);
    return res.status(200).json(userTrades);
  }

  // 404
  res.status(404).json({ error: "Not found" });
};
