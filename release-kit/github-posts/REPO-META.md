# Repository metadata — paste into GitHub repo settings

## Description (≤350 characters — pick one)

**Option A (recommended, 311 chars):**

```
Local web dashboard that scans your WiFi/LAN and identifies connected
devices — vendor, hostname, exact model, open ports, and device type with
confidence + evidence. Windows, single .exe, no Node.js needed. New-device
alerts, SQLite history, notes. MIT.
```

**Option B (shorter, 231 chars):**

```
Scan your WiFi/LAN from Windows and see what's connected: vendor, hostname,
model, open ports, device type with evidence. One .exe, no install, local
only. New-device alerts + history. MIT.
```

**Option C (feature-forward, 344 chars):**

```
airmon-ng-style LAN inventory for Windows, minus monitor mode. Ping sweep +
ARP + mDNS/SSDP/NetBIOS + TCP probes → vendor, hostname, exact model,
open ports, device type with confidence. Single .exe, no Node/admin, web
dashboard on 127.0.0.1. New-device alerts, history, notes. MIT.
```

## Topics (copy all — GitHub allows up to 20)

```
wifi
lan
network-scanner
networking
device-detection
fingerprinting
mdns
ssdp
upnp
netbios
arp
windows
nodejs
web-dashboard
self-hosted
local-first
privacy
security
inventory
```

## Suggested repo name

`wifi-scanner`

(Alternatives: `lan-scanner`, `wifi-device-scanner`, `net-inventory`)

## Social preview image

Upload `docs/img/dashboard-full.png` (Settings → Social preview).

## README badges (optional — add to the top of README.md)

```markdown
![Release](https://img.shields.io/github/v/release/<OWNER>/wifi-scanner?include_prereleases)
![License](https://img.shields.io/badge/license-MIT-blue)
![Windows](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D6)
![Node](https://img.shields.io/badge/build-Node%20SEA%20%2B%20esbuild-339933)
```

## Repo "About" extras

- **Website / homepage:** `https://github.com/<OWNER>/wifi-scanner/releases/latest`
- **Enable:** Issues ✓ · Discussions (optional) ✓ · Wiki ✗ (docs live in `docs/`)

## Issue templates (optional starter)

`.github/ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
name: Bug report
about: Something didn't work as expected
---

**What happened**


**What I expected**


**How I ran it**
- [ ] Prebuilt exe (version / release tag:)
- [ ] From source (`npm start` / `npm run build`)

**Console output** (paste the console window text)


**Environment**
- Windows version (`winver`):
- Node.js version (if from source):
- Network type (home/hotel/enterprise/VPN):
- AV product + exact detection name (if flagged):
```
