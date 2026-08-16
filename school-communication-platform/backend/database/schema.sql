-- ============================================================
-- SCHOOL COMMUNICATION PLATFORM — DATABASE SCHEMA (SQLite)
-- All statements are idempotent (CREATE TABLE IF NOT EXISTS).
-- ============================================================

-- ------------------------------------------------------------------
-- USERS
-- A single identity across the whole platform. role is extensible.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name       TEXT NOT NULL,
  email           TEXT UNIQUE,
  phone           TEXT,
  username        TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'student'
                  CHECK (role IN ('super_admin','admin','teacher','student','parent')),
  profile_picture TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive','suspended')),
  last_login      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT
);

-- ------------------------------------------------------------------
-- CLASSES  (e.g. "Senior 2", stream "A" -> S.2A)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,          -- "Senior 2", "Primary 7"
  stream           TEXT NOT NULL DEFAULT 'A',
  class_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  academic_year    TEXT NOT NULL DEFAULT '2026',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (name, stream, academic_year)
);

-- ------------------------------------------------------------------
-- TEACHERS
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teachers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  staff_code   TEXT UNIQUE NOT NULL,
  full_name    TEXT NOT NULL,
  subjects     TEXT,               -- JSON array, e.g. ["Mathematics","Physics"]
  phone        TEXT,
  email        TEXT,
  qualification TEXT,
  date_joined  TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Teachers <-> Classes many-to-many (subject assignment)
CREATE TABLE IF NOT EXISTS teacher_classes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject    TEXT,
  UNIQUE (teacher_id, class_id)
);

-- ------------------------------------------------------------------
-- STUDENTS
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  student_code   TEXT UNIQUE NOT NULL,     -- admission / student number
  full_name      TEXT NOT NULL,
  class_id       INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  stream         TEXT,
  gender         TEXT,
  date_of_birth  TEXT,
  parent_name    TEXT,
  parent_phone   TEXT,
  parent_email   TEXT,
  address        TEXT,
  enrollment_date TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------------
-- PARENTS  (one account, multiple children via parent_students)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parents (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  parent_code TEXT UNIQUE NOT NULL,
  full_name  TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  occupation TEXT,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Parent <-> Student relationship (one parent may have many children)
CREATE TABLE IF NOT EXISTS parent_students (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id    INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'Parent/Guardian',
  UNIQUE (parent_id, student_id)
);

-- ------------------------------------------------------------------
-- MESSAGING
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct','group','class','broadcast')),
  title      TEXT,                       -- for group/class chats
  class_id   INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content         TEXT NOT NULL DEFAULT '',
  attachment_id   INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Read receipts: one row per (message, user)
CREATE TABLE IF NOT EXISTS message_reads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (message_id, user_id)
);

-- ------------------------------------------------------------------
-- DOCUMENTS & FOLDERS
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  owner_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,             -- current display name (renameable)
  original_name TEXT NOT NULL,             -- original uploaded file name
  mime_type     TEXT,
  size          INTEGER DEFAULT 0,
  storage_path  TEXT NOT NULL,             -- relative path under UPLOAD_DIR
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  folder_id     INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  description   TEXT,
  expire_date   TEXT,                      -- auto-delete when this date passes
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT
);

-- Document permissions: rows grant access.
-- target_type: 'user' (target_id = user id), 'role' (target_id = role name),
--              'class' (target_id = class id), 'all'
CREATE TABLE IF NOT EXISTS document_access (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('user','role','class','all')),
  target_id   TEXT NOT NULL,
  UNIQUE (document_id, target_type, target_id)
);

-- ------------------------------------------------------------------
-- ANNOUNCEMENTS
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  target_type  TEXT NOT NULL DEFAULT 'all',
               -- 'all' | 'role' | 'class' | 'parents_of_class' | 'staff' | 'students' | 'users'
  target_value TEXT,        -- role name / class id / JSON array of ids
  sender_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  important    INTEGER NOT NULL DEFAULT 0,
  expire_date  TEXT,        -- auto-delete when this date passes
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcement_reads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (announcement_id, user_id)
);

-- ------------------------------------------------------------------
-- NOTIFICATIONS  (stored in the database, per user)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'system',  -- message|document|announcement|system|account
  title      TEXT,
  body       TEXT,
  link       TEXT,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------------
