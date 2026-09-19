/**
 * /api/classes — class management + my-classes lookup for teachers & students.
 */
const express = require('express');
const router = express.Router();
const { all, get, run, tx } = require('../database/db');
const { authenticate, requireStaffAdmin } = require('../middleware/auth');
const { cleanString, asInt } = require('../middleware/validate');
const { log } = require('../services/audit');
const { classIdsForTeacherUserId, classIdForStudentUserId, teachersForClass } = require('../services/permissions');

/** GET /api/classes — list classes (admins see all; teachers see own; students see their class). */
router.get('/', authenticate, (req, res) => {
  const academicYear = cleanString(req.query.academicYear, 20);
  let rows;

  if (req.user.role === 'teacher') {
    const ids = classIdsForTeacherUserId(req.user.id);
    rows = ids.length
      ? all(`SELECT c.*, (SELECT t.full_name FROM teachers t WHERE t.id = c.class_teacher_id) AS class_teacher_name,
                    (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status='active') AS student_count
              FROM classes c WHERE c.id IN (${ids.map(() => '?').join(',')}) ORDER BY c.name, c.stream`, ids)
      : [];
  } else if (req.user.role === 'student') {
    const cid = classIdForStudentUserId(req.user.id);
    rows = cid
      ? all(`SELECT c.*, (SELECT t.full_name FROM teachers t WHERE t.id = c.class_teacher_id) AS class_teacher_name,
                    (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status='active') AS student_count
              FROM classes c WHERE c.id = ?`, [cid])
      : [];
  } else {
    rows = all(`SELECT c.*, (SELECT t.full_name FROM teachers t WHERE t.id = c.class_teacher_id) AS class_teacher_name,
                (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status='active') AS student_count
                FROM classes c ORDER BY c.name, c.stream`, []);
  }

  if (academicYear) rows = rows.filter((r) => r.academic_year === academicYear);
  res.json({ classes: rows });
});

/** POST /api/classes */
router.post('/', authenticate, requireStaffAdmin, (req, res) => {
  const name = cleanString(req.body.name, 60);
  const stream = cleanString(req.body.stream, 20) || 'A';
  const classTeacherId = asInt(req.body.classTeacherId);
  const academicYear = cleanString(req.body.academicYear, 20) || '2026';

  if (!name) return res.status(400).json({ error: 'Class name is required.' });
  if (get('SELECT id FROM classes WHERE name = ? AND stream = ? AND academic_year = ?', [name, stream, academicYear])) {
    return res.status(409).json({ error: `Class ${name} ${stream} (${academicYear}) already exists.` });
  }
  if (classTeacherId && !get('SELECT id FROM teachers WHERE id = ?', [classTeacherId])) {
    return res.status(400).json({ error: 'Selected class teacher does not exist.' });
  }

  const info = run(
    'INSERT INTO classes (name, stream, class_teacher_id, academic_year) VALUES (?, ?, ?, ?)',
    [name, stream, classTeacherId || null, academicYear]
  );
  if (classTeacherId) run('INSERT OR IGNORE INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)', [classTeacherId, info.lastInsertRowid]);
  log(req.user, 'CLASS_CREATED', `Created class ${name} ${stream}`, req.ip);
  res.status(201).json({ message: 'Class created.', class: get('SELECT * FROM classes WHERE id = ?', [info.lastInsertRowid]) });
});

