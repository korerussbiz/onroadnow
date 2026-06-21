const axios = require('axios');

// ---------- RPC endpoints to test ----------
const RPC_ENDPOINTS = {
  ethereum: [
    'https://mainnet.infura.io/v3/' + (process.env.INFURA_KEY || ''),
    'https://eth-mainnet.g.alchemy.com/v2/' + (process.env.ALCHEMY_KEY || ''),
    'https://cloudflare-eth.com/',
    'https://rpc.ankr.com/eth',
    'https://ethereum.publicnode.com'
  ],
  polygon: [
    'https://polygon-mainnet.infura.io/v3/' + (process.env.INFURA_KEY || ''),
    'https://polygon-mainnet.g.alchemy.com/v2/' + (process.env.ALCHEMY_KEY || ''),
    'https://rpc.ankr.com/polygon',
    'https://polygon-rpc.com/'
  ],
  solana: [
    process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
    'https://solana-api.projectserum.com',
    'https://rpc.ankr.com/solana'
  ]
};

// ---------- Price APIs to test ----------
const PRICE_APIS = [
  { name: 'CoinGecko', url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', parser: (d) => d.bitcoin.usd },
  { name: 'Binance', url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', parser: (d) => parseFloat(d.price) },
  { name: 'Kraken', url: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD', parser: (d) => parseFloat(d.result.XXBTZUSD.c[0]) },
  { name: 'Yahoo Finance', url: 'https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD', parser: (d) => d.chart.result[0].meta.regularMarketPrice },
  { name: 'Alpha Vantage', url: 'https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=BTC&to_currency=USD&apikey=' + (process.env.ALPHA_VANTAGE_KEY || ''), parser: (d) => parseFloat(d['Realtime Currency Exchange Rate']['Exchange Rate']) }
];

// ---------- Discovery Service ----------
class DiscoveryService {
  constructor() {
    this.workingRPCs = {};
    this.workingPriceAPI = null;
    this.lastCheck = 0;
  }

  async testRPC(url, chain) {
    try {
      const start = Date.now();
      const payload = { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 };
      const res = await axios.post(url, payload, { timeout: 5000 });
      if (res.status === 200 && res.data && res.data.result) {
        return { url, latency: Date.now() - start, working: true };
      }
    } catch (e) {}
    return { url, working: false };
  }

  async discoverRPCs() {
    const results = {};
    for (const [chain, endpoints] of Object.entries(RPC_ENDPOINTS)) {
      const candidates = await Promise.all(endpoints.map(e => this.testRPC(e, chain)));
      const working = candidates.filter(c => c.working).sort((a,b) => a.latency - b.latency);
      if (working.length > 0) {
        results[chain] = working[0].url;
        console.log(`✅ Found working RPC for ${chain}: ${working[0].url} (${working[0].latency}ms)`);
      } else {
        console.warn(`⚠️ No working RPC for ${chain}`);
      }
    }
    this.workingRPCs = results;
    return results;
  }

  async testPriceAPI(api) {
    try {
      const start = Date.now();
      const res = await axios.get(api.url, { timeout: 5000 });
      if (res.status === 200) {
        const price = api.parser(res.data);
        if (price && !isNaN(price)) {
          return { name: api.name, price, latency: Date.now() - start, working: true };
        }
      }
    } catch (e) {}
    return { name: api.name, working: false };
  }

  async discoverPriceAPI() {
    const results = await Promise.all(PRICE_APIS.map(a => this.testPriceAPI(a)));
    const working = results.filter(r => r.working).sort((a,b) => a.latency - b.latency);
    if (working.length > 0) {
      this.workingPriceAPI = working[0];
      console.log(`✅ Found working price API: ${working[0].name} (${working[0].latency}ms)`);
    } else {
      console.warn('⚠️ No working price API found');
    }
    return this.workingPriceAPI;
  }

  async discoverAll() {
    const rpcs = await this.discoverRPCs();
    const priceApi = await this.discoverPriceAPI();
    this.lastCheck = Date.now();
    return { rpcs, priceApi };
  }

  getRPC(chain) {
    return this.workingRPCs[chain] || null;
  }

  getPriceAPI() {
    return this.workingPriceAPI;
  }
}

module.exports = new DiscoveryService();
