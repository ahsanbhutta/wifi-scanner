# WiFi Scanner

A local web dashboard that scans your WiFi/LAN and identifies attached devices — vendor, hostname, model, open ports, and a best-guess device type with a confidence level. Built for **Windows**, where monitor-mode packet capture (the Kali `airmon-ng` workflow) is generally not available.

```
npm install
npm start
→ open http://127.0.0.1:3847
```

Requires **Node.js 24+** (uses the built-in `node:sqlite`; no native modules to compile). No admin rights needed. The server binds to `127.0.0.1` only — it is a local tool, not a LAN service.

## Distribute it as one .exe

```
npm run build
→ dist\WiFiScanner.exe   (~90 MB, one file, no Node.js required on the target PC)
```

Double-click the exe and it:

- starts the scanner and serves the dashboard on `127.0.0.1:3847` (moves to
  3848… if that port is taken by some other program),
- opens your browser automatically (set `WIFI_SCANNER_NO_BROWSER=1` to
  disable), printing the URL to the console,
- **runs only one copy**: double-clicking a second time just opens the browser
  on the instance that is already running,
- keeps its data in `%LOCALAPPDATA%\WiFiScanner` (vendor DB + device history),
  so the exe can live on the Desktop, in Downloads, or on a USB stick — it
  never writes next to itself.

The build embeds everything (server, dependencies, dashboard files) into a copy
of the Node runtime — that's why the file is ~90 MB; the app code itself is
~1.3 MB. Rebuilding after code changes takes one command.

**Icon and version info:** the exe ships with a custom icon and Explorer
"Properties → Details" strings instead of Node.js's defaults. They come
from `assets/icon.ico` — run `npm run icon` to regenerate the default
artwork, or drop in your own `assets/icon.png` (or `.ico`) and rebuild.
The `CompanyName`/`LegalCopyright` strings live at the top of `build.mjs`.

**Notes for whoever receives the exe:**

- **Windows only** (the scan logic drives PowerShell/`nbtstat`). No Node.js,
  no installer, no admin rights needed — the exe *is* the program.
- **SmartScreen**: if the exe was downloaded from the internet, Windows shows
  "Windows protected your PC" → click **More info → Run anyway**. This is
  normal for unsigned executables (buying a code-signing certificate removes
  the warning). A locally built copy runs without that prompt.
- Antivirus heuristics occasionally flag any unsigned program that pings a
  network; the source is right here if a scan is needed.
- The exe console window shows the URL and scan log — **closing it stops the
  scanner**. Scanning only ever touches the LAN you are connected to.
- It is not an installer: nothing is added to the Start Menu or registry.
  Want that later? Wrap `WiFiScanner.exe` in Inno Setup/NSIS to get shortcuts
  and an uninstaller.
- The console and API are unchanged from the dev version, so `PORT=<n>` still
  selects a different port if you need one.

## What it does

Each scan runs this pipeline (typically 20–40 seconds):

1. **Adapter discovery** — reads IP configuration via PowerShell, skips virtual adapters (Hyper-V, WSL, VMware, Tailscale…), and follows the default route so it always scans the real network.
2. **Ping sweep** — pings every address in the subnet to wake devices and populate the neighbor (ARP) table.
3. **Neighbor table** — MAC addresses + neighbor states. Ghost entries (zero MAC, `Unreachable`/`Incomplete`) are excluded so dead hosts are never enriched.
4. **Vendor lookup** — MAC prefix → vendor using Wireshark's `manuf` file (40k+ prefixes, downloaded once to `data/manuf`). Locally-administered MACs are flagged as *randomized* instead of guessed.
5. **Network-wide enrichment** (in parallel, only for hosts believed alive):
   - **mDNS/DNS-SD** — hostnames (`Sarahs-iPhone`) and services (AirPlay, Chromecast, printers, HomeKit, `_adb`…)
   - **SSDP/UPnP** — often yields the exact device model (e.g. `ZTE ZXHN H168N V3.5`)
   - **NetBIOS** (`nbtstat`) — Windows machine names
   - **TCP port probe + HTTP grab** — well-known service ports, server headers and page titles
6. **Fingerprinting** — combines the above into a device type (`Router / gateway`, `Android device`, `Windows PC`, `printer`…) with `high` / `medium` / `low` confidence and human-readable reasons ("UPnP device description", "mDNS service _adb").
7. **History** — results are merged into a SQLite database (`data/devices.db`). First-time devices trigger a **new-device alert**; per-device notes and an ignore/hide option persist across scans.

### Dashboard

- Sortable/filterable device table (IP, MAC, vendor, hostname, type/model, confidence, open ports, last seen)
- Search box + "new only" filter (agrees with the 24h new-device banner)
- **CSV / JSON export** of the stored device list (one click, RFC 4180 CSV)
- **Watch mode**: auto-rescan every 1/5/15/60 min with a Windows toast when a new device appears
- Detail panel per device: full fingerprint evidence, services, open ports, notes, hide
- Live progress during a scan; devices not seen in the latest scan are dimmed as `(off)` but keep their last-known details

