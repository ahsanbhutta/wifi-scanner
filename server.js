// Local web server: serves the dashboard + JSON API for scanning.
// Binds to 127.0.0.1 only — this is a local tool, not a LAN service.
//
// Packaged (npm run build) it becomes a single .exe: assets are embedded in
// the bundle, data lives in %LOCALAPPDATA%\WiFiScanner, a second double-click
// focuses the browser instead of starting a second copy, and the dashboard
// opens automatically.
import express from 'express';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runScan } from './src/scan.js';
import { initOui } from './src/oui.js';
import { upsertScan, listDevices, recentNew, setNotes, setIgnore, history } from './src/store.js';
import { toCsv, toJson } from './src/export.js';
import { notify } from './src/notify.js';
import { PACKAGED, ROOT_DIR, DATA_DIR } from './src/paths.js';
import assetsMap from '#assets';

const PORT = Number(process.env.PORT || 3847);
// Dev never auto-opens a browser (annoying while iterating); the exe does,
// unless WIFI_SCANNER_NO_BROWSER=1 is set.
const OPEN_BROWSER = PACKAGED && process.env.WIFI_SCANNER_NO_BROWSER !== '1';

const app = express();
app.use(express.json({ limit: '64kb' }));

// ---- static assets ----
// Packaged: serve the map embedded at build time (no public/ folder needed).
// Dev: serve public/ from disk so edits show up without a rebuild.
if (assetsMap) {
  for (const [name, asset] of Object.entries(assetsMap)) {
    const body = asset.b64 ? Buffer.from(asset.body, 'base64') : asset.body;
    const handler = (_req, res) => {
      res.set('X-Wifi-Scanner-Assets', 'embedded');
      res.type(asset.type);
      res.send(body);
    };
    app.get(`/${name}`, handler);
    if (name === 'index.html') app.get('/', handler);
  }
} else {
  app.use(express.static(path.join(ROOT_DIR, 'public')));
}

// ---- scan state (single scan at a time) ----
const state = {
  running: false,
  phase: 'idle',
  message: 'Idle',
  progress: null, // {done,total} or null
  lastResult: null, // {devices, network, durationMs, scannedAt}
  lastError: null,
};

function onProgress(phase, message, progress = null) {
  state.phase = phase;
  state.message = message;
  state.progress = progress;
}

// ---- watch mode (periodic auto-scan + new-device toast) ----
// Not persisted across restarts: the exe is a desktop app, and re-arming on
// start would surprise the user with background scans they didn't ask for.
const watch = {
  enabled: false,
  intervalMinutes: 15,
  timer: null,
  lastRunAt: null,
  nextRunAt: null,
};

function scheduleWatch() {
  if (watch.timer) clearTimeout(watch.timer);
  watch.timer = null;
  watch.nextRunAt = null;
  if (!watch.enabled) return;
  const ms = Math.min(Math.max(watch.intervalMinutes, 1), 1440) * 60 * 1000;
  watch.nextRunAt = Date.now() + ms;
  watch.timer = setTimeout(async () => {
    try {
      await runScanOnce({ silent: true });
      watch.lastRunAt = Date.now();
    } catch { /* runScanOnce already recorded the error */ }
    scheduleWatch(); // chain; never overlap scans (runScanOnce no-ops if busy)
  }, ms);
  watch.timer.unref?.(); // don't keep the process alive just for the timer
}

/**
 * One full scan + persist + toast. Shared by POST /api/scan and watch mode.
 * Returns the result, or null if a scan is already running / it failed.
 */
async function runScanOnce({ silent = false } = {}) {
  if (state.running) return null;
  state.running = true;
  state.lastError = null;
  if (!silent) onProgress('start', 'Starting scan…');
  try {
    const result = await runScan((phase, message) => onProgress(phase, message));
    result.scannedAt = Date.now();
    // Persist known devices; mark brand-new ones.
    const rows = upsertScan(result.devices.filter((d) => d.mac && !d.mac.startsWith('ip:')));
    const newMacs = new Set(rows.filter((r) => r.isNew).map((r) => r.mac));
    for (const d of result.devices) if (newMacs.has(d.mac)) d.isNew = true;
    state.lastResult = result;
    onProgress('done', `Scan complete — ${result.devices.length} devices in ${(result.durationMs / 1000).toFixed(1)}s`);
    // Watch mode: desktop notification only when a genuinely new device shows up.
    if (newMacs.size > 0 && watch.enabled) {
      const first = result.devices.find((d) => newMacs.has(d.mac));
      notify(
        `${newMacs.size} new device${newMacs.size > 1 ? 's' : ''} on your network`,
        first
          ? `${first.hostname || first.mac}${first.vendor ? ` · ${first.vendor}` : ''}`
          : 'Open WiFi Scanner to review',
      );
    }
    return result;
  } catch (err) {
    state.lastError = err?.message ?? String(err);
    onProgress('error', `Scan failed: ${state.lastError}`);
    return null;
  } finally {
    state.running = false;
  }
}

