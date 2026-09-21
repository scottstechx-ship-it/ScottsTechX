/**
 * Database singleton.
 * Opens the SQLite file, applies the schema, and exposes small helpers.
 * All queries in the app use prepared statements -> SQL injection safe.
 *
 * The driver is resolved by ./driver.js: better-sqlite3 when available,
 * Node's built-in node:sqlite otherwise (see driver.js for why).
 */
const fs = require('fs');
const path = require('path');
const { openDatabase } = require('./driver');
const env = require('../config/env');

fs.mkdirSync(path.dirname(env.DATABASE_PATH), { recursive: true });
fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });

const db = openDatabase(env.DATABASE_PATH);
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
ensureColumn('site_gallery', 'media_type', "TEXT DEFAULT 'image'");
ensureColumn('announcements', 'expire_date', 'TEXT');

// Tables added after the first release are created here too, so existing
// databases pick them up without a manual migration step.
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,
    csrf_token   TEXT NOT NULL,
    ip           TEXT,
    user_agent   TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at   TEXT NOT NULL,
    revoked      INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS login_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ident        TEXT NOT NULL,
    ip           TEXT,
    attempts     INTEGER NOT NULL DEFAULT 1,
    first_at     TEXT NOT NULL DEFAULT (datetime('now')),
    last_at      TEXT NOT NULL DEFAULT (datetime('now')),
    locked_until TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_login_attempts_key ON login_attempts(ident, ip);
`);

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

// ---- announcement scheduling (draft / scheduled / published) --------------
// Existing rows are already announced, so they default to 'published'.
ensureColumn('announcements', 'status', "TEXT NOT NULL DEFAULT 'published'");
ensureColumn('announcements', 'scheduled_at', 'TEXT');
// ---- attendance reporting period -----------------------------------------
// Term/year on each attendance row so a term report is a GROUP BY, not a
// guess from dates. Existing rows keep NULL and are matched by date.
ensureColumn('attendance', 'term', 'TEXT');
ensureColumn('attendance', 'academic_year', 'TEXT');

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
// Accounts created by the school (seed, admins, imports) are trusted: they
// never went through self-registration, so they must not be asked to verify
// an email address they never submitted themselves.
db.prepare("UPDATE users SET email_verified = 1 WHERE registration_status = 'approved' AND email_verified = 0").run();

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

// ---- report cards -------------------------------------------------------
// A report card is the deliverable that goes to a parent: either an imported
// file (the school's own PDF/scan) or one generated from imported marks.
// `sent_at` records delivery so the office can see who still needs theirs.
db.exec(`
  CREATE TABLE IF NOT EXISTS report_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- NULL while an imported file has not been matched to a child yet
    student_id INTEGER,
    class_id INTEGER,
    term TEXT,
    academic_year TEXT,
    source TEXT NOT NULL DEFAULT 'marks',
    file_name TEXT,
    original_name TEXT,
    mime_type TEXT,
    size INTEGER,
    storage_path TEXT,
    total REAL,
    average REAL,
    position INTEGER,
    class_size INTEGER,
    teacher_comment TEXT,
    sent_at TEXT,
    sent_by INTEGER,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(student_id, term, academic_year)
  );
  CREATE INDEX IF NOT EXISTS idx_report_cards_term ON report_cards(term, academic_year);
  CREATE INDEX IF NOT EXISTS idx_report_cards_student ON report_cards(student_id);
  CREATE TABLE IF NOT EXISTS report_card_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_card_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    score REAL,
    out_of REAL DEFAULT 100,
    percentage REAL,
    grade TEXT,
    remarks TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_report_subjects_card ON report_card_subjects(report_card_id);
`);
ensureColumn('report_cards', 'delivery_note', 'TEXT');
ensureColumn('report_cards', 'import_batch', 'TEXT');


// ---- helpers ----------------------------------------------------------
const all = (sql, params = []) => db.prepare(sql).all(params);
const get = (sql, params = []) => db.prepare(sql).get(params);
const run = (sql, params = []) => db.prepare(sql).run(params);

function tx(fn) {
  const doTx = db.transaction(fn);
  return doTx();
}

/** Get one setting value parsed as JSON (or undefined). */
/**
 * Older databases were created with report_cards.student_id NOT NULL, which made
 * it impossible to park an imported file that could not be matched to a child.
 * SQLite cannot drop NOT NULL in place, so rebuild the table once, keeping rows.
 */
(function relaxReportCardStudent() {
  const studentId = all('PRAGMA table_info(report_cards)').find((c) => c.name === 'student_id');
  if (!studentId || !studentId.notnull) return;
  try {
    tx(() => {
      run('DROP INDEX IF EXISTS idx_report_cards_term');
      run('DROP INDEX IF EXISTS idx_report_cards_student');
      run('ALTER TABLE report_cards RENAME TO report_cards_legacy');
      run(`CREATE TABLE report_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        class_id INTEGER,
        term TEXT,
        academic_year TEXT,
        source TEXT NOT NULL DEFAULT 'marks',
        file_name TEXT,
        original_name TEXT,
        mime_type TEXT,
        size INTEGER,
        storage_path TEXT,
        total REAL,
        average REAL,
        position INTEGER,
        class_size INTEGER,
        teacher_comment TEXT,
        sent_at TEXT,
        sent_by INTEGER,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        delivery_note TEXT,
        import_batch TEXT,
        UNIQUE(student_id, term, academic_year)
      )`);
      run(`INSERT INTO report_cards (id, student_id, class_id, term, academic_year, source, file_name, original_name,
             mime_type, size, storage_path, total, average, position, class_size, teacher_comment, sent_at, sent_by,
             created_by, created_at, delivery_note, import_batch)
           SELECT id, student_id, class_id, term, academic_year, source, file_name, original_name,
             mime_type, size, storage_path, total, average, position, class_size, teacher_comment, sent_at, sent_by,
             created_by, created_at, delivery_note, import_batch FROM report_cards_legacy`);
      run('DROP TABLE report_cards_legacy');
      run('CREATE INDEX IF NOT EXISTS idx_report_cards_term ON report_cards(term, academic_year)');
      run('CREATE INDEX IF NOT EXISTS idx_report_cards_student ON report_cards(student_id)');
    });
    console.log('[db] report_cards rebuilt so unmatched report files can be parked');
  } catch (e) {
    console.error('[db] report_cards migration skipped:', e.message);
  }
})();

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