/** GET /api/classes/:id — detail with students and teachers. */
router.get('/:id', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  const c = get('SELECT * FROM classes WHERE id = ?', [id]);
  if (!c) return res.status(404).json({ error: 'Class not found.' });

  // Access: admins, super admins, teachers assigned to the class, students of the class.
  if (req.user.role === 'teacher') {
    if (!classIdsForTeacherUserId(req.user.id).includes(id)) return res.status(403).json({ error: 'You do not have access to this class.' });
  }
  if (req.user.role === 'student' && classIdForStudentUserId(req.user.id) !== id) {
    return res.status(403).json({ error: 'You do not have access to this class.' });
  }
  if (req.user.role === 'parent') {
    const { classIdsForParentUserId } = require('../services/permissions');
    if (!classIdsForParentUserId(req.user.id).includes(id)) return res.status(403).json({ error: 'You do not have access to this class.' });
  }

  c.class_teacher = get(
    'SELECT t.id, t.full_name, t.phone, t.email, t.user_id FROM classes c JOIN teachers t ON t.id = c.class_teacher_id WHERE c.id = ?', [id]
  ) || null;

  c.teachers = all(
    `SELECT t.id, t.full_name, t.user_id, tc.subject FROM teacher_classes tc
     JOIN teachers t ON t.id = tc.teacher_id WHERE tc.class_id = ?`, [id]
  );

  // Students list — parents get names + basic info only; students see classmates.
  if (req.user.role === 'parent' || req.user.role === 'student') {
    c.students = all(
      `SELECT s.id, s.student_code, s.full_name, s.gender FROM students s
       WHERE s.class_id = ? AND s.status='active' ORDER BY s.full_name`, [id]
    );
  } else {
    c.students = all(
      `SELECT s.*, u.username, u.email AS user_email FROM students s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.class_id = ? ORDER BY s.full_name`, [id]
    );
  }
  res.json({ class: c });
});

/** PUT /api/classes/:id */
router.put('/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const existing = get('SELECT * FROM classes WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Class not found.' });

  const name = cleanString(req.body.name, 60) || existing.name;
  const stream = cleanString(req.body.stream, 20) || existing.stream;
  const academicYear = cleanString(req.body.academicYear, 20) || existing.academic_year;
  const classTeacherId = req.body.classTeacherId !== undefined && req.body.classTeacherId !== null && req.body.classTeacherId !== ''
    ? asInt(req.body.classTeacherId) : existing.class_teacher_id;

  if (classTeacherId && !get('SELECT id FROM teachers WHERE id = ?', [classTeacherId])) {
    return res.status(400).json({ error: 'Selected class teacher does not exist.' });
  }
  tx(() => {
    run('UPDATE classes SET name = ?, stream = ?, class_teacher_id = ?, academic_year = ? WHERE id = ?',
      [name, stream, classTeacherId || null, academicYear, id]);
    if (classTeacherId) run('INSERT OR IGNORE INTO teacher_classes (teacher_id, class_id) VALUES (?, ?)', [classTeacherId, id]);
  });
  log(req.user, 'CLASS_UPDATED', `Updated class ${name} ${stream}`, req.ip);
  res.json({ message: 'Class updated.', class: get('SELECT * FROM classes WHERE id = ?', [id]) });
});

/** DELETE /api/classes/:id */
router.delete('/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const c = get('SELECT * FROM classes WHERE id = ?', [id]);
  if (!c) return res.status(404).json({ error: 'Class not found.' });
  tx(() => {
    run('UPDATE students SET class_id = NULL WHERE class_id = ?', [id]);
    run('DELETE FROM teacher_classes WHERE class_id = ?', [id]);
    run('DELETE FROM conversations WHERE class_id = ?', [id]);
    run('DELETE FROM classes WHERE id = ?', [id]);
  });
  log(req.user, 'CLASS_DELETED', `Deleted class ${c.name} ${c.stream}`, req.ip);
  res.json({ message: 'Class deleted.' });
});

/** GET /api/classes/:id/students — explicit student list for a class. */
router.get('/:id/students', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  if (!get('SELECT id FROM classes WHERE id = ?', [id])) return res.status(404).json({ error: 'Class not found.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(id)) {
    return res.status(403).json({ error: 'You do not have access to this class.' });
  }
  if (req.user.role === 'student' && classIdForStudentUserId(req.user.id) !== id) {
    return res.status(403).json({ error: 'You do not have access to this class.' });
  }
  const students = all(
    `SELECT s.id, s.student_code, s.full_name, s.gender, s.status, u.id AS user_id
     FROM students s LEFT JOIN users u ON u.id = s.user_id
     WHERE s.class_id = ? AND s.status = 'active' ORDER BY s.full_name`, [id]
  );
  res.json({ students });
});

module.exports = router;
