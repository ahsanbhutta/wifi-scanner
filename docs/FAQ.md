# FAQ

## Do I need Node.js installed?

Not for the exe — `WiFiScanner.exe` contains everything (including the
Node runtime). Only running **from source** needs Node.js 24+.

## Is it free? Is there a catch?

Free and open source (MIT). No telemetry, no account, no pro version. The
only outbound traffic is a one-time 3 MB vendor-database download from
wireshark.org and the scan traffic on your own LAN.

## Does it need admin rights?

No. It doesn't install anything, touch the registry, or bind to non-localhost
addresses. Scanning uses ordinary ping/TCP connections any user can make.

## Why is the exe ~90 MB?

It embeds the entire Node runtime — that's the floor for any Node-based
single file. The actual app code is ~1.3 MB. A 5 MB exe would require
rewriting the app in Go/Rust.

## Will it work on my WiFi network?

It scans the LAN you're connected to. Caveats:

- **Client-isolated networks** (hotels, some enterprises) only reveal the
  gateway — devices there can't talk to each other, so neither can the
  scanner.
- **VPNs** take over the default route, so you'd scan the VPN's network
  instead. Disconnect the VPN to scan your LAN.
- **Silent devices** (phones in deep sleep) may need a second scan.

## Why does it say "Randomized (private MAC)"?

Modern phones and laptops use a random MAC address per network for
privacy. The vendor bits are fake, so no manufacturer can be derived. You
can still identify the device by hostname, mDNS services, open ports, or
your router's client list.

## Can it see devices on *other* networks, or neighbors' WiFi?

No — and that's deliberate. It only sees hosts on the LAN it's connected
to. Seeing every radio-visible client requires monitor mode
(`airmon-ng` on Kali), which Windows drivers mostly don't support. See
[WINDOWS-vs-KALI.md](WINDOWS-vs-KALI.md).

## Can I use it to kick people off my network / attack devices?

No. It only *reads* — ping, ARP resolution, service discovery, and TCP
connect attempts to check open ports. It never authenticates, sends
payloads, or modifies anything. Use it to inventory and troubleshoot your
own network.

## Is scanning my network legal?

Scanning devices **on your own LAN** (your home/router network) is normal
network administration. Scanning networks you don't own or have permission
for may violate local law and your ISP's terms. Only scan what you're
allowed to scan.

## Does it work on macOS / Linux?

No. The scan logic drives Windows-specific tooling (PowerShell adapter
discovery, `nbtstat`). The web UI and pipeline are portable in principle,
but no other OS is tested or supported.

## Where is my data stored?

- Exe: `%LOCALAPPDATA%\WiFiScanner` (`devices.db` history + `manuf` vendor DB)
- From source: `data\` in the project folder

Nothing else is written anywhere. Delete those folders to reset.

## How do I stop it?

Close the console window (that's the server). Or end `WiFiScanner.exe` in
Task Manager. Nothing keeps running in the background after that.

## Why did my second double-click "do nothing"?

The exe is single-instance: it detected the running copy and opened the
browser instead of starting a duplicate server. Check the console — it
prints `wifi-scanner is already running -> http://127.0.0.1:3847`.

## Can I run it as a service / at startup?

Not built in — it's a portable tool by design. If you want that, wrap the
exe in Inno Setup/NSIS (installer with Start Menu entry) or use Task
Scheduler to launch it at login.

## How accurate are the device types?

The tool reports **confidence with evidence**:

- `high` — exact model from a UPnP device description, or strong banner
  combinations (e.g. SSH + HTTP with known server headers)
- `medium` — consistent port fingerprint + vendor OUI
- `low` — OUI alone

Every row shows its evidence in the detail panel, so you can judge for
yourself.

## The vendor list is wrong for my device.

Possible causes: the OUI belongs to a white-label manufacturer, the device
uses a randomized MAC, or your device's vendor changed hands. Trust the
hostname/services evidence over the OUI when they disagree, and use the
per-device **notes** field to record the truth.

## Can I export the device list?

Yes — **CSV** or **JSON** buttons next to the search box download the
whole stored history (up to 5000 rows). CSV opens in Excel; JSON keeps the
full structure for scripts. Same data via
`http://127.0.0.1:3847/api/devices/export?format=csv`.

## What is "watch" mode?

Tick **watch** in the header and choose an interval (1/5/15/60 min): the
scanner re-runs on its own and pops a **Windows toast** only when a MAC
that was never seen before appears. It's off by default and forgotten when
you close the app, so no surprise background scans. Suppress toasts with
`WIFI_SCANNER_NO_TOAST=1`.
