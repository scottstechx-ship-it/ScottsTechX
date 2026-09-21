'use strict';
/**
 * IMPORT HUB — one place that knows how the school's data fits together.
 *
 * Every importer goes through the resolvers below, so the same rules apply no
 * matter which file the office uploads:
 *
 *   resolveClass   "Senior 2" + "A"      -> class row (created when asked)
 *   resolveSubject "Mathematics"         -> subject row (created when asked)
 *   resolveTeacher "TCH-2026-01" / name  -> teacher + user account
 *   resolveStudent "STU-2026-100" / name -> student + user account + class
 *   resolveParent  phone / email / name  -> parent + user account
 *   linkTeacherClass / linkParentStudent -> the join tables the rest of the
 *                                           platform already reads
 *
 * Everything is idempotent: re-importing the same file never duplicates a
 * person, a class or a link. Each call returns `{ id, created }` so the caller
 * can report exactly what was built ("3 classes created, 12 subjects linked").
 */
const { all, get, run } = require('../database/db');

// ------------------------------------------------------------------ helpers
function clean(v, max = 200) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, max);
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
}

function normPhone(v) {
  return String(v || '').replace(/[^\d+]/g, '').replace(/^0+/, '+256').replace(/^\+\+/, '+');
}

/** Compare names loosely: case, punctuation, extra spaces and order-insensitive. */
function nameKey(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/** "Mathematics, Physics" / "Mathematics;Physics" / "Mathematics and Physics" -> array */
function splitList(v) {
  return String(v == null ? '' : v)
    .split(/[,;/|]+|\band\b|\b&/gi)
    .map((s) => clean(s, 80))
    .filter(Boolean);
}

/** Split a "Senior 2 A" / "Senior 2 - A" class label into name + stream. */
function splitClassLabel(label) {
  const raw = clean(label, 80);
  if (!raw) return { name: '', stream: '' };
  const withDash = raw.match(/^(.*?)\s*[-–]\s*(\S+)$/);
  if (withDash) return { name: clean(withDash[1], 60), stream: clean(withDash[2], 10) };
  // "Senior 2 A" -> name "Senior 2", stream "A" (a trailing single letter/word)
  const words = raw.split(' ');
  if (words.length > 1 && /^[A-Za-z]{1,3}$/.test(words[words.length - 1]) && /\d/.test(words[words.length - 2] || '')) {
    return { name: words.slice(0, -1).join(' '), stream: words[words.length - 1] };
  }
  return { name: raw, stream: '' };
}

const YEAR = () => String(get("SELECT strftime('%Y','now') AS y").y || new Date().getFullYear());

// ------------------------------------------------------------------- classes
function findClass(name, stream, year) {
  const n = clean(name, 60);
  if (!n) return null;
  const s = clean(stream, 10);
  const y = clean(year, 10) || YEAR();
  if (s) {
    const exact = get('SELECT * FROM classes WHERE lower(name) = lower(?) AND lower(COALESCE(stream,\'\')) = lower(?) AND COALESCE(academic_year, ?) = ?', [n, s, y, y]);
    if (exact) return exact;
  }
  const found = get('SELECT * FROM classes WHERE lower(name) = lower(?) AND COALESCE(academic_year, ?) = ? ORDER BY id LIMIT 1', [n, y, y])
      || get('SELECT * FROM classes WHERE lower(name) = lower(?) ORDER BY id LIMIT 1', [n]);
  if (found) return found;
  // People write "Senior 2 A" (name + stream in one cell) far more often than
  // they split it, so retry with the label taken apart before giving up.
  if (!s) {
    const parts = splitClassLabel(n);
    if (parts.name && parts.name !== n) return findClass(parts.name, parts.stream, y);
  }
  return null;
}

function resolveClass(name, stream, year, { create = true } = {}) {
  const n = clean(name, 60);
  if (!n) return { id: null, created: false };
  const existing = findClass(n, stream, year);
  if (existing) return { id: existing.id, created: false, row: existing };
  if (!create) return { id: null, created: false, missing: n };
  const y = clean(year, 10) || YEAR();
  const info = run('INSERT INTO classes (name, stream, academic_year) VALUES (?, ?, ?)', [n, clean(stream, 10) || null, y]);
  return { id: info.lastInsertRowid, created: true, row: get('SELECT * FROM classes WHERE id = ?', [info.lastInsertRowid]) };
}

// ------------------------------------------------------------------ subjects
function subjectCode(name) {
  const letters = String(name || '').replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean);
  let code = letters.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  if (code.length < 3) code = (String(name || '').replace(/[^A-Za-z]/g, '').toUpperCase() + 'XXX').slice(0, 3);
  let candidate = code;
  let n = 1;
  while (get('SELECT id FROM subjects WHERE upper(COALESCE(code,\'\')) = ?', [candidate])) {
    candidate = code.slice(0, 2) + n;
    n += 1;
  }
  return candidate;
}

function resolveSubject(name, { code = '', department = '', create = true } = {}) {
  const n = clean(name, 80);
  if (!n) return { id: null, created: false };
  const existing = get('SELECT * FROM subjects WHERE lower(name) = lower(?) OR upper(COALESCE(code,\'\')) = upper(?)', [n, clean(code, 10)])
    || (clean(code, 10) ? get('SELECT * FROM subjects WHERE upper(COALESCE(code,\'\')) = ?', [clean(code, 10)]) : null);
  if (existing) return { id: existing.id, created: false, row: existing, name: existing.name };
  if (!create) return { id: null, created: false, missing: n };
  const info = run('INSERT INTO subjects (name, code, department) VALUES (?, ?, ?)',
    [n, clean(code, 10) || subjectCode(n), clean(department, 60) || null]);
  return { id: info.lastInsertRowid, created: true, row: get('SELECT * FROM subjects WHERE id = ?', [info.lastInsertRowid]), name: n };
}

// ------------------------------------------------------------------ logins
function makeUsername(base, fallback = 'user') {
  const root = (String(base || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 24)) || fallback;
  let candidate = root.toLowerCase();
  let n = 1;
  while (get('SELECT id FROM users WHERE username = ?', [candidate])) {
    candidate = (root.slice(0, 24 - String(n).length - 1) + '_' + n).toLowerCase();
    n += 1;
  }
  return candidate;
}

