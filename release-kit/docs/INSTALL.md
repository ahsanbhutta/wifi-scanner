# Install

Two ways to run WiFi Scanner: the **one-file exe** (recommended for
everyone) or **from source** (for development).

---

## Option A — the executable (no Node.js required)

1. Download `WiFiScanner.exe` (~90 MB) from the
   [latest release](../../releases/latest) — or `WiFiScanner.zip`
   (~33 MB) if you'd rather a smaller download; extract it first.
2. Double-click it.

That's it. The exe is fully self-contained: no installer, no admin rights,
no dependencies. It

- starts a local server on `127.0.0.1:3847` (falls back to 3848… if that
  port is taken by another program),
- opens your default browser to the dashboard,
- can live anywhere — Desktop, Downloads, USB stick. It never writes next
  to itself; all data goes to `%LOCALAPPDATA%\WiFiScanner`.

**Stop it** by closing the console window (or ending `WiFiScanner.exe` in
Task Manager).

### SmartScreen on first run

If the exe was downloaded from the internet, Windows shows
*"Windows protected your PC"*:

1. Click **More info**
2. Click **Run anyway**

This appears because the exe is unsigned — a code-signing certificate
removes it permanently, but that costs money and this project doesn't have
one. A copy you build yourself on your own PC runs without the prompt.

### Environment variables

| Variable | Effect |
|---|---|
| `PORT` | Base port (default `3847`; the exe then tries +1…+20 on conflict) |
| `WIFI_SCANNER_NO_BROWSER=1` | Don't auto-open the browser |
| `WIFI_SCANNER_NO_TOAST=1` | Don't show watch-mode desktop notifications |

Example (PowerShell):

```powershell
$env:PORT = '8080'
$env:WIFI_SCANNER_NO_BROWSER = '1'
$env:WIFI_SCANNER_NO_TOAST = '1'
.\WiFiScanner.exe
```

---

## Option B — run from source (development)

Requires **Node.js 24+** (the app uses the built-in `node:sqlite`; there
are no native modules to compile). Check with `node --version`.

```
npm install
npm start
→ open http://127.0.0.1:3847
```

- Dev mode serves `public/` from disk, so UI edits show up on refresh
  without a rebuild.
- Dev data lives in `data/` next to the source (vendor DB + history).
- Dev mode does **not** auto-open a browser and fails loudly if the port
  is busy.

To build the exe from source, see [BUILD-FROM-SOURCE.md](BUILD-FROM-SOURCE.md).

---

## Uninstall

There is nothing to uninstall with the exe — no registry entries, no Start
Menu shortcuts, no services. To remove it:

1. Close the console window (stops the scanner).
2. Delete `WiFiScanner.exe`.
3. Optionally delete `%LOCALAPPDATA%\WiFiScanner` (the vendor DB and
   device history).

From source: delete the project folder and `node_modules/`.
