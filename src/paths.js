// Runtime paths shared by dev and the packaged single-file exe.
// - dev:      runs from the project → data/ next to server.js (unchanged)
// - packaged: the exe can live anywhere (Desktop, Downloads, USB), so user
//             data goes to %LOCALAPPDATA%\WiFiScanner (vendor DB + history).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Build step (esbuild `define`) rewrites this to `true` inside the exe.
export const PACKAGED = globalThis.__PACKAGED__ ?? false;

// Dev entry-point directory (server.js), resolved from argv so `npm start`
// and `node /path/to/server.js` both land on the project root.
const devRoot = process.argv[1]
  ? path.dirname(path.resolve(process.argv[1]))
  : process.cwd();

/** Project root in dev (null when packaged). */
export const ROOT_DIR = PACKAGED ? null : devRoot;

/** Writable data directory (vendor DB, device history). */
export const DATA_DIR = PACKAGED
  ? path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'WiFiScanner',
    )
  : path.join(devRoot, 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });
