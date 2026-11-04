# Announcement posts — pick a variant and paste

Replace `<REPO>` with your GitHub URL everywhere. Keep the screenshots:
`docs/img/dashboard-full.png` is the good one.

---

## 1. Short / generic (Discord, group chats, anywhere)

```
I built WiFi Scanner — a local dashboard that scans your LAN and tells you
what's connected: vendor, hostname, exact model (via UPnP), open ports, and
a device type with evidence. New-device alerts, history, notes.

Windows, one .exe (~90 MB), no Node.js/installer/admin rights. Double-click
→ browser opens → Scan network (20–40s).

Open source (MIT), local only — no telemetry, dashboard binds 127.0.0.1.

<REPO>

Heads up: unsigned exe → SmartScreen "More info → Run anyway". No monitor
mode (Windows doesn't really support it), so it sees your LAN — not every
radio-visible client like airmon-ng would.
```

---

## 2. Reddit — r/selfhosted (or r/homelab, r/windows)

**Title options:**
- `I made a one-file LAN scanner for Windows: sees what's on your WiFi, tells you the model — no Node, no installer`
- `WiFi Scanner: a local web dashboard that inventories your LAN (vendor/model/ports) in one .exe`

```
**What it does**

Run one exe, it opens a dashboard, hit *Scan network*. In 20–40 seconds you
get a table of everything on your LAN:

- IP, MAC, vendor (Wireshark OUI, 40k+ prefixes), hostname
- Exact model when a device advertises it (UPnP gave me my router's full
  model string: ZTE ZXHN H168N V3.5)
- Open ports + HTTP banner/title grab
- Best-guess device type with **confidence level and the evidence** behind
  it ("UPnP device description", "mDNS service _adb"…)
- New-device alert banner, SQLite history, per-device notes, hide/ignore
- One-click **CSV/JSON export**; **watch mode** that re-scans on a timer
  and toasts you when an unknown device shows up

Enrichment is mDNS/DNS-SD, SSDP/UPnP, NetBIOS (nbtstat) and TCP probes —
in parallel, and only against hosts that actually look alive, so a /24
finishes in ~20-40s.

**Why Windows**

airmon-ng/monitor mode basically isn't available on Windows drivers, so
instead of pretending, this actively probes the LAN from the normal
interface. Trade-off is honest: you see devices that participate in your
LAN, not every radio-visible client. Client-isolated APs (hotels) show only
the gateway. Details in the repo's WINDOWS-vs-KALI doc.

**Install**

Download `WiFiScanner.exe` (~90 MB — it embeds the Node runtime), double
click, done. No Node, no installer, no admin rights. Data goes to
%LOCALAPPDATA%\WiFiScanner. Or `npm install && npm start` from source.

⚠ Unsigned → SmartScreen wants "More info → Run anyway". Build it yourself
with `npm run build` if you don't want to trust my binary.

**Privacy:** local only. No telemetry. Only outbound traffic is a one-time
vendor DB download from wireshark.org + scan traffic on your own LAN.
Dashboard binds 127.0.0.1 only.

MIT: <REPO>
```

---

## 3. Hacker News — Show HN

**Title:** `Show HN: WiFi Scanner – one-exe LAN device scanner with model ID for Windows`

```
I wanted airmon-ng's "what's on my network" answer on a normal Windows
box, and monitor mode basically doesn't exist there (driver support). So
this takes the other path: actively probe the LAN and *identify* what
answers.

Pipeline per scan (~20-40s on a /24):
  adapter discovery (PowerShell, skips Hyper-V/WSL/VMware/Tailscale NICs)
  -> ping sweep + neighbor table (ghost entries filtered)
  -> vendor OUI lookup (Wireshark manuf, randomized MACs flagged not guessed)
  -> parallel enrichment: mDNS/DNS-SD, SSDP/UPnP (often the exact model),
     nbtstat, TCP probe + HTTP header/title
  -> fingerprint with high/medium/low confidence + the evidence
  -> SQLite history: new-device alerts, notes, sighting timelines

It ships as a single ~90 MB exe (Node SEA + esbuild; no Node/installer/admin
on the target). Dashboard is vanilla JS on 127.0.0.1. Double-clicking twice
doesn't start a second server; it takes the next free port if 3847 is taken.

Honest limitations I'd want flagged before trying it:
- Windows only; no monitor mode, so no SSID/RSSI/probe-request visibility,
  and client-isolated APs reveal only the gateway
- unsigned exe => SmartScreen prompt, occasional AV heuristics (it pings a
  network, that's the job)
- ~90 MB is the Node-runtime floor; app code is 1.3 MB
- read-only: discovery + banner reads, no injection/deauth/payloads

Local only, no telemetry; sole outbound call is a one-time manuf download
from wireshark.org.

Repo + source: <REPO>
```

---

## 4. X / Mastodon (short)

```
Built WiFi Scanner: one .exe that scans your LAN and says what's connected —
vendor, hostname, exact model, open ports, device type + evidence.

No Node/installer/admin. Double-click → browser → Scan (20-40s).
New-device alerts, history, notes. Local only, MIT, open source.

<REPO>

(Windows: no monitor mode, so it's your LAN — not every radio client like
airmon-ng. Unsigned exe => SmartScreen "Run anyway".)
```

**Mastodon/X thread variant (2/3):**

```
How it finds things: ping sweep + ARP table, then mDNS/DNS-SSDP/NetBIOS +
TCP port probes in parallel against hosts that look alive. UPnP often
hands over the exact model string. Randomized phone MACs get flagged
instead of mis-vendored.

Then it fingerprints: type + confidence + the actual reasons ("mDNS
service _adb"), and remembers everything in SQLite so you get a "new device
seen in last 24h" banner next time.
```

**Thread variant (3/3):**

```
Why not just airmon-ng? Monitor mode isn't supported by most Windows WiFi
drivers. Trade-off is documented: this sees devices that participate in
your LAN, not every radio-visible client; client-isolated APs show only
the gateway. Windows users get zero-setup inventory instead.

Build from source: npm install && npm run build -> dist\WiFiScanner.exe
```

---

## 5. LinkedIn / generic professional

```
Recently shipped WiFi Scanner — a local web dashboard that inventories a
Windows machine's WiFi/LAN: vendor, hostname, device model, open ports,
and a best-guess device type with a confidence level and the evidence
behind it.

Technical notes:
• Pipeline: PowerShell adapter discovery → ping sweep + ARP neighbor
  table → OUI lookup (Wireshark manuf) → parallel mDNS/SSDP/NetBIOS/TCP
  enrichment → heuristic fingerprinting → SQLite history
• Distributed as a single self-contained .exe via Node's SEA feature +
  esbuild — no runtime, installer, or admin rights required on the target
• Web UI is dependency-free vanilla JS served on 127.0.0.1; single-instance
  and port-conflict handling built in
• Privacy-first: no telemetry, all data stays local

The honest limitation I documented up front: no monitor-mode capture on
Windows, so it identifies devices on your own LAN rather than every
radio-visible client. MIT licensed: <REPO>
```

---

## Hashtag suggestions

`#selfhosted #homelab #networking #windows #opensource #infosec #iot`
