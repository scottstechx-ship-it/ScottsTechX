/**
 * Database backups.
 *
 * A snapshot is a real, self-contained SQLite file produced with
 * `VACUUM INTO` — a consistent copy taken while the server keeps running
 * (no lock, no downtime, WAL included). It can be opened directly, or
 * restored with `npm run restore -- <file>`.
 *
 * Snapshots land in <DATA_DIR>/backups and the oldest ones are pruned so the
 * folder never grows without bound.
 */
const fs = require('fs');
const path = require('path');
const { db } = require('../database/db');
const env = require('../config/env');

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Take a snapshot now. Returns the file path, or null on failure. */
function backupNow(label = '') {
  try {
    fs.mkdirSync(env.BACKUP_DIR, { recursive: true });
    const safe = String(label || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
    const name = `school-${stamp()}${safe ? '-' + safe : ''}.db`;
    const target = path.join(env.BACKUP_DIR, name);
    if (/'/.test(target)) return null;
    // VACUUM INTO writes a compacted, transaction-consistent copy.
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    prune();
    return target;
  } catch (e) {
    // A failed backup must never take the server down.
    console.error('[Backup] failed:', e.message);
    return null;
  }
}

/** List snapshots, newest first. */
function listBackups() {
  try {
    return fs.readdirSync(env.BACKUP_DIR)
      .filter((f) => /^school-.*\.db$/.test(f))
      .map((f) => {
        const full = path.join(env.BACKUP_DIR, f);
        const st = fs.statSync(full);
        return { name: f, path: full, size: st.size, created_at: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  } catch { return []; }
}

/** Keep only the newest BACKUP_KEEP snapshots. */
function prune() {
  const keep = Math.max(1, env.BACKUP_KEEP);
  const all = listBackups();
  for (const old of all.slice(keep)) {
    try { fs.unlinkSync(old.path); } catch { /* ignore */ }
  }
}

let timer = null;
/** Start the rolling backup job. */
function startBackupInterval() {
  if (timer) return timer;
  const everyMs = Math.max(0.25, env.BACKUP_EVERY_HOURS) * 60 * 60 * 1000;
  timer = setInterval(() => {
    const file = backupNow('auto');
    if (file) console.log(`[Backup] snapshot saved -> ${file}`);
  }, everyMs);
  if (timer.unref) timer.unref();
  // one snapshot as soon as the server is up, so there is always a restore point
  const first = backupNow('startup');
  if (first) console.log(`[Backup] snapshot saved -> ${first}`);
  return timer;
}

module.exports = { backupNow, listBackups, prune, startBackupInterval };
