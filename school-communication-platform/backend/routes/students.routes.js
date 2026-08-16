/**
 * /api/students — student management (admins + super admins).
 * Teachers can list students of the classes they teach (with classId filter).
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { all, get, run, tx } = require('../database/db');
const { authenticate, requireRole, requireStaffAdmin } = require('../middleware/auth');
const { cleanString, isEmail, isPhone, asInt, passwordError } = require('../middleware/validate');
const { log } = require('../services/audit');
const { classIdsForTeacherUserId, classIdForStudentUserId } = require('../services/permissions');

const LIST_SELECT = `
  SELECT s.*, c.name AS class_name, c.stream AS class_stream,
         u.username, u.email AS user_email, u.phone AS user_phone, u.status AS user_status,
         u.last_login
  FROM students s
  LEFT JOIN classes c ON c.id = s.class_id
  LEFT JOIN users u ON u.id = s.user_id`;

/** GET /api/students */
router.get('/', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const q = cleanString(req.query.search, 100);
  const classId = asInt(req.query.classId);
  const status = cleanString(req.query.status, 20);
  const limit = Math.min(asInt(req.query.limit, 100) || 100, 500);
  const offset = Math.max(asInt(req.query.offset, 0) || 0, 0);

  const where = [];
  const params = [];

  if (q) {
    where.push('(s.full_name LIKE ? OR s.student_code LIKE ? OR s.parent_name LIKE ? OR s.parent_phone LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (status && ['active', 'inactive', 'suspended'].includes(status)) { where.push('s.status = ?'); params.push(status); }

  // Teachers may only see students of their own classes.
  if (req.user.role === 'teacher') {
    const myClasses = classIdsForTeacherUserId(req.user.id);
    if (!myClasses.length) return res.json({ students: [], total: 0 });
    if (classId) {
      if (!myClasses.includes(classId)) {
        return res.status(403).json({ error: 'You can only view students of your own classes.' });
      }
      where.push('s.class_id = ?'); params.push(classId);
    } else {
      where.push(`s.class_id IN (${myClasses.map(() => '?').join(',')})`); params.push(...myClasses);
    }
  } else if (classId) {
    where.push('s.class_id = ?'); params.push(classId);
  }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) AS c FROM students s ${whereSql}`, params).c;
  const students = all(`${LIST_SELECT} ${whereSql} ORDER BY s.full_name COLLATE NOCASE LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ students, total, limit, offset });
});

