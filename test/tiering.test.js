// Presence-tiering rules — the regression net for the ghost-row bugs:
// Stale must NOT count as present (a Tenda MAC once showed at 3 IPs),
// Delay/Probe are often our own sweep's in-flight ARP probes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildActiveTier, makeOnSubnet, ipToInt, FRESH_STATES, DEAD_STATES } from '../src/tiering.js';

const NET = { ip: '192.168.10.5', prefix: 24 };

const tier = (overrides = {}) =>
  buildActiveTier({ alive: [], neighbors: new Map(), gateway: null, ...NET, ...overrides });

test('ping-alive hosts join the active tier', () => {
  const { active } = tier({ alive: ['192.168.10.7', '192.168.10.9'] });
  assert.ok(active.has('192.168.10.7'));
  assert.ok(active.has('192.168.10.9'));
});

test('alive hosts off the subnet are dropped', () => {
  const { active } = tier({ alive: ['10.0.0.9'] });
  assert.equal(active.size, 0);
});

test('Reachable / Permanent / arp neighbors are active', () => {
  const neighbors = new Map([
    ['192.168.10.7', { mac: 'aa:bb:cc:dd:ee:01', state: 'Reachable' }],
    ['192.168.10.8', { mac: 'aa:bb:cc:dd:ee:02', state: 'Permanent' }],
    ['192.168.10.9', { mac: 'aa:bb:cc:dd:ee:03', state: 'arp' }],
  ]);
  const { active, passive } = tier({ neighbors });
  assert.deepEqual([...active].sort(), ['192.168.10.7', '192.168.10.8', '192.168.10.9']);
  assert.equal(passive.size, 0);
});

test('Stale neighbors are passive, never active (IP-change ghost regression)', () => {
  // One MAC lingering at three old IPs — all Stale — must not be enriched.
  const mac = '08:40:f3:46:c4:d8';
  const neighbors = new Map([
    ['192.168.10.7', { mac, state: 'Stale' }],
    ['192.168.10.12', { mac, state: 'Stale' }],
    ['192.168.10.22', { mac, state: 'Stale' }],
  ]);
  const { active, passive } = tier({ neighbors });
  assert.equal(active.size, 0, 'Stale must not be active');
  assert.equal(passive.size, 3, 'Stale stays listed as passive history');
});

test('Delay / Probe neighbors are passive, never active (own-probe regression)', () => {
  const neighbors = new Map([
    ['192.168.10.7', { mac: 'aa:bb:cc:dd:ee:01', state: 'Delay' }],
    ['192.168.10.8', { mac: 'aa:bb:cc:dd:ee:02', state: 'Probe' }],
  ]);
  const { active, passive } = tier({ neighbors });
  assert.equal(active.size, 0);
  assert.equal(passive.size, 2);
});

test('Unreachable / Incomplete ghosts are excluded from BOTH tiers', () => {
  const neighbors = new Map([
    ['192.168.10.7', { mac: 'aa:bb:cc:dd:ee:01', state: 'Unreachable' }],
    ['192.168.10.8', { mac: '', state: 'Incomplete' }],
    ['192.168.10.9', { mac: 'aa:bb:cc:dd:ee:03', state: 'Incomplete' }],
  ]);
  const { active, passive } = tier({ neighbors });
  assert.equal(active.size, 0);
  assert.equal(passive.size, 0);
});

test('neighbor without a MAC is dropped', () => {
  const neighbors = new Map([['192.168.10.7', { mac: '', state: 'Reachable' }]]);
  const { active, passive } = tier({ neighbors });
  assert.equal(active.size, 0);
  assert.equal(passive.size, 0);
});

test('off-subnet neighbor is ignored even when Reachable', () => {
  const neighbors = new Map([['10.189.215.193', { mac: 'aa:bb:cc:dd:ee:01', state: 'Reachable' }]]);
  const { active, passive } = tier({ neighbors });
  assert.equal(active.size, 0);
  assert.equal(passive.size, 0);
});

test('gateway is always in the active tier', () => {
  const { active } = tier({ gateway: '192.168.10.1' });
  assert.ok(active.has('192.168.10.1'));
});

test('mixed input produces the expected union', () => {
  const neighbors = new Map([
    ['192.168.10.1', { mac: 'aa:bb:cc:dd:ee:01', state: 'Reachable' }],
    ['192.168.10.2', { mac: 'aa:bb:cc:dd:ee:02', state: 'Stale' }],
    ['192.168.10.3', { mac: 'aa:bb:cc:dd:ee:03', state: 'Unreachable' }],
  ]);
  const { active, passive } = tier({
    alive: ['192.168.10.4'],
    neighbors,
    gateway: '192.168.10.1',
  });
  assert.deepEqual([...active].sort(), ['192.168.10.1', '192.168.10.4']);
  assert.deepEqual([...passive.keys()], ['192.168.10.2']);
});

test('makeOnSubnet: /24 boundaries and /0', () => {
  const in24 = makeOnSubnet('192.168.10.5', 24);
  assert.ok(in24('192.168.10.0'));
  assert.ok(in24('192.168.10.255'));
  assert.ok(!in24('192.168.11.1'));
  assert.ok(!in24('10.0.0.1'));

  const in16 = makeOnSubnet('172.16.5.9', 16);
  assert.ok(in16('172.16.255.254'));
  assert.ok(!in16('172.17.0.1'));

  const any = makeOnSubnet('10.1.2.3', 0);
  assert.ok(any('8.8.8.8'));
});

test('ipToInt is an unsigned 32-bit value', () => {
  assert.equal(ipToInt('0.0.0.0'), 0);
  assert.equal(ipToInt('255.255.255.255'), 4294967295);
  assert.equal(ipToInt('192.168.10.5'), 3232238085);
});

test('state sets document the contract', () => {
  assert.ok(FRESH_STATES.has('Reachable') && FRESH_STATES.has('Permanent') && FRESH_STATES.has('arp'));
  assert.ok(DEAD_STATES.has('Unreachable') && DEAD_STATES.has('Incomplete'));
  assert.ok(!FRESH_STATES.has('Stale'));
});
