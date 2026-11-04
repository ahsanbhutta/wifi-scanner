// Active TCP fingerprinting: probe a small set of service ports and grab HTTP
// headers/title where available. Yields device *type* hints (camera, printer,
// router, console...) even when the vendor/model is unknown.
import net from 'node:net';
import tls from 'node:tls';

// Well-known ports chosen for identification value, not completeness.
export const PORTS = [
  21, 22, 23, 53, 80, 135, 139, 443, 445, 548, 554, 631, 9100, 5000, 5060,
  5353, 62078, 8008, 8009, 8080, 8443, 8888, 9100, 9222, 32400, 50389,
];

// Port -> device-type hint used by the fingerprint heuristics.
export const PORT_HINTS = {
  22: 'ssh',
  23: 'telnet',
  554: 'rtsp-streamer',
  631: 'printer',
  9100: 'printer',
  445: 'windows',
  135: 'windows',
  139: 'windows',
  548: 'apple-file',
  62078: 'iphone-lockdown',
  8008: 'chromecast',
  8009: 'chromecast',
  32400: 'plex',
  9222: 'chrome-debug',
  5060: 'sip-phone',
  5353: 'mdns',
};

function tcpProbe(ip, port, timeout = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, ip);
  });
}

async function httpGrab(ip, port, timeout = 1500) {
  const tlsMode = port === 443 || port === 8443;
  return new Promise((resolve) => {
    let socket;
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      try { socket?.destroy(); } catch { /* ignore */ }
      resolve(val);
    };
    try {
      if (tlsMode) {
        socket = tls.connect({ host: ip, port, rejectUnauthorized: false, servername: undefined, timeout });
      } else {
        socket = net.connect({ host: ip, port, timeout });
      }
    } catch {
      resolve(null);
      return;
    }
    socket.setTimeout(timeout, () => done(null));
    socket.once('error', () => done(null));
    socket.once('connect', () => {
      socket.write(`GET / HTTP/1.1\r\nHost: ${ip}\r\nUser-Agent: wifi-scanner/1.0\r\nConnection: close\r\n\r\n`);
    });
    let buf = '';
    socket.on('data', (d) => {
      buf += d.toString('utf8');
      if (buf.length > 8192 || /\r\n\r\n/.test(buf)) {
        const [head] = buf.split(/\r\n\r\n/);
        const server = head.match(/^server:\s*(.+)$/im)?.[1]?.trim() || null;
        const powered = head.match(/^x-powered-by:\s*(.+)$/im)?.[1]?.trim() || null;
        const title = buf.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim() || null;
        const status = head.match(/^HTTP\/1\.[01]\s+(\d{3})/)?.[1] || null;
        done({ server, powered, title, status });
      }
    });
    socket.once('end', () => {
      if (!settled) {
        const [head] = buf.split(/\r\n\r\n/);
        const server = head?.match(/^server:\s*(.+)$/im)?.[1]?.trim() || null;
        const title = buf.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim() || null;
        done(buf ? { server, powered: null, title, status: null } : null);
      }
    });
  });
}

/**
 * Scan ports for one host. Returns {open:[], http:{port,server,powered,title}|null}.
 * An all-empty result is retried once: WiFi power-save can swallow a whole
 * burst of SYNs, which otherwise makes an active device look port-dead.
 */
export async function probeHost(ip, { ports = PORTS } = {}) {
  let res = await probeOnce(ip, ports);
  if (res.open.length === 0 && res.http === null) {
    await new Promise((r) => setTimeout(r, 250));
    res = await probeOnce(ip, ports);
  }
  return res;
}

async function probeOnce(ip, ports) {
  const unique = [...new Set(ports)];
  const results = await Promise.all(
    unique.map((p) => tcpProbe(ip, p)),
  );
  const open = unique.filter((p, i) => results[i]);

  let http = null;
  for (const p of [80, 443, 8080, 8443]) {
    if (open.includes(p)) {
      http = await httpGrab(ip, p);
      if (http) { http.port = p; break; }
    }
  }
  return { open, http };
}
