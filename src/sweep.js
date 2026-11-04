// Ping sweep + Windows neighbor (ARP) table reader.
import { execFile, pool } from './util.js';

/** ICMP sweep with bounded concurrency. Returns Set of IPs that answered. */
export async function pingSweep(hosts, { concurrency = 64, timeout = 400, onProgress } = {}) {
  const alive = new Set();
  let done = 0;
  await pool(hosts, concurrency, async (ip) => {
    // -n 1 echo, -w timeout ms, -4 force IPv4
    const res = await execFile('ping', ['-n', '1', '-w', String(timeout), '-4', ip], {
      timeout: timeout + 2000,
    });
    if (res.code === 0) alive.add(ip);
    done++;
    onProgress?.(done, hosts.length);
  });
  return alive;
}

/** Read the Windows neighbor table (IP -> MAC). Returns Map<ip, {mac, state}>. */
export async function readNeighbors() {
  // Filter ghosts in PowerShell: zero/broadcast MACs are failed ARP entries,
  // Unreachable/Incomplete are not present. State is stringified explicitly
  // because ConvertTo-Json may serialize the enum as a number.
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Get-NetNeighbor -AddressFamily IPv4 |
  Where-Object {
    $_.LinkLayerAddress -and
    $_.LinkLayerAddress -ne '00-00-00-00-00-00' -and
    $_.LinkLayerAddress -ne 'ff-ff-ff-ff-ff-ff' -and
    $_.State -ne 'Incomplete' -and
    $_.State -ne 'Unreachable'
  } |
  Select-Object IPAddress,
    @{n='Mac';e={$_.LinkLayerAddress.ToLower().Replace('-',':')}},
    @{n='State';e={[string]$_.State}} |
  ConvertTo-Json -Compress
`;
  const res = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    timeout: 20000,
  });
  const map = new Map();
  const out = res.stdout.trim();
  if (!out) return map;
  let rows;
  try {
    rows = JSON.parse(out);
  } catch {
    return map;
  }
  if (!Array.isArray(rows)) rows = [rows];
  for (const r of rows) {
    if (!r?.IPAddress || !r?.Mac) continue;
    map.set(r.IPAddress, { mac: String(r.Mac), state: String(r.State ?? '') });
  }
  return map;
}

/** Fallback parser for `arp -a` output (locale-tolerant: match ip + mac pairs). */
export function parseArpA(text) {
  const map = new Map();
  const re = /(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f]{2}-[0-9a-f]{2}-[0-9a-f]{2}-[0-9a-f]{2}-[0-9a-f]{2}-[0-9a-f]{2})/gi;
  let m;
  while ((m = re.exec(text))) {
    const mac = m[2].toLowerCase();
    // Skip failed ARP entries (zero) and the broadcast address.
    if (mac === '00:00:00:00:00:00' || mac === 'ff:ff:ff:ff:ff:ff') continue;
    map.set(m[1], { mac: mac.replace(/-/g, ':'), state: 'arp' });
  }
  return map;
}
