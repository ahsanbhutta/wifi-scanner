// NetBIOS name queries (Windows/Android/Samba hostnames) via nbtstat -A.
// Falls back gracefully when nbtstat is unavailable or the host ignores NBNS.
import { execFile, pool } from './util.js';

const ENTRY_RE = /^\s*(\S+)\s+<([0-9A-F]{2})>\s+(UNIQUE|GROUP)\s+/i;

/** Query one host. Returns {name, group} or null. */
export async function netbiosName(ip, timeout = 2500) {
  const res = await execFile('nbtstat', ['-A', ip], { timeout });
  if (res.code !== 0 || !res.stdout) return null;
  let name = null;
  let group = null;
  for (const line of res.stdout.split(/\r?\n/)) {
    const m = line.match(ENTRY_RE);
    if (!m) continue;
    const [, n, suffix, kind] = m;
    if (kind.toUpperCase() === 'UNIQUE' && suffix === '00' && !/^\s*__/.test(n)) {
      // <00> UNIQUE = workstation service = machine name
      if (!name || n.length > name.length) name = n;
    }
    if (kind.toUpperCase() === 'GROUP' && suffix === '00' && !group) group = n; // workgroup/domain
  }
  if (!name && !group) return null;
  return { name, group };
}

/** Batch query. Returns Map<ip, {name, group}> for hosts that answered. */
export async function netbiosDiscover(ips, { concurrency = 8 } = {}) {
  const out = new Map();
  await pool(ips, concurrency, async (ip) => {
    const r = await netbiosName(ip);
    if (r && (r.name || r.group)) out.set(ip, r);
  });
  return out;
}
