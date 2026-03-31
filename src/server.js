require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { MOSQUES, SUBMISSIONS, USERS, ALL_STATES } = require('./data');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS — allow iframe embedding from any origin ─────────────
app.use(cors({
  origin: true,
  credentials: true
}));

// ─── Security headers — allow iframe embedding ─────────────────
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// ─── SESSION — SameSite=None for cross-origin iframe ──────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'mosquemap-dev-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,           // works over HTTP in dev/iframe
    sameSite: 'none',        // required for cross-origin iframe
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/login');
}

// ─── HEALTH ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'MosqueMap Admin', mosques: MOSQUES.length, time: new Date().toISOString() });
});

// ─── AUTH ROUTES ──────────────────────────────────────────────
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = USERS.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const defaultPass = process.env.ADMIN_PASSWORD || 'MosqueMap2026!';
  const valid = password === defaultPass || (user.passwordHash && await bcrypt.compare(password, user.passwordHash));
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  req.session.save(err => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json({ success: true, user: req.session.user });
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json(req.session.user);
});

// ─── PROTECTED PAGE ROUTES ────────────────────────────────────
// All serve index.html — auth is checked client-side via /api/auth/me
['/', '/mosques', '/submissions', '/map', '/users', '/settings'].forEach(route => {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
});

// ─── STATS ────────────────────────────────────────────────────
app.get('/api/stats', requireAuth, (req, res) => {
  const byState = {};
  MOSQUES.forEach(m => { byState[m.state] = (byState[m.state] || 0) + 1; });
  const topStates = Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 10);
  res.json({
    totalMosques: MOSQUES.length,
    verifiedMosques: MOSQUES.filter(m => m.status === 'verified').length,
    pendingReview: SUBMISSIONS.filter(s => s.status === 'pending').length,
    pendingMosques: MOSQUES.filter(m => m.status === 'pending').length,
    totalStates: ALL_STATES.length,
    totalUsers: 1247, activeUsers: 312, searchesToday: 843, addedThisMonth: 14,
    topStates, byState
  });
});

// ─── MOSQUES ──────────────────────────────────────────────────
app.get('/api/mosques', requireAuth, (req, res) => {
  const { q = '', status = '', state = '', page = 1, limit = 50 } = req.query;
  let list = MOSQUES;
  if (status) list = list.filter(m => m.status === status);
  if (state) list = list.filter(m => m.state === state);
  if (q) {
    const ql = q.toLowerCase();
    list = list.filter(m => m.name.toLowerCase().includes(ql) || (m.lga || '').toLowerCase().includes(ql) || (m.state || '').toLowerCase().includes(ql));
  }
  const total = list.length;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  res.json({ mosques: list.slice(offset, offset + parseInt(limit)), total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

app.get('/api/mosques/map', requireAuth, (req, res) => {
  const { state = '' } = req.query;
  const list = state ? MOSQUES.filter(m => m.state === state) : MOSQUES;
  res.json({ data: list.map(m => [m.id, m.name, m.lat, m.lng, m.state, m.status]), total: list.length });
});

app.get('/api/mosques/:id', requireAuth, (req, res) => {
  const mosque = MOSQUES.find(m => m.id === req.params.id);
  if (!mosque) return res.status(404).json({ error: 'Not found' });
  res.json(mosque);
});

app.post('/api/mosques', requireAuth, (req, res) => {
  const mosque = { id: String(Date.now()), ...req.body, status: 'pending', createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString().split('T')[0], submittedBy: req.session.user.email, source: 'admin' };
  MOSQUES.push(mosque);
  res.status(201).json(mosque);
});

app.put('/api/mosques/:id', requireAuth, (req, res) => {
  const idx = MOSQUES.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  MOSQUES[idx] = { ...MOSQUES[idx], ...req.body, updatedAt: new Date().toISOString().split('T')[0] };
  res.json(MOSQUES[idx]);
});

app.delete('/api/mosques/:id', requireAuth, (req, res) => {
  const idx = MOSQUES.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  MOSQUES.splice(idx, 1);
  res.json({ success: true });
});

app.post('/api/mosques/:id/verify', requireAuth, (req, res) => {
  const m = MOSQUES.find(m => m.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  m.status = 'verified'; m.updatedAt = new Date().toISOString().split('T')[0];
  res.json(m);
});

app.post('/api/mosques/:id/reject', requireAuth, (req, res) => {
  const m = MOSQUES.find(m => m.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  m.status = 'rejected'; m.updatedAt = new Date().toISOString().split('T')[0];
  res.json(m);
});

// ─── STATES ───────────────────────────────────────────────────
app.get('/api/states', requireAuth, (req, res) => res.json(ALL_STATES));

// ─── SUBMISSIONS ──────────────────────────────────────────────
app.get('/api/submissions', requireAuth, (req, res) => {
  let list = [...SUBMISSIONS];
  if (req.query.status) list = list.filter(s => s.status === req.query.status);
  res.json({ submissions: list, total: list.length });
});

app.post('/api/submissions/:id/approve', requireAuth, (req, res) => {
  const sub = SUBMISSIONS.find(s => s.id === req.params.id);
  if (!sub) return res.status(404).json({ error: 'Not found' });
  sub.status = 'approved';
  const mosque = { id: String(Date.now()), name: sub.name, address: sub.address, lat: sub.lat, lng: sub.lng, state: sub.state, lga: sub.lga, phone: sub.phone, facilities: sub.facilities || [], status: 'verified', rating: null, submittedBy: sub.submittedBy, createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString().split('T')[0], about: sub.notes || '', source: 'community' };
  MOSQUES.push(mosque);
  res.json({ success: true, mosque });
});

app.post('/api/submissions/:id/reject', requireAuth, (req, res) => {
  const sub = SUBMISSIONS.find(s => s.id === req.params.id);
  if (!sub) return res.status(404).json({ error: 'Not found' });
  sub.status = 'rejected';
  res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🕌 MosqueMap Admin running on port ${PORT} | ${MOSQUES.length} mosques loaded`);
});

module.exports = app;
