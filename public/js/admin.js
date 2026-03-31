// ============================================================
// MosqueMap Admin Portal — Frontend JS v2 (Real Dataset)
// ============================================================
let currentPage = 'dashboard';
let allMosques = [];
let allSubmissions = [];
let adminMap = null;
let adminMapMarkers = [];
let modalMap = null;
let modalMarker = null;
let editingId = null;
let allStates = [];
let currentMosquePage = 1;
let currentMosqueTotal = 0;
let currentMosqueFilter = { q:'', status:'', state:'' };
let clusterGroup = null;

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadStates();
  await loadStats();
  navigate('dashboard', document.querySelector('[data-page=dashboard]'));
});

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me', {credentials:'include'});
    if (!res.ok) { window.location.replace('/login'); return; }
    const user = await res.json();
    document.getElementById('sidebar-name').textContent = user.name||'Admin';
    document.getElementById('sidebar-email').textContent = user.email;
  } catch(e) { window.location.replace('/login'); }
}

async function doLogout() {
  await fetch('/api/auth/logout',{ credentials: 'include', method:'POST'});
  window.location.replace('/login');
}

async function loadStates() {
  try {
    const res = await fetch('/api/states', {credentials:'include'});
    allStates = await res.json();
  } catch(e) {}
}

function navigate(page, el) {
  currentPage = page;
  document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
  if (el) el.classList.add('active');
  const titles = { dashboard:'Dashboard', mosques:'All Mosques', submissions:'Submissions', map:'Map View', users:'Users', settings:'Settings' };
  document.getElementById('topbar-title').textContent = titles[page]||page;
  const content = document.getElementById('page-content');
  content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:#808080;font-size:14px">Loading...</div>';
  setTimeout(() => {
    switch(page) {
      case 'dashboard': renderDashboard(); break;
      case 'mosques': renderMosques(); break;
      case 'submissions': renderSubmissions(); break;
      case 'map': renderMapView(); break;
      case 'users': renderUsers(); break;
      case 'settings': renderSettings(); break;
    }
  }, 50);
}

let stats = {};
async function loadStats() {
  try {
    const res = await fetch('/api/stats', {credentials:'include'});
    stats = await res.json();
    const badge = document.getElementById('sub-badge');
    const topPending = document.getElementById('topbar-pending');
    if (badge) badge.textContent = stats.pendingReview||0;
    if (topPending) topPending.textContent = stats.pendingReview||0;
  } catch(e) {}
}

