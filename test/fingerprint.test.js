// Fingerprint heuristics: evidence -> device type + model + confidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint } from '../src/fingerprint.js';

test('no evidence at all -> Unknown / none', () => {
  const r = fingerprint({});
  assert.equal(r.type, 'Unknown');
  assert.equal(r.confidence, 'none');
  assert.equal(r.model, null);
  assert.deepEqual(r.reasons, []);
});

test('randomized MAC with no other evidence -> Unknown (randomized MAC)', () => {
  const r = fingerprint({ vendor: 'Randomized (private MAC)', randomized: true });
  assert.equal(r.type, 'Unknown (randomized MAC)');
  assert.equal(r.confidence, 'none');
});

test('mDNS _adb service -> Android device, high', () => {
  const r = fingerprint({ mdns: { services: ['_adb._tcp'] } });
  assert.equal(r.type, 'Android device');
  assert.equal(r.confidence, 'high');
  assert.ok(r.reasons.includes('mDNS service _adb._tcp'));
});

test('mDNS _airplay service -> Apple AirPlay device, high', () => {
  const r = fingerprint({ mdns: { services: ['_airplay._tcp'] } });
  assert.equal(r.type, 'Apple AirPlay device');
  assert.equal(r.confidence, 'high');
});

test('hostname DESKTOP-* -> Windows PC, high', () => {
  const r = fingerprint({ mdns: { hostnames: ['DESKTOP-KITCHEN'] } });
  assert.equal(r.type, 'Windows PC');
  assert.equal(r.confidence, 'high');
  assert.ok(r.reasons.includes('hostname "DESKTOP-KITCHEN"'));
});

test('hostname via NetBIOS name counts too', () => {
  const r = fingerprint({ netbios: { name: 'WIN-OFFICE' } });
  assert.equal(r.type, 'Windows PC');
});

test('SSDP device description -> exact model + high confidence', () => {
  const r = fingerprint({
    ssdp: { desc: { manufacturer: 'ZTE', modelName: 'ZXHN H168N', modelNumber: 'V3.5' } },
  });
  assert.equal(r.model, 'ZTE ZXHN H168N V3.5');
  assert.equal(r.type, 'ZTE ZXHN H168N');
  assert.equal(r.confidence, 'high');
  assert.ok(r.reasons.includes('UPnP device description'));
});

test('open port with a known hint -> Printer, high', () => {
  const r = fingerprint({ open: [9100], portHints: { 9100: 'printer' } });
  assert.equal(r.type, 'Printer');
  assert.equal(r.confidence, 'high');
  assert.ok(r.reasons.includes('port 9100 open'));
});

test('vendor OUI fallback is low confidence', () => {
  const r = fingerprint({ vendor: 'Apple, Inc.' });
  assert.equal(r.type, 'Apple device');
  assert.equal(r.confidence, 'low');
  assert.ok(r.reasons.includes('vendor OUI: Apple, Inc.'));
});

test('high-confidence evidence beats a low vendor guess', () => {
  const r = fingerprint({
    mdns: { services: ['_airplay._tcp'] },
    vendor: 'Apple, Inc.',
  });
  assert.equal(r.type, 'Apple AirPlay device', 'service evidence must win over OUI');
  assert.equal(r.confidence, 'high');
});

test('HTTP title -> medium candidate and model fallback', () => {
  const r = fingerprint({ http: { title: 'TP-LINK Wireless Router', port: 80 } });
  assert.equal(r.confidence, 'medium');
  assert.equal(r.model, 'TP-LINK Wireless Router');
  assert.ok(r.reasons.includes('HTTP 80 title'));
});

test('mDNS TXT model hint supplies the model', () => {
  const r = fingerprint({
    mdns: { txts: [{ type: '_hap', txt: { model: 'Eve Energy 20EBO123' } }] },
  });
  assert.equal(r.model, 'Eve Energy 20EBO123');
});

test('duplicate reasons are deduplicated', () => {
  const r = fingerprint({ mdns: { services: ['_adb._tcp', '_adb._tcp'] } });
  const hits = r.reasons.filter((x) => x === 'mDNS service _adb._tcp');
  assert.equal(hits.length, 1);
});

test('printer hostname pattern matches', () => {
  const r = fingerprint({ hostname: 'HP-LaserJet-400' });
  assert.equal(r.type, 'Printer');
  assert.equal(r.confidence, 'high');
});
