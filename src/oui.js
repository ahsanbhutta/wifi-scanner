// OUI lookup: MAC prefix -> vendor. Uses Wireshark's manuf file, downloaded
// once into the data dir. A small built-in fallback keeps first runs useful.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

const MANUF_PATH = path.join(DATA_DIR, 'manuf');
const MANUF_URL = 'https://www.wireshark.org/download/automated/data/manuf';

// Tiny fallback so a scan works before/without the download.
const FALLBACK = {
  '00:1a:11': 'Google, Inc.',
  '3c:22:fb': 'Apple, Inc.',
  'f0:18:98': 'Apple, Inc.',
  'a4:83:e7': 'Apple, Inc.',
  'dc:a6:32': 'Raspberry Pi Trading',
  'b8:27:eb': 'Raspberry Pi Foundation',
  '54:64:d9': 'ASUSTek Computer',
  '9c:b6:d0': 'Roku, Inc.',
  'ac:5a:14': 'Samsung Electronics',
  'f4:f5:d8': 'Google, Inc.',
  '54:60:09': 'Google, Inc.',
  '30:fd:38': 'Google, Inc.',
  '74:2e:fc': 'Nintendo Co., Ltd.',
  '00:22:6b': 'Microsoft Corporation',
  '7c:1e:52': 'Microsoft Corporation',
  'c8:3f:26': 'Microsoft Corporation',
  '00:50:56': 'VMware, Inc.',
  '00:15:5d': 'Microsoft Corporation',
  '02:42:ac': 'Docker Inc.',
  '24:a4:3c': 'Espressif Inc.',
  '30:ae:a4': 'Espressif Inc.',
  '84:f3:eb': 'Espressif Inc.',
  'cc:50:e3': 'Espressif Inc.',
  '50:02:91': 'Espressif Inc.',
  'b0:be:76': 'TP-Link Technologies',
  '50:c7:bf': 'TP-Link Technologies',
  '30:de:4b': 'TP-Link Technologies',
  'e8:48:b8': 'TP-Link Technologies',
  '98:da:c4': 'TP-Link Technologies',
  '00:0c:43': 'Ralink Technology',
  '00:1d:0f': 'TP-Link Technologies',
  '2c:b2:1a': 'Philips Lighting BV',
  'ec:b5:fa': 'Philips Lighting BV',
  '7c:70:9d': 'ASUSTek Computer',
  '24:4b:81': 'ASUSTek Computer',
  'e0:3f:49': 'ASUSTek Computer',
  '00:e0:4c': 'Realtek Semiconductor',
  '52:6a:65': 'Locally administered (randomized)',
  '02:00:00': 'Locally administered (randomized)',
  '06:00:00': 'Locally administered (randomized)',
  '0a:00:00': 'Locally administered (randomized)',
  '0e:00:00': 'Locally administered (randomized)',
};

let table = null; // Map<prefix(9 or 11 chars), vendor>
let source = 'fallback';
let initPromise = null; // single-flight: concurrent callers share one load

/** Parse Wireshark manuf text into Map<prefix, vendor>. Exported for tests. */
export function parseManuf(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const prefix = parts[0].trim().toLowerCase();
    if (!/^([0-9a-f]{2}:){2,3}[0-9a-f]{2}$/.test(prefix)) continue;
    const vendor = parts[1].trim();
    if (vendor) map.set(prefix, vendor);
  }
  return map;
}

async function downloadManuf() {
  try {
    const res = await fetch(MANUF_URL, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes('\t')) throw new Error('unexpected manuf content');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MANUF_PATH, text);
    return text;
  } catch (err) {
    const cause = err?.cause?.message ?? err?.cause?.code;
    console.error(`vendor DB download failed: ${err?.message ?? err}${cause ? ` (${cause})` : ''}`);
    return null;
  }
}

/** Load (and if needed download) the OUI table. Safe to call repeatedly. */
export async function initOui({ refresh = false } = {}) {
  if (table && !refresh) return { source, size: table.size };
  if (initPromise && !refresh) return initPromise;
  initPromise = (async () => {
    let text = null;
    if (!refresh && fs.existsSync(MANUF_PATH)) {
      try {
        text = fs.readFileSync(MANUF_PATH, 'utf8');
      } catch { /* fall through to download */ }
    }
    if (!text) text = await downloadManuf();
    if (text) {
      table = parseManuf(text);
      source = fs.existsSync(MANUF_PATH) ? 'manuf' : 'manuf (memory only)';
    } else {
      table = new Map(Object.entries(FALLBACK));
      source = 'fallback (offline)';
    }
    return { source, size: table.size };
  })();
  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

/** True if the MAC is locally administered (randomized). */
export function isRandomized(mac) {
  const first = parseInt(String(mac).split(':')[0], 16);
  return (first & 0x02) !== 0;
}

/** Look up vendor for a MAC. Returns {vendor, randomized, source}. */
export function lookupOui(mac) {
  if (!table) table = new Map(Object.entries(FALLBACK));
  const clean = String(mac).toLowerCase();
  const octets = clean.split(':');
  if (octets.length < 3) return { vendor: null, randomized: false, source: 'none' };
  const randomized = isRandomized(clean);
  if (randomized) {
    return { vendor: 'Randomized (private MAC)', randomized: true, source: 'ieee-locally-administered' };
  }
  const p3 = octets.slice(0, 3).join(':');
  const p4 = octets.slice(0, 4).join(':');
  const vendor = table.get(p4) || table.get(p3) || FALLBACK[p3] || null;
  return { vendor, randomized: false, source: vendor ? source : 'miss' };
}

/** Async variant: ensures the table is initialized first. */
export async function lookupOuiAsync(mac) {
  if (!table) await initOui();
  return lookupOui(mac);
}