-- SETTINGS  (key/value JSON store — school info, permissions, etc.)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ------------------------------------------------------------------
-- AUDIT LOG
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  user_name  TEXT,
  role       TEXT,
  action     TEXT NOT NULL,
  details    TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conv     ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_participants_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_msg_reads_user    ON message_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_docs_uploader     ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_doc_access        ON document_access(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_notif_user        ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_ann_reads_user    ON announcement_reads(user_id);
-- ------------------------------------------------------------------
-- PASSWORD RESET TOKENS (self-service "forgot password" flow)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_logs_created      ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_pwreset_hash      ON password_resets(token_hash);

-- ============================================================
-- UPGRADE v2 — academic, financial & personalization modules
-- ============================================================

-- Per-user preferences (theme, notification toggles, etc.)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme              TEXT NOT NULL DEFAULT 'system',   -- light | dark | system
  notif_prefs        TEXT NOT NULL DEFAULT '{}',       -- JSON per-type toggles
  communication_prefs TEXT NOT NULL DEFAULT '{}',
  dashboard_prefs    TEXT NOT NULL DEFAULT '{}',
  updated_at         TEXT
);

-- Subject reference list (managed by admins)
CREATE TABLE IF NOT EXISTS subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  code       TEXT,
  department TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Attendance
CREATE TABLE IF NOT EXISTS attendance (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('present','absent','late','permission')),
  note       TEXT,
  marked_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE (student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance(class_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);

-- Assignments
CREATE TABLE IF NOT EXISTS assignments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject     TEXT,
  teacher_id  INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  due_date    TEXT,
  resources   TEXT,               -- JSON array of document ids
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  content       TEXT,
  attachment_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  grade         REAL,
  grade_comment TEXT,
  graded_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  released      INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT,
  UNIQUE (assignment_id, student_id)
);

-- Exams
CREATE TABLE IF NOT EXISTS exams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject    TEXT,
  date       TEXT,
  start_time TEXT,
  end_time   TEXT,
  term       TEXT,
  status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','completed','published')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_exams_class ON exams(class_id);

CREATE TABLE IF NOT EXISTS exam_results (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id    INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  marks      REAL,
  grade      TEXT,
  comments   TEXT,
  entered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT,
  UNIQUE (exam_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam ON exam_results(exam_id);

-- Timetable
CREATE TABLE IF NOT EXISTS timetable_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id      INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject       TEXT,
  teacher_id    INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  room          TEXT,
  day           TEXT NOT NULL CHECK (day IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  academic_year TEXT NOT NULL DEFAULT '2026',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_timetable_class ON timetable_entries(class_id, day);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher ON timetable_entries(teacher_id, day);

-- Fees
CREATE TABLE IF NOT EXISTS fee_structures (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  amount        REAL NOT NULL,
  academic_year TEXT NOT NULL,
  term          TEXT,
  class_id      INTEGER REFERENCES classes(id) ON DELETE CASCADE,  -- NULL = all classes
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_fees (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_structure_id INTEGER NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
  amount          REAL NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, fee_structure_id)
);
CREATE INDEX IF NOT EXISTS idx_student_fees_student ON student_fees(student_id);

CREATE TABLE IF NOT EXISTS fee_payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount      REAL NOT NULL,
  method      TEXT,
  reference   TEXT,
  receipt_no  TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_at     TEXT NOT NULL DEFAULT (datetime('now')),
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(student_id);

-- Bulk import sessions (audit trail)
CREATE TABLE IF NOT EXISTS imports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  filename   TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'students',
  status     TEXT NOT NULL DEFAULT 'uploaded',   -- uploaded|analyzed|validated|imported|failed
  counts     TEXT,                               -- JSON {imported, updated, skipped, failed}
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Email verification tokens (parent self-registration)
CREATE TABLE IF NOT EXISTS email_verifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_verif_hash ON email_verifications(token_hash);

-- ============================================================
-- PUBLIC WEBSITE CONTENT (admissions, gallery, news)
-- ============================================================

-- Online admission applications from the public website
CREATE TABLE IF NOT EXISTS admission_applications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT NOT NULL,
  date_of_birth TEXT,
  gender        TEXT,
  applying_for  TEXT NOT NULL,
  program       TEXT,
  combination   TEXT,
  parent_name   TEXT NOT NULL,
  parent_phone  TEXT NOT NULL,
  parent_email  TEXT,
  prev_school   TEXT,
  motivation    TEXT,
  status        TEXT NOT NULL DEFAULT 'new',   -- new|reviewing|accepted|rejected
  note          TEXT,
  reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admissions_status ON admission_applications(status);

-- Website gallery images (managed by super admin)
CREATE TABLE IF NOT EXISTS site_gallery (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  caption     TEXT,
  filename    TEXT,                             -- stored upload (preferred)
  url         TEXT,                             -- or an external image URL
  category    TEXT DEFAULT 'general',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Website news posts (managed by admins, optional expiry)
CREATE TABLE IF NOT EXISTS site_news (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  image_file  TEXT,                             -- optional uploaded image
  image_url   TEXT,                             -- or external URL
  published   INTEGER NOT NULL DEFAULT 1,
  expires_at  TEXT,                             -- NULL = never expires
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_site_news_pub ON site_news(published, expires_at);
