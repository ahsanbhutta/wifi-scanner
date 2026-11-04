# Privacy & Security

Short version: **everything runs locally, nothing is uploaded, and the tool
only ever talks to devices on your own LAN** (plus one one-time database
download from wireshark.org).

## What leaves your machine

| Traffic | When | Destination | Why |
|---|---|---|---|
| Vendor database download | Once (first run), or on manual refresh | `www.wireshark.org` (HTTPS) | Fetch Wireshark's `manuf` OUI file (~3 MB). Cached locally afterwards |
| Ping sweep | Each scan | **Your LAN only** (the scanned subnet) | Wake devices / populate ARP |
| mDNS / SSDP queries | Each scan | **Your LAN** (multicast `224.0.0.251`, `239.255.255.250`) | Service discovery |
| NetBIOS (`nbtstat`) | Each scan | **Your LAN** | Windows machine names |
| TCP connect attempts | Each scan | **Your LAN** | Detect open ports + read HTTP banners/titles |

**That's the complete list.** No telemetry, no analytics, no crash
reporters, no update checks, no accounts, no external APIs.

## What it never does

- ❌ Never sends scan results, device lists, MACs, or hostnames anywhere —
  they stay in your local SQLite database
- ❌ Never binds to anything but `127.0.0.1` — nothing on your network can
  connect *to* the scanner
- ❌ Never modifies devices — no login attempts, no configuration changes,
  no payloads. TCP connections are opened to *read* a banner, then closed
- ❌ Never captures packets or frames — no raw 802.11 capture, no
  promiscuous mode, no packet sniffing
- ❌ Never writes outside its data directory
  (`%LOCALAPPDATA%\WiFiScanner` for the exe, `data\` for source runs) —
  no registry edits, no Start Menu entries, no scheduled tasks, no
  services, no files next to the exe
- ❌ Never auto-starts with Windows

## Data it keeps (all on your device)

| File | Contents |
|---|---|
| `devices.db` | Per-MAC history: first/last seen, vendor, hostname, type, your notes, ignore flags. **This is network inventory data — treat it as sensitive** |
| `manuf` | Public vendor database (no personal data) |

Delete either file (or the whole folder) to erase everything. There is no
copy anywhere else.

## Attack surface, honestly

- **The server listens on `127.0.0.1` only** — reachable from your own
  browser, not from the LAN. Other people on the WiFi cannot open your
  dashboard or read your device history.
- **It is still a local HTTP server.** Anything running as *you* on this
  PC (including other apps and your browser) can call the API — that's the
  normal trust model for local tools (Jupyter, VS Code, etc.).
- **The API is read-mostly**: it can start a scan, toggle watch mode
  (periodic re-scan), set notes/ignore flags, refresh the vendor DB, and
  export your own device history as CSV/JSON. There is no endpoint that
  executes commands or returns arbitrary file contents.
- **Scanning is active traffic.** Your router and any IDS on the LAN will
  see pings and connection attempts from your PC. That's inherent to
  scanning, and it's why you should only scan networks you own or have
  permission to scan.
- **The exe is unsigned.** Downloaded copies trigger SmartScreen, and AV
  heuristics may flag any unsigned program that pings a subnet. The source
  is public and the build is reproducible
  ([BUILD-FROM-SOURCE.md](BUILD-FROM-SOURCE.md)) — the safest way to run
  it is to build it yourself.
- **Third-party dependencies are minimal**: `express` and `multicast-dns`
  at runtime; `esbuild` and `postject` only at build time. No native
  modules, no bundled blobs from unknown sources.

## Recommended practices

1. **Build it yourself** if you're security-sensitive — one command,
   inspect the result.
2. **Run it on networks you own.** Scanning networks without permission
   can be illegal depending on jurisdiction.
3. **Treat `devices.db` as sensitive** if others use your PC — it lists
   every device that has been on your network.
4. **Review before redistributing the exe** — if you hand the binary to
   someone else, they're trusting *your* build. Point them at the source.

## Reporting a security issue

Open a GitHub issue (or a private advisory if the repo has them enabled)
with reproduction steps. Please don't file public issues for
exploits affecting other people's setups.