### API

| Endpoint | Description |
|---|---|
| `POST /api/scan` | Start a scan (one at a time) |
| `POST /api/watch` | Enable/disable watch mode (`{enabled, intervalMinutes}`, clamped 1–1440) |
| `GET /api/status` | Progress: phase, message, last error, watch state |
| `GET /api/last-scan` | Full detail of the most recent scan |
| `GET /api/devices` | Stored device history + new-today list |
| `GET /api/devices/export?format=csv\|json` | Download the device list as an attachment |
| `GET /api/devices/:mac/history` | Sighting timeline for one device |
| `PATCH /api/devices/:mac` | Set `notes` or `ignore` |
| `GET /api/oui`, `POST /api/oui/refresh` | Vendor DB status / re-download |

## Windows vs. Kali (`airmon-ng`) — honest limitations

This tool does **not** put your adapter in monitor mode. On most Windows WiFi drivers that is unsupported or unstable, so instead of capturing raw 802.11 frames, this scanner actively probes the LAN from the normal (managed) interface. Practical consequences:

- **You only see devices that participate in your LAN.** A device is discovered because it answers ping/ARP, announces itself via mDNS/SSDP/NetBIOS, or has open TCP ports. On monitor mode, Kali sees *every* frame in radio range — including clients associated with other networks, probe requests from devices merely *looking* for networks, and silent devices that never transmit.
- **Client-isolated networks look empty.** On APs that block client-to-client traffic (common in hotels/enterprises — e.g. a /24 where only the gateway responds), only the gateway will be found. Monitor mode would still see those clients.
- **Silent/power-saving devices can be missed.** A phone in deep sleep with no traffic may not respond within the scan window. Scanning again shortly after usually catches it.
- **MAC randomization limits vendor identification.** Modern phones and laptops use a random MAC per network, so the OUI lookup can't identify the manufacturer — those rows are labeled *Randomized (private MAC)* and identified instead by hostname, mDNS services, or port fingerprint.
- **No frame-level data.** No SSID sniffing, no signal strength (RSSI) per client, no deauth/association analysis, no channel hopping. If you need those, use a monitor-mode-capable adapter with Kali/`airmon-ng`, `airodump-ng`, or a tool like Wireshark.
- **What you gain:** it runs on your everyday Windows machine with zero setup, needs no admin rights, and gives rich *identification* (model names via UPnP, human names via mDNS/NetBIOS, device type with evidence) rather than raw frame data.

## Project layout

```
server.js            Express app, API routes, scan state (127.0.0.1:3847)
build.mjs            npm run build → dist/WiFiScanner.exe (Node SEA + esbuild)
src/
  netinfo.js         PowerShell adapter/gateway discovery (skips virtual NICs)
  sweep.js           Ping sweep + neighbor (ARP) table parsing
  oui.js             Wireshark manuf download/lookup + randomization detection
  mdns.js            mDNS/DNS-SD queries (hostnames, service types, TXT)
  ssdp.js            SSDP/UPnP discovery (device description → model)
  netbios.js         NetBIOS name lookup via nbtstat
  ports.js           TCP service probes + HTTP header/title grab
  fingerprint.js     Heuristics: type/model/confidence/reasons
  tiering.js         Presence tiering rules (pure, unit-tested)
  store.js           SQLite history (node:sqlite): sightings, notes, alerts
  scan.js            Orchestrator: active/passive tiering, parallel enrichment
  export.js          CSV/JSON export builders (pure, unit-tested)
  notify.js          Windows toast/balloon notifications (best-effort)
  paths.js           dev vs packaged paths (data/ vs %LOCALAPPDATA%\WiFiScanner)
  embedded-assets.js dev stub; the build embeds public/ through this hook
test/                Unit tests (npm test → node:test, 42 tests)
scripts/
  make-icon.mjs      npm run icon → assets/icon.ico (default art or your PNG)
assets/
  icon.ico           exe icon, 7 sizes — replace with your own and rebuild
  icon-preview.png   256px render of the current icon
public/              Dashboard (vanilla JS, no build step)
data/
  manuf              Vendor OUI database (auto-downloaded, ~3 MB)
  devices.db         Device history (created on first scan)
dist/                Build output (gitignore-able): WiFiScanner.exe + intermediates
```

## Design notes

- **Active/passive tiering:** only hosts with a fresh neighbor state, a ping reply, or an mDNS/SSDP response get the expensive enrichment (NetBIOS alone costs ~12 s per dead host). Known-but-silent neighbors are still listed, marked inactive, without enrichment.
- **Bounded concurrency:** port probes run in a pool; mDNS/SSDP/NetBIOS run in parallel with each other.
- **Resilient by design:** a failing enrichment step (e.g. mDNS port already in use) logs to the console and degrades to an empty result — it never fails the scan. Empty port-probe results are retried once, since WiFi power-save can swallow a whole burst of SYNs.
- **Privacy:** everything runs locally. The only outbound traffic is the one-time vendor DB download from wireshark.org and the scan traffic itself, which stays on your LAN.
