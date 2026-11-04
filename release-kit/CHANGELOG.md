# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] — 2026-11-04

First public release.

### Added

- **Single-file Windows executable** — `dist\WiFiScanner.exe` (~90 MB),
  built with Node SEA + esbuild. No Node.js, installer, or admin rights
  needed on the target PC.
  - Auto-opens the browser on double-click (`WIFI_SCANNER_NO_BROWSER=1`
    disables it).
  - Single-instance: double-clicking a second copy reopens the browser on
    the running instance instead of starting a second server.
  - Port fallback: binds 3847, then 3848… (+20) if the port is taken.
  - Stores data in `%LOCALAPPDATA%\WiFiScanner`; the exe itself never
    writes next to its own location.
  - Dashboard assets embedded in the binary (no `public/` folder needed).
  - Custom exe icon + Explorer "Properties → Details" version info
    (`assets/icon.ico`, regenerate with `npm run icon`; swap in your own
    PNG/ICO and rebuild).
- **Scan pipeline** (20–40 s per /24):
  - PowerShell adapter discovery that skips virtual NICs (Hyper-V, WSL,
    VMware, Tailscale…) and follows the default route.
  - Ping sweep + neighbor (ARP) table parsing with ghost-entry filtering.
  - Vendor lookup from Wireshark's `manuf` (40k+ prefixes, downloaded once,
    with a built-in fallback so first runs work offline).
  - Randomized-MAC detection — locally-administered addresses are labeled
    *Randomized (private MAC)* instead of being mis-vendored.
  - Parallel enrichment for live hosts only: mDNS/DNS-SD, SSDP/UPnP,
    NetBIOS (`nbtstat`), TCP port probe with HTTP header/title grab.
  - Fingerprint heuristics producing device type, model, confidence
    (`high`/`medium`/`low`) and human-readable reasons.
- **Web dashboard** (vanilla JS, served from `127.0.0.1:3847`):
  - Sortable/filterable device table with search box and "new only" filter.
  - **CSV / JSON export** of the stored device list (RFC 4180 CSV, JSON
    with metadata) via the header buttons or `GET /api/devices/export`.
  - **Watch mode**: periodic auto-scan (1–1440 min interval) with a
    Windows toast notification when a new device appears
    (`WIFI_SCANNER_NO_TOAST=1` disables toasts; off by default, not
    persisted across restarts).
  - Detail panel per device: evidence, services, ports, notes, hide.
  - New-device alert banner (24 h rule, matching the filter).
  - Live scan progress; devices absent from the latest scan shown as
    `(off)` with their last-known details retained.
- **Device history** in SQLite (`node:sqlite`): first-seen/last-seen,
  sighting timeline per MAC, per-device notes, ignore/hide, new-device
  alerts.
- **JSON API**: scan control, watch mode, status, last-scan detail, device
  history, CSV/JSON export, per-device patch, OUI status/refresh.
- **Tests + CI**: 42 unit tests (`npm test`, built-in `node:test`) covering
  presence tiering, fingerprint heuristics, OUI parsing, and export
  formatting; GitHub Actions workflow builds the exe on `windows-latest`
  for every push and attaches it to a Release on tag pushes. Dependabot
  keeps npm and action versions current.
- **Docs**: install, user guide, troubleshooting, FAQ, build-from-source,
  architecture, Windows-vs-Kali comparison, privacy & security.

### Known limitations

- Windows only — the scan logic drives PowerShell/`nbtstat`.
- No monitor mode: sees only devices participating in the LAN (not every
  radio-visible client as `airmon-ng` would). Client-isolated networks show
  only the gateway.
- The exe is unsigned: downloaded copies trigger a SmartScreen prompt
  (More info → Run anyway) and may occasionally be flagged by AV
  heuristics.
- ~90 MB because it embeds the entire Node runtime (app code is ~1.3 MB).

[1.0.0]: https://github.com/<OWNER>/<REPO>/releases/tag/v1.0.0
