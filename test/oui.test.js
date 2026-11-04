// OUI parsing, randomized-MAC detection, and vendor lookup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseManuf, isRandomized, lookupOui } from '../src/oui.js';

const SAMPLE = [
  '# Wireshark manuf sample',
  '00:1A:11\tGoogle, Inc.',
  '3c:22:fb\tApple, Inc.',
  'f4:12:34:56\tMA-M Block Vendor',
  'bad line without tab',
  'not-a-mac\tSome Vendor',
  '00:1b:63\t',
  '',
].join('\n');

test('parseManuf reads tab-separated prefixes, lowercases them', () => {
  const map = parseManuf(SAMPLE);
  assert.equal(map.get('00:1a:11'), 'Google, Inc.');
  assert.equal(map.get('3c:22:fb'), 'Apple, Inc.');
});

test('parseManuf accepts 4-octet (MA-M) prefixes', () => {
  const map = parseManuf(SAMPLE);
  assert.equal(map.get('f4:12:34:56'), 'MA-M Block Vendor');
});

test('parseManuf skips comments, malformed lines, and empty vendors', () => {
  const map = parseManuf(SAMPLE);
  assert.equal(map.size, 3);
  assert.ok(!map.has('not-a-mac'));
  assert.ok(!map.has('bad line without tab'));
});

test('isRandomized flags locally-administered MACs (bit 0x02)', () => {
  assert.equal(isRandomized('02:00:00:00:00:01'), true);
  assert.equal(isRandomized('f2:37:92:9a:49:a1'), true); // modern phone
  assert.equal(isRandomized('00:1a:11:22:33:44'), false); // real OUI
  assert.equal(isRandomized('3c:22:fb:aa:bb:cc'), false); // Apple
});

test('lookupOui resolves a known OUI from the fallback table (no init needed)', () => {
  const r = lookupOui('00:1a:11:22:33:44');
  assert.equal(r.vendor, 'Google, Inc.');
  assert.equal(r.randomized, false);
});

test('lookupOui short-circuits randomized MACs before the table', () => {
  const r = lookupOui('f2:37:92:9a:49:a1');
  assert.equal(r.randomized, true);
  assert.equal(r.vendor, 'Randomized (private MAC)');
  assert.equal(r.source, 'ieee-locally-administered');
});

test('lookupOui returns null vendor for unknown OUIs', () => {
  // first octet 0x10: globally administered (bit 0x02 clear), not in any table
  const r = lookupOui('10:22:33:44:55:66');
  assert.equal(r.vendor, null);
  assert.equal(r.randomized, false);
});

test('lookupOui rejects malformed MACs', () => {
  const r = lookupOui('1:2');
  assert.equal(r.vendor, null);
  assert.equal(r.source, 'none');
});
