/**
 * Database singleton (better-sqlite3).
 * Opens the SQLite file, applies the schema, and exposes small helpers.
 * All queries in the app use prepared statements -> SQL injection safe.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = require('../config/env');

fs.mkdirSync(path.dirname(env.DATABASE_PATH), { recursive: true });
fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });

const db = new Database(env.DATABASE_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ---- migrations (idempotent) ------------------------------------------
/**
 * Add a column to an existing table if it doesn't exist yet.
 */
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

ensureColumn('documents', 'expire_date', 'TEXT');
ensureColumn('announcements', 'expire_date', 'TEXT');

/** conversations.type gained 'broadcast' and 'channel' — rebuild if old CHECK. */
function migrateConversationsType() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='conversations'").get();
  if (row && row.sql && row.sql.includes('broadcast') && row.sql.includes('channel')) return; // already current
  db.pragma('foreign_keys = OFF');
  const doMigrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE conversations_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        type       TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct','group','class','broadcast','channel')),
        title      TEXT,
        class_id   INTEGER REFERENCES classes(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO conversations_new (id, type, title, class_id, created_by, created_at)
        SELECT id, type, title, class_id, created_by, created_at FROM conversations;
      DROP TABLE conversations;
      ALTER TABLE conversations_new RENAME TO conversations;
    `);
  });
  doMigrate();
  db.pragma('foreign_keys = ON');
}
migrateConversationsType();

// conversation_participants: archiving + muting
ensureColumn('conversation_participants', 'archived', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('conversation_participants', 'muted', 'INTEGER NOT NULL DEFAULT 0');

// messages: editing support
ensureColumn('messages', 'edited', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('messages', 'updated_at', 'TEXT');

// ---- upgrade: registration / verification / forced password change ----
ensureColumn('users', 'registration_status', "TEXT NOT NULL DEFAULT 'approved' CHECK (registration_status IN ('approved','pending','rejected'))");
ensureColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('imports', 'credentials', 'TEXT');

// Existing approved parents (created by admins / seed) count as email-verified.
db.prepare("UPDATE users SET email_verified = 1 WHERE role = 'parent' AND registration_status = 'approved'").run();

// ---- backfill: chat attachments must be downloadable by conversation
// participants (files attached to messages were previously owner-only).
function backfillMessageAttachmentAccess() {
  const rows = db.prepare(
    `SELECT m.attachment_id, cp.user_id FROM messages m
     JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
     WHERE m.attachment_id IS NOT NULL`
  ).all();
  const ins = db.prepare('INSERT OR IGNORE INTO document_access (document_id, target_type, target_id) VALUES (?, ?, ?)');
  for (const r of rows) ins.run(r.attachment_id, 'user', String(r.user_id));
}
try { backfillMessageAttachmentAccess(); } catch { /* tables may not exist yet on very first boot */ }

// ---- helpers ----------------------------------------------------------
const all = (sql, params = []) => db.prepare(sql).all(params);
const get = (sql, params = []) => db.prepare(sql).get(params);
const run = (sql, params = []) => db.prepare(sql).run(params);

function tx(fn) {
  const doTx = db.transaction(fn);
  return doTx();
}

/** Get one setting value parsed as JSON (or undefined). */
function getSetting(key, fallback) {
  const row = get('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

function setSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)]
  );
}

module.exports = { db, all, get, run, tx, getSetting, setSetting };
