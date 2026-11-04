// Dashboard logic: poll status, render device table, filters, detail panel.
const $ = (sel) => document.querySelector(sel);

let lastScan = null;      // full live scan result
let stored = [];          // stored device rows (history)
let sortKey = 'ip';
let sortAsc = true;
let selectedMac = null;

const PHASE_LABELS = {
  idle: '', start: 'Starting', network: 'Network', sweep: 'Ping sweep',
  arp: 'ARP table', mdns: 'mDNS', ssdp: 'SSDP', netbios: 'NetBIOS',
  ports: 'Port fingerprint', merge: 'Merging', done: 'Done', error: 'Error',
};

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

// ---- status polling ----
async function pollStatus() {
  try {
    const s = await api('/api/status');
    const wrap = $('#progress-wrap');
    if (s.running) {
      wrap.classList.remove('hidden');
      $('#progress-text').textContent = `${PHASE_LABELS[s.phase] ?? s.phase}: ${s.message}`;
      // indeterminate shimmer while running
      $('#progress-bar').style.width = '100%';
      $('#progress-bar').style.opacity = '0.6';
      $('#scan-btn').disabled = true;
    } else {
      $('#scan-btn').disabled = false;
      if (s.phase === 'done' || s.phase === 'error') {
        $('#progress-text').textContent = s.message;
        $('#progress-bar').style.opacity = '1';
        $('#progress-bar').style.width = s.phase === 'done' ? '100%' : '0%';
        if (s.phase === 'done') setTimeout(() => wrap.classList.add('hidden'), 4000);
      } else {
        wrap.classList.add('hidden');
      }
    }
    if (s.network) {
      $('#net-info').textContent =
        `${s.network.alias || ''} ${s.network.ip}/${s.network.prefix} · gw ${s.network.gateway ?? 'n/a'}` +
        (s.deviceCount ? ` · ${s.deviceCount} devices` : '');
    }
    if (s.lastError) $('#progress-text').textContent = `Error: ${s.lastError}`;
    // Restore watch controls from server state (server is the source of truth).
    if (s.watch) {
      $('#watch-en').checked = s.watch.enabled;
      $('#watch-int').value = String(s.watch.intervalMinutes);
      $('#watch-int').disabled = !s.watch.enabled;
      $('#watch-en').title = s.watch.enabled
        ? (() => {
            const mins = s.watch.nextRunAt
              ? Math.max(1, Math.round((s.watch.nextRunAt - Date.now()) / 60000))
              : null;
            return mins ? `Watching — next scan in ~${mins} min` : 'Watching — next scan soon';
          })()
        : 'Re-scan automatically and notify when a new device appears';
    }
  } catch { /* server briefly busy; retry */ }
}

async function startScan() {
  $('#scan-btn').disabled = true;
  try {
    await api('/api/scan', { method: 'POST' });
    pollStatus();
    const t = setInterval(async () => {
      await pollStatus();
      const s = await api('/api/status').catch(() => null);
      if (s && !s.running && s.phase !== 'idle') {
        clearInterval(t);
        await refresh();
      }
    }, 900);
  } catch (err) {
    alert(err.message);
    $('#scan-btn').disabled = false;
  }
}

// ---- data refresh ----
async function refresh() {
  const [scan, db] = await Promise.all([
    api('/api/last-scan').catch(() => null),
    api('/api/devices').catch(() => ({ devices: [], newToday: [] })),
  ]);
  lastScan = scan;
  stored = db.devices;
  renderAlerts(db.newToday);
  renderTable();
}

