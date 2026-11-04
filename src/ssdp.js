// SSDP/UPnP discovery: M-SEARCH multicast, then fetch each device description
// XML for exact manufacturer/model/modelNumber. Great for TVs, streaming sticks,
// consoles and routers.
import dgram from 'node:dgram';

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;

function buildSearch(st) {
  return [
    'M-SEARCH * HTTP/1.1',
    `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
    'MAN: "ssdp:discover"',
    'MX: 2',
    `ST: ${st}`,
    'USER-Agent: wifi-scanner/1.0',
    '',
    '',
  ].join('\r\n');
}

function parseHeaders(buf) {
  const text = buf.toString('utf8');
  const lines = text.split(/\r?\n/);
  const headers = {};
  for (const line of lines.slice(1)) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return headers;
}

function xmlTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

async function fetchDescription(location, timeoutMs = 2500) {
  const res = await fetch(location, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return null;
  const xml = await res.text();
  if (!xml.includes('<')) return null;
  return {
    friendlyName: xmlTag(xml, 'friendlyName'),
    manufacturer: xmlTag(xml, 'manufacturer'),
    modelName: xmlTag(xml, 'modelName'),
    modelNumber: xmlTag(xml, 'modelNumber'),
    modelDescription: xmlTag(xml, 'modelDescription'),
    udn: xmlTag(xml, 'UDN'),
    serialNumber: xmlTag(xml, 'serialNumber'),
  };
}

/**
 * Discover UPnP/SSDP devices on the LAN.
 * Returns Map<ip, {server, locations:[], desc}>
 */
export async function ssdpDiscover({ timeoutMs = 3500 } = {}) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const found = new Map();

    const finish = async () => {
      try { sock.close(); } catch { /* already closed */ }
      // Fetch descriptions in parallel for exact model info.
      await Promise.all([...found.entries()].map(async ([ip, rec]) => {
        for (const loc of rec.locations) {
          try {
            const desc = await fetchDescription(loc);
            if (desc && (desc.modelName || desc.manufacturer)) { rec.desc = desc; break; }
          } catch { /* try next */ }
        }
      }));
      resolve(found);
    };

    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; finish(); } }, timeoutMs);

    sock.on('error', () => { if (!done) { done = true; clearTimeout(timer); finish(); } });
    sock.on('message', (msg, rinfo) => {
      const ip = rinfo.address;
      if (!ip || ip.startsWith('224.') || ip.startsWith('239.')) return;
      const h = parseHeaders(msg);
      const location = h.location;
      if (!location) return;
      if (!found.has(ip)) found.set(ip, { server: h.server || '', locations: [], desc: null });
      const rec = found.get(ip);
      if (!rec.server && h.server) rec.server = h.server;
      if (!rec.locations.includes(location) && rec.locations.length < 3) rec.locations.push(location);
    });

    sock.bind(() => {
      try { sock.setBroadcast(true); } catch { /* not fatal */ }
      const payload = Buffer.from(buildSearch('ssdp:all'));
      // Two bursts improve reliability.
      sock.send(payload, 0, payload.length, SSDP_PORT, SSDP_ADDR);
      setTimeout(() => {
        if (!done) {
          try { sock.send(payload, 0, payload.length, SSDP_PORT, SSDP_ADDR); } catch { /* ignore */ }
        }
      }, 700);
    });
  });
}
