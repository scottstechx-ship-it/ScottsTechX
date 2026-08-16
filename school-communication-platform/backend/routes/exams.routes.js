/**
 * /api/exams — exam schedules, marks entry and result publishing.
 * Workflow: draft -> scheduled -> completed -> published (publish = admin only).
 * Teachers cannot publish unfinished results.
 */
const express = require('express');
const router = express.Router();
const { all, get, run, tx } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { cleanString, asInt, asBool } = require('../middleware/validate');
const { log } = require('../services/audit');
const { notifyMany } = require('../services/notify');
const {
  classIdsForTeacherUserId,
  classIdForStudentUserId,
  classIdsForParentUserId,
  studentIdsForClass,
  studentUserIdsForClass,
} = require('../services/permissions');

const STATUSES = ['draft', 'scheduled', 'completed', 'published'];

function scopedClassIds(user) {
  if (user.role === 'super_admin' || user.role === 'admin') return null;
  if (user.role === 'teacher') return classIdsForTeacherUserId(user.id);
  if (user.role === 'student') { const c = classIdForStudentUserId(user.id); return c ? [c] : []; }
  if (user.role === 'parent') return classIdsForParentUserId(user.id);
  return [];
}

/** GET /api/exams */
router.get('/', authenticate, (req, res) => {
  const classId = asInt(req.query.classId);
  const search = cleanString(req.query.search, 120);
  const limit = Math.min(asInt(req.query.limit, 200) || 200, 500);
  const offset = Math.max(asInt(req.query.offset, 0) || 0, 0);

  const where = [];
  const params = [];
  const scoped = scopedClassIds(req.user);
  if (scoped === null) {
    if (classId) { where.push('e.class_id = ?'); params.push(classId); }
  } else {
    if (!scoped.length) return res.json({ exams: [], total: 0 });
    if (classId) {
      if (!scoped.includes(classId)) return res.status(403).json({ error: 'You do not have access to that class.' });
      where.push('e.class_id = ?'); params.push(classId);
    } else {
      where.push(`e.class_id IN (${scoped.map(() => '?').join(',')})`); params.push(...scoped);
    }
  }
  if (search) { where.push('(e.title LIKE ? OR e.subject LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) c FROM exams e ${whereSql}`, params).c;
  const exams = all(
    `SELECT e.*, c.name AS class_name, c.stream AS class_stream,
            (SELECT COUNT(*) FROM exam_results r WHERE r.exam_id = e.id) AS results_count
     FROM exams e LEFT JOIN classes c ON c.id = e.class_id
     ${whereSql} ORDER BY e.date IS NULL, e.date ASC, e.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]
  );

  // Students/parents only see published or completed exams' details; hide drafts.
  const visible = exams.filter((e) => {
    if (['super_admin', 'admin', 'teacher'].includes(req.user.role)) return true;
    return e.status === 'published' || e.status === 'completed';
  });
  res.json({ exams: visible, total: visible.length, limit, offset });
});

/** POST /api/exams — admin or teacher creates. */
router.post('/', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const title = cleanString(req.body.title, 200);
  const classId = asInt(req.body.classId);
  const subject = cleanString(req.body.subject, 120);
  const date = cleanString(req.body.date, 20);
  const startTime = cleanString(req.body.startTime, 10);
  const endTime = cleanString(req.body.endTime, 10);
  const term = cleanString(req.body.term, 60);

  if (!title || !classId || !subject) return res.status(400).json({ error: 'Title, class and subject are required.' });
  if (!get('SELECT id FROM classes WHERE id = ?', [classId])) return res.status(404).json({ error: 'Class not found.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(classId)) {
    return res.status(403).json({ error: 'You can only create exams for your own classes.' });
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });

  const info = run(
    'INSERT INTO exams (title, class_id, subject, date, start_time, end_time, term, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, \'draft\', ?)',
    [title, classId, subject, date || null, startTime || null, endTime || null, term || null, req.user.id]
  );
  log(req.user, 'EXAM_CREATED', `Created exam "${title}" (${subject}, class ${classId})`, req.ip);
  res.status(201).json({ message: 'Exam created (draft).', exam: get('SELECT * FROM exams WHERE id = ?', [info.lastInsertRowid]) });
});

/** GET /api/exams/:id */
router.get('/:id', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  const e = get('SELECT * FROM exams WHERE id = ?', [id]);
  if (!e) return res.status(404).json({ error: 'Exam not found.' });
  const scoped = scopedClassIds(req.user);
  if (scoped !== null && !scoped.includes(e.class_id)) return res.status(403).json({ error: 'You do not have access to this exam.' });
  if (!['super_admin', 'admin', 'teacher'].includes(req.user.role) && e.status === 'draft') {
    return res.status(403).json({ error: 'This exam has not been published yet.' });
  }
  const cls = get('SELECT name, stream FROM classes WHERE id = ?', [e.class_id]);
  e.class_name = cls ? `${cls.name} ${cls.stream}` : '';

  if (['super_admin', 'admin', 'teacher'].includes(req.user.role)) {
    e.results = all(
      `SELECT r.*, s.full_name AS student_name, s.student_code FROM exam_results r
       JOIN students s ON s.id = r.student_id WHERE r.exam_id = ? ORDER BY s.full_name`, [id]
    );
    e.results_count = e.results.length;
  } else if (req.user.role === 'student') {
    const me = get('SELECT id FROM students WHERE user_id = ?', [req.user.id]);
    if (me) e.my_result = get('SELECT * FROM exam_results WHERE exam_id = ? AND student_id = ?', [id, me.id]) || null;
  } else if (req.user.role === 'parent') {
    // Parents see ONLY their own children's results — never the whole class.
    const childIds = all(
      `SELECT s.id FROM parent_students ps JOIN students s ON s.id = ps.student_id
       WHERE ps.parent_id = (SELECT id FROM parents WHERE user_id = ?)`, [req.user.id]
    ).map((r) => r.id);
    e.results = childIds.length ? all(
      `SELECT r.*, s.full_name AS student_name, s.student_code FROM exam_results r
       JOIN students s ON s.id = r.student_id
       WHERE r.exam_id = ? AND r.student_id IN (${childIds.map(() => '?').join(',')})
       ORDER BY s.full_name`, [id, ...childIds]
    ) : [];
    e.results_count = e.results.length;
  }
  res.json({ exam: e });
});

/** PUT /api/exams/:id — edit (creator/teacher of class/admin). */
router.put('/:id', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const id = asInt(req.params.id);
  const e = get('SELECT * FROM exams WHERE id = ?', [id]);
  if (!e) return res.status(404).json({ error: 'Exam not found.' });
  if (e.status === 'published') return res.status(400).json({ error: 'Published exams cannot be edited. Ask a Super Admin.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(e.class_id)) {
    return res.status(403).json({ error: 'You can only edit exams for your own classes.' });
  }
  const title = cleanString(req.body.title, 200) || e.title;
  const subject = req.body.subject !== undefined ? cleanString(req.body.subject, 120) : e.subject;
  const date = req.body.date !== undefined ? cleanString(req.body.date, 20) : e.date;
  const startTime = req.body.startTime !== undefined ? cleanString(req.body.startTime, 10) : e.start_time;
  const endTime = req.body.endTime !== undefined ? cleanString(req.body.endTime, 10) : e.end_time;
  const term = req.body.term !== undefined ? cleanString(req.body.term, 60) : e.term;
  const status = req.body.status !== undefined ? cleanString(req.body.status, 20) : e.status;
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid exam status.' });
  run('UPDATE exams SET title = ?, subject = ?, date = ?, start_time = ?, end_time = ?, term = ?, status = ?, updated_at = ? WHERE id = ?',
    [title, subject, date || null, startTime || null, endTime || null, term || null, status || e.status, new Date().toISOString(), id]);
  log(req.user, 'EXAM_UPDATED', `Updated exam "${title}" -> status ${status || e.status}`, req.ip);
  res.json({ message: 'Exam updated.', exam: get('SELECT * FROM exams WHERE id = ?', [id]) });
});

/** DELETE /api/exams/:id */
router.delete('/:id', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const id = asInt(req.params.id);
  const e = get('SELECT * FROM exams WHERE id = ?', [id]);
  if (!e) return res.status(404).json({ error: 'Exam not found.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(e.class_id)) {
    return res.status(403).json({ error: 'You can only delete exams for your own classes.' });
  }
  tx(() => {
    run('DELETE FROM exam_results WHERE exam_id = ?', [id]);
    run('DELETE FROM exams WHERE id = ?', [id]);
  });
  log(req.user, 'EXAM_DELETED', `Deleted exam "${e.title}"`, req.ip);
  res.json({ message: 'Exam deleted.' });
});

/** PUT /api/exams/:id/results — bulk enter marks for the class. */
router.put('/:id/results', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const id = asInt(req.params.id);
  const e = get('SELECT * FROM exams WHERE id = ?', [id]);
  if (!e) return res.status(404).json({ error: 'Exam not found.' });
  if (e.status === 'published') return res.status(400).json({ error: 'Published results cannot be changed.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(e.class_id)) {
    return res.status(403).json({ error: 'You can only enter marks for your own classes.' });
  }
  const rows = Array.isArray(req.body.results) ? req.body.results : [];
  if (!rows.length) return res.status(400).json({ error: 'Provide results: [{studentId, marks, grade?, comments?}]' });
  const classStudentIds = studentIdsForClass(e.class_id);
  let saved = 0;
  tx(() => {
    for (const r of rows) {
      const studentId = asInt(r.studentId);
      const marks = parseFloat(r.marks);
      if (!classStudentIds.includes(studentId) || isNaN(marks) || marks < 0 || marks > 100) continue;
      const grade = cleanString(r.grade, 10) || gradeFor(marks);
      const comments = cleanString(r.comments, 1000);
      run(
        `INSERT INTO exam_results (exam_id, student_id, marks, grade, comments, entered_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(exam_id, student_id) DO UPDATE SET marks = excluded.marks, grade = excluded.grade, comments = excluded.comments, entered_by = excluded.entered_by, updated_at = excluded.updated_at`,
        [id, studentId, marks, grade, comments || null, req.user.id, new Date().toISOString()]
      );
      saved++;
    }
    if (e.status === 'draft') run('UPDATE exams SET status = \'completed\', updated_at = ? WHERE id = ?', [new Date().toISOString(), id]);
  });
  log(req.user, 'EXAM_RESULTS_ENTERED', `Entered ${saved} results for exam "${e.title}"`, req.ip);
  res.json({ message: `${saved} result${saved === 1 ? '' : 's'} saved. The exam is now "completed".`, saved });
});

function gradeFor(marks) {
  if (marks >= 80) return 'A';
  if (marks >= 70) return 'B';
  if (marks >= 60) return 'C';
  if (marks >= 50) return 'D';
  return 'F';
}

/** POST /api/exams/:id/publish — admin only. Notifies students + parents. */
router.post('/:id/publish', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  const id = asInt(req.params.id);
  const e = get('SELECT * FROM exams WHERE id = ?', [id]);
  if (!e) return res.status(404).json({ error: 'Exam not found.' });
  if (e.status !== 'completed') {
    return res.status(400).json({ error: 'Only completed exams can be published. Enter all marks first.' });
  }
  const count = get('SELECT COUNT(*) c FROM exam_results WHERE exam_id = ?', [id]).c;
  const students = get('SELECT COUNT(*) c FROM students WHERE class_id = ? AND status = \'active\'', [e.class_id]).c;
  if (count === 0) return res.status(400).json({ error: 'No results entered yet — cannot publish.' });
  run('UPDATE exams SET status = \'published\', updated_at = ? WHERE id = ?', [new Date().toISOString(), id]);
  const userIds = studentUserIdsForClass(e.class_id);
  notifyMany(userIds, 'results', 'Results published', `Results for "${e.title}" (${e.subject}) are now available.`, '/exams');
  log(req.user, 'EXAM_PUBLISHED', `Published results for exam "${e.title}" (${count} results)`, req.ip);
  res.json({ message: `Results published. ${count} results released to ${userIds.length} students.` });
});

module.exports = router;
