# Build from source

Reproduce `dist\WiFiScanner.exe` from a clean checkout. One command, ~15
seconds.

## Prerequisites

- **Node.js 24+** (`node --version`) — the build uses `node:sqlite` and
  Node's SEA tooling
- **Windows** — the exe is a copy of your local `node.exe` with the app
  injected; Windows is the supported target
- No admin rights required

## Build

```powershell
git clone https://github.com/<OWNER>/wifi-scanner.git
cd wifi-scanner
npm install
npm test          # optional but recommended: 42 unit tests, ~2 s
npm run build
```

Output:

```
dist\
  WiFiScanner.exe    ← the deliverable (~90 MB)
  bundle.cjs         ← esbuild bundle (intermediate)
  sea-prep.blob      ← SEA blob (intermediate)
  assets-map.js      ← embedded public/ files (intermediate)
  sea-config.json    ← SEA config (intermediate)
```

> **If the build fails with `EPERM` on `WiFiScanner.exe`**, a copy is
> running: `Get-Process WiFiScanner | Stop-Process -Force`, then rebuild.

## What the build does (`build.mjs`)

1. **Embed the web UI** — every file in `public/` is read and written into
   `dist/assets-map.js` as a JS module (text inline, binaries base64). At
   runtime the server serves these instead of reading from disk, so the exe
   needs no `public/` folder.
2. **Bundle with esbuild** — `server.js` and all dependencies (Express,
   multicast-dns, the whole `src/` tree) are bundled into one CJS file
   (~1.3 MB) for `platform: node`, `target: node24`.
   - `#assets` is aliased to the generated asset map (dev uses the stub
     `src/embedded-assets.js` via package `imports`).
   - `globalThis.__PACKAGED__` is defined `true`, which flips `src/paths.js`
     to packaged behavior: data in `%LOCALAPPDATA%\WiFiScanner`, embedded
     assets, auto-open browser, single-instance, port fallback.
3. **Create the SEA blob** — `node --experimental-sea-config` turns the
   bundle into `sea-prep.blob`.
4. **Copy + inject** — your `node.exe` is copied to
   `dist\WiFiScanner.exe`, and `postject` injects the blob:

   ```
   npx postject WiFiScanner.exe NODE_SEA_BLOB sea-prep.blob \
     --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
   ```

`postject` prints `warning: The signature seems corrupted!` — **expected**.
Injecting the blob invalidates the Node binary's Authenticode signature,
which is exactly why internet-downloaded copies show SmartScreen.

## Verify the build

```powershell
# 1. It runs and serves embedded assets (header says "embedded")
.\dist\WiFiScanner.exe
# console: wifi-scanner -> http://127.0.0.1:3847

# 2. In another terminal:
Invoke-WebRequest http://127.0.0.1:3847/ -UseBasicParsing |
  Select-Object -ExpandProperty Headers X-Wifi-Scanner-Assets
# → embedded
```

Manual checks worth doing:

- [ ] Scan completes and finds your gateway
- [ ] Second double-click prints `wifi-scanner is already running` and
      exits 0
- [ ] Data lands in `%LOCALAPPDATA%\WiFiScanner`, nothing is written next
      to the exe
- [ ] Running the exe from a different working directory (e.g. Downloads)
      still works

## Custom icon & version info

The build embeds `assets/icon.ico` into the exe (replacing Node's logo)
and fills in Explorer's **Properties → Details** — pure JavaScript via
[`resedit`](https://www.npmjs.com/package/resedit), no extra tools.

**Use your own artwork — two options:**

```powershell
# Option 1: give it a PNG (any square size; the script resizes to
# 16/24/32/48/64/128/256 via GDI+ and packs a multi-size .ico)
copy my-logo.png assets\icon.png
npm run icon
npm run build

# Option 2: give it a ready-made .ico (multi-size for crisp small sizes)
copy my-logo.ico assets\icon.ico
npm run build          # no conversion needed — the build uses it as-is
```

No file present? `npm run icon` generates the default artwork (the dark
tile with the Wi-Fi symbol). `assets/icon-preview.png` shows a 256px
render of whatever is active.

**Edit the version strings** (shown in Explorer → right-click →
Properties → Details) at the top of `build.mjs`:

```js
const VERSION = { major: 1, minor: 0, micro: 0, revision: 0 };
const VERSION_STRINGS = {
  FileDescription: 'WiFi Scanner — LAN device scanner',
  ProductName: 'WiFi Scanner',
  CompanyName: 'WiFi Scanner contributors',
  LegalCopyright: '© 2026 WiFi Scanner contributors',
  OriginalFilename: exeName,
  InternalName: 'WiFiScanner',
};
```

**How it works:** after `postject` injects the SEA blob, the build
reopens the exe with `pe-library`, replaces the icon group resources with
every size from the `.ico`, rewrites the VERSIONINFO resource, and writes
the file back. This is also what produces the
`warning: The signature seems corrupted!` note from postject — the exe is
unsigned either way, so SmartScreen behavior is unchanged.

**Verify:**

```powershell
(Get-Item dist\WiFiScanner.exe).VersionInfo | Format-List ProductName, FileVersion
# → ProductName : WiFi Scanner
#   FileVersion  : 1.0.0.0
```

The icon shows in Explorer, Task Manager, and the taskbar/alt-tab.

## Why ~90 MB?

| Piece | Size |
|---|---|
| Node runtime (`node.exe`) | ~88 MB |
| App bundle (server + deps + UI) | ~1.3 MB |
| **Total** | **~90 MB** |

That's the floor for Node SEA. Alternatives and their tradeoffs:

- **pkg / nexe** — same runtime, similar size
- **Deno compile** — same story
- **Go / Rust rewrite** — 5–15 MB, but a full rewrite of every scan module
- **Bundle an installer (Inno Setup/NSIS)** — doesn't shrink anything, but
  gives Start Menu shortcuts and an uninstaller

## Shipping to users

1. Upload `dist\WiFiScanner.exe` as a GitHub Release asset (2 GB limit —
   90 MB is trivial).
2. Users see SmartScreen on download → **More info → Run anyway** (unsigned).
3. Code signing (DigiCert/Sectigo/EV cert, ~$50–400/yr) removes the prompt:
   sign the exe after postject with `signtool sign /fd SHA256 …`.

## Reproducibility note

The exe embeds **your** `node.exe`, so builds differ across Node patch
versions. For byte-identical rebuilds, pin the Node version (e.g. via
`.nvmrc` containing `v24.20.0`) and rebuild on the same OS.