function renderAlerts(newToday) {
  const el = $('#alerts');
  if (!newToday?.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `<b>⚠ ${newToday.length} new device${newToday.length > 1 ? 's' : ''} seen in the last 24h:</b> ` +
    newToday.map((d) => `${escapeHtml(d.hostname || d.mac)} <span class="muted">(${escapeHtml(d.vendor || 'unknown vendor')})</span>`).join(', ');
}

// Devices first seen within the last 24h — same rule as the alert banner,
// so the "new only" filter always agrees with it.
const DAY_MS = 24 * 3600 * 1000;
const isNewToday = (ts) => typeof ts === 'number' && ts >= Date.now() - DAY_MS;

// Merge live scan detail onto stored rows for display.
function currentRows() {
  const storedByMac = new Map(stored.map((s) => [s.mac, s]));
  const rows = [];
  const seen = new Set();

  // Live scan first (rich detail); stored history fills missing fields so
  // passive devices keep their last-known hostname/model/notes.
  for (const d of lastScan?.devices ?? []) {
    seen.add(d.mac);
    const s = storedByMac.get(d.mac);
    rows.push({
      ...d,
      hostname: d.hostname ?? s?.hostname ?? null,
      type: d.type && d.type !== 'Unknown' ? d.type : (s?.type ?? d.type),
      model: d.model ?? s?.model ?? null,
      notes: s?.notes ?? '',
      last_seen: lastScan.scannedAt,
      isNew: d.isNew || isNewToday(s?.first_seen),
      source: 'live',
    });
  }
  // Stored devices not in the last scan (still known).
  for (const s of stored) {
    if (seen.has(s.mac)) continue;
    rows.push({
      mac: s.mac, ip: s.last_ip, vendor: s.vendor, hostname: s.hostname,
      type: s.type, model: s.model, confidence: s.confidence,
      notes: s.notes, last_seen: s.last_seen, isActive: false,
      isNew: isNewToday(s.first_seen), source: 'stored',
    });
  }
  return rows;
}

function confClass(c) {
  return { high: 'conf-high', medium: 'conf-medium', low: 'conf-low' }[c] || 'conf-none';
}

function renderTable() {
  const q = $('#search').value.trim().toLowerCase();
  const newOnly = $('#new-only').checked;
  let rows = currentRows();
  if (newOnly) rows = rows.filter((r) => r.isNew);
  if (q) {
    rows = rows.filter((r) =>
      [r.ip, r.mac, r.hostname, r.vendor, r.type, r.model]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }

  rows.sort((a, b) => {
    const av = a[sortKey] ?? '', bv = b[sortKey] ?? '';
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortAsc ? cmp : -cmp;
  });

  const tbody = $('#dev-table tbody');
  tbody.innerHTML = rows.map((r) => `
    <tr data-mac="${escapeAttr(r.mac)}" class="${r.isNew ? 'new-row' : ''} ${r.isActive === false ? 'inactive' : ''} ${r.mac === selectedMac ? 'selected' : ''}">
      <td class="mono">${escapeHtml(r.ip ?? '—')}${r.isActive === false ? ' <span class="muted">(off)</span>' : ''}</td>
      <td class="mono">${escapeHtml(r.mac)}</td>
      <td>${escapeHtml(r.vendor ?? (r.randomized ? 'Randomized' : '—'))}</td>
      <td>${escapeHtml(r.hostname ?? '—')}</td>
      <td>${escapeHtml(r.type ?? '—')}${r.model ? `<br><span class="muted">${escapeHtml(r.model)}</span>` : ''}</td>
      <td><span class="conf ${confClass(r.confidence)}">${escapeHtml(r.confidence ?? 'none')}</span></td>
      <td>${(r.open ?? []).slice(0, 6).map((p) => `<span class="pill">${p}</span>`).join('') || '<span class="muted">—</span>'}</td>
      <td class="muted">${relTime(r.last_seen)}</td>
    </tr>`).join('');

  $('#dev-count').textContent = `(${rows.length})`;
  $('#empty').classList.toggle('hidden', rows.length > 0);

  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', () => { selectedMac = tr.dataset.mac; renderTable(); renderDetail(); });
  });
}

