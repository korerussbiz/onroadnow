const admin = require('firebase-admin');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { OAuth2Client } = require('google-auth-library');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const GOOGLE_CLIENT_ID = '134628093591-61nk4mneo6d1o6of5da3e3fijgtd5dd0.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Initialize Firestore
if (!admin.apps.length) {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    // For local development, place serviceAccountKey.json in project root
    try {
      serviceAccount = require('./serviceAccountKey.json');
    } catch(e) { console.log('No service account key found'); }
  }
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
}
const db = admin.firestore();

let users = []; // fallback in-memory if Firestore not available

// Helper: get user from Firestore or memory
async function getUser(uid) {
  if (db) {
    const doc = await db.collection('users').doc(uid).get();
    return doc.exists ? doc.data() : null;
  } else {
    return users.find(u => u.id === uid);
  }
}
async function setUser(uid, data) {
  if (db) {
    await db.collection('users').doc(uid).set(data, { merge: true });
  } else {
    const existing = users.find(u => u.id === uid);
    if (existing) Object.assign(existing, data);
    else users.push({ id: uid, ...data });
  }
}
async function getAllUsers() {
  if (db) {
    const snapshot = await db.collection('users').get();
    return snapshot.docs.map(d => d.data());
  } else {
    return users;
  }
}
// Similar helpers for listings, sales, requests (same pattern)
// For brevity, I'll implement Firestore versions – full code in next messages.

// For now, use in-memory arrays (you already have working code). We'll replace with Firestore later.
// But to keep this answer manageable, I'll provide the full Firestore backend as a separate script.

console.log('Backend ready');
