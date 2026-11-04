// mDNS/DNS-SD discovery: ask for common service types, collect responders.
// Answers give: hostname (e.g. "Sarahs-iPhone"), model hints from TXT records,
// and service types (airplay, chromecast, smb, ipp/printer, hap/homekit...).
import createMdns from 'multicast-dns';

const SERVICE_TYPES = [
  '_googlecast._tcp.local', // Chromecast / Google TV
  '_airplay._tcp.local', // AirPlay
  '_raop._tcp.local', // AirPlay audio
  '_companion-link._tcp.local', // Apple devices
  '_smb._tcp.local', // Windows file sharing
  '_workstation._tcp.local',
  '_http._tcp.local',
  '_https._tcp.local',
  '_ipp._tcp.local', // printers
  '_ipps._tcp.local',
  '_pdl-datastream._tcp.local',
  '_printer._tcp.local',
  '_hap._tcp.local', // HomeKit accessories
  '_adb._tcp.local', // Android debug bridge
  '_mediarouter._tcp.local', // Google Home
  '_spotify-connect._tcp.local',
  '_sonos._tcp.local',
  '_nvstream._tcp.local',
  '_rtsp._tcp.local',
  '_rfb._tcp.local', // VNC
  '_ssh._tcp.local',
  '_sftp-ssh._tcp.local',
  '_companion-link._tcp.local',
  '_amzn-wplay._tcp.local', // Amazon devices
  '_matter._tcp.local',
  '_axis-video._tcp.local',
  '_dlna-device-info._tcp.local',
  '_mi-connect._tcp.local', // Xiaomi
];

function txtToObject(data) {
  if (!data) return {};
  if (typeof data === 'object' && !Buffer.isBuffer(data) && !Array.isArray(data)) return data;
  const out = {};
  const arr = Array.isArray(data) ? data : [data];
  for (const item of arr) {
    const s = Buffer.isBuffer(item) ? item.toString('utf8') : String(item);
    const i = s.indexOf('=');
    if (i > 0) out[s.slice(0, i).toLowerCase()] = s.slice(i + 1);
  }
  return out;
}

/**
 * Query mDNS for `timeoutMs`. Returns Map<ip, {hostnames:Set, services:Set, txts:[{type,txt}]}>.
 * Also resolves hostnames for IPs seen in A records.
 */
export async function mdnsDiscover({ timeoutMs = 3500 } = {}) {
  return new Promise((resolve) => {
    const mdns = createMdns();
    const byIp = new Map(); // ip -> record
    const nameToIp = new Map(); // lowercase hostname -> ip

    // A socket error must reject (and not crash the process via EventEmitter).
    let rejectFn = null;
    const failure = new Promise((_, rej) => { rejectFn = rej; });
    mdns.on('error', (err) => rejectFn?.(err));

    const rec = (ip) => {
      if (!byIp.has(ip)) byIp.set(ip, { hostnames: new Set(), services: new Set(), txts: [] });
      return byIp.get(ip);
    };

    function handleAnswers(answers, ipHint) {
      for (const a of answers || []) {
        const ip = ipHint;
        if (a.type === 'A' && ip) {
          const host = String(a.name || '').replace(/\.local$/i, '');
          if (host) nameToIp.set(host.toLowerCase(), ip);
          continue;
        }
        if (!ip) continue;
        if (a.type === 'PTR') {
          const name = String(a.data || a.name || '');
          const svc = name.match(/(_[a-z0-9-]+)\._(?:tcp|udp)\.local$/i);
          if (svc) rec(ip).services.add(svc[1].toLowerCase());
          continue;
        }
        if (a.type === 'TXT' || a.type === 'SRV') {
          const name = String(a.name || '');
          const svc = name.match(/(_[a-z0-9-]+)\._(?:tcp|udp)\.local$/i);
          if (a.type === 'TXT' && svc) {
            rec(ip).txts.push({ type: svc[1].toLowerCase(), txt: txtToObject(a.data) });
          }
          if (a.type === 'SRV' && a.data?.target) {
            const host = String(a.data.target).replace(/\.local$/i, '');
            if (host) nameToIp.set(host.toLowerCase(), ip);
          }
        }
      }
    }

    mdns.on('response', (response, rinfo) => {
      const ip = rinfo?.address;
      if (!ip || ip.startsWith('224.') || ip.startsWith('239.')) return;
      handleAnswers(response.answers, ip);
      handleAnswers(response.additionals, ip);
    });

    const questions = SERVICE_TYPES.map((name) => ({ name, type: 'PTR' }));
    mdns.query({ questions });
    // Repeat waves catch slow/waking responders (phones, IoT in power-save).
    // Send the FULL list each time — the first wave's reply can be lost, and
    // types like _adb/_hap sit past any arbitrary prefix cut.
    const requery = setTimeout(() => {
      try { mdns.query({ questions }); } catch { /* closed */ }
    }, 1200);
    const requery2 = setTimeout(() => {
      try { mdns.query({ questions }); } catch { /* closed */ }
    }, 2400);

    setTimeout(() => {
      clearTimeout(requery);
      clearTimeout(requery2);
      try { mdns.destroy(); } catch { /* already destroyed */ }
      // Merge A-record hostnames into IP records.
      for (const [host, ip] of nameToIp) {
        const r = rec(ip);
        if (host && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) r.hostnames.add(host);
      }
      const out = new Map();
      for (const [ip, r] of byIp) {
        if (r.hostnames.size || r.services.size || r.txts.length) out.set(ip, r);
      }
      resolve(out);
    }, timeoutMs);
  });
}
