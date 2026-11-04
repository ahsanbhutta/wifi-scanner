// Device-list export (CSV / JSON) for the dashboard's download buttons.
// Pure functions — unit-tested; no I/O.

const COLUMNS = [
  ['mac', (d) => d.mac],
  ['ip', (d) => d.last_ip],
  ['vendor', (d) => d.vendor],
  ['hostname', (d) => d.hostname],
  ['type', (d) => d.type],
  ['model', (d) => d.model],
  ['confidence', (d) => d.confidence],
  ['first_seen', (d) => iso(d.first_seen)],
  ['last_seen', (d) => iso(d.last_seen)],
  ['notes', (d) => d.notes],
];

function iso(ts) {
  return ts ? new Date(Number(ts)).toISOString() : '';
}

/** Quote a CSV field only when it needs it (comma, quote, newline). */
export function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180-style CSV with a header row (CRLF line endings). */
export function toCsv(devices) {
  const lines = [COLUMNS.map(([h]) => h).join(',')];
  for (const d of devices) {
    lines.push(COLUMNS.map(([, get]) => csvEscape(get(d))).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** JSON export with metadata (tool, timestamp, count). */
export function toJson(devices) {
  return JSON.stringify(
    {
      tool: 'wifi-scanner',
      exportedAt: new Date().toISOString(),
      count: devices.length,
      devices: devices.map((d) => ({
        mac: d.mac,
        ip: d.last_ip ?? null,
        vendor: d.vendor ?? null,
        hostname: d.hostname ?? null,
        type: d.type ?? null,
        model: d.model ?? null,
        confidence: d.confidence ?? null,
        firstSeen: iso(d.first_seen) || null,
        lastSeen: iso(d.last_seen) || null,
        notes: d.notes ?? null,
      })),
    },
    null,
    2,
  );
}
