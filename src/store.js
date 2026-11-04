// Persistent device store using Node's built-in node:sqlite (no native deps).
// Keeps first/last seen, user notes, and a known-device baseline so the UI can
// flag "new device" alerts.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

const DB_PATH = path.join(DATA_DIR, 'devices.db');

let db = null;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      mac            TEXT PRIMARY KEY,
      vendor         TEXT,
      first_seen     INTEGER NOT NULL,
      last_seen      INTEGER NOT NULL,
      last_ip        TEXT,
      hostname       TEXT,
      type           TEXT,
      model          TEXT,
      confidence     TEXT,
      notes          TEXT DEFAULT '',
      ignore         INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sightings (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      mac      TEXT NOT NULL,
      ts       INTEGER NOT NULL,
      ip       TEXT,
      hostname TEXT,
      type     TEXT,
      model    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sightings_mac ON sightings(mac);
  `);
  return db;
}

/** Merge a scan result into the store. Returns {mac, isNew, ...} rows. */
export function upsertScan(devices, ts = Date.now()) {
  const d = getDb();
  const select = d.prepare('SELECT mac, first_seen, ignore FROM devices WHERE mac = ?');
  const insert = d.prepare(`
    INSERT INTO devices (mac, vendor, first_seen, last_seen, last_ip, hostname, type, model, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(mac) DO UPDATE SET
      last_seen = excluded.last_seen,
      last_ip   = COALESCE(excluded.last_ip, devices.last_ip),
      vendor    = COALESCE(excluded.vendor, devices.vendor),
      hostname  = COALESCE(excluded.hostname, devices.hostname),
      type      = COALESCE(excluded.type, devices.type),
      model     = COALESCE(excluded.model, devices.model),
      confidence= COALESCE(excluded.confidence, devices.confidence)
  `);
  const sighting = d.prepare(
    'INSERT INTO sightings (mac, ts, ip, hostname, type, model) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const out = [];
  for (const dev of devices) {
    const existing = select.get(dev.mac);
    const isNew = !existing;
    d.exec('BEGIN');
    try {
      insert.run(
        dev.mac, dev.vendor ?? null, isNew ? ts : existing.first_seen, ts,
        dev.ip ?? null, dev.hostname ?? null, dev.type ?? null,
        dev.model ?? null, dev.confidence ?? null,
      );
      sighting.run(dev.mac, ts, dev.ip ?? null, dev.hostname ?? null, dev.type ?? null, dev.model ?? null);
      d.exec('COMMIT');
    } catch (err) {
      d.exec('ROLLBACK');
      throw err;
    }
    out.push({ mac: dev.mac, isNew });
  }
  return out;
}

/** Full device rows for the UI, newest activity first. */
export function listDevices({ limit = 500 } = {}) {
  const d = getDb();
  return d.prepare(`
    SELECT mac, vendor, first_seen, last_seen, last_ip, hostname, type, model,
           confidence, notes, ignore
    FROM devices
    WHERE ignore = 0
    ORDER BY last_seen DESC
    LIMIT ?
  `).all(limit);
}

/** Macs seen for the first time within `sinceMs` (new-device alerts). */
export function recentNew(sinceMs = 24 * 3600 * 1000) {
  const d = getDb();
  return d.prepare(`
    SELECT mac, vendor, hostname, type, model, first_seen, last_ip
    FROM devices
    WHERE first_seen >= ? AND ignore = 0
    ORDER BY first_seen DESC
  `).all(Date.now() - sinceMs);
}

export function setNotes(mac, notes) {
  getDb().prepare('UPDATE devices SET notes = ? WHERE mac = ?').run(notes, mac);
}

export function setIgnore(mac, ignore) {
  getDb().prepare('UPDATE devices SET ignore = ? WHERE mac = ?').run(ignore ? 1 : 0, mac);
}

/** Recent sightings for one device (timeline). */
export function history(mac, limit = 50) {
  return getDb().prepare(
    'SELECT ts, ip, hostname, type, model FROM sightings WHERE mac = ? ORDER BY ts DESC LIMIT ?',
  ).all(mac, limit);
}
