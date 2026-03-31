require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { MOSQUES, SUBMISSIONS, USERS, ALL_STATES } = require('./data');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.SESSION_SECRET || 'mosquemap-jwt-secret-2026';

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// ─── JWT AUTH MIDDLEWARE ──────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) {
    res.status(401).json({ error: 'Token expired or invalid' });
  }
}

// ─── HEALTH ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'MosqueMap Admin', mosques: MOSQUES.length });
});

// ─── ALL PAGE ROUTES → serve index.html (SPA) ─────────────────
// Auth is handled entirely client-side via JWT in localStorage
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '../public/login.html')));
['/', '/mosques', '/submissions', '/map', '/users', '/settings'].forEach(r => {
  app.get(r, (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
});

// ─── AUTH API ─────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = USERS.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const defaultPass = process.env.ADMIN_PASSWORD || 'MosqueMap2026!';
  if (password !== defaultPass) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));

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
    list = list.filter(m =>
      m.name.toLowerCase().includes(ql) ||
      (m.lga || '').toLowerCase().includes(ql) ||
      (m.state || '').toLowerCase().includes(ql)
    );
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
  const m = MOSQUES.find(m => m.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  res.json(m);
});

app.post('/api/mosques', requireAuth, (req, res) => {
  const mosque = { id: String(Date.now()), ...req.body, status: 'pending', createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString().split('T')[0], submittedBy: req.user.email, source: 'admin' };
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
  MOSQUES.push({ id: String(Date.now()), name: sub.name, address: sub.address, lat: sub.lat, lng: sub.lng, state: sub.state, lga: sub.lga, phone: sub.phone, facilities: sub.facilities || [], status: 'verified', rating: null, submittedBy: sub.submittedBy, createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString().split('T')[0], about: sub.notes || '', source: 'community' });
  res.json({ success: true });
});

app.post('/api/submissions/:id/reject', requireAuth, (req, res) => {
  const sub = SUBMISSIONS.find(s => s.id === req.params.id);
  if (!sub) return res.status(404).json({ error: 'Not found' });
  sub.status = 'rejected';
  res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🕌 MosqueMap Admin running on port ${PORT} | ${MOSQUES.length} mosques | JWT auth`);
});

module.exports = app;