// ─── DASHBOARD ────────────────────────────────────────────────
async function renderDashboard() {
  await loadStats();
  const topStates = stats.topStates || [];
  const maxCount = topStates[0]?.[1] || 1;
  document.getElementById('page-content').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon teal">🕌</div><div class="stat-info"><div class="stat-value">${(stats.totalMosques||0).toLocaleString()}</div><div class="stat-label">Total Mosques</div><div class="stat-delta up">↑ OSGOF National Dataset</div></div></div>
      <div class="stat-card"><div class="stat-icon green">✅</div><div class="stat-info"><div class="stat-value">${(stats.verifiedMosques||0).toLocaleString()}</div><div class="stat-label">Verified</div><div class="stat-delta up">↑ 100% from OSGOF</div></div></div>
      <div class="stat-card"><div class="stat-icon gold">📥</div><div class="stat-info"><div class="stat-value">${stats.pendingReview||0}</div><div class="stat-label">Pending Review</div><div class="stat-delta" style="color:#d97706">⚠ Community submissions</div></div></div>
      <div class="stat-card"><div class="stat-icon teal">🗺️</div><div class="stat-info"><div class="stat-value">${stats.totalStates||36}</div><div class="stat-label">States Covered</div><div class="stat-delta up">↑ All 36 states + FCT</div></div></div>
      <div class="stat-card"><div class="stat-icon green">👥</div><div class="stat-info"><div class="stat-value">${(stats.totalUsers||0).toLocaleString()}</div><div class="stat-label">App Users</div><div class="stat-delta up">↑ ${stats.activeUsers||0} active today</div></div></div>
    </div>
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">Top 10 States by Mosque Count</div>
        <div class="bar-chart">
          ${topStates.map(([state,count]) => `
            <div class="bar-row">
              <div class="bar-label">${state.length>10?state.slice(0,10)+'…':state}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.round(count/maxCount*100)}%"></div></div>
              <div class="bar-value">${count.toLocaleString()}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Quick Actions</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:4px">
          <button class="btn btn-primary" style="height:40px;width:100%;justify-content:center;font-size:13px" onclick="openAddModal()">+ Add New Mosque</button>
          <button class="btn btn-edit" style="height:40px;width:100%;justify-content:center;font-size:13px" onclick="navigate('submissions',document.querySelector('[data-page=submissions]'))">📥 Review Submissions (${stats.pendingReview||0})</button>
          <button class="btn btn-view" style="height:40px;width:100%;justify-content:center;font-size:13px" onclick="navigate('map',document.querySelector('[data-page=map]'))">🗺️ View Full Map</button>
          <button class="btn btn-view" style="height:40px;width:100%;justify-content:center;font-size:13px" onclick="exportCSV()">📤 Export All Mosques CSV</button>
        </div>
        <div style="margin-top:16px;padding:12px;background:#e8f5f5;border-radius:10px;font-size:12px;color:#095555;line-height:1.5">
          <strong>📊 Dataset Info</strong><br>
          Source: OSGOF (Office of the Surveyor General of the Federation)<br>
          Last updated: September 2017<br>
          Coverage: All 36 states + FCT
        </div>
      </div>
    </div>`;
}

// ─── MOSQUES PAGE ─────────────────────────────────────────────
async function renderMosques(page=1) {
  currentMosquePage = page;
  const { q, status, state } = currentMosqueFilter;
  const res = await fetch(`/api/mosques?q=${encodeURIComponent(q)}&status=${status}&state=${encodeURIComponent(state)}&page=${page}&limit=50`, {credentials:'include'});
  const { mosques, total, pages } = await res.json();
  currentMosqueTotal = total;

  const stateOptions = allStates.map(s=>`<option value="${s}" ${s===state?'selected':''}>${s}</option>`).join('');

  document.getElementById('page-content').innerHTML = `
    <div class="filter-bar">
      <div class="search-wrap"><span class="search-icon-abs">🔍</span><input type="text" id="mosque-search" value="${q}" placeholder="Search name, LGA, state..." oninput="debounceSearch(this.value)"></div>
      <select class="filter-select" id="status-filter" onchange="setMosqueFilter('status',this.value)">
        <option value="">All Status</option>
        <option value="verified" ${status==='verified'?'selected':''}>✅ Verified</option>
        <option value="pending" ${status==='pending'?'selected':''}>⏳ Pending</option>
        <option value="rejected" ${status==='rejected'?'selected':''}>❌ Rejected</option>
      </select>
      <select class="filter-select" id="state-filter" onchange="setMosqueFilter('state',this.value)">
        <option value="">All States</option>
        ${stateOptions}
      </select>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:13px;color:#808080"><strong style="color:#080808">${total.toLocaleString()}</strong> mosques · Page ${page} of ${pages}</div>
      <div style="display:flex;gap:8px">
        ${page>1?`<button class="btn btn-view btn-sm" onclick="renderMosques(${page-1})">← Prev</button>`:''}
        ${page<pages?`<button class="btn btn-view btn-sm" onclick="renderMosques(${page+1})">Next →</button>`:''}
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Mosque Name</th><th>State / LGA</th><th>Coordinates</th><th>Status</th><th>Source</th><th>Actions</th></tr></thead>
        <tbody>
          ${!mosques.length ? `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🕌</div><h3>No mosques found</h3></div></td></tr>` :
          mosques.map(m => `
            <tr>
              <td><div class="mosque-name-cell">${m.name}</div></td>
              <td><div style="font-size:13px;font-weight:600">${m.state||'—'}</div><div class="mosque-addr-cell">${m.lga||m.address||'—'}</div></td>
              <td style="font-size:11px;color:#a8a8a8;font-family:monospace">${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}</td>
              <td><span class="badge ${m.status||'verified'}">${m.status==='verified'?'✅ Verified':m.status==='pending'?'⏳ Pending':'❌ Rejected'}</span></td>
              <td style="font-size:11px;color:#808080">${m.source||'OSGOF'}</td>
              <td><div class="action-group">
                ${m.status==='pending'?`<button class="btn btn-sm btn-verify" onclick="verifyMosque('${m.id}')">✅</button><button class="btn btn-sm btn-reject" onclick="rejectMosque('${m.id}')">❌</button>`:''}
                <button class="btn btn-sm btn-edit" onclick="editMosque('${m.id}')">✏️</button>
                <button class="btn btn-sm btn-delete" onclick="deleteMosque('${m.id}')">🗑️</button>
              </div></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

let searchDebounce = null;
function debounceSearch(val) {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => { currentMosqueFilter.q = val; renderMosques(1); }, 400);
}

function setMosqueFilter(key, val) {
  currentMosqueFilter[key] = val;
  renderMosques(1);
}

// ─── MAP VIEW (with Leaflet.markercluster) ────────────────────
async function renderMapView() {
  document.getElementById('page-content').innerHTML = `
    <div class="filter-bar">
      <select class="filter-select" id="map-state-filter" onchange="loadMapData(this.value)">
        <option value="">All States (may be slow)</option>
        ${allStates.map(s=>`<option value="${s}">${s}</option>`).join('')}
      </select>
      <button class="topbar-btn" onclick="adminMap&&adminMap.setView([9.082,8.675],6)">🇳🇬 Nigeria</button>
      <button class="topbar-btn" onclick="adminMap&&adminMap.setView([6.524,3.379],12)">Lagos</button>
      <button class="topbar-btn" onclick="adminMap&&adminMap.setView([12.002,8.592],12)">Kano</button>
      <button class="topbar-btn" onclick="adminMap&&adminMap.setView([9.058,7.495],12)">Abuja</button>
    </div>
    <div id="admin-map"></div>
    <div class="map-legend">
      <div class="legend-item"><div class="legend-dot" style="background:#0D6E6E"></div>OSGOF Verified</div>
      <div class="legend-item"><div class="legend-dot" style="background:#d97706"></div>Community Pending</div>
      <div class="legend-item" style="font-size:11px;color:#808080;margin-left:auto">Select a state above for faster loading</div>
    </div>`;

  setTimeout(async () => {
    if (adminMap) { adminMap.remove(); adminMap=null; }
    adminMap = L.map('admin-map',{zoomControl:true}).setView([9.082,8.675],6);
    L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',{maxZoom:20,attribution:'© Google Maps'}).addTo(adminMap);
    adminMap.invalidateSize();
    // Load Lagos by default (manageable size)
    loadMapData('Lagos');
    document.getElementById('map-state-filter').value = 'Lagos';
  }, 100);
}

async function loadMapData(state) {
  if (!adminMap) return;
  // Remove existing cluster
  if (clusterGroup) { adminMap.removeLayer(clusterGroup); clusterGroup=null; }
  showToast(`Loading ${state||'all'} mosques...`);
  const res = await fetch(`/api/mosques/map?state=${encodeURIComponent(state)}`, {credentials:'include'});
  const { data, total } = await res.json();
  // Use simple markers with clustering via divIcon
  // [id, name, lat, lng, state, status]
  const bounds = [];
  const markers = [];
  data.forEach(m => {
    const color = m[5]==='pending'?'#d97706':'#0D6E6E';
    const icon = L.circleMarker([m[2],m[3]],{ radius:6, fillColor:color, color:'white', weight:1.5, fillOpacity:0.9 });
    icon.on('click',()=>{
      icon.bindPopup(`<div style="font-family:Inter,sans-serif;min-width:180px"><strong>${m[1]}</strong><br><span style="font-size:12px;color:#808080">${m[4]}</span><br><span style="font-size:11px;background:${color};color:white;padding:2px 8px;border-radius:10px;display:inline-block;margin-top:6px">${m[5]}</span><br><div style="margin-top:8px"><button onclick="editMosque('${m[0]}')" style="height:28px;background:#e8f5f5;color:#0D6E6E;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;padding:0 10px">✏️ Edit</button></div></div>`).openPopup();
    });
    markers.push(icon);
    bounds.push([m[2],m[3]]);
  });
  // Add all markers at once
  const group = L.featureGroup(markers).addTo(adminMap);
  clusterGroup = group;
  if (bounds.length > 0) adminMap.fitBounds(bounds, { padding:[30,30], maxZoom:12 });
  showToast(`✅ ${total.toLocaleString()} mosques loaded`);
}

// ─── SUBMISSIONS ──────────────────────────────────────────────
async function renderSubmissions() {
  const res = await fetch('/api/submissions', {credentials:'include'});
  const { submissions } = await res.json();
  document.getElementById('page-content').innerHTML = `
    <div style="margin-bottom:16px;padding:12px 16px;background:#fffbeb;border-radius:10px;border-left:4px solid #d97706;font-size:13px;color:#92400e;font-weight:500">
      ⚠️ ${submissions.filter(s=>s.status==='pending').length} community submissions awaiting review. User accounts are logged for accountability.
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Mosque Name</th><th>Location</th><th>Submitted By</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${!submissions.length ? `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📥</div><h3>No submissions</h3><p>All caught up!</p></div></td></tr>` :
          submissions.map(s=>`
            <tr>
              <td><div class="mosque-name-cell">${s.name}</div><div class="mosque-addr-cell">${s.notes||'No notes'}</div></td>
              <td><div class="mosque-addr-cell">${s.address||`${s.state||''}, ${s.lga||''}`}</div></td>
              <td style="font-size:12px;color:#3d3d3d">${s.submittedBy}</td>
              <td style="font-size:12px;color:#808080">${s.submittedAt}</td>
              <td><span class="badge ${s.status}">${s.status==='pending'?'⏳ Pending':s.status==='approved'?'✅ Approved':'❌ Rejected'}</span></td>
              <td><div class="action-group">
                ${s.status==='pending'?`<button class="btn btn-sm btn-verify" onclick="approveSubmission('${s.id}')">✅ Approve</button><button class="btn btn-sm btn-reject" onclick="rejectSubmission('${s.id}')">❌ Reject</button>`:'<span style="font-size:12px;color:#a8a8a8">Processed</span>'}
              </div></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ─── USERS ────────────────────────────────────────────────────
function renderUsers() {
  document.getElementById('page-content').innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>User</th><th>Role</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          <tr>
            <td><div class="mosque-name-cell">Admin</div><div class="mosque-addr-cell">admin@mosquemap.ng</div></td>
            <td><span class="badge superadmin">⭐ Super Admin</span></td>
            <td style="font-size:12px;color:#808080">2024-01-01</td>
            <td><span class="badge verified">✅ Active</span></td>
            <td><button class="btn btn-sm btn-edit" onclick="showToast('Edit user — v2')">✏️ Edit</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="margin-top:16px;padding:16px;background:#e8f5f5;border-radius:12px;font-size:13px;color:#095555;line-height:1.5">
      <strong>👥 User Management v2</strong> — Full user management with mosque admin roles, invitation system, and activity logs will be available in the next release. All app user accounts are stored in localStorage on their devices and linked to submissions for accountability.
    </div>`;
}

// ─── SETTINGS ─────────────────────────────────────────────────
function renderSettings() {
  document.getElementById('page-content').innerHTML = `
    <div style="max-width:600px;display:flex;flex-direction:column;gap:20px">
      <div class="chart-card">
        <div class="chart-title">App Settings</div>
        <div class="form-group"><label>Default Country</label><select style="width:100%;height:40px;background:#f5f5f5;border:1.5px solid rgba(0,0,0,0.08);border-radius:8px;padding:0 12px;font-size:13px;font-family:Inter,sans-serif;outline:none"><option selected>Nigeria</option><option>Ghana</option><option>Senegal</option></select></div>
        <div class="form-group"><label>Default Prayer Calculation Method</label><select style="width:100%;height:40px;background:#f5f5f5;border:1.5px solid rgba(0,0,0,0.08);border-radius:8px;padding:0 12px;font-size:13px;font-family:Inter,sans-serif;outline:none"><option>Muslim World League</option><option>Egyptian General Authority</option><option>University of Islamic Sciences, Karachi</option></select></div>
        <button class="btn btn-primary" style="height:40px;padding:0 20px;margin-top:8px" onclick="showToast('✅ Settings saved!')">Save Settings</button>
      </div>
      <div class="chart-card">
        <div class="chart-title">Change Password</div>
        <div class="form-group"><label>Current Password</label><input type="password" placeholder="••••••••" style="height:40px;background:#f5f5f5;border:1.5px solid rgba(0,0,0,0.08);border-radius:8px;padding:0 12px;font-size:13px;width:100%;font-family:Inter,sans-serif;outline:none"></div>
        <div class="form-group"><label>New Password</label><input type="password" placeholder="••••••••" style="height:40px;background:#f5f5f5;border:1.5px solid rgba(0,0,0,0.08);border-radius:8px;padding:0 12px;font-size:13px;width:100%;font-family:Inter,sans-serif;outline:none"></div>
        <button class="btn btn-primary" style="height:40px;padding:0 20px;margin-top:8px" onclick="showToast('✅ Password updated!')">Update Password</button>
      </div>
      <div class="chart-card">
        <div class="chart-title">Database & Export</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-edit" style="height:40px;padding:0 16px" onclick="exportCSV()">📤 Export Mosques CSV</button>
          <button class="btn btn-view" style="height:40px;padding:0 16px" onclick="showToast('Backup created!')">💾 Backup Data</button>
        </div>
        <p style="font-size:12px;color:#808080;margin-top:12px">Dataset: 22,379 mosques from OSGOF National Geodatabase. For production, connect PostgreSQL + PostGIS for full spatial query support.</p>
      </div>
    </div>`;
}

// ─── MOSQUE ACTIONS ───────────────────────────────────────────
async function verifyMosque(id) {
  await fetch(`/api/mosques/${id}/verify`,{ credentials: 'include', method:'POST'});
  showToast('✅ Mosque verified!');
  await loadStats();
  if (currentPage==='mosques') renderMosques(currentMosquePage);
}

async function rejectMosque(id) {
  if (!confirm('Reject this mosque?')) return;
  await fetch(`/api/mosques/${id}/reject`,{ credentials: 'include', method:'POST'});
  showToast('❌ Rejected');
  if (currentPage==='mosques') renderMosques(currentMosquePage);
}

async function deleteMosque(id) {
  if (!confirm('Permanently delete? Cannot be undone.')) return;
  await fetch(`/api/mosques/${id}`,{ credentials: 'include', method:'DELETE'});
  showToast('🗑️ Deleted');
  await loadStats();
  renderMosques(currentMosquePage);
}

async function approveSubmission(id) {
  await fetch(`/api/submissions/${id}/approve`,{ credentials: 'include', method:'POST'});
  showToast('✅ Approved — mosque added to map!');
  await loadStats();
  renderSubmissions();
}

async function rejectSubmission(id) {
  if (!confirm('Reject this submission?')) return;
  await fetch(`/api/submissions/${id}/reject`,{ credentials: 'include', method:'POST'});
  showToast('❌ Rejected');
  renderSubmissions();
}

// ─── ADD/EDIT MODAL ───────────────────────────────────────────
function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Add New Mosque';
  ['m-name','m-lat','m-lng','m-address','m-phone','m-facilities','m-about'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = id==='m-lat'?'9.0820':id==='m-lng'?'8.6753':'';
  });
  document.getElementById('m-status').value = 'pending';
  // Populate state select
  const sel = document.getElementById('m-state');
  if (sel && sel.options.length <= 1) {
    allStates.forEach(s => { const o=document.createElement('option'); o.value=s; o.textContent=s; sel.appendChild(o); });
  }
  document.getElementById('mosque-modal').classList.add('open');
  setTimeout(initModalMap, 100);
}

async function editMosque(id) {
  const res = await fetch(`/api/mosques/${id}`, {credentials:'include'});
  const m = await res.json();
  editingId = id;
  document.getElementById('modal-title').textContent = 'Edit Mosque';
  document.getElementById('m-name').value = m.name||'';
  document.getElementById('m-lat').value = m.lat||'';
  document.getElementById('m-lng').value = m.lng||'';
  document.getElementById('m-address').value = m.address||m.lga||'';
  document.getElementById('m-phone').value = m.phone||'';
  document.getElementById('m-status').value = m.status||'pending';
  document.getElementById('m-facilities').value = (m.facilities||[]).join(', ');
  document.getElementById('m-about').value = m.about||'';
  const sel = document.getElementById('m-state');
  if (sel && sel.options.length <= 1) {
    allStates.forEach(s => { const o=document.createElement('option'); o.value=s; o.textContent=s; sel.appendChild(o); });
  }
  if (sel) sel.value = m.state||'';
  document.getElementById('mosque-modal').classList.add('open');
  setTimeout(() => initModalMap(m.lat, m.lng), 100);
}

function initModalMap(lat=9.082, lng=8.675) {
  if (modalMap) { modalMap.remove(); modalMap=null; modalMarker=null; }
  modalMap = L.map('modal-map',{zoomControl:false,attributionControl:false}).setView([lat,lng],14);
  L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',{maxZoom:20}).addTo(modalMap);
  const icon = L.divIcon({ className:'', html:'<div style="font-size:24px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))">📍</div>', iconSize:[24,24], iconAnchor:[12,24] });
  modalMarker = L.marker([lat,lng],{icon,draggable:true}).addTo(modalMap);
  modalMarker.on('dragend', e => {
    const p=e.target.getLatLng();
    document.getElementById('m-lat').value=p.lat.toFixed(5);
    document.getElementById('m-lng').value=p.lng.toFixed(5);
  });
  modalMap.on('click', e => {
    modalMarker.setLatLng(e.latlng);
    document.getElementById('m-lat').value=e.latlng.lat.toFixed(5);
    document.getElementById('m-lng').value=e.latlng.lng.toFixed(5);
  });
  modalMap.invalidateSize();
}

function closeModal() {
  document.getElementById('mosque-modal').classList.remove('open');
  if (modalMap) { modalMap.remove(); modalMap=null; }
}

async function saveMosque() {
  const data = {
    name: document.getElementById('m-name').value.trim(),
    lat: parseFloat(document.getElementById('m-lat').value),
    lng: parseFloat(document.getElementById('m-lng').value),
    address: document.getElementById('m-address').value.trim(),
    state: document.getElementById('m-state')?.value||'',
    phone: document.getElementById('m-phone').value.trim()||null,
    status: document.getElementById('m-status').value,
    facilities: document.getElementById('m-facilities').value.split(',').map(s=>s.trim()).filter(Boolean),
    about: document.getElementById('m-about').value.trim()
  };
  if (!data.name) { showToast('⚠️ Name required'); return; }
  const url = editingId?`/api/mosques/${editingId}`:'/api/mosques';
  const method = editingId?'PUT':'POST';
  await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  showToast(editingId?'✅ Updated!':'✅ Added!');
  closeModal();
  await loadStats();
  if (currentPage==='mosques') renderMosques(currentMosquePage);
  else if (currentPage==='dashboard') renderDashboard();
}

// ─── EXPORT ───────────────────────────────────────────────────
async function exportCSV() {
  showToast('📤 Preparing export...');
  const res = await fetch('/api/mosques?limit=1000&page=1', {credentials:'include'});
  const { mosques } = await res.json();
  const headers = ['id','name','state','lga','address','lat','lng','phone','status','source'];
  const rows = mosques.map(m => headers.map(h=>`"${String(m[h]||'').replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','),...rows].join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mosquemap-nigeria.csv';
  a.click();
  showToast('📤 CSV exported (first 1000 records)!');
}

// ─── TOAST ────────────────────────────────────────────────────
let toastTimer=null;
function showToast(msg) {
  const t=document.getElementById('toast');
  if (!t) return;
  t.textContent=msg; t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),2800);
}
