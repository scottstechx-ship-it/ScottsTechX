/** GET /api/teachers — teacher management (admins + super admins). */
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { all, get, run, tx } = require('../database/db');
const { authenticate, requireStaffAdmin, requireRole } = require('../middleware/auth');
const { cleanString, isEmail, isPhone, asInt, passwordError } = require('../middleware/validate');
const { log } = require('../services/audit');
const { classIdsForTeacherUserId } = require('../services/permissions');

const LIST_SELECT = `
  SELECT t.*, u.username, u.email AS user_email, u.status AS user_status, u.last_login
  FROM teachers t LEFT JOIN users u ON u.id = t.user_id`;

function withClasses(teacher) {
  if (!teacher) return teacher;
  teacher.classes = all(
    `SELECT c.id, c.name, c.stream, c.academic_year, tc.subject
     FROM teacher_classes tc JOIN classes c ON c.id = tc.class_id
     WHERE tc.teacher_id = ? ORDER BY c.name`, [teacher.id]
  );
  try { teacher.subjects = JSON.parse(teacher.subjects || '[]'); } catch { teacher.subjects = []; }
  return teacher;
}

/** GET /api/teachers/classes — classes assigned to the current teacher (for teacher dashboard). */
router.get('/classes', authenticate, requireRole('teacher', 'super_admin', 'admin'), (req, res) => {
  let teacherIds;
  if (req.user.role === 'teacher') {
    const t = get('SELECT id FROM teachers WHERE user_id = ?', [req.user.id]);
    if (!t) return res.json({ classes: [] });
    teacherIds = [t.id];
  } else if (req.query.teacherId) {
    teacherIds = [asInt(req.query.teacherId)];
  } else {
    return res.json({ classes: [] });
  }

  const classes = [];
  for (const tid of teacherIds) {
    const tc = all(
      `SELECT c.id, c.name, c.stream, c.academic_year, tc.subject,
              (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'active') AS student_count
       FROM teacher_classes tc JOIN classes c ON c.id = tc.class_id
       WHERE tc.teacher_id = ? ORDER BY c.name`, [tid]
    );
    classes.push(...tc);
  }
  res.json({ classes });
});