function renderDetail() {
  const panel = $('#detail-panel');
  if (!selectedMac) { panel.classList.add('hidden'); return; }
  const r = currentRows().find((x) => x.mac === selectedMac);
  if (!r) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');

  const svc = (r.services ?? []).map((s) => `<span class="pill">${escapeHtml(s)}</span>`).join('');
  const reasons = (r.reasons ?? []).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
  const http = r.http
    ? `<dt>HTTP</dt><dd>${escapeHtml(r.http.server ?? '')} ${r.http.title ? '· ' + escapeHtml(r.http.title) : ''}</dd>`
    : '';

  $('#detail').innerHTML = `
    <h3>${escapeHtml(r.hostname || r.type || r.mac)}</h3>
    <dl>
      <dt>MAC</dt><dd class="mono">${escapeHtml(r.mac)}</dd>
      <dt>IP</dt><dd class="mono">${escapeHtml(r.ip ?? '—')}</dd>
      <dt>Vendor</dt><dd>${escapeHtml(r.vendor ?? '—')}${r.randomized ? ' <span class="pill">randomized MAC</span>' : ''}</dd>
      <dt>Type</dt><dd>${escapeHtml(r.type ?? '—')} (${escapeHtml(r.confidence ?? 'none')})</dd>
      <dt>Model</dt><dd>${escapeHtml(r.model ?? '—')}</dd>
      <dt>Open ports</dt><dd>${(r.open ?? []).join(', ') || '—'}</dd>
      ${http}
      ${r.isGateway ? '<dt>Role</dt><dd><span class="pill gateway">gateway</span></dd>' : ''}
    </dl>
    ${svc ? `<div class="muted" style="margin-bottom:6px">Services</div>${svc}` : ''}
    ${reasons ? `<div class="muted" style="margin:10px 0 4px">Why this guess</div><ul class="reasons">${reasons}</ul>` : ''}
    <div class="muted" style="margin:10px 0 4px">Notes</div>
    <textarea id="notes" placeholder="e.g. Sarah's phone, living room TV…">${escapeHtml(r.notes ?? '')}</textarea>
    <div style="margin-top:8px;display:flex;gap:8px">
      <button id="save-notes" style="padding:5px 14px;font-size:12px">Save note</button>
      <button id="hide-dev" style="padding:5px 14px;font-size:12px;background:#30363d">Hide device</button>
    </div>`;

  $('#save-notes').onclick = async () => {
    await api(`/api/devices/${encodeURIComponent(r.mac)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: $('#notes').value }),
    });
    await refresh();
  };
  $('#hide-dev').onclick = async () => {
    await api(`/api/devices/${encodeURIComponent(r.mac)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ignore: true }),
    });
    selectedMac = null;
    await refresh();
    renderDetail();
  };
}

// ---- utils ----
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

function relTime(ts) {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ---- wiring ----
$('#scan-btn').addEventListener('click', startScan);
$('#search').addEventListener('input', renderTable);
$('#new-only').addEventListener('change', renderTable);

// Watch mode: POST the desired state; server clamps the interval.
async function pushWatch() {
  const enabled = $('#watch-en').checked;
  const intervalMinutes = Number($('#watch-int').value);
  $('#watch-int').disabled = !enabled;
  try {
    await api('/api/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, intervalMinutes }),
    });
    pollStatus();
  } catch (err) {
    alert(`Could not update watch mode: ${err.message}`);
  }
}
$('#watch-en').addEventListener('change', pushWatch);
$('#watch-int').addEventListener('change', pushWatch);

// Export buttons: let the browser handle the attachment download.
$('#csv-btn').addEventListener('click', () => { window.location.href = '/api/devices/export?format=csv'; });
$('#json-btn').addEventListener('click', () => { window.location.href = '/api/devices/export?format=json'; });
document.querySelectorAll('th[data-k]').forEach((th) => {
  th.addEventListener('click', () => {
    const k = th.dataset.k;
    if (sortKey === k) sortAsc = !sortAsc;
    else { sortKey = k; sortAsc = true; }
    renderTable();
  });
});

api('/api/oui').then((o) => {
  $('#oui-badge').textContent = `vendor db: ${o.source} · ${o.size}`;
}).catch(() => { $('#oui-badge').textContent = 'vendor db: unavailable'; });

refresh();
pollStatus();
setInterval(pollStatus, 2000);
