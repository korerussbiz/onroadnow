const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const ccxt = require('ccxt');

const app = express();
app.use(express.json());

// ---------- Freqtrade Proxy ----------
app.post('/api/trade/signal', async (req, res) => {
  const { symbol, action } = req.body;
  try {
    // Forward to Freqtrade's API
    const response = await axios.post('http://localhost:8080/api/v1/entry', {
      pair: symbol,
      side: action
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- MoneroMiner Control ----------
app.post('/api/miner/start', (req, res) => {
  exec('~/MoneroMiner/build/monerominer -c ~/monerominer_config/config.json &', (err) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ status: 'started' });
  });
});

app.post('/api/miner/stop', (req, res) => {
  exec('pkill -f monerominer', (err) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ status: 'stopped' });
  });
});

// ---------- Market Data (via CCXT) ----------
app.get('/api/market/:symbol', async (req, res) => {
  const exchange = new ccxt.binance();
  try {
    const ticker = await exchange.fetchTicker(req.params.symbol);
    res.json(ticker);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.BRIDGE_PORT || 3001;
app.listen(PORT, () => console.log(`Bridge running on port ${PORT}`));
