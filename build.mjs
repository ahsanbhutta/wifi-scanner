// Build a single self-contained Windows .exe (Node SEA).
//
//   npm run build   ->   dist/WiFiScanner.exe
//
// Steps:
//   1. embed every public/ file into a JS asset map (no files on disk at runtime)
//   2. esbuild-bundle server.js + all dependencies into one CJS file
//   3. turn that bundle into a SEA blob (node --experimental-sea-config)
//   4. copy node.exe and inject the blob with postject
//
// The result is one file (~80 MB — it contains the whole Node runtime) that
// serves the dashboard on 127.0.0.1 and opens the browser on double-click.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';
import esbuild from 'esbuild';
import * as PELibrary from 'pe-library';
import * as ResEdit from 'resedit';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const exeName = 'WiFiScanner.exe';
const exePath = path.join(dist, exeName);
const bundlePath = path.join(dist, 'bundle.cjs');
const blobPath = path.join(dist, 'sea-prep.blob');
const configPath = path.join(dist, 'sea-config.json');
const iconPath = path.join(root, 'assets', 'icon.ico');

// Explorer "Properties -> Details" strings — edit these freely.
const VERSION = { major: 1, minor: 0, micro: 0, revision: 0 };
const VERSION_STRINGS = {
  FileDescription: 'WiFi Scanner — LAN device scanner',
  ProductName: 'WiFi Scanner',
  CompanyName: 'WiFi Scanner contributors',
  LegalCopyright: '© 2026 WiFi Scanner contributors',
  OriginalFilename: exeName,
  InternalName: 'WiFiScanner',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const isText = (type) =>
  type.startsWith('text/') ||
  /javascript|json|svg|x-www-form-urlencoded/.test(type);

// ---- 1. embed public/ ---------------------------------------------------
function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

const publicDir = path.join(root, 'public');
const assets = {};
for (const rel of walk(publicDir)) {
  const type = MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream';
  const buf = fs.readFileSync(path.join(publicDir, rel));
  assets[rel] = isText(type)
    ? { type, body: buf.toString('utf8') }
    : { type, body: buf.toString('base64'), b64: true };
}
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const assetsMapPath = path.join(dist, 'assets-map.js');
fs.writeFileSync(assetsMapPath, `export default ${JSON.stringify(assets)};\n`);
console.log(`embedded ${Object.keys(assets).length} public files`);

// ---- 2. bundle ----------------------------------------------------------
// #assets -> the generated map (dev uses the src/ stub via package imports).
const assetsAlias = {
  name: 'assets-alias',
  setup(build) {
    build.onResolve({ filter: /^#assets$/ }, () => ({ path: assetsMapPath }));
  },
};

await esbuild.build({
  entryPoints: [path.join(root, 'server.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  outfile: bundlePath,
  // Inside the exe, paths.js takes the packaged branch (AppData data dir,
  // embedded assets, auto-open, single-instance).
  define: { 'globalThis.__PACKAGED__': 'true' },
  plugins: [assetsAlias],
  logLevel: 'warning',
});
console.log(`bundled server.js -> ${path.relative(root, bundlePath)} (${(fs.statSync(bundlePath).size / 1024).toFixed(0)} KB)`);

// ---- 3. SEA blob --------------------------------------------------------
// Paths in sea-config.json are resolved from the process cwd; use absolute.
fs.writeFileSync(
  configPath,
  JSON.stringify(
    {
      main: bundlePath,
      output: blobPath,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
    },
    null,
    2,
  ),
);
execFileSync(process.execPath, ['--experimental-sea-config', configPath], {
  cwd: root,
  stdio: 'inherit',
});
console.log(`sea blob: ${(fs.statSync(blobPath).size / 1024 / 1024).toFixed(1)} MB`);

// ---- 4. copy node.exe + inject the blob ---------------------------------
fs.copyFileSync(process.execPath, exePath);
const fuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
// Quote every path: the project lives under "Default Project" (spaces).
execSync(
  `npx postject "${exePath}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse ${fuse}`,
  { cwd: root, stdio: 'inherit', shell: true },
);

// ---- 5. icon + version info ---------------------------------------------
// assets/icon.ico (from `npm run icon`) replaces Node's logo; also fills in
// Explorer's "Properties -> Details". Pure-JS via resedit — no extra tools.
if (fs.existsSync(iconPath)) {
  // node.exe is Authenticode-signed; the blob injection already invalidated
  // that signature, and resedit regenerates the file unsigned regardless.
  const pe = PELibrary.NtExecutable.from(fs.readFileSync(exePath), {
    ignoreCert: true,
  });
  const res = PELibrary.NtExecutableResource.from(pe);

  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    groups.length ? groups[0].id : 1, // node.exe ships an icon group
    1033, // en-US
    iconFile.icons.map((item) => item.data),
  );

  const viList = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const vi = viList[0] ?? ResEdit.Resource.VersionInfo.createEmpty();
  const { major, minor, micro, revision } = VERSION;
  vi.setFileVersion(major, minor, micro, revision, 1033);
  vi.setProductVersion(major, minor, micro, revision, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, VERSION_STRINGS);
  vi.outputToResourceEntries(res.entries);

  res.outputResource(pe);
  fs.writeFileSync(exePath, Buffer.from(pe.generate()));
  console.log('icon + version info applied (assets/icon.ico)');
} else {
  console.log('assets/icon.ico not found — keeping the default Node.js icon');
}

const size = fs.statSync(exePath).size / 1024 / 1024;
console.log('');
console.log(`done: ${path.relative(process.cwd(), exePath)} (${size.toFixed(1)} MB)`);
console.log('double-click it: serves 127.0.0.1:3847 and opens the browser.');
console.log('note: unsigned exes show a SmartScreen "More info -> Run anyway" prompt');
console.log('      when downloaded from the internet (a local build runs silently).');