/** POST /api/students — create a student (+ login account). */
router.post('/', authenticate, requireStaffAdmin, (req, res) => {
  const fullName = cleanString(req.body.fullName, 120);
  const studentCode = cleanString(req.body.studentCode, 40);
  const classId = asInt(req.body.classId);
  const stream = cleanString(req.body.stream, 20);
  const gender = cleanString(req.body.gender, 20);
  const dob = cleanString(req.body.dateOfBirth, 20);
  const parentName = cleanString(req.body.parentName, 120);
  const parentPhone = cleanString(req.body.parentPhone, 30);
  const parentEmail = cleanString(req.body.parentEmail, 160);
  const address = cleanString(req.body.address, 300);
  const enrollmentDate = cleanString(req.body.enrollmentDate, 20);
  const username = cleanString(req.body.username, 40);
  const email = cleanString(req.body.email, 160);
  const password = cleanString(req.body.password, 200);

  if (!fullName || !studentCode) {
    return res.status(400).json({ error: 'fullName and studentCode are required.' });
  }
  if (classId && !get('SELECT id FROM classes WHERE id = ?', [classId])) {
    return res.status(400).json({ error: 'Selected class does not exist.' });
  }
  if (parentEmail && !isEmail(parentEmail)) return res.status(400).json({ error: 'Invalid parent email.' });
  if (parentPhone && !isPhone(parentPhone)) return res.status(400).json({ error: 'Invalid parent phone.' });
  if (email && !isEmail(email)) return res.status(400).json({ error: 'Invalid email.' });
  if (get('SELECT id FROM students WHERE student_code = ?', [studentCode])) {
    return res.status(409).json({ error: 'A student with that student number already exists.' });
  }

  // Auto-generate a login code (username) + default password when not supplied,
  // so every student can log in and will be forced to change the password.
  const school = require('../services/settingsService').readSettings().school;
  const defaultPassword = school.defaultStudentPassword || 'Student@123';
  function makeUsername(base) {
    const clean = String(base || '').replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 24);
    const root = clean || 'student';
    let candidate = root;
    let n = 1;
    while (get('SELECT id FROM users WHERE username = ?', [candidate])) {
      candidate = root.slice(0, 24 - String(n).length - 1) + '_' + n;
      n++;
    }
    return candidate;
  }
  let finalUsername = username;
  let finalPassword = password;
  let userId = null;
  let credentials = null;

  const studentId = tx(() => {
    finalUsername = finalUsername || makeUsername(studentCode);
    finalPassword = finalPassword || defaultPassword;
    if (get('SELECT id FROM users WHERE username = ?', [finalUsername])) {
      const e = new Error('That username is already taken.');
      e.status = 409;
      throw e;
    }
    if (email && get('SELECT id FROM users WHERE lower(email) = lower(?)', [email])) {
      const e = new Error('That email is already registered.');
      e.status = 409;
      throw e;
    }
    const pwErr = passwordError(finalPassword, { strong: require('../config/env').STRONG_PASSWORDS });
    if (pwErr) { const e = new Error(pwErr); e.status = 400; throw e; }
    const info = run(
      `INSERT INTO users (full_name, email, phone, username, password_hash, role, status, registration_status, email_verified, must_change_password)
       VALUES (?, ?, ?, ?, ?, 'student', 'active', 'approved', 1, 1)`,
      [fullName, email || null, parentPhone || null, finalUsername, bcrypt.hashSync(finalPassword, 10)]
    );
    userId = info.lastInsertRowid;
    credentials = { username: finalUsername, password: finalPassword };
    const info2 = run(
      `INSERT INTO students (user_id, student_code, full_name, class_id, stream, gender, date_of_birth,
                             parent_name, parent_phone, parent_email, address, enrollment_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [userId, studentCode, fullName, classId || null, stream || null, gender || null, dob || null,
       parentName || null, parentPhone || null, parentEmail || null, address || null, enrollmentDate || null]
    );
    return info2.lastInsertRowid;
  });

  log(req.user, 'STUDENT_CREATED', `Created student "${fullName}" (${studentCode})`, req.ip);
  const student = get(`${LIST_SELECT} WHERE s.id = ?`, [studentId]);
  res.status(201).json({
    message: credentials
      ? `Student created successfully. Login: ${credentials.username} / ${credentials.password} — they will be asked to change it on first login.`
      : 'Student created successfully.',
    credentials,
    student,
  });
});

/** GET /api/students/:id */
router.get('/:id', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const id = asInt(req.params.id);
  const student = get(`${LIST_SELECT} WHERE s.id = ?`, [id]);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  if (req.user.role === 'teacher') {
    const myClasses = classIdsForTeacherUserId(req.user.id);
    if (!student.class_id || !myClasses.includes(student.class_id)) {
      return res.status(403).json({ error: 'You do not have access to this student.' });
    }
  }
  res.json({ student });
});

/** PUT /api/students/:id */
router.put('/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const existing = get('SELECT * FROM students WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Student not found.' });

  const fullName = cleanString(req.body.fullName, 120) || existing.full_name;
  const studentCode = cleanString(req.body.studentCode, 40) || existing.student_code;
  const classId = req.body.classId !== undefined && req.body.classId !== null && req.body.classId !== ''
    ? asInt(req.body.classId) : existing.class_id;
  const stream = cleanString(req.body.stream, 20) || existing.stream;
  const gender = cleanString(req.body.gender, 20) || existing.gender;
  const dob = cleanString(req.body.dateOfBirth, 20) || existing.date_of_birth;
  const parentName = cleanString(req.body.parentName, 120) || existing.parent_name;
  const parentPhone = cleanString(req.body.parentPhone, 30) || existing.parent_phone;
  const parentEmail = cleanString(req.body.parentEmail, 160) || existing.parent_email;
  const address = cleanString(req.body.address, 300) || existing.address;
  const enrollmentDate = cleanString(req.body.enrollmentDate, 20) || existing.enrollment_date;
  const status = cleanString(req.body.status, 20) || existing.status;

  if (classId && !get('SELECT id FROM classes WHERE id = ?', [classId])) {
    return res.status(400).json({ error: 'Selected class does not exist.' });
  }
  if (status && !['active', 'inactive', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const clash = get('SELECT id FROM students WHERE student_code = ? AND id != ?', [studentCode, id]);
  if (clash) return res.status(409).json({ error: 'That student number is already in use.' });

  run(
    `UPDATE students SET full_name = ?, student_code = ?, class_id = ?, stream = ?, gender = ?,
       date_of_birth = ?, parent_name = ?, parent_phone = ?, parent_email = ?, address = ?,
       enrollment_date = ?, status = ?
     WHERE id = ?`,
    [fullName, studentCode, classId, stream, gender, dob, parentName, parentPhone, parentEmail, address, enrollmentDate, status, id]
  );
  if (existing.user_id) {
    run('UPDATE users SET full_name = ? WHERE id = ?', [fullName, existing.user_id]);
    run('UPDATE users SET status = ? WHERE id = ?', [status, existing.user_id]);
  }
  log(req.user, 'STUDENT_UPDATED', `Updated student "${fullName}" (${studentCode})`, req.ip);
  res.json({ message: 'Student updated.', student: get(`${LIST_SELECT} WHERE s.id = ?`, [id]) });
});

/** DELETE /api/students/:id — delete student and (optionally) their account. */
router.delete('/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const s = get('SELECT * FROM students WHERE id = ?', [id]);
  if (!s) return res.status(404).json({ error: 'Student not found.' });
  tx(() => {
    run('DELETE FROM parent_students WHERE student_id = ?', [id]);
    run('DELETE FROM students WHERE id = ?', [id]);
    if (s.user_id) run('DELETE FROM users WHERE id = ?', [s.user_id]);
  });
  log(req.user, 'STUDENT_DELETED', `Deleted student "${s.full_name}"`, req.ip);
  res.json({ message: 'Student deleted.' });
});

/** PUT /api/students/:id/status — activate/deactivate without deleting. */
router.put('/:id/status', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const status = cleanString(req.body.status, 20);
  if (!['active', 'inactive', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const s = get('SELECT * FROM students WHERE id = ?', [id]);
  if (!s) return res.status(404).json({ error: 'Student not found.' });
  run('UPDATE students SET status = ? WHERE id = ?', [status, id]);
  if (s.user_id) run('UPDATE users SET status = ? WHERE id = ?', [status, s.user_id]);
  log(req.user, 'STUDENT_STATUS', `Set status of "${s.full_name}" to ${status}`, req.ip);
  res.json({ message: `Student ${status}.` });
});

/** POST /api/students/:id/link-parent — link a student to an existing parent account. */
router.post('/:id/link-parent', authenticate, requireStaffAdmin, (req, res) => {
  const studentId = asInt(req.params.id);
  const parentId = asInt(req.body.parentId);
  const relationship = cleanString(req.body.relationship, 60) || 'Parent/Guardian';
  if (!parentId || !get('SELECT id FROM parents WHERE id = ?', [parentId])) {
    return res.status(400).json({ error: 'Valid parentId is required.' });
  }
  if (!get('SELECT id FROM students WHERE id = ?', [studentId])) {
    return res.status(404).json({ error: 'Student not found.' });
  }
  run(
    'INSERT OR IGNORE INTO parent_students (parent_id, student_id, relationship) VALUES (?, ?, ?)',
    [parentId, studentId, relationship]
  );
  log(req.user, 'STUDENT_LINKED', `Linked student ${studentId} to parent ${parentId}`, req.ip);
  res.json({ message: 'Parent linked to student.' });
});

/** Convenience used by the student dashboard. */
function studentByUserId(userId) {
  return get(`${LIST_SELECT} WHERE s.user_id = ?`, [userId]);
}

module.exports = router;
module.exports.studentByUserId = studentByUserId;