function nextCode(prefix, table, column) {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const rows = all(`SELECT ${column} AS c FROM ${table} WHERE ${column} LIKE ?`, [like]);
  let max = 0;
  for (const r of rows) {
    const m = /(\d+)\s*$/.exec(String(r.c || ''));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
}

/** Create a login account. Returns { id, created, username }. */
function resolveUser({ fullName, email, phone, role, password, username, bcrypt, mustChange = true }) {
  const mail = clean(email, 160).toLowerCase();
  const name = clean(fullName, 120);
  const uname = makeUsername(username || mail.split('@')[0] || name.replace(/\s+/g, '.'), role);
  const info = run(
    `INSERT INTO users (full_name, email, phone, username, password_hash, role, status, registration_status, email_verified, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, 'active', 'approved', 1, ?)`,
    [name, mail || null, clean(phone, 30) || null, uname, bcrypt.hashSync(password, 10), role, mustChange ? 1 : 0]
  );
  return { id: info.lastInsertRowid, created: true, username: uname };
}

// ------------------------------------------------------------------ teachers
function findTeacher({ staffCode = '', name = '', email = '' } = {}) {
  const code = clean(staffCode, 30);
  if (code) {
    const t = get('SELECT * FROM teachers WHERE upper(staff_code) = upper(?)', [code]);
    if (t) return t;
    const u = get("SELECT * FROM users WHERE role = 'teacher' AND upper(username) = upper(?)", [code]);
    if (u) return get('SELECT * FROM teachers WHERE user_id = ?', [u.id]);
  }
  const mail = clean(email, 160).toLowerCase();
  if (mail) {
    const t = get('SELECT * FROM teachers WHERE lower(COALESCE(email,\'\')) = ?', [mail]);
    if (t) return t;
    const u = get('SELECT * FROM users WHERE lower(COALESCE(email,\'\')) = ?', [mail]);
    if (u) return get('SELECT * FROM teachers WHERE user_id = ?', [u.id]);
  }
  const n = clean(name, 120);
  if (n) {
    const key = nameKey(n);
    const hit = all('SELECT * FROM teachers').find((t) => nameKey(t.full_name) === key);
    if (hit) return hit;
  }
  return null;
}

function resolveTeacher({ staffCode = '', name = '', email = '', phone = '', subjects = '', qualification = '', dateJoined = '', password = 'Teacher@123', bcrypt }) {
  const existing = findTeacher({ staffCode, name, email });
  if (existing) return { id: existing.id, created: false, row: existing };
  const code = clean(staffCode, 30).toUpperCase() || nextCode('TCH', 'teachers', 'staff_code');
  const user = resolveUser({
    fullName: name || code, email, phone, role: 'teacher', password,
    username: code.toLowerCase(), bcrypt,
  });
  const info = run(
    `INSERT INTO teachers (user_id, staff_code, full_name, subjects, phone, email, qualification, date_joined, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [user.id, code, clean(name, 120) || code, clean(subjects, 300) || null, clean(phone, 30) || null,
      clean(email, 160).toLowerCase() || null, clean(qualification, 200) || null, clean(dateJoined, 20) || null]
  );
  return {
    id: info.lastInsertRowid, created: true, row: get('SELECT * FROM teachers WHERE id = ?', [info.lastInsertRowid]),
    credentials: { name: clean(name, 120) || code, username: user.username, code, password },
  };
}

/** Attach a teacher to a class (+ optional subject) — the pair the platform reads. */
function linkTeacherClass(teacherId, classId, subject = '', { asClassTeacher = false } = {}) {
  if (!teacherId || !classId) return { linked: false };
  // teacher_classes is UNIQUE(teacher_id, class_id): one row per pair, with the
  // subjects that teacher takes in that class kept together in one text column.
  const subj = clean(subject, 80);
  const existing = get('SELECT * FROM teacher_classes WHERE teacher_id = ? AND class_id = ?', [teacherId, classId]);
  let linked = false;
  if (!existing) {
    run('INSERT INTO teacher_classes (teacher_id, class_id, subject) VALUES (?, ?, ?)', [teacherId, classId, subj || null]);
    linked = true;
  } else if (subj) {
    const have = String(existing.subject || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!have.includes(subj.toLowerCase())) {
      const merged = [...new Set([...String(existing.subject || '').split(',').map((x) => x.trim()).filter(Boolean), subj])].join(', ');
      run('UPDATE teacher_classes SET subject = ? WHERE id = ?', [merged, existing.id]);
      linked = true;
    }
  }
  let classTeacher = false;
  if (asClassTeacher) {
    const cls = get('SELECT class_teacher_id FROM classes WHERE id = ?', [classId]);
    // classes.class_teacher_id references teachers(id)
    if (cls && !cls.class_teacher_id) {
      run('UPDATE classes SET class_teacher_id = ? WHERE id = ?', [teacherId, classId]);
      classTeacher = true;
    }
  }
  return { linked, classTeacher };
}

// ------------------------------------------------------------------ students
function findStudent({ admissionNo = '', name = '', classId = null } = {}) {
  const code = clean(admissionNo, 30);
  if (code) {
    const s = get('SELECT * FROM students WHERE upper(student_code) = upper(?)', [code]);
    if (s) return s;
  }
  const n = clean(name, 120);
  if (n) {
    const key = nameKey(n);
    const pool = classId
      ? all('SELECT * FROM students WHERE class_id = ?', [classId])
      : all('SELECT * FROM students');
    const hit = pool.find((s) => nameKey(s.full_name) === key);
    if (hit) return hit;
    if (!classId) {
      const loose = all('SELECT * FROM students').find((s) => nameKey(s.full_name).includes(key) || key.includes(nameKey(s.full_name)));
      if (loose) return loose;
    }
  }
  return null;
}

function resolveStudent({ admissionNo = '', name = '', classId = null, stream = '', gender = '', dob = '', address = '', enrollmentDate = '', password = 'Student@123', phone = '', email = '', bcrypt }) {
  const existing = findStudent({ admissionNo, name, classId });
  if (existing) {
    // keep an existing student's class fresh when the import says otherwise
    if (classId && !existing.class_id) run('UPDATE students SET class_id = ? WHERE id = ?', [classId, existing.id]);
    return { id: existing.id, created: false, row: get('SELECT * FROM students WHERE id = ?', [existing.id]) };
  }
  const code = clean(admissionNo, 30).toUpperCase() || nextCode('STU', 'students', 'student_code');
  const user = resolveUser({
    fullName: name || code, email, phone, role: 'student', password, username: code.toLowerCase(), bcrypt,
  });
  const info = run(
    `INSERT INTO students (user_id, student_code, full_name, class_id, stream, gender, date_of_birth, address, enrollment_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [user.id, code, clean(name, 120) || code, classId || null, clean(stream, 10) || null,
      normaliseGender(gender), clean(dob, 20) || null, clean(address, 200) || null, clean(enrollmentDate, 20) || null]
  );
  return {
    id: info.lastInsertRowid, created: true, row: get('SELECT * FROM students WHERE id = ?', [info.lastInsertRowid]),
    credentials: { name: clean(name, 120) || code, username: user.username, code, password },
  };
}

function normaliseGender(v) {
  const s = clean(v, 12).toLowerCase();
  if (s.startsWith('m')) return 'Male';
  if (s.startsWith('f')) return 'Female';
  return '';
}

// ------------------------------------------------------------------- parents
function findParent({ parentCode = '', phone = '', email = '', name = '' } = {}) {
  const code = clean(parentCode, 30);
  if (code) {
    const p = get('SELECT * FROM parents WHERE upper(COALESCE(parent_code,\'\')) = upper(?)', [code]);
    if (p) return p;
  }
  const mail = clean(email, 160).toLowerCase();
  if (mail) {
    const p = get('SELECT * FROM parents WHERE lower(COALESCE(email,\'\')) = ?', [mail]);
    if (p) return p;
    const u = get(`SELECT * FROM users WHERE lower(COALESCE(email,'')) = ? AND role = 'parent'`, [mail]);
    if (u) return get('SELECT * FROM parents WHERE user_id = ?', [u.id]);
  }
  const ph = normPhone(phone);
  if (ph && ph.length > 6) {
    const candidates = all('SELECT * FROM parents').filter((p) => normPhone(p.phone) === ph);
    if (candidates.length) {
      // same number + same name = the same person; same number, different name
      // is a shared office phone, so keep them apart
      const key = nameKey(name);
      if (!key) return candidates[0];
      return candidates.find((p) => nameKey(p.full_name) === key) || null;
    }
  }
  const n = clean(name, 120);
  if (n) {
    const key = nameKey(n);
    const hit = all('SELECT * FROM parents').find((p) => nameKey(p.full_name) === key);
    if (hit) return hit;
  }
  return null;
}

function resolveParent({ parentCode = '', name = '', phone = '', email = '', address = '', occupation = '', password = 'Parent@123', bcrypt }) {
  const existing = findParent({ parentCode, phone, email, name });
  if (existing) {
    // fill in blanks the office has now supplied — never overwrite good data
    const patch = {};
    if (!existing.phone && clean(phone, 30)) patch.phone = clean(phone, 30);
    if (!existing.email && clean(email, 160)) patch.email = clean(email, 160).toLowerCase();
    if (!existing.address && clean(address, 200)) patch.address = clean(address, 200);
    if (!existing.occupation && clean(occupation, 80)) patch.occupation = clean(occupation, 80);
    if (Object.keys(patch).length) {
      const sets = Object.keys(patch).map((k) => `${k} = ?`).join(', ');
      run(`UPDATE parents SET ${sets} WHERE id = ?`, [...Object.values(patch), existing.id]);
    }
    return { id: existing.id, created: false, row: get('SELECT * FROM parents WHERE id = ?', [existing.id]) };
  }
  const code = clean(parentCode, 30).toUpperCase() || nextCode('PAR', 'parents', 'parent_code');
  const user = resolveUser({
    fullName: name || code, email, phone, role: 'parent', password,
    username: code.toLowerCase(), bcrypt,
  });
  const info = run(
    `INSERT INTO parents (user_id, parent_code, full_name, phone, email, address, occupation, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    [user.id, code, clean(name, 120) || code, clean(phone, 30) || null,
      clean(email, 160).toLowerCase() || null, clean(address, 200) || null, clean(occupation, 80) || null]
  );
  return {
    id: info.lastInsertRowid, created: true, row: get('SELECT * FROM parents WHERE id = ?', [info.lastInsertRowid]),
    credentials: { name: clean(name, 120) || code, username: user.username, code, password },
  };
}

const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Sponsor', 'Aunt', 'Uncle', 'Sister', 'Brother', 'Grandparent', 'Other'];
function normaliseRelationship(v, childName = '', parentName = '') {
  const raw = clean(v, 20);
  if (raw) {
    const hit = RELATIONSHIPS.find((r) => r.toLowerCase() === raw.toLowerCase());
    if (hit) return hit;
    if (/^mum$|^mom$|^mother$/i.test(raw)) return 'Mother';
    if (/^dad$|^father$/i.test(raw)) return 'Father';
    return raw[0].toUpperCase() + raw.slice(1).toLowerCase();
  }
  // guess from the surname when the file did not say
  const child = nameKey(childName).split(' ').filter(Boolean);
  const parent = nameKey(parentName).split(' ').filter(Boolean);
  if (child.length && parent.length && child.some((w) => parent.includes(w))) return 'Guardian';
  return 'Guardian';
}

function linkParentStudent(parentId, studentId, relationship = 'Guardian') {
  if (!parentId || !studentId) return { linked: false };
  const existing = get('SELECT id FROM parent_students WHERE parent_id = ? AND student_id = ?', [parentId, studentId]);
  if (existing) {
    const patch = relationship ? `UPDATE parent_students SET relationship = ? WHERE id = ?` : null;
    if (patch) run(patch, [relationship, existing.id]);
    return { linked: false };
  }
  run('INSERT INTO parent_students (parent_id, student_id, relationship) VALUES (?, ?, ?)', [parentId, studentId, relationship || 'Guardian']);
  return { linked: true };
}

/** Children listed as "STU-1; STU-2" or "Amina Nakato, Brian Ssemwanga". */
function resolveChildren(value, { classHint = null } = {}) {
  const list = String(value == null ? '' : value)
    .split(/[;|\n]+|\s+and\s+|,\s*(?=[A-Z0-9])/g)
    .map((s) => clean(s, 120))
    .filter(Boolean);
  const found = [];
  const missing = [];
  for (const entry of list) {
    // "STU-2026-100 (Sarah)" -> the code is what matters
    const codeMatch = entry.match(/\b([A-Z]{2,4}-\d{2,4}-\d{1,5}|\d{4,})\b/);
    const student = findStudent({ admissionNo: codeMatch ? codeMatch[1] : '', name: entry.replace(/\(.*?\)/g, '').trim(), classId: classHint });
    if (student) found.push(student);
    else missing.push(entry);
  }
  return { found, missing };
}

// --------------------------------------------------------------- attendance
const STATUS_MAP = {
  p: 'present', present: 'present', '1': 'present', y: 'present', yes: 'present', '/': 'present', '✓': 'present',
  a: 'absent', abs: 'absent', absent: 'absent', x: 'absent', '0': 'absent', n: 'absent', no: 'absent',
  l: 'late', late: 'late', t: 'late',
  e: 'permission', excused: 'permission', permission: 'permission', perm: 'permission', exc: 'permission',
};
function normaliseStatus(v) {
  const s = clean(v, 20).toLowerCase();
  return STATUS_MAP[s] || '';
}

module.exports = {
  clean, isEmail, normPhone, nameKey, splitList, splitClassLabel, normaliseGender,
  normaliseRelationship, normaliseStatus, RELATIONSHIPS,
  findClass, resolveClass, resolveSubject, subjectCode,
  findTeacher, resolveTeacher, linkTeacherClass,
  findStudent, resolveStudent, resolveChildren,
  findParent, resolveParent, linkParentStudent,
  resolveUser, makeUsername, nextCode, YEAR,
};
