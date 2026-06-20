#!/bin/bash
# Load environment variables from koreruss40.env
if [ -f koreruss40.env ]; then
  export $(grep -v '^#' koreruss40.env | xargs)
fi

# Check required variables
if [ -z "$WALLETCONNECT_PROJECT_ID" ] || [ "$WALLETCONNECT_PROJECT_ID" == "YOUR_WALLETCONNECT_PROJECT_ID" ]; then
  echo "❌ Please set WALLETCONNECT_PROJECT_ID in koreruss40.env"
  exit 1
fi

cd ~/onroadnow

# Install dependencies (if not already)
npm install @solana/web3.js ethers axios @walletconnect/modal --save

# Update api/index.js with real claim scanning endpoints
cat >> api/index.js << 'EOFAPI'
// ---------- Real blockchain claim scanning (EVM + Solana) ----------
const { ethers } = require('ethers');
const { Connection, PublicKey } = require('@solana/web3.js');

// Known claimable contracts (EVM)
const EVM_CLAIM_CONTRACTS = {
  '1': { // Ethereum mainnet
    '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': 'UNI airdrop',
    '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85': 'ENS airdrop',
    '0x111111111117dc0aa78b770fa6a738034120c302': '1inch airdrop'
  }
};

if (url === '/api/claim/scan-evm' && method === 'POST') {
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { address, chainId = '1' } = req.body;
  if (!address) return res.status(400).json({ error: 'Missing address' });
  try {
    const provider = new ethers.providers.JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_KEY || 'YOUR_INFURA_KEY'}`);
    const claims = [];
    const contracts = EVM_CLAIM_CONTRACTS[chainId] || {};
    for (const [contractAddr, name] of Object.entries(contracts)) {
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
    // Placeholder – replace with real program checks
    claims.push({ program: 'Jito', amount: '0.5 JTO', eligible: true });
    res.status(200).json({ claims });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  return;
}
EOFAPI

# Create public/claimer.html with WalletConnect
cat > public/claimer.html << 'EOFHTML'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OnRoadNow – Real Claim Bot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #0f172a; color: #e2e8f0; padding: 1rem; }
    .container { max-width: 800px; margin: 0 auto; }
    .card { background: #1e293b; border-radius: 1.5rem; padding: 1.5rem; margin-bottom: 1.5rem; }
    .btn { background: #3b82f6; border: none; padding: 0.5rem 1.2rem; border-radius: 2rem; color: white; font-weight: 600; cursor: pointer; margin-right: 0.5rem; }
    .btn-success { background: #10b981; }
    .btn-danger { background: #ef4444; }
    .log { background: #0f172a; border-radius: 1rem; padding: 1rem; max-height: 300px; overflow-y: auto; font-family: monospace; margin-top: 1rem; }
    .nav { margin-bottom: 1rem; }
    .nav a { color: #94a3b8; text-decoration: none; margin-right: 1rem; }
    .flex { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem; }
    .status { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 0.5rem; }
    .status-running { background: #10b981; box-shadow: 0 0 5px #10b981; }
    .status-stopped { background: #ef4444; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/dist/index.umd.js"></script>
</head>
<body>
<div class="container">
  <div class="nav"><a href="/">Home</a> | <a href="/auto-trader">Auto‑Trader</a> | <a href="/claimer">Claim Bot</a></div>
  <div class="card">
    <h2>🤖 Real Claim Bot</h2>
    <p>Connect your wallet, scan for real claimable tokens, and auto‑claim them.</p>
    <div class="flex">
      <button id="connectBtn" class="btn">🔗 Connect Wallet</button>
      <button id="scanBtn" class="btn">🔍 Scan Now</button>
      <button id="claimBtn" class="btn btn-success">💰 Claim All</button>
      <button id="startAutoBtn" class="btn">▶️ Auto Mode</button>
      <button id="stopAutoBtn" class="btn btn-danger">⏹️ Stop</button>
      <span id="statusDisplay"><span class="status status-stopped"></span> Disconnected</span>
    </div>
    <div id="walletAddress" style="margin-top:0.5rem;"></div>
  </div>
  <div class="card">
    <h3>📋 Found Claims</h3>
    <div id="claimsList"></div>
  </div>
  <div class="card">
    <h3>📜 Activity Log</h3>
    <div id="log" class="log"></div>
  </div>
</div>
<script>
  const projectId = '{{WC_PROJECT_ID}}';
  let web3Modal, provider, signer, walletAddress;
  let autoInterval = null;
  let isAutoRunning = false;

  function addLog(msg, isError = false) {
    const logDiv = document.getElementById('log');
    const p = document.createElement('div');
    p.innerHTML = `[${new Date().toLocaleTimeString()}] ${msg}`;
    if (isError) p.style.color = '#f87171';
    logDiv.appendChild(p);
    logDiv.scrollTop = logDiv.scrollHeight;
    while (logDiv.children.length > 100) logDiv.removeChild(logDiv.firstChild);
  }

  function updateStatus(text, color) {
    const status = document.getElementById('statusDisplay');
    status.innerHTML = `<span class="status" style="background:${color};box-shadow:0 0 5px ${color};"></span> ${text}`;
  }

  async function connectWallet() {
    try {
      if (!web3Modal) {
        web3Modal = new WalletConnectModal.default({
          projectId,
          chains: ['eip155:1'],
          themeMode: 'dark'
        });
      }
      await web3Modal.open();
      const session = web3Modal.getProvider();
      if (session) {
        const accounts = await session.request({ method: 'eth_accounts' });
        walletAddress = accounts[0];
        document.getElementById('walletAddress').innerText = `Connected: ${walletAddress.slice(0,6)}...${walletAddress.slice(-4)}`;
        updateStatus('Connected', '#10b981');
        addLog(`✅ Wallet connected: ${walletAddress}`);
      }
    } catch(e) {
      addLog(`❌ Connection error: ${e.message}`, true);
    }
  }

  async function scanClaims() {
    if (!walletAddress) { addLog("Connect wallet first", true); return; }
    addLog("Scanning for claimable tokens...");
    updateStatus('Scanning', '#facc15');
    try {
      const res = await fetch('/api/claim/scan-evm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      });
      const data = await res.json();
      if (data.error) { addLog(`❌ ${data.error}`, true); return; }
      const claims = data.claims || [];
      const container = document.getElementById('claimsList');
      container.innerHTML = '';
      if (claims.length === 0) {
        container.innerHTML = '<div style="color:#94a3b8;">No claimable tokens found.</div>';
        addLog("No claims found.");
      } else {
        claims.forEach(c => {
          const div = document.createElement('div');
          div.className = 'claim-item';
          div.innerHTML = `<strong>${c.name}</strong> – ${c.amount} (contract: ${c.contract.slice(0,10)}...)`;
          container.appendChild(div);
        });
        addLog(`✅ Found ${claims.length} claimable items.`);
      }
      updateStatus('Connected', '#10b981');
    } catch(e) {
      addLog(`❌ Scan error: ${e.message}`, true);
      updateStatus('Error', '#ef4444');
    }
  }

  async function claimAll() {
    if (!walletAddress) { addLog("Connect wallet first", true); return; }
    addLog("Claiming all...");
    // TODO: implement actual claim transactions
    addLog("✅ Claiming simulation – replace with actual tx signing.");
  }

  function startAuto() {
    if (autoInterval) clearInterval(autoInterval);
    isAutoRunning = true;
    autoInterval = setInterval(scanClaims, 60000);
    addLog("🚀 Auto mode started (every 60s)");
    updateStatus('Auto Running', '#10b981');
  }

  function stopAuto() {
    if (autoInterval) { clearInterval(autoInterval); autoInterval = null; }
    isAutoRunning = false;
    addLog("⏹️ Auto mode stopped");
    updateStatus('Connected', '#10b981');
  }

  document.getElementById('connectBtn').onclick = connectWallet;
  document.getElementById('scanBtn').onclick = scanClaims;
  document.getElementById('claimBtn').onclick = claimAll;
  document.getElementById('startAutoBtn').onclick = startAuto;
  document.getElementById('stopAutoBtn').onclick = stopAuto;
</script>
</body>
</html>
EOFHTML

# Replace placeholder with actual Project ID from env
sed -i "s/{{WC_PROJECT_ID}}/$WALLETCONNECT_PROJECT_ID/g" public/claimer.html

# Update vercel.json for routing
cat > vercel.json << 'EOF'
{
  "version": 2,
  "builds": [
    { "src": "api/index.js", "use": "@vercel/node" },
    { "src": "public/**", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/index.js" },
    { "src": "/auto-trader", "dest": "/public/auto-trader.html" },
    { "src": "/claimer", "dest": "/public/claimer.html" },
    { "src": "/marketplace", "dest": "/public/marketplace.html" },
    { "src": "/(.*)", "dest": "/public/$1" }
  ]
}
