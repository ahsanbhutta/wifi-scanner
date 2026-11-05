# WiFi Scanner

A local web dashboard that scans your WiFi/LAN and identifies attached devices — vendor, hostname, model, open ports, and a best-guess device type with a confidence level. Built for **Windows**, where monitor-mode packet capture (the Kali `airmon-ng` workflow) is generally not available.

![WiFi Scanner dashboard](docs/img/dashboard-full.png)

## Quick start — one file, no Node.js needed

1. Download **`WiFiScanner.exe`** from the [latest release](../../releases/latest) (~90 MB) — short on bandwidth? Grab **`WiFiScanner.zip`** (~33 MB) instead and extract it first.
2. Double-click it. Your browser opens the dashboard at `http://127.0.0.1:3847`.
3. Press **Scan network**. Devices appear in 20–40 seconds.
4. Close the console window to stop the scanner.

No installer, no admin rights, no dependencies. The exe runs from anywhere — Desktop, Downloads, or a USB stick — and keeps its data in `%LOCALAPPDATA%\WiFiScanner`.

> **SmartScreen?** If you downloaded the exe from the internet, Windows shows *"Windows protected your PC"* → click **More info → Run anyway**. That's normal for unsigned executables. See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Run from source

```
npm install
npm start
→ open http://127.0.0.1:3847
```

Requires **Node.js 24+** (uses the built-in `node:sqlite`; no native modules to compile). The server binds to `127.0.0.1` only — it is a local tool, not a LAN service.

To produce the single exe yourself:

```
npm run build
→ dist\WiFiScanner.exe
```

The exe has a custom icon and Explorer version info out of the box — swap in your own with `npm run icon` (details below).

Details: [docs/BUILD-FROM-SOURCE.md](docs/BUILD-FROM-SOURCE.md).

## What it does

Each scan runs this pipeline (typically 20–40 seconds):

1. **Adapter discovery** — reads IP configuration via PowerShell, skips virtual adapters (Hyper-V, WSL, VMware, Tailscale…), and follows the default route so it always scans the real network.
2. **Ping sweep** — pings every address in the subnet to wake devices and populate the neighbor (ARP) table.
3. **Neighbor table** — MAC addresses + neighbor states. Ghost entries (zero MAC, `Unreachable`/`Incomplete`) are excluded so dead hosts are never enriched.
4. **Vendor lookup** — MAC prefix → vendor using Wireshark's `manuf` file (40k+ prefixes, downloaded once). Locally-administered MACs are flagged as *randomized* instead of guessed.
5. **Network-wide enrichment** (in parallel, only for hosts believed alive):
   - **mDNS/DNS-SD** — hostnames (`Sarahs-iPhone`) and services (AirPlay, Chromecast, printers, HomeKit, `_adb`…)
   - **SSDP/UPnP** — often yields the exact device model (e.g. `ZTE ZXHN H168N V3.5`)
   - **NetBIOS** (`nbtstat`) — Windows machine names
   - **TCP port probe + HTTP grab** — well-known service ports, server headers and page titles
6. **Fingerprinting** — combines the above into a device type (`Router / gateway`, `Android device`, `Windows PC`, `printer`…) with `high` / `medium` / `low` confidence and human-readable reasons ("UPnP device description", "mDNS service _adb").
7. **History** — results are merged into a SQLite database. First-time devices trigger a **new-device alert**; per-device notes and an ignore/hide option persist across scans.

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
- **Client-isolated networks look empty.** On APs that block client-to-client traffic (common in hotels/enterprises), only the gateway will be found. Monitor mode would still see those clients.
- **Silent/power-saving devices can be missed.** A phone in deep sleep with no traffic may not respond within the scan window. Scanning again shortly after usually catches it.
- **MAC randomization limits vendor identification.** Modern phones and laptops use a random MAC per network, so the OUI lookup can't identify the manufacturer — those rows are labeled *Randomized (private MAC)* and identified instead by hostname, mDNS services, or port fingerprint.
- **No frame-level data.** No SSID sniffing, no signal strength (RSSI) per client, no deauth/association analysis, no channel hopping. If you need those, use a monitor-mode-capable adapter with Kali/`airmon-ng`, `airodump-ng`, or a tool like Wireshark.
- **What you gain:** it runs on your everyday Windows machine with zero setup, needs no admin rights, and gives rich *identification* (model names via UPnP, human names via mDNS/NetBIOS, device type with evidence) rather than raw frame data.

Full comparison: [docs/WINDOWS-vs-KALI.md](docs/WINDOWS-vs-KALI.md).

## Documentation

| Doc | |
|---|---|
| [Install](docs/INSTALL.md) | Exe vs. from source, environment variables |
| [User guide](docs/USER-GUIDE.md) | Reading the dashboard |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | SmartScreen, AV flags, empty scans, ports |
| [FAQ](docs/FAQ.md) | Quick answers |
| [Build from source](docs/BUILD-FROM-SOURCE.md) | Reproduce the exe |
| [Architecture](docs/ARCHITECTURE.md) | Scan pipeline, module by module |
| [Windows vs. Kali](docs/WINDOWS-vs-KALI.md) | Monitor-mode comparison |
| [Privacy & security](docs/PRIVACY-SECURITY.md) | What touches the network |
| [Code signing](docs/CODE-SIGNING.md) | Optional: kill SmartScreen/AV warnings |

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
data/                Dev data: vendor DB + device history (created on first scan)
dist/                Build output (gitignored): WiFiScanner.exe + intermediates
```

## Design notes

- **Active/passive tiering:** only hosts with a fresh neighbor state, a ping reply, or an mDNS/SSDP response get the expensive enrichment (NetBIOS alone costs ~12 s per dead host). Known-but-silent neighbors are still listed, marked inactive, without enrichment.
- **Bounded concurrency:** port probes run in a pool; mDNS/SSDP/NetBIOS run in parallel with each other.
- **Resilient by design:** a failing enrichment step (e.g. mDNS port already in use) logs to the console and degrades to an empty result — it never fails the scan. Empty port-probe results are retried once, since WiFi power-save can swallow a whole burst of SYNs.
- **Privacy:** everything runs locally. The only outbound traffic is the one-time vendor DB download from wireshark.org and the scan traffic itself, which stays on your LAN. See [docs/PRIVACY-SECURITY.md](docs/PRIVACY-SECURITY.md).

## License

[MIT](LICENSE)
