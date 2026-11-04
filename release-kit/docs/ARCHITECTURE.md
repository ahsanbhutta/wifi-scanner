# Architecture

How a scan works, module by module. Read this before changing scan
behavior — the tiering rules are easy to break.

```
server.js  ── HTTP API (127.0.0.1:3847) ──  public/ dashboard
    │
    └── runScan() ─────────────────────────── src/scan.js (orchestrator)
            │
            ├─ netinfo.js    which adapter / subnet / gateway
            ├─ sweep.js      ping sweep + neighbor (ARP) table
            ├─ oui.js        vendor lookup (manuf) + randomization detect
            ├─ mdns.js       mDNS/DNS-SD queries          ┐ parallel
            ├─ ssdp.js       SSDP/UPnP + device model     │ enrichment
            ├─ netbios.js    nbtstat names                │ (live hosts
            ├─ ports.js      TCP probe + HTTP grab        │  only)
            ├─ fingerprint.js type/model/confidence       ┘
            ├─ tiering.js     active/passive rules (pure, tested)
            └─ store.js      SQLite history (node:sqlite)

    server.js also owns: watch mode (chained timer → runScanOnce →
    src/notify.js toast) and CSV/JSON export (src/export.js).
```

## Startup

1. `src/paths.js` decides the data directory:
   - **dev** — `data/` next to the entry script (argv-based resolution, no
     `import.meta`, so the CJS bundle works the same way)
   - **packaged** (`globalThis.__PACKAGED__ === true` via esbuild `define`)
     — `%LOCALAPPDATA%\WiFiScanner`
   and creates it.
2. Static assets: dev serves `public/` from disk; the exe serves the
   embedded map (`#assets` import → `assets-map.js` at build time, stub
   `src/embedded-assets.js` in dev).
3. `initOui()` loads `manuf` from disk, or downloads it once from
   wireshark.org (with an error log on failure and a 42-prefix built-in
   fallback so first runs still work).
4. **Packaged only:** probe `127.0.0.1:3847/api/status` — if another copy
   is running, print its URL, reopen the browser, exit 0 (single-instance).
   Then bind 3847, retrying +1…+20 on `EADDRINUSE` (dev fails loud instead).

## The scan pipeline (`src/scan.js`)

Phases reported through `onProgress(phase, message)` →
`GET /api/status` → the dashboard's progress bar.

### 1. Adapter discovery (`netinfo.js`)

PowerShell `Get-NetIPAddress`/`Get-NetRoute` (JSON out) to find the active
IPv4 adapter. **Skips virtual adapters** — Hyper-V, WSL, VMware, VirtualBox,
Tailscale, ZeroTier — by friendly-name/description patterns, and follows the
default route so the scan targets the real network even when a VPN or
virtual NIC is present.

### 2. Ping sweep + neighbor table (`sweep.js`)

- Pings the subnet to wake devices and populate the ARP cache.
- Parses `Get-NetNeighbor` for MAC + state.
- **Ghost filtering:** drops entries with zero MAC or states
  `Unreachable`/`Incomplete` — dead hosts never reach enrichment.

### 3. Tiering — the rule that keeps scans fast

Only hosts in the **active tier** get expensive enrichment:

```
active  = ping-alive  ∪  fresh-neighbor  ∪  mDNS/SSDP responders
fresh   = neighbor state ∈ {Reachable, Permanent, arp}
```

`Stale`, `Delay`, `Probe` deliberately do **not** count as presence:

- **Stale** lingers for hours after an IP changes — one Tenda MAC was seen
  at three IPs at once because of it.
- **Delay/Probe** are often our *own* sweep's in-flight ARP probes, i.e.
  the scanner would be enriching itself.

Known-but-silent neighbors are still **listed** (marked inactive/`(off)`),
just not probed — NetBIOS alone costs ~12 s per dead host.

### 4. Enrichment (parallel, active hosts only)

| Module | Wire protocol | Yields |
|---|---|---|
| `mdns.js` | mDNS/DNS-SD (multicast-dns) | hostnames, service types, TXT records. Requery sends the **full** service list (a `slice(0,12)` bug once dropped `_adb`/`_hap`), with a third wave at 2400 ms for slow responders |
| `ssdp.js` | SSDP `M-SEARCH` → device description HTTP GET | often the **exact model** (`ZTE ZXHN H168N V3.5`) |
| `netbios.js` | `nbtstat -a <ip>` | Windows machine names (slow — active tier only) |
| `ports.js` | TCP connect to well-known ports, then HTTP `GET /` | open ports, `Server:` headers, page titles |

**Port probe settings:** 1200 ms timeout, **one retry when the first pass
comes back all-empty** (WiFi power-save can swallow an entire burst of
SYNs), scan pool concurrency 12 (600 ms/no-retry/pool-24 was flaky).

### 5. Fingerprinting (`fingerprint.js`)

Pure function over the evidence: device type (`Router / gateway`,
`Android device`, `Windows PC`, `printer`…), model, `high|medium|low`
confidence, and human-readable reasons (`"UPnP device description"`,
`"mDNS service _adb"`). Randomized MACs (locally-administered bit set)
are labeled *Randomized (private MAC)* by `oui.js` instead of being
mis-vendored.

### 6. Persistence (`store.js`)

SQLite via Node's built-in `node:sqlite` (`DatabaseSync`) — no native
modules, which is why the exe needs no compiler.

- `upsertScan(devices)` → first-seen/last-seen per MAC, **`isNew`** for
  first-seen within 24 h (the same rule the dashboard's banner and "new
  only" filter use)
- sighting timeline per device, notes, ignore/hide
- new-device alerts surfaced as the dashboard banner

## Server (`server.js`)

- Express, `express.json({ limit: '64kb' })`, binds **`127.0.0.1` only**.
- Single scan at a time: `state.running` guard → second `POST /api/scan`
  gets `409`.
- `runScanOnce()` is shared by `POST /api/scan` and **watch mode**:
  `POST /api/watch` arms a chained `setTimeout` (interval clamped
  1–1440 min, `.unref()`ed so it never keeps the process alive) that calls
  `runScanOnce({silent:true})` and shows a Windows toast (`src/notify.js`,
  WinRT with balloon fallback) only when new MACs appeared. Watch state is
  in-memory only — never persisted, never armed at startup.
- `GET /api/devices/export?format=csv|json` streams the stored list as a
  download (formatting lives in pure `src/export.js`).
- `state.lastResult` holds the live last scan (full detail);
  `/api/devices` serves the stored history — that's why the table shows
  `(off)` rows the instant the page loads, before any scan runs.

## Failure philosophy

Every enrichment step is allowed to fail independently: an error is
logged to the console and degrades to an empty result, never a failed
scan. The only hard failures are adapter discovery (no network) and an
unhandled exception in the pipeline.

## Packaging (`build.mjs`)

esbuild bundle (CJS, `node24`) → Node SEA blob → copy of `node.exe` →
`postject` injection. `#assets` is aliased from a package `imports` map so
dev and build share one import site. See
[BUILD-FROM-SOURCE.md](BUILD-FROM-SOURCE.md) for the full recipe.