/** GET /api/teachers */
router.get('/', authenticate, requireStaffAdmin, (req, res) => {
  const q = cleanString(req.query.search, 100);
  const status = cleanString(req.query.status, 20);
  const limit = Math.min(asInt(req.query.limit, 100) || 100, 500);
  const offset = Math.max(asInt(req.query.offset, 0) || 0, 0);

  const where = [];
  const params = [];
  if (q) {
    where.push('(t.full_name LIKE ? OR t.staff_code LIKE ? OR t.email LIKE ? OR t.phone LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (status && ['active', 'inactive', 'suspended'].includes(status)) { where.push('t.status = ?'); params.push(status); }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) AS c FROM teachers t ${whereSql}`, params).c;
  const teachers = all(`${LIST_SELECT} ${whereSql} ORDER BY t.full_name COLLATE NOCASE LIMIT ? OFFSET ?`, [...params, limit, offset]);
  teachers.forEach(withClasses);
  res.json({ teachers, total, limit, offset });
});

/** Unique username helper: make a username-safe login code from a base string. */
function makeUsername(base, used = new Set()) {
  const clean = String(base || '').replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 24);
  const root = clean || 'staff';
  let candidate = root;
  let n = 1;
  while (get('SELECT id FROM users WHERE username = ?', [candidate]) || used.has(candidate)) {
    candidate = root.slice(0, 24 - String(n).length - 1) + '_' + n;
    n++;
  }
  used.add(candidate);
  return candidate;
}

/** Next staff code like TCH-2026-001. */
function nextStaffCode() {
  const year = new Date().getFullYear();
  const prefix = `TCH-${year}-`;
  const last = get('SELECT staff_code FROM teachers WHERE staff_code LIKE ? ORDER BY id DESC LIMIT 1', [prefix + '%']);
  let n = 1;
  if (last) {
    const m = /\d+$/.exec(last.staff_code);
    if (m) n = parseInt(m[0], 10) + 1;
  }
  return prefix + String(n).padStart(3, '0');
}

/** POST /api/teachers */
router.post('/', authenticate, requireStaffAdmin, (req, res) => {
  const fullName = cleanString(req.body.fullName, 120);
  let staffCode = cleanString(req.body.staffCode, 40);
  const subjects = Array.isArray(req.body.subjects) ? req.body.subjects.map((s) => cleanString(s, 60)).filter(Boolean).slice(0, 20) : [];
  const phone = cleanString(req.body.phone, 30);
  const email = cleanString(req.body.email, 160);
  const qualification = cleanString(req.body.qualification, 200);
  const dateJoined = cleanString(req.body.dateJoined, 20);
  const classIds = Array.isArray(req.body.classIds) ? req.body.classIds.map(asInt).filter(Boolean) : [];
  let username = cleanString(req.body.username, 40);
  let password = cleanString(req.body.password, 200);

  if (!fullName) return res.status(400).json({ error: 'fullName is required.' });
  // auto-generate a staff code when not provided
  if (!staffCode) staffCode = nextStaffCode();
  if (get('SELECT id FROM teachers WHERE staff_code = ?', [staffCode])) {
    return res.status(409).json({ error: 'A teacher with that staff number already exists.' });
  }
  if (email && !isEmail(email)) return res.status(400).json({ error: 'Invalid email.' });
  if (phone && !isPhone(phone)) return res.status(400).json({ error: 'Invalid phone.' });
  for (const cid of classIds) {
    if (!get('SELECT id FROM classes WHERE id = ?', [cid])) return res.status(400).json({ error: `Class ${cid} does not exist.` });
  }

  const school = require('../services/settingsService').readSettings().school;
  const defaultPassword = school.defaultTeacherPassword || 'Teacher@123';

  const teacherId = tx(() => {
    let userId = null;
    if (!username) username = makeUsername(staffCode);
    if (!password) password = defaultPassword;

    if (get('SELECT id FROM users WHERE username = ?', [username])) { const e = new Error('That username is already taken.'); e.status = 409; throw e; }
    if (email && get('SELECT id FROM users WHERE lower(email) = lower(?)', [email])) { const e = new Error('That email is already registered.'); e.status = 409; throw e; }
    const pwErr = passwordError(password, { strong: require('../config/env').STRONG_PASSWORDS });
    if (pwErr) { const e = new Error(pwErr); e.status = 400; throw e; }
    const info = run(
      `INSERT INTO users (full_name, email, phone, username, password_hash, role, status, registration_status, email_verified, must_change_password)
       VALUES (?, ?, ?, ?, ?, 'teacher', 'active', 'approved', 1, 1)`,
      [fullName, email || null, phone || null, username, bcrypt.hashSync(password, 10)]
    );
    userId = info.lastInsertRowid;
    const info2 = run(
      `INSERT INTO teachers (user_id, staff_code, full_name, subjects, phone, email, qualification, date_joined, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [userId, staffCode, fullName, JSON.stringify(subjects), phone || null, email || null, qualification || null, dateJoined || null]
    );
    const tid = info2.lastInsertRowid;
    for (const cid of classIds) {
      run('INSERT OR IGNORE INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)', [tid, cid]);
    }
    return tid;
  });

  log(req.user, 'TEACHER_CREATED', `Created teacher "${fullName}" (${staffCode})`, req.ip);
  res.status(201).json({
    message: `Teacher created successfully. Login: ${username} / ${password} — they will be asked to change it on first login.`,
    credentials: { username, password },
    teacher: withClasses(get(`${LIST_SELECT} WHERE t.id = ?`, [teacherId])),
  });
});

/** GET /api/teachers/:id */
router.get('/:id', authenticate, requireStaffAdmin, (req, res) => {
  const t = get(`${LIST_SELECT} WHERE t.id = ?`, [asInt(req.params.id)]);
  if (!t) return res.status(404).json({ error: 'Teacher not found.' });
  res.json({ teacher: withClasses(t) });
});

/** PUT /api/teachers/:id */
router.put('/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const existing = get('SELECT * FROM teachers WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Teacher not found.' });

  const fullName = cleanString(req.body.fullName, 120) || existing.full_name;
  const staffCode = cleanString(req.body.staffCode, 40) || existing.staff_code;
  const subjects = Array.isArray(req.body.subjects) ? req.body.subjects.map((s) => cleanString(s, 60)).filter(Boolean).slice(0, 20) : JSON.parse(existing.subjects || '[]');
  const phone = cleanString(req.body.phone, 30) || existing.phone;
  const email = cleanString(req.body.email, 160) || existing.email;
  const qualification = cleanString(req.body.qualification, 200) || existing.qualification;
  const dateJoined = cleanString(req.body.dateJoined, 20) || existing.date_joined;
  const status = cleanString(req.body.status, 20) || existing.status;
  const classIds = Array.isArray(req.body.classIds)
    ? req.body.classIds.map(asInt).filter(Boolean)
    : all('SELECT class_id FROM teacher_classes WHERE teacher_id = ?', [id]).map((r) => r.class_id);

  if (email && !isEmail(email)) return res.status(400).json({ error: 'Invalid email.' });
  if (phone && !isPhone(phone)) return res.status(400).json({ error: 'Invalid phone.' });
  if (status && !['active', 'inactive', 'suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const clash = get('SELECT id FROM teachers WHERE staff_code = ? AND id != ?', [staffCode, id]);
  if (clash) return res.status(409).json({ error: 'That staff number is already in use.' });

  tx(() => {
    run(
      `UPDATE teachers SET full_name = ?, staff_code = ?, subjects = ?, phone = ?, email = ?, qualification = ?, date_joined = ?, status = ?
       WHERE id = ?`,
      [fullName, staffCode, JSON.stringify(subjects), phone || null, email || null, qualification || null, dateJoined || null, status, id]
    );
    if (existing.user_id) {
      run('UPDATE users SET full_name = ?, email = ?, phone = ?, status = ? WHERE id = ?', [fullName, email || null, phone || null, status, existing.user_id]);
    }
    if (Array.isArray(req.body.classIds)) {
      run('DELETE FROM teacher_classes WHERE teacher_id = ?', [id]);
      for (const cid of classIds) run('INSERT OR IGNORE INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)', [id, cid]);
    }
  });
  log(req.user, 'TEACHER_UPDATED', `Updated teacher "${fullName}"`, req.ip);
  res.json({ message: 'Teacher updated.', teacher: withClasses(get(`${LIST_SELECT} WHERE t.id = ?`, [id])) });
});

/** DELETE /api/teachers/:id */
router.delete('/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const t = get('SELECT * FROM teachers WHERE id = ?', [id]);
  if (!t) return res.status(404).json({ error: 'Teacher not found.' });
  tx(() => {
    run('DELETE FROM teacher_classes WHERE teacher_id = ?', [id]);
    run('UPDATE classes SET class_teacher_id = NULL WHERE class_teacher_id = ?', [id]);
    run('DELETE FROM teachers WHERE id = ?', [id]);
    if (t.user_id) run('DELETE FROM users WHERE id = ?', [t.user_id]);
  });
  log(req.user, 'TEACHER_DELETED', `Deleted teacher "${t.full_name}"`, req.ip);
  res.json({ message: 'Teacher deleted.' });
});

/** PUT /api/teachers/:id/status */
router.put('/:id/status', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const status = cleanString(req.body.status, 20);
  if (!['active', 'inactive', 'suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const t = get('SELECT * FROM teachers WHERE id = ?', [id]);
  if (!t) return res.status(404).json({ error: 'Teacher not found.' });
  run('UPDATE teachers SET status = ? WHERE id = ?', [status, id]);
  if (t.user_id) run('UPDATE users SET status = ? WHERE id = ?', [status, t.user_id]);
  log(req.user, 'TEACHER_STATUS', `Set status of "${t.full_name}" to ${status}`, req.ip);
  res.json({ message: `Teacher ${status}.` });
});

module.exports = router;
