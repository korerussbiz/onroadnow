#!/bin/bash
# Overwrite public/index.html with fixed login, description, tutorial
cat > public/index.html << 'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OnRoadNow – Smart Delivery & Marketplace</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <!-- Google Sign-In -->
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #f3f6fc; color: #1e293b; }
    .hero { background: linear-gradient(135deg, #0f2b5e, #1e4a8a); color: white; padding: 3rem 1.5rem; text-align: center; margin-bottom: 2rem; }
    .hero h1 { font-size: 2.5rem; font-weight: 800; }
    .hero p { font-size: 1.2rem; margin-top: 0.5rem; opacity: 0.9; max-width: 800px; margin-left: auto; margin-right: auto; }
    .container { max-width: 1400px; margin: 0 auto; padding: 0 1.5rem; }
    .card { background: white; border-radius: 1.5rem; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); padding: 1.5rem; margin-bottom: 2rem; transition: 0.2s; }
    .card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; border-bottom: 2px solid #e0e7ff; padding-bottom: 0.75rem; font-weight: 700; font-size: 1.2rem; }
    .btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.2rem; border-radius: 2rem; font-weight: 600; border: none; cursor: pointer; transition: 0.2s; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-outline { background: transparent; border: 1px solid #cbd5e1; }
    .btn-google { background: #db4437; color: white; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; }
    .form-group { margin-bottom: 1rem; }
    input, select, textarea { width: 100%; padding: 0.75rem 1rem; border: 1px solid #cbd5e1; border-radius: 1rem; font-family: inherit; }
    #map { height: 400px; border-radius: 1rem; margin-top: 1rem; background: #e2e8f0; }
    .place-list { max-height: 250px; overflow-y: auto; background: white; border-radius: 1rem; border: 1px solid #e2e8f0; margin-top: 1rem; }
    .place { padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; cursor: pointer; }
    .place:hover { background: #f8fafc; }
    .listing-card { border: 1px solid #e2e8f0; border-radius: 1rem; padding: 1rem; margin-bottom: 1rem; }
    .badge { background: #eef2ff; padding: 0.25rem 0.75rem; border-radius: 2rem; font-size: 0.75rem; font-weight: 600; color: #1e40af; }
    .flex-between { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
    .hidden { display: none; }
    .tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; border-bottom: 1px solid #e2e8f0; }
    .tab { padding: 0.5rem 1rem; cursor: pointer; border-radius: 2rem; transition: 0.2s; }
    .tab.active { background: #2563eb; color: white; }
    .profile-avatar { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid white; margin-top: -40px; margin-left: 1rem; }
    .footer { text-align: center; margin-top: 2rem; padding: 1rem; color: #64748b; font-size: 0.8rem; }
    .tutorial-steps { display: flex; flex-wrap: wrap; gap: 1rem; margin: 1rem 0; }
    .step { flex: 1; min-width: 180px; background: #f8fafc; border-radius: 1rem; padding: 1rem; text-align: center; }
    @media (max-width: 640px) { .hero h1 { font-size: 1.8rem; } }
  </style>
</head>
<body>
<div class="hero">
  <h1>🏍️ OnRoadNow</h1>
  <p>Jamaica's premier delivery & marketplace platform – earn, sell, connect</p>
</div>
<div class="container">
  <div id="authSection"></div>

  <!-- Business Description & Tutorial -->
  <div class="card">
    <div class="card-header"><i class="fas fa-info-circle"></i> How It Works</div>
    <p><strong>OnRoadNow</strong> connects people who need items delivered or picked up with trusted local deliverers. Whether you need groceries, medicine, food, or packages – post a request and a nearby deliverer will accept and complete the job.</p>
    <p><strong>For deliverers:</strong> Earn money on your own schedule. You can choose to front the cost of items and receive a <strong>22.4% reimbursement fee</strong> upon successful delivery. Standard deliveries earn the delivery fee you set.</p>
    <p><strong>For buyers:</strong> Use the map to find stores, post a detailed request, select payment method (Visa/Mastercard, e‑transfer, or Deliverer Fronts Cost). Track your delivery in real time.</p>
    <p><strong>Marketplace:</strong> Sell new or used items. Set your own fee (1–3.8%). When someone buys, the sale is recorded and you receive the price minus the fee.</p>
    <div class="tutorial-steps">
      <div class="step"><i class="fas fa-user-plus fa-2x"></i><h4>1. Sign Up</h4><p>Google or Email</p></div>
      <div class="step"><i class="fas fa-map-marker-alt fa-2x"></i><h4>2. Find Store</h4><p>Move the map, click any shop</p></div>
      <div class="step"><i class="fas fa-clipboard-list fa-2x"></i><h4>3. Post Request</h4><p>Describe item, pickup/dropoff</p></div>
      <div class="step"><i class="fas fa-hand-holding-usd fa-2x"></i><h4>4. Earn Money</h4><p>Accept, deliver, get paid</p></div>
    </div>
  </div>

  <!-- Member Dashboard (after login) -->
  <div id="memberDashboard" class="card hidden">
    <div style="background: linear-gradient(45deg, #1e3a8a, #2563eb); height: 100px; border-radius: 1rem 1rem 0 0; margin: -1.5rem -1.5rem 0 -1.5rem;"></div>
    <div class="flex-between" style="margin-top: -40px; padding: 0 1rem;">
      <img id="profileAvatar" class="profile-avatar" src="https://via.placeholder.com/80">
      <div><button id="changeAvatarBtn" class="btn btn-outline btn-sm"><i class="fas fa-camera"></i> Change</button></div>
    </div>
    <div id="profileInfo" style="margin: 1rem 1rem 0 1rem;"></div>
    <div class="tabs">
      <div class="tab active" data-tab="profile">Profile</div>
      <div class="tab" data-tab="sales">Sales</div>
      <div class="tab" data-tab="deliveries">Deliveries</div>
      <div class="tab" id="adminTab">Admin</div>
    </div>
    <div id="profileTab" class="tab-content">
      <div class="form-group"><label>📞 Phone</label><input type="tel" id="phoneInput" placeholder="+1234567890"></div>
      <div class="form-group"><label>👤 Full Name</label><input type="text" id="fullNameInput" placeholder="Your name"></div>
      <button id="saveProfileBtn" class="btn btn-primary">Save Profile</button>
    </div>
    <div id="salesTab" class="tab-content hidden"><div id="salesLogs"></div></div>
    <div id="deliveriesTab" class="tab-content hidden"><div id="activeDeliveries"></div></div>
    <div id="adminTabContent" class="tab-content hidden"><h4>Admin Controls</h4><div id="adminListings"></div><div id="adminUsers"></div></div>
  </div>

  <!-- Map & Nearby -->
  <div class="card">
    <div class="card-header"><i class="fas fa-map-marker-alt"></i> Find Stores & Shops (move map)</div>
    <div id="map"></div>
    <div id="places" class="place-list"><div style="padding:1rem; text-align:center;">Move map to load shops</div></div>
  </div>

  <!-- Request & Deliverer Tools -->
  <div class="grid-2">
    <div class="card">
      <div class="card-header"><i class="fas fa-truck"></i> Post Delivery Request</div>
      <form id="requestForm">
        <textarea id="itemDetails" placeholder="What do you need? (e.g., Food, package, groceries)" rows="2" required></textarea>
        <input type="text" id="pickupLocation" placeholder="Pickup address" required>
        <input type="text" id="dropoffLocation" placeholder="Dropoff address" required>
        <input type="number" id="itemCost" placeholder="Item cost / offer (JMD)" required>
        <select id="paymentMethod">
          <option value="visa_mc">💳 Visa/Mastercard</option>
          <option value="etransfer">📧 E-Transfer</option>
          <option value="deliverer_fronts">🛵 Deliverer Fronts Cost (+22.4% fee)</option>
        </select>
        <button type="submit" class="btn btn-primary">Post Request</button>
      </form>
    </div>
    <div class="card">
      <div class="card-header"><i class="fas fa-tools"></i> Deliverer Tools</div>
      <button id="startTrackingBtn" class="btn btn-primary">📍 Start Tracking (go online)</button>
      <button id="stopTrackingBtn" class="btn btn-outline hidden">🛑 Stop Tracking</button>
      <p id="trackingStatus"></p>
      <hr>
      <select id="roleSelect"><option value="buyer">👤 Customer</option><option value="deliverer">🛵 Deliverer</option></select>
    </div>
  </div>

  <!-- Marketplace -->
  <div class="card">
    <div class="card-header"><i class="fas fa-shopping-cart"></i> Marketplace – Items for Sale</div>
    <div id="marketplaceListings"></div>
  </div>

  <!-- Open Requests -->
  <div class="card">
    <div class="card-header"><i class="fas fa-clipboard-list"></i> Open Delivery Requests</div>
    <div id="requests"></div>
  </div>

  <div class="footer">© 2025 OnRoadNow by KorerussBiz – All responsibility lies with users. <a href="#" id="showDisclaimerLink">Legal Disclaimer</a></div>
</div>

<script>
  async function apiCall(url, options = {}) {
    const res = await fetch(url, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json' } });
    return res.json();
  }

  let currentUser = null;
  let map, markers = [];

  function handleCredentialResponse(response) {
    fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    })
    .then(res => res.json())
    .then(data => { if (data.user) location.reload(); else alert('Google login failed'); })
    .catch(err => alert('Error: ' + err.message));
  }

  function renderLogin() {
    document.getElementById('authSection').innerHTML = `
      <div class="card">
        <div class="card-header"><i class="fas fa-sign-in-alt"></i> Login / Signup</div>
        <div id="g_id_onload"
             data-client_id="134628093591-61nk4mneo6d1o6of5da3e3fijgtd5dd0.apps.googleusercontent.com"
             data-callback="handleCredentialResponse"
             data-auto_prompt="false">
        </div>
        <div class="g_id_signin" data-type="standard" data-size="large" data-theme="outline" data-text="sign_in_with" data-shape="rectangular"></div>
        <div style="margin:1rem 0; text-align:center;">or</div>
        <div class="flex-between" style="gap: 0.5rem;">
          <input type="email" id="loginEmail" placeholder="Email" style="flex:1;">
          <input type="password" id="loginPassword" placeholder="Password" style="flex:1;">
          <button id="emailLogin" class="btn btn-primary">Login</button>
          <button id="emailSignup" class="btn btn-outline">Signup</button>
        </div>
        <p id="authMsg" style="margin-top:0.5rem;"></p>
      </div>
    `;
    document.getElementById('emailLogin').onclick = async () => {
      const email = document.getElementById('loginEmail').value;
      const pwd = document.getElementById('loginPassword').value;
      const res = await apiCall('/api/login', { method: 'POST', body: JSON.stringify({ email, password: pwd }) });
      if (res.error) document.getElementById('authMsg').innerText = res.error;
      else location.reload();
    };
    document.getElementById('emailSignup').onclick = async () => {
      const email = document.getElementById('loginEmail').value;
      const pwd = document.getElementById('loginPassword').value;
      const name = prompt('Your full name:');
      if (!name) return;
      const res = await apiCall('/api/signup', { method: 'POST', body: JSON.stringify({ email, password: pwd, name }) });
      if (res.error) document.getElementById('authMsg').innerText = res.error;
      else location.reload();
    };
  }

  async function checkAuth() {
    const data = await apiCall('/api/me');
    if (data.id) {
      currentUser = data;
      document.getElementById('authSection').innerHTML = `<div class="flex-between"><span><i class="fas fa-user-check"></i> ${data.email}</span><button id="logoutBtn" class="btn btn-outline">Logout</button></div>`;
      document.getElementById('logoutBtn').onclick = async () => { await apiCall('/api/logout', { method: 'POST' }); location.reload(); };
      document.getElementById('memberDashboard').classList.remove('hidden');
      document.getElementById('profileInfo').innerHTML = `<strong>${data.name || data.email}</strong> &nbsp;|&nbsp; ${data.email}`;
      document.getElementById('phoneInput').value = data.phone || '';
      document.getElementById('fullNameInput').value = data.name || '';
      document.getElementById('profileAvatar').src = data.avatar || 'https://via.placeholder.com/80';
      loadMarketplaceListings();
      loadRequests();
      if (data.email === 'admin@korerussbiz.com') document.getElementById('adminTab').classList.remove('hidden');
      else document.getElementById('adminTab').classList.add('hidden');
    } else {
      renderLogin();
      document.getElementById('memberDashboard').classList.add('hidden');
    }
  }

  document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
    await apiCall('/api/user', { method: 'POST', body: JSON.stringify({ phone: document.getElementById('phoneInput').value, name: document.getElementById('fullNameInput').value }) });
    alert('Profile saved!');
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
      document.getElementById(`${tabName}Tab`)?.classList.remove('hidden');
      document.getElementById(`${tabName}TabContent`)?.classList.remove('hidden');
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (tabName === 'admin') loadAdminData();
    });
  });

  async function loadAdminData() {
    const listings = await apiCall('/api/listings');
    const adminListingsDiv = document.getElementById('adminListings');
    adminListingsDiv.innerHTML = '<h5>All Listings</h5>';
    listings.forEach(l => {
      adminListingsDiv.innerHTML += `<div class="listing-card"><strong>${l.title}</strong> by ${l.sellerId}<br>Price: JMD ${l.price}<br><button onclick="deleteListing(${l.id})" class="btn btn-outline btn-sm">Delete</button></div>`;
    });
    const users = await apiCall('/api/users');
    const adminUsersDiv = document.getElementById('adminUsers');
    if (adminUsersDiv) adminUsersDiv.innerHTML = '<h5>All Users</h5>' + (users || []).map(u => `<div>${u.email} (${u.name || ''})</div>`).join('');
  }
  window.deleteListing = async (id) => {
    if (confirm('Remove listing?')) {
      await apiCall('/api/listings', { method: 'DELETE', body: JSON.stringify({ id }) });
      loadMarketplaceListings();
      if (currentUser?.email === 'admin@korerussbiz.com') loadAdminData();
    }
  };

  // Leaflet Map
  function initMap() {
    map = L.map('map').setView([18.4655, -77.9223], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 14);
        fetchNearby(pos.coords.latitude, pos.coords.longitude);
      }, () => fetchNearby(18.4655, -77.9223));
    } else fetchNearby(18.4655, -77.9223);
    map.on('moveend', () => {
      const c = map.getCenter();
      fetchNearby(c.lat, c.lng);
    });
  }
  async function fetchNearby(lat, lon) {
    const placesDiv = document.getElementById('places');
    placesDiv.innerHTML = '<div style="padding:1rem;">Loading shops...</div>';
    try {
      const res = await fetch(`/api/nearby?lat=${lat}&lon=${lon}&radius=2000`);
      const data = await res.json();
      markers.forEach(m => map.removeLayer(m)); markers = [];
      placesDiv.innerHTML = '';
      if (data.elements && data.elements.length) {
        data.elements.forEach(el => {
          const name = el.tags?.name || (el.tags?.shop || el.tags?.amenity || 'Unnamed');
          const latlng = [el.lat, el.lon];
          const marker = L.marker(latlng).addTo(map).bindPopup(name);
          markers.push(marker);
          const div = document.createElement('div'); div.className = 'place'; div.innerText = name;
          div.onclick = () => { map.setView(latlng, 16); marker.openPopup(); };
          placesDiv.appendChild(div);
        });
      } else placesDiv.innerHTML = '<div style="padding:1rem;">No shops found. Move map.</div>';
    } catch(e) { placesDiv.innerHTML = '<div style="padding:1rem;">Error loading shops</div>'; }
  }
  window.initMap = initMap;

  // Delivery Requests
  document.getElementById('requestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return alert('Login first');
    await apiCall('/api/requests', { method: 'POST', body: JSON.stringify({
      itemDetails: document.getElementById('itemDetails').value,
      pickupLocation: document.getElementById('pickupLocation').value,
      dropoffLocation: document.getElementById('dropoffLocation').value,
      itemCost: parseFloat(document.getElementById('itemCost').value),
      paymentMethod: document.getElementById('paymentMethod').value
    })});
    alert('Request posted!'); loadRequests();
  });
  async function loadRequests() {
    const reqs = await apiCall('/api/requests');
    const container = document.getElementById('requests');
    container.innerHTML = '';
    reqs.forEach(r => {
      const div = document.createElement('div'); div.className = 'card';
      let actions = '';
      if (currentUser && currentUser.id !== r.userId && r.status === 'open') {
        actions = `<button onclick="acceptRequest(${r.id})" class="btn btn-primary btn-sm">Accept</button>`;
        if (r.paymentMethod === 'deliverer_fronts') actions += `<button onclick="offerLoan(${r.id})" class="btn btn-outline btn-sm">Front money</button>`;
      }
      div.innerHTML = `<div><strong>${escapeHtml(r.itemDetails)}</strong><br>Pickup: ${escapeHtml(r.pickupLocation)}<br>Dropoff: ${escapeHtml(r.dropoffLocation)}<br>💰 JMD ${r.itemCost}<br>💳 ${r.paymentMethod}<br>Status: ${r.status}</div><div>${actions}</div>`;
      container.appendChild(div);
    });
  }
  window.acceptRequest = async (id) => {
    await apiCall(`/api/accept?id=${id}`, { method: 'POST', body: JSON.stringify({ delivererId: currentUser.id, delivererName: currentUser.name }) });
    alert('Accepted!'); loadRequests(); loadActiveDeliveries();
  };
  window.offerLoan = async (id) => {
    const amount = prompt('Amount to front (JMD):');
    if (amount) await apiCall('/api/offerLoan', { method: 'POST', body: JSON.stringify({ requestId: id, delivererId: currentUser.id, amountFronted: parseFloat(amount) }) });
  };
  let watchId = null;
  const startBtn = document.getElementById('startTrackingBtn'), stopBtn = document.getElementById('stopTrackingBtn'), trackingStatus = document.getElementById('trackingStatus'), roleSelect = document.getElementById('roleSelect');
  if (roleSelect) {
    roleSelect.value = localStorage.getItem('onroadnow_role') || 'buyer';
    roleSelect.onchange = (e) => { localStorage.setItem('onroadnow_role', e.target.value); location.reload(); };
  }
  if (startBtn && currentUser && localStorage.getItem('onroadnow_role') === 'deliverer') {
    startBtn.onclick = () => {
      if (!navigator.geolocation) return alert('Geolocation not supported');
      watchId = navigator.geolocation.watchPosition(async (pos) => {
        await apiCall('/api/updateLocation', { method: 'POST', body: JSON.stringify({ delivererId: currentUser.id, lat: pos.coords.latitude, lon: pos.coords.longitude, status: 'in_progress' }) });
        trackingStatus.innerHTML = `<i class="fas fa-street-view"></i> Live: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      }, console.error, { enableHighAccuracy: true });
      startBtn.classList.add('hidden'); stopBtn.classList.remove('hidden');
    };
    stopBtn.onclick = () => { if (watchId) navigator.geolocation.clearWatch(watchId); startBtn.classList.remove('hidden'); stopBtn.classList.add('hidden'); trackingStatus.innerHTML = ''; };
  } else if (startBtn) { startBtn.style.display = 'none'; stopBtn.style.display = 'none'; }
  async function loadActiveDeliveries() {
    if (localStorage.getItem('onroadnow_role') !== 'buyer' || !currentUser) return;
    const reqs = await apiCall('/api/requests');
    const myRequests = reqs.filter(r => r.userId === currentUser.id && (r.status === 'accepted' || r.status === 'in_progress'));
    const container = document.getElementById('activeDeliveries');
    container.innerHTML = '';
    for (const req of myRequests) {
      const locData = await apiCall(`/api/getLocation?requestId=${req.id}`);
      const div = document.createElement('div'); div.className = 'card';
      div.innerHTML = `<div><strong>${escapeHtml(req.itemDetails)}</strong><br>Pickup: ${escapeHtml(req.pickupLocation)}<br>Dropoff: ${escapeHtml(req.dropoffLocation)}<br>Deliverer: ${req.delivererName}<br>Status: ${locData.status}<br>Location: ${locData.location ? `${locData.location.lat.toFixed(5)}, ${locData.location.lon.toFixed(5)}` : 'Not yet'}</div>${locData.status === 'in_progress' ? `<button onclick="confirmDelivery(${req.id})" class="btn btn-primary btn-sm">Confirm Delivery</button>` : ''}`;
      container.appendChild(div);
    }
  }
  window.confirmDelivery = async (id) => {
    await apiCall('/api/confirmDelivery', { method: 'POST', body: JSON.stringify({ requestId: id, customerId: currentUser.id }) });
    alert('Delivery confirmed. Deliverer will be paid.');
    loadActiveDeliveries(); loadRequests();
  };
  setInterval(() => { if (localStorage.getItem('onroadnow_role') === 'buyer') loadActiveDeliveries(); }, 5000);
  // Marketplace
  async function loadMarketplaceListings() {
    const listings = await apiCall('/api/listings');
    const container = document.getElementById('marketplaceListings');
    container.innerHTML = '';
    listings.forEach(l => {
      const adminBtn = (currentUser?.email === 'admin@korerussbiz.com') ? `<button onclick="deleteListing(${l.id})" class="btn btn-outline btn-sm">Remove</button>` : '';
      const div = document.createElement('div'); div.className = 'listing-card';
      div.innerHTML = `<div class="flex-between"><strong>${escapeHtml(l.title)}</strong>${adminBtn}</div><p>${escapeHtml(l.description)}</p><div><span class="badge">JMD ${l.price}</span> <span class="badge">Fee ${l.feePercent}%</span></div><button onclick="buyListing(${l.id})" class="btn btn-primary btn-sm">Buy Now</button>`;
      container.appendChild(div);
    });
  }
  window.buyListing = async (id) => {
    if (!currentUser) return alert('Login to buy');
    await apiCall('/api/purchase', { method: 'POST', body: JSON.stringify({ listingId: id }) });
    alert('Purchase recorded!'); loadMarketplaceListings();
  };
  function escapeHtml(str) { return str ? str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])) : ''; }
  loadRequests(); if (localStorage.getItem('onroadnow_role') === 'buyer') loadActiveDeliveries();
  checkAuth();
</script>
</body>
</html>
HTML

# Overwrite api/index.js (ensuring all endpoints)
cat > api/index.js << 'JS'
const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const GOOGLE_CLIENT_ID = '134628093591-61nk4mneo6d1o6of5da3e3fijgtd5dd0.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

let users = [];
let listings = [];
let sales = [];
let requests = [];
let deliveries = [];

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}
function verifyPassword(pwd, hash) {
  return hashPassword(pwd) === hash;
}

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

  // ---------- Authentication ----------
  if (url === '/api/signup' && method === 'POST') {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'User exists' });
    const id = Date.now().toString();
    users.push({ id, email, passwordHash: hashPassword(password), name, phone: '', role: 'user', createdAt: Date.now() });
    const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', cookie.serialize('token', token, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 604800 }));
    res.status(200).json({ message: 'Signup successful', user: { id, email, name } });
    return;
  }
  if (url === '/api/login' && method === 'POST') {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', cookie.serialize('token', token, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 604800 }));
    res.status(200).json({ message: 'Login successful', user: { id: user.id, email: user.email, name: user.name } });
    return;
  }
  if (url === '/api/logout' && method === 'POST') {
    res.setHeader('Set-Cookie', cookie.serialize('token', '', { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 0 }));
    res.status(200).json({ message: 'Logged out' });
    return;
  }
  if (url === '/api/me' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.status(200).json({ id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role, avatar: user.avatar });
    return;
  }
  if (url === '/api/user' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const user = users.find(u => u.id === userId);
    if (user) Object.assign(user, req.body);
    res.status(200).json({ message: 'Profile updated' });
    return;
  }
  // Google OAuth
  if (url === '/api/auth/google' && method === 'POST') {
    const { credential } = req.body;
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const email = payload.email;
      const name = payload.name;
      let user = users.find(u => u.email === email);
      if (!user) {
        const id = Date.now().toString();
        user = { id, email, name, phone: '', role: 'user', createdAt: Date.now() };
        users.push(user);
      }
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      res.setHeader('Set-Cookie', cookie.serialize('token', token, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 604800 }));
      res.status(200).json({ user });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
    return;
  }
  // List users (admin only)
  if (url === '/api/users' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const currentUser = users.find(u => u.id === userId);
    if (currentUser?.email !== 'admin@korerussbiz.com') return res.status(403).json({ error: 'Admin only' });
    res.status(200).json(users);
    return;
  }
  // Marketplace listings
  if (url === '/api/listings' && method === 'GET') {
    res.status(200).json(listings.filter(l => l.status === 'active'));
    return;
  }
  if (url === '/api/listings' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Login required' });
    const { title, description, price, feePercent } = req.body;
    const newListing = {
      id: Date.now(),
      sellerId: userId,
      title, description,
      price: parseFloat(price),
      feePercent: feePercent || 2,
      status: 'active',
      createdAt: Date.now()
    };
    listings.push(newListing);
    res.status(200).json(newListing);
    return;
  }
  if (url === '/api/listings' && method === 'DELETE') {
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const currentUser = users.find(u => u.id === userId);
    if (currentUser?.email !== 'admin@korerussbiz.com') return res.status(403).json({ error: 'Admin only' });
    const { id } = req.body;
    const index = listings.findIndex(l => l.id === parseInt(id));
    if (index === -1) return res.status(404).json({ error: 'Listing not found' });
    listings.splice(index, 1);
    res.status(200).json({ message: 'Listing removed' });
    return;
  }
  if (url === '/api/purchase' && method === 'POST') {
    if (!userId) return res.status(401).json({ error: 'Login required' });
    const { listingId } = req.body;
    const listing = listings.find(l => l.id === parseInt(listingId));
    if (!listing || listing.status !== 'active') return res.status(404).json({ error: 'Listing not available' });
    const feeAmount = (listing.price * listing.feePercent) / 100;
    const sale = {
      saleId: Date.now(),
      listingId: listing.id,
      sellerId: listing.sellerId,
      buyerId: userId,
      amount: listing.price,
      fee: feeAmount,
      timestamp: Date.now()
    };
    sales.push(sale);
    listing.status = 'sold';
    res.status(200).json(sale);
    return;
  }
  if (url === '/api/sales' && method === 'GET') {
    if (!userId) return res.status(401).json({ error: 'Login required' });
    const userSales = sales.filter(s => s.sellerId === userId || s.buyerId === userId);
    res.status(200).json(userSales);
    return;
  }
  // Nearby places (OpenStreetMap)
  if (url.startsWith('/api/nearby')) {
    const { lat, lon, radius = 2000 } = req.query;
    const query = `[out:json];(node["shop"](around:${radius},${lat},${lon});node["amenity"="restaurant"](around:${radius},${lat},${lon});node["amenity"="cafe"](around:${radius},${lat},${lon});node["amenity"="pharmacy"](around:${radius},${lat},${lon});node["shop"="supermarket"](around:${radius},${lat},${lon}););out body;`;
    try {
      const response = await axios.post('https://overpass-api.de/api/interpreter', `data=${query}`, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      res.status(200).json(response.data);
    } catch (err) { res.status(500).json({ error: err.message }); }
    return;
  }
  // Delivery requests
  if (url === '/api/requests') {
    if (method === 'POST') {
      if (!userId) return res.status(401).json({ error: 'Login required' });
      const request = { id: Date.now(), ...req.body, userId, status: 'open' };
      requests.push(request);
      res.status(200).json(request);
    } else if (method === 'GET') {
      res.status(200).json(requests);
    } else res.status(405).end();
    return;
  }
  if (url.startsWith('/api/accept')) {
    const id = parseInt(req.query.id);
    const request = requests.find(r => r.id === id);
    if (!request) return res.status(404).json({ error: 'Not found' });
    request.status = 'accepted';
    request.delivererId = req.body.delivererId;
    request.delivererName = req.body.delivererName;
    res.status(200).json(request);
    return;
  }
  if (url === '/api/offerLoan' && method === 'POST') {
    res.status(200).json({});
    return;
  }
  if (url === '/api/confirmDelivery' && method === 'POST') {
    const { requestId, customerId } = req.body;
    const request = requests.find(r => r.id === parseInt(requestId));
    if (request) request.status = 'completed';
    res.status(200).json({});
    return;
  }
  if (url === '/api/updateLocation' && method === 'POST') {
    const { delivererId, lat, lon, status } = req.body;
    let delivery = deliveries.find(d => d.delivererId === delivererId);
    if (!delivery) {
      delivery = { delivererId, location: { lat, lon }, status, lastUpdate: Date.now() };
      deliveries.push(delivery);
    } else {
      delivery.location = { lat, lon };
      delivery.status = status;
      delivery.lastUpdate = Date.now();
    }
    res.status(200).json({});
    return;
  }
  if (url.startsWith('/api/getLocation')) {
    const { requestId } = req.query;
    const request = requests.find(r => r.id === parseInt(requestId));
    if (!request) return res.status(404).json({ error: 'Not found' });
    const delivery = deliveries.find(d => d.delivererId === request.delivererId);
    res.status(200).json({ location: delivery?.location || null, status: request.status });
    return;
  }
  res.status(404).json({ error: 'Not found' });
};
JS

echo "✅ Fixed frontend and backend with description, tutorial, and corrected login."
