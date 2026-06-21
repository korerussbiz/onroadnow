const express = require('express');
const { exec } = require('child_process');
const axios = require('axios');
const app = express();
app.use(express.json());
const PORT = 3001;
const WALLET = '9vXyKbMr85Yaus38RQnjLjfxPWbCJVESbTmRH6JCWVE2';

app.post('/api/miner/start', (req, res) => {
  exec('~/start_miner.sh > /dev/null 2>&1 &', (error) => {
    if (error) { res.status(500).json({ error: 'Failed to start' }); }
    else { res.json({ status: 'started' }); }
  });
});

app.post('/api/miner/stop', (req, res) => {
  exec('pkill -f xmrig', (error) => { res.json({ status: 'stopped' }); });
});

app.get('/api/miner/status', (req, res) => {
  exec('pgrep -f xmrig', (error, stdout) => {
    res.json({ running: stdout.trim().length > 0 });
  });
});

app.get('/api/mining/stats', async (req, res) => {
  try {
    const response = await axios.get(`https://supportxmr.com/api/miner/${WALLET}/stats`);
    const data = response.data;
    const priceRes = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd');
    const xmrPrice = priceRes.data.monero?.usd || 0;
    const balance = (data.amtDue || 0) / 1e12;
    res.json({
      wallet: WALLET,
      hashrate: data.hashrate || 0,
      balance,
      totalHashes: data.totalHashes || 0,
      validShares: data.validShares || 0,
      lastShare: data.lastHash || 0,
      xmrPrice,
      valueUSD: balance * xmrPrice,
      paid: (data.amtPaid || 0) / 1e12
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Bridge running on port ${PORT}`));
