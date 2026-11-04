# Release notes — WiFi Scanner v1.0.0

> Paste as the body of the GitHub Release for tag `v1.0.0`.
> Attach `dist\WiFiScanner.exe` (~90 MB) as the release asset.

---

**A local web dashboard that scans your WiFi/LAN and tells you what's
connected — vendor, hostname, exact model, open ports, and a device type
with confidence + evidence. Windows, one file, no Node.js needed.**

![dashboard](docs/img/dashboard-full.png)

## Download

Grab **`WiFiScanner.exe`** below, double-click, press **Scan network**.
Your browser opens the dashboard automatically.

- **No installer, no admin rights, no dependencies** — the exe is the whole
  program (~90 MB; it embeds the Node runtime).
- First download from the internet? Windows shows SmartScreen →
  **More info → Run anyway** (the exe is unsigned). See
  [docs/TROUBLESHOOTING.md](../../blob/main/docs/TROUBLESHOOTING.md).
- Stop it by closing the console window.

## What a scan does (20–40 s per /24)

1. Finds the real adapter via PowerShell, skipping virtual NICs
   (Hyper-V, WSL, VMware, Tailscale…) and following the default route
2. Pings the subnet to wake devices + fills the ARP/neighbor table
3. Looks up vendors from Wireshark's `manuf` (40k+ prefixes) — and flags
   randomized MACs instead of guessing
4. Enriches live hosts in parallel: **mDNS/DNS-SD** (hostnames, AirPlay,
   Chromecast, HomeKit, `_adb`…), **SSDP/UPnP** (often the exact model),
   **NetBIOS** (`nbtstat`), **TCP port probe + HTTP banners**
5. Fingerprints everything into a device type with `high`/`medium`/`low`
   confidence and human-readable reasons
6. Stores history in SQLite — **new-device alerts**, sighting timelines,
   per-device notes, hide/ignore

## Dashboard

- Sortable/filterable table: IP, MAC, vendor, hostname, type/model,
  confidence, ports, last seen
- Search box + **new only** filter (same 24 h rule as the alert banner)
- **CSV / JSON export** of your device list — one click, opens in Excel
- **Watch mode** — auto-rescan every 1/5/15/60 min with a Windows toast
  when a new device appears
- Detail panel per device: all evidence, services, open ports, notes
- Live progress; devices absent from the latest scan show as dimmed
  `(off)` rows with their last-known details

## Install from source

```
npm install
npm test         # 42 unit tests
npm start        # → http://127.0.0.1:3847
npm run build    # → dist\WiFiScanner.exe
```

Needs Node.js 24+ (uses built-in `node:sqlite` — no native modules).

## Antivirus & SmartScreen — read this if your AV complains

- The exe is **unsigned** → on download Windows shows *"Windows protected your PC"* → click **More info → Run anyway**. Locally built copies run without the prompt.
- Some AV products flag unsigned network scanners heuristically (it pings a subnet — that is what scanning is). Before trusting or reporting it:
  - **Check it yourself:** upload the exe (or its SHA-256) to https://www.virustotal.com — *VirusTotal permalink for this build: `[PASTE AFTER UPLOADING]`*
  - **Report a false positive to Microsoft** (free, usually days): https://www.microsoft.com/en-us/wdsi/filesubmission
  - **Or rebuild from source** — one command, fully reproducible: [docs/BUILD-FROM-SOURCE.md](../../blob/main/docs/BUILD-FROM-SOURCE.md)
- What the app actually does: ping / ARP / discovery queries / TCP connect-and-read on **your own LAN**. No injection, no payloads, no telemetry. Details: [docs/PRIVACY-SECURITY.md](../../blob/main/docs/PRIVACY-SECURITY.md)

## Honest limitations

- **Windows only** (the scan drives PowerShell/`nbtstat`).
- **No monitor mode.** Unlike Kali's `airmon-ng`, this probes your LAN from
  the normal interface — you see devices that participate in your LAN, not
  every radio-visible client. Client-isolated networks (hotels, enterprises)
  show only the gateway. Full comparison:
  [docs/WINDOWS-vs-KALI.md](../../blob/main/docs/WINDOWS-vs-KALI.md)
- **MAC randomization** means phones/laptops often can't be vendor-IDed —
  they're labeled *Randomized (private MAC)* and identified by
  hostname/services instead.
- **Unsigned exe** → SmartScreen prompt on internet download; some AV
  heuristics may flag it (it pings a network — that's what scanning is).
  Build it yourself with `npm run build` if you'd rather not trust a
  binary.
- **~90 MB** because it contains the entire Node runtime (app code is
  ~1.3 MB).

## Privacy

Local only. No telemetry, no accounts, no uploads. The only outbound
traffic: the one-time vendor-DB download from wireshark.org and scan
traffic on your own LAN. The dashboard binds `127.0.0.1` — nothing on your
network can reach it. Details:
[docs/PRIVACY-SECURITY.md](../../blob/main/docs/PRIVACY-SECURITY.md).

## Scanning ethics

Only scan networks you own or have permission to scan. This tool is
read-only: no injection, no deauth, no payloads — just discovery and
banner reading.

## Docs

[Install](../../blob/main/docs/INSTALL.md) ·
[User guide](../../blob/main/docs/USER-GUIDE.md) ·
[Troubleshooting](../../blob/main/docs/TROUBLESHOOTING.md) ·
[FAQ](../../blob/main/docs/FAQ.md) ·
[Build from source](../../blob/main/docs/BUILD-FROM-SOURCE.md) ·
[Architecture](../../blob/main/docs/ARCHITECTURE.md)

**Feedback welcome** — issues with the console output, your Windows
version, and what was found (or missing) are especially useful.
