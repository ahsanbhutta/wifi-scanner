// Scan orchestrator: subnet sweep -> neighbor/MAC table -> enrichment
// (NetBIOS, mDNS, SSDP, port fingerprint) -> vendor lookup -> fingerprint.
import { getNetworkInfo, subnetHosts } from './netinfo.js';
import { pingSweep, readNeighbors } from './sweep.js';
import { lookupOuiAsync, isRandomized } from './oui.js';
import { netbiosDiscover } from './netbios.js';
import { mdnsDiscover } from './mdns.js';
import { ssdpDiscover } from './ssdp.js';
import { probeHost, PORT_HINTS } from './ports.js';
import { fingerprint } from './fingerprint.js';
import { buildActiveTier } from './tiering.js';
import { pool } from './util.js';

const MAX_HOSTS = 768; // safety cap for huge subnets

/**
 * Run a full scan. `onProgress(phase, detail)` receives human-readable updates.
 * Returns {devices, network, durationMs}.
 */
export async function runScan(onProgress = () => {}) {
  const started = Date.now();

  onProgress('network', 'Reading IP configuration…');
  const net = await getNetworkInfo();
  if (!net) throw new Error('Could not read IP configuration (is PowerShell available?)');
  const hosts = subnetHosts(net.ip, net.prefix, MAX_HOSTS);
  onProgress('network', `${net.alias || 'adapter'} ${net.ip}/${net.prefix}, ${hosts.length} addresses, gateway ${net.gateway ?? 'n/a'}`);

  // 1. Wake the LAN and populate the neighbor (ARP) table.
  onProgress('sweep', `Pinging ${hosts.length} addresses…`);
  const alive = await pingSweep(hosts, {
    concurrency: 64,
    onProgress: (done, total) => onProgress('sweep', `Ping sweep ${done}/${total}`),
  });

  onProgress('arp', 'Reading neighbor (ARP) table…');
  let neighbors = await readNeighbors();
  if (neighbors.size === 0) {
    const { execFile } = await import('./util.js');
    const res = await execFile('arp', ['-a'], { timeout: 10000 });
    const { parseArpA } = await import('./sweep.js');
    neighbors = parseArpA(res.stdout);
  }

  // Presence tiering: ping-alive + fresh neighbors + gateway. The state
  // rules (why Stale/Delay/Probe don't count) live in tiering.js, which is
  // unit-tested — mDNS/SSDP responders join `active` further below.
  const { active, passive, onSubnet } = buildActiveTier({
    alive,
    neighbors,
    gateway: net.gateway,
    ip: net.ip,
    prefix: net.prefix,
  });
  onProgress('arp', `${active.size} live devices found`);

  // 2. Network-wide enrichment in parallel. mDNS/SSDP responders join the
  // active tier even when they ignore ping (phones, smart home gear).
  onProgress('mdns', 'Querying mDNS + SSDP + NetBIOS…');
  const noteErr = (what) => (err) => {
    console.error(`${what} failed:`, err?.message ?? err);
    return new Map();
  };
  const [mdnsMap, ssdpMap] = await Promise.all([
    mdnsDiscover({ timeoutMs: 3500 }).catch(noteErr('mDNS')),
    ssdpDiscover({ timeoutMs: 3500 }).catch(noteErr('SSDP')),
  ]);
  for (const ip of [...mdnsMap.keys(), ...ssdpMap.keys()]) {
    if (onSubnet(ip)) active.add(ip);
  }

  const ips = [...active];
  const nbMap = await netbiosDiscover(ips, { concurrency: 8 }).catch(noteErr('NetBIOS'));

  // 3. Per-host port/HTTP fingerprinting (bounded concurrency, active only).
  onProgress('ports', `Fingerprinting ${ips.length} hosts…`);
  const probes = new Map();
  await pool(ips, 12, async (ip) => {
    try {
      probes.set(ip, await probeHost(ip));
    } catch (err) {
      console.error(`[probe] ${ip} failed: ${err?.message ?? err}`);
      probes.set(ip, { open: [], http: null });
    }
  });

  // 4. Merge everything into device records.
  onProgress('merge', 'Combining results…');
  const devices = [];
  const allIps = new Set([...active, ...mdnsMap.keys(), ...ssdpMap.keys()].filter(onSubnet));
  // Known-but-silent devices are listed too (marked inactive) so the history
  // stays visible without paying enrichment cost for them.
  for (const [ip, info] of passive) {
    if (!allIps.has(ip)) allIps.add(ip);
  }

  for (const ip of allIps) {
    const nb = neighbors.get(ip);
    const mdns = mdnsMap.get(ip) ?? null;
    const ssdp = ssdpMap.get(ip) ?? null;
    const probe = probes.get(ip) ?? { open: [], http: null };
    const mac = nb?.mac ?? null;
    const isActive = active.has(ip);

    // Vendor lookup (MAC only; randomized MACs flagged instead).
    let vendor = null;
    let randomized = false;
    if (mac) {
      const oui = await lookupOuiAsync(mac);
      vendor = oui.vendor;
      randomized = oui.randomized || isRandomized(mac);
    }

    // Hostname priority: NetBIOS > mDNS hostname > SSDP friendlyName.
    const hostname =
      nbMap.get(ip)?.name ||
      (mdns && [...mdns.hostnames][0]) ||
      ssdp?.desc?.friendlyName ||
      null;

    const dev = {
      mac: mac || `ip:${ip}`,
      ip,
      isActive,
      vendor,
      randomized,
      hostname,
      netbios: nbMap.get(ip) ?? null,
      mdns,
      ssdp,
      open: probe.open,
      http: probe.http,
      portHints: PORT_HINTS,
      isGateway: net.gateway === ip,
    };

    const fp = fingerprint(dev);
    dev.type = dev.isGateway ? 'Router / gateway' : fp.type;
    dev.model = fp.model;
    dev.confidence = fp.confidence;
    dev.reasons = fp.reasons;
    dev.services = [...(mdns?.services ?? [])];
    devices.push(dev);
  }

  // Sort: gateway first, then by open ports (more info = likely active), then IP.
  devices.sort((a, b) => {
    if (a.isGateway !== b.isGateway) return a.isGateway ? -1 : 1;
    return a.ip.localeCompare(b.ip, undefined, { numeric: true });
  });

  return {
    devices,
    network: { ...net, swept: hosts.length },
    durationMs: Date.now() - started,
  };
}
