// ============================================================
// MosqueMap Admin — Real dataset from OSGOF Nigeria GeoJSON
// 22,379 mosques across 36 states
// ============================================================
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Load the full mosque dataset
let MOSQUES = [];
try {
  const raw = fs.readFileSync(path.join(__dirname, '../data/mosques.json'), 'utf8');
  MOSQUES = JSON.parse(raw);
  console.log(`✅ Loaded ${MOSQUES.length} mosques from dataset`);
} catch(e) {
  console.warn('⚠️ Could not load mosques.json, using empty array:', e.message);
}

// Load states list
let ALL_STATES = [];
try {
  ALL_STATES = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/states.json'), 'utf8'));
} catch(e) {}

// Community submissions (in-memory, replace with DB in production)
const SUBMISSIONS = [
  { id: uuidv4(), name: "Masjid Tawheed Lekki", address: "Lekki Phase 1, Lagos", lat: 6.4478, lng: 3.4723, state: "Lagos", lga: "Eti-Osa", phone: "+234 808 901 2345", facilities: ["wudu","parking"], submittedBy: "user@example.com", submittedAt: "2025-03-28", status: "pending", notes: "New mosque in Lekki Phase 1" },
  { id: uuidv4(), name: "Rahimiyya Mosque Ibadan", address: "Bodija, Ibadan, Oyo State", lat: 7.3775, lng: 3.9470, state: "Oyo", lga: "Ibadan North", phone: null, facilities: ["wudu","women"], submittedBy: "community@ibadan.ng", submittedAt: "2025-03-27", status: "pending", notes: "" },
  { id: uuidv4(), name: "Masjid Al-Furqan PH", address: "GRA Phase 2, Port Harcourt", lat: 4.8156, lng: 7.0498, state: "Rivers", lga: "Port Harcourt", phone: "+234 809 012 3456", facilities: ["wudu","parking","women"], submittedBy: "admin@alfurqan.ng", submittedAt: "2025-03-25", status: "pending", notes: "" }
];

const USERS = [
  { id: uuidv4(), email: process.env.ADMIN_EMAIL || "admin@mosquemap.ng", passwordHash: null, role: "superadmin", name: "Admin", createdAt: "2024-01-01" }
];

module.exports = { MOSQUES, SUBMISSIONS, USERS, ALL_STATES };