app.get('/api/status', (req, res) => {
  res.json({
    running: state.running,
    phase: state.phase,
    message: state.message,
    lastError: state.lastError,
    scannedAt: state.lastResult?.scannedAt ?? null,
    durationMs: state.lastResult?.durationMs ?? null,
    network: state.lastResult?.network ?? null,
    deviceCount: state.lastResult?.devices.length ?? 0,
    watch: {
      enabled: watch.enabled,
      intervalMinutes: watch.intervalMinutes,
      lastRunAt: watch.lastRunAt,
      nextRunAt: watch.nextRunAt,
    },
  });
});

app.post('/api/scan', async (req, res) => {
  if (state.running) return res.status(409).json({ error: 'Scan already running' });
  res.json({ started: true });
  await runScanOnce();
});

// Enable/disable watch mode; interval clamped to 1–1440 minutes.
app.post('/api/watch', (req, res) => {
  const { enabled, intervalMinutes } = req.body ?? {};
  if (typeof enabled === 'boolean') watch.enabled = enabled;
  if (Number.isFinite(intervalMinutes)) {
    watch.intervalMinutes = Math.min(Math.max(Math.round(intervalMinutes), 1), 1440);
  }
  scheduleWatch();
  res.json({ watch: { enabled: watch.enabled, intervalMinutes: watch.intervalMinutes } });
});

// Export the stored device list as CSV or JSON (download).
app.get('/api/devices/export', (req, res) => {
  const format = String(req.query.format || 'csv').toLowerCase();
  if (format !== 'csv' && format !== 'json') {
    return res.status(400).json({ error: 'format must be csv or json' });
  }
  const devices = listDevices({ limit: 5000 });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  if (format === 'csv') {
    res.set('Content-Disposition', `attachment; filename="wifi-scanner-devices-${stamp}.csv"`);
    res.type('text/csv; charset=utf-8');
    return res.send(toCsv(devices));
  }
  res.set('Content-Disposition', `attachment; filename="wifi-scanner-devices-${stamp}.json"`);
  res.type('application/json');
  return res.send(toJson(devices));
});

// Stored device list (history across scans).
app.get('/api/devices', (req, res) => {
  res.json({ devices: listDevices(), newToday: recentNew() });
});

// Live results of the most recent scan (full detail: reasons, ports, services).
app.get('/api/last-scan', (req, res) => {
  const r = state.lastResult;
  if (!r) return res.json(null);
  res.json({
    scannedAt: r.scannedAt,
    durationMs: r.durationMs,
    network: r.network,
    devices: r.devices,
  });
});

app.get('/api/devices/:mac/history', (req, res) => {
  res.json({ history: history(req.params.mac) });
});

app.patch('/api/devices/:mac', (req, res) => {
  const { notes, ignore } = req.body ?? {};
  if (typeof notes === 'string') setNotes(req.params.mac, notes);
  if (typeof ignore === 'boolean') setIgnore(req.params.mac, ignore);
  res.json({ ok: true });
});

// Refresh the OUI vendor database.
app.post('/api/oui/refresh', async (req, res) => {
  const info = await initOui({ refresh: true });
  res.json(info);
});

app.get('/api/oui', async (req, res) => {
  const info = await initOui();
  res.json(info);
});

// ---- startup ----
function openBrowser(url) {
  try {
    const cp = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    cp.on('error', () => { /* no browser available; the URL is printed above */ });
    cp.unref();
  } catch { /* the URL is printed to the console anyway */ }
}

async function existingInstance(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
      signal: AbortSignal.timeout(600),
    });
    if (!res.ok) return false;
    const j = await res.json();
    return Boolean(j) && typeof j === 'object' && 'running' in j && 'phase' in j;
  } catch {
    return false;
  }
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

async function main() {
  // Packaged: double-clicking a second copy just opens the browser on the
  // instance that is already running, instead of starting a second server.
  if (PACKAGED && (await existingInstance(PORT))) {
    console.log(`wifi-scanner is already running -> http://127.0.0.1:${PORT}`);
    if (OPEN_BROWSER) openBrowser(`http://127.0.0.1:${PORT}`);
    return;
  }

  // Packaged: take the first free port (3847, 3848, …) so a foreign process
  // squatting on the default port never just crashes the app. Dev fails loud.
  let port = PORT;
  for (;;) {
    try {
      await listen(port);
      break;
    } catch (err) {
      if (PACKAGED && err?.code === 'EADDRINUSE' && port < PORT + 20) {
        port++;
        continue;
      }
      throw err;
    }
  }

  const oui = await initOui();
  const url = `http://127.0.0.1:${port}`;
  console.log(`wifi-scanner -> ${url}`);
  console.log(`vendor DB: ${oui.source} (${oui.size} prefixes)`);
  if (PACKAGED) console.log(`data: ${DATA_DIR}`);
  console.log('Scan only networks you own or have permission to scan.');
  console.log('Close this window to stop.');
  if (OPEN_BROWSER) openBrowser(url);
}

main().catch((err) => {
  console.error('failed to start:', err?.message ?? err);
  process.exitCode = 1;
});
