// Generate assets/icon.ico for the packaged exe.
//
//   npm run icon
//
// Priority:
//   1. assets/icon.png  -> converted to a multi-size .ico (GDI+ resizes it)
//   2. assets/icon.ico  -> kept as-is (you put it there; delete to regenerate)
//   3. neither          -> the default artwork is generated procedurally
//
// The build (build.mjs) embeds assets/icon.ico into dist/WiFiScanner.exe.
// Also writes assets/icon-preview.png (256px) so you can eyeball the result.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assetsDir = path.join(root, 'assets');
const pngPath = path.join(assetsDir, 'icon.png');
const icoPath = path.join(assetsDir, 'icon.ico');
const previewPath = path.join(assetsDir, 'icon-preview.png');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
fs.mkdirSync(assetsDir, { recursive: true });

// ---------------------------------------------------------------- PNG encode
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ----------------------------------------------------------------- ICO pack
function packIco(images /* [{ size, png }] */) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((img, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(img.size >= 256 ? 0 : img.size, e); // width
    header.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1); // height
    header.writeUInt8(0, e + 2); // color count
    header.writeUInt8(0, e + 3); // reserved
    header.writeUInt16LE(1, e + 4); // planes
    header.writeUInt16LE(32, e + 6); // bit count
    header.writeUInt32LE(img.png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += img.png.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.png)]);
}

// ------------------------------------------------- default artwork renderer
// Dark rounded tile, sky-blue Wi-Fi symbol, green "live" indicator.
// Supersampled for clean edges at every size.
function renderDefault(size) {
  const k = size <= 24 ? 8 : 4; // supersample factor
  const out = Buffer.alloc(size * size * 4);

  const RAD = 0.22; // corner radius (fraction of size)
  const OX = 0.5;
  const OY = 0.76; // Wi-Fi origin (bottom center)
  const DOT = 0.055; // center dot radius
  const ARCS = [0.17, 0.3, 0.43]; // arc radii
  const HW = 0.043; // arc half-width
  const SPAN = (55 * Math.PI) / 180; // half-angle of the arc fan
  const LIVE = [0.8, 0.2, 0.072]; // green dot: x, y, radius
  const BORDER = Math.max(1, 0.03 * size) / size;

  const TOP = [30, 41, 59]; // #1E293B
  const BOT = [15, 23, 42]; // #0F172A
  const ACC = [56, 189, 248]; // #38BDF8
  const GREEN = [34, 197, 94]; // #22C55E

  function sample(u, v) {
    // rounded-rect signed distance (negative = inside)
    const qx = Math.abs(u - 0.5) - (0.5 - RAD);
    const qy = Math.abs(v - 0.5) - (0.5 - RAD);
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - RAD;
    if (d > 0) return null;

    // vertical gradient background
    let r = TOP[0] + (BOT[0] - TOP[0]) * v;
    let g = TOP[1] + (BOT[1] - TOP[1]) * v;
    let b = TOP[2] + (BOT[2] - TOP[2]) * v;

    // subtle light edge so the tile reads on dark taskbars
    if (d > -BORDER) {
      const f = 0.1 * (1 + d / BORDER);
      r += (255 - r) * f;
      g += (255 - g) * f;
      b += (255 - b) * f;
    }

    // Wi-Fi: center dot, then the arc fan
    const dx = u - OX;
    const dy = v - OY;
    const dw = Math.hypot(dx, dy);
    if (dw <= DOT) return ACC;
    if (dw > 0 && Math.abs(Math.atan2(dx, -dy)) <= SPAN) {
      for (const rr of ARCS) if (Math.abs(dw - rr) <= HW) return ACC;
    }

    // green "scanning" indicator
    if (Math.hypot(u - LIVE[0], v - LIVE[1]) <= LIVE[2]) return GREEN;

    return [r, g, b];
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < k; sy++) {
        for (let sx = 0; sx < k; sx++) {
          const c = sample((x + (sx + 0.5) / k) / size, (y + (sy + 0.5) / k) / size);
          if (c) {
            n++;
            r += c[0];
            g += c[1];
            b += c[2];
          }
        }
      }
      const i = (y * size + x) * 4;
      if (n === 0) continue; // fully transparent (default alpha 0)
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
      out[i + 3] = Math.round((255 * n) / (k * k));
    }
  }
  return out;
}

function generateDefault() {
  const images = SIZES.map((size) => ({
    size,
    png: encodePng(size, size, renderDefault(size)),
  }));
  fs.writeFileSync(icoPath, packIco(images));
  const preview = images.find((i) => i.size === 256).png;
  fs.writeFileSync(previewPath, preview);
  console.log(`generated default icon -> ${path.relative(root, icoPath)} (${images.length} sizes)`);
  console.log(`preview -> ${path.relative(root, previewPath)}`);
}

// ------------------------------------------- convert a user PNG to multi-size
function pngSize(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function convertUserPng() {
  const src = fs.readFileSync(pngPath);
  const dim = pngSize(src);
  if (!dim) {
    console.error(`assets/icon.png is not a valid PNG — delete it to regenerate the default icon`);
    process.exit(1);
  }
  if (dim.w !== dim.h) console.warn(`warning: icon.png is ${dim.w}x${dim.h} (not square) — it will be stretched`);

  // GDI+ does the high-quality resizes (Windows-only project anyway).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-'));
  const ps = `
    Add-Type -AssemblyName System.Drawing
    $src = [System.Drawing.Image]::FromFile($env:ICON_SRC)
    try {
      foreach ($s in 16,24,32,48,64,128,256) {
        $bmp = New-Object System.Drawing.Bitmap($s, $s)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CompositingQuality = 'HighQuality'
        $g.InterpolationMode = 'HighQualityBicubic'
        $g.SmoothingMode = 'HighQuality'
        $g.PixelOffsetMode = 'HighQuality'
        $g.DrawImage($src, 0, 0, $s, $s)
        $g.Dispose()
        $bmp.Save((Join-Path $env:ICON_TMP "size-$s.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
      }
    } finally { $src.Dispose() }
  `;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
      env: { ...process.env, ICON_SRC: pngPath, ICON_TMP: tmp },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    const images = SIZES.map((size) => ({
      size,
      png: fs.readFileSync(path.join(tmp, `size-${size}.png`)),
    }));
    fs.writeFileSync(icoPath, packIco(images));
    fs.copyFileSync(pngPath, previewPath);
    console.log(`converted assets/icon.png (${dim.w}x${dim.h}) -> ${path.relative(root, icoPath)} (${images.length} sizes)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// --------------------------------------------------------------------- main
if (fs.existsSync(pngPath)) {
  convertUserPng();
} else if (fs.existsSync(icoPath)) {
  console.log('kept existing assets/icon.ico (delete it, or run with assets/icon.png present, to change it)');
} else {
  generateDefault();
}
