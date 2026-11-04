# Troubleshooting

## "Windows protected your PC" (SmartScreen)

**Symptom:** double-clicking `WiFiScanner.exe` shows a blue dialog:
*"Windows protected your PC"*.

**Cause:** the exe is unsigned, and SmartScreen weighs reputation — a file
downloaded from the internet with no history always trips it.

**Fix:** click **More info → Run anyway**.

**Permanently:** buy an EV or standard code-signing certificate (~$50–400/yr)
and sign the build, or build the exe yourself locally (a local build runs
silently because it never left your machine).

## Antivirus flags the exe

**Symptom:** Defender/AV quarantines or warns about `WiFiScanner.exe`.

**Cause:** heuristics dislike unsigned programs that ping a whole subnet —
that behavior looks like a scanner (because it is one). This is extremely
common for network tools.

**Fix / response:**

1. Check what exactly the detection is (Defender → Protection history →
   the detection name).
2. Submit the file to [VirusTotal](https://www.virustotal.com) to see
   which engines flag it and why.
3. Reassure yourself/others with the source: the whole app is here, and
   `npm run build` reproduces the exe byte-for-byte in structure (see
   [BUILD-FROM-SOURCE.md](BUILD-FROM-SOURCE.md)).
4. **Scan it on VirusTotal** — upload the exe or paste its SHA-256 to
   https://www.virustotal.com to see exactly which engines flag it and why
   (share this permalink in your release notes).
5. **Report a false positive to Microsoft** (free, often resolved in days):
   https://www.microsoft.com/en-us/wdsi/filesubmission — include the
   detection name and the file hash.
6. Add an exclusion **only** if you trust the source you got it from.

## Browser doesn't open automatically

**Symptom:** the console says `wifi-scanner -> http://127.0.0.1:3847` but
no browser tab appears.

**Fix:** copy the URL from the console and paste it into any browser
manually. Auto-open uses `cmd /c start`, which respects your default
browser; if it's misconfigured the manual URL always works.

To disable auto-open on purpose: `set WIFI_SCANNER_NO_BROWSER=1` before
launching.

## Port already in use

**Symptom:** the console shows `wifi-scanner -> http://127.0.0.1:3848`
(or another port).

**Explanation:** something else holds 3847, so the exe took the next free
port. **Use whatever URL the console printed.** The exe tries 3847 + 1…+20;
if all are taken it fails with a clear error.

To force a port: `set PORT=8080` before launching.

## "Scan failed" or scans that never finish

1. **Check the console log** — the error message appears there and in the
   dashboard banner (`GET /api/status` → `lastError`).
2. **Wi-Fi asleep?** Re-run the scan; the first sweep often wakes devices.
3. **VPN / virtual adapters** can confuse adapter discovery. Disconnect the
   VPN and scan again — the scanner skips virtual NICs, but a VPN that
   owns the default route wins by design (it thinks that's your network).
4. **Firewall:** the app itself binds only `127.0.0.1`, but the scan sends
   ping/TCP from your PC. If a third-party firewall blocks outbound probes,
   allow them — or expect fewer results.

## Only the gateway is found

**Symptom:** a 1–2 device scan on a network you know has more clients.

**Cause:** **client isolation** — the AP blocks device-to-device traffic.
Common in hotels, cafés, and some enterprise/guest networks. The scanner
can only see hosts it can talk to.

**Also possible:** you're on a VPN (all LAN traffic routes through it).

This is the documented Windows-vs-monitor-mode tradeoff, not a bug — see
[WINDOWS-vs-KALI.md](WINDOWS-vs-KALI.md).

## Devices show as "(off)" even though they're on

They answered a previous scan but not this one. Typical reasons: phone
entered deep sleep, device roamed to another AP/SSID, power-saving dropped
the pings. Run another scan; sleeping phones usually answer the second one.

## Vendor shows "Offline fallback (42 prefixes)"

The one-time download of Wireshark's `manuf` file failed (offline, blocked,
or a transient network error). Scans still work, but most vendors show as
unknown.

**Fix:** press refresh in the dashboard or call:

```
POST http://127.0.0.1:3847/api/oui/refresh
```

The file is cached at `%LOCALAPPDATA%\WiFiScanner\manuf` (exe) or
`data\manuf` (source) and is only downloaded when missing.

## Randomized MACs everywhere — no vendors

Modern phones/laptops use a **random MAC per network** by design. The OUI
bits don't map to any manufacturer, so rows show *Randomized (private
MAC)*. That's correct behavior, not a lookup failure — identify those
devices by hostname, mDNS services, ports, or your router's client list.

## Second double-click seems to do nothing

By design: the exe detected the running instance and just focused/reopened
the browser. The console briefly prints
`wifi-scanner is already running -> http://127.0.0.1:3847` and exits.

To actually restart: close the first console window (or end the process in
Task Manager), then double-click again.

## Build fails: "EPERM … WiFiScanner.exe"

A `WiFiScanner.exe` process is running and Windows won't overwrite it:

```powershell
Get-Process WiFiScanner | Stop-Process -Force
npm run build
```

## Still stuck?

Open an issue with:

- Windows version (`winver`) and how you launched the exe (double-click /
  terminal)
- The exact console output
- What you expected vs. what happened
- Detection name if this is an AV report
