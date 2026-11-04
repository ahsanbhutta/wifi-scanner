// Presence tiering: decide which IPs get expensive enrichment (NetBIOS,
// port probes). Pure module — no I/O — so the rules are unit-testable.
//
// Rationale for the state rules: Stale lingers for hours after a device
// changes IP (one Tenda MAC was seen at three IPs at once), and Delay/Probe
// are often our own sweep's in-flight ARP probes — treating either as
// "present" produces ghost rows. Only Reachable/Permanent/arp (plus ping
// replies and mDNS/SSDP responders, added by the caller) count as alive.

/** Neighbor states that are solid evidence a device is present. */
export const FRESH_STATES = new Set(['Reachable', 'Permanent', 'arp']);

/** States that mean "known but dead" — excluded from both tiers. */
export const DEAD_STATES = new Set(['Unreachable', 'Incomplete']);

/** Dotted IPv4 -> unsigned 32-bit int. */
export function ipToInt(ip) {
  return String(ip)
    .split('.')
    .reduce((a, o) => (a << 8) + (Number(o) & 255), 0) >>> 0;
}

/** Predicate: is `ip` inside `networkIp/prefix`? (prefix 0 = everything) */
export function makeOnSubnet(networkIp, prefix) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const base = ipToInt(networkIp) & mask;
  return (ip) => (ipToInt(ip) & mask) === base;
}

/**
 * Build the active/passive tiers for a scan.
 *
 * @param {object} p
 * @param {Iterable<string>} p.alive  IPs that answered the ping sweep
 * @param {Map<string, {mac: string, state: string}>} p.neighbors ARP table
 * @param {string|null} [p.gateway]   forced into the active tier
 * @param {string} p.ip               local IPv4 address
 * @param {number} p.prefix           subnet prefix length
 * @returns {{active: Set<string>, passive: Map<string, object>,
 *            onSubnet: (ip: string) => boolean}}
 */
export function buildActiveTier({ alive = [], neighbors = new Map(), gateway = null, ip, prefix }) {
  const onSubnet = makeOnSubnet(ip, prefix);

  // Active tier: ping-alive + freshly-confirmed neighbors + gateway.
  const active = new Set([...alive].filter(onSubnet));
  const passive = new Map(); // ip -> neighbor info (known but not confirmed live)

  for (const [nip, info] of neighbors) {
    if (!info.mac || !onSubnet(nip)) continue; // ghost / off-subnet entries
    if (FRESH_STATES.has(info.state)) active.add(nip);
    else if (!DEAD_STATES.has(info.state)) passive.set(nip, info);
  }

  if (gateway) active.add(gateway);
  return { active, passive, onSubnet };
}
