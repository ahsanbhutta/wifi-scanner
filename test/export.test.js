// CSV/JSON export formatting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvEscape, toCsv, toJson } from '../src/export.js';

const ROW = {
  mac: '08:40:f3:46:c4:d8',
  last_ip: '192.168.10.12',
  vendor: 'TendaTechnology',
  hostname: null,
  type: 'Unknown',
  model: null,
  confidence: 'low',
  first_seen: 1700000000000,
  last_seen: 1700003600000,
  notes: 'kitchen, "the router"',
};

test('csvEscape passes plain values through untouched', () => {
  assert.equal(csvEscape('hello'), 'hello');
  assert.equal(csvEscape(42), '42');
});

test('csvEscape quotes commas, quotes, and newlines (RFC 4180)', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
});

test('toCsv starts with the expected header row', () => {
  const csv = toCsv([]);
  const header = csv.split('\r\n')[0];
  assert.equal(
    header,
    'mac,ip,vendor,hostname,type,model,confidence,first_seen,last_seen,notes',
  );
});

test('toCsv uses CRLF line endings and a trailing newline', () => {
  const csv = toCsv([ROW]);
  assert.ok(csv.endsWith('\r\n'));
  assert.equal(csv.split('\r\n').filter(Boolean).length, 2); // header + 1 row
});

test('toCsv escapes tricky field values', () => {
  const csv = toCsv([ROW]);
  const rowLine = csv.split('\r\n')[1];
  assert.ok(rowLine.includes('"kitchen, ""the router"""'));
  assert.ok(rowLine.includes('08:40:f3:46:c4:d8'));
  assert.ok(rowLine.includes(new Date(1700000000000).toISOString()));
});

test('toJson round-trips with metadata and mapped field names', () => {
  const data = JSON.parse(toJson([ROW]));
  assert.equal(data.tool, 'wifi-scanner');
  assert.equal(data.count, 1);
  assert.equal(data.devices[0].ip, '192.168.10.12');
  assert.equal(data.devices[0].firstSeen, new Date(1700000000000).toISOString());
  assert.equal(data.devices[0].lastSeen, new Date(1700003600000).toISOString());
  assert.equal(data.devices[0].hostname, null);
  assert.ok(typeof data.exportedAt === 'string');
});

test('toJson handles missing optional fields', () => {
  const data = JSON.parse(toJson([{ mac: 'aa:bb:cc:dd:ee:ff' }]));
  assert.equal(data.devices[0].ip, null);
  assert.equal(data.devices[0].firstSeen, null);
});
