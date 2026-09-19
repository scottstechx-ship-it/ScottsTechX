/**
 * /api/assignments — assignments, submissions and grading.
 *  - Teachers create assignments for their classes, attach resources, grade
 *  - Students view/submit; parents view their children's class assignments
 */
const express = require('express');
const router = express.Router();
const { all, get, run, tx } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { cleanString, asInt, asBool } = require('../middleware/validate');
const { log } = require('../services/audit');
const { notify, notifyMany } = require('../services/notify');
const {
  classIdsForTeacherUserId,
  classIdForStudentUserId,
  classIdsForParentUserId,
  studentIdsForClass,
  studentUserIdsForClass,
  teachersForClass,
} = require('../services/permissions');

/** Students (user ids) of a class + their student table ids. */
function classStudents(classId) {
  return all(
    `SELECT s.id AS student_id, s.user_id FROM students s WHERE s.class_id = ? AND s.status = 'active'`, [classId]
  );
}

function scopedClassIds(user) {
  if (user.role === 'super_admin' || user.role === 'admin') return null; // all
  if (user.role === 'teacher') return classIdsForTeacherUserId(user.id);
  if (user.role === 'student') {
    const cid = classIdForStudentUserId(user.id);
    return cid ? [cid] : [];
  }
  if (user.role === 'parent') return classIdsForParentUserId(user.id);
  return [];
}

function withSubmissionsCount(assignments, user) {
  for (const a of assignments) {
    const count = get('SELECT COUNT(*) c FROM assignment_submissions WHERE assignment_id = ?', [a.id]).c;
    a.submission_count = count;
    if (user.role === 'student') {
      const mine = get(
        'SELECT grade, released, submitted_at FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?',
        [a.id, get('SELECT id FROM students WHERE user_id = ?', [user.id]).id]
      );
      a.my_submission = mine || null;
    }
  }
  return assignments;
}

/** GET /api/assignments — scoped by role. */
router.get('/', authenticate, (req, res) => {
  const classId = asInt(req.query.classId);
  const subject = cleanString(req.query.subject, 120);
  const status = cleanString(req.query.status, 20);
  const search = cleanString(req.query.search, 120);
  const limit = Math.min(asInt(req.query.limit, 200) || 200, 500);
  const offset = Math.max(asInt(req.query.offset, 0) || 0, 0);

  const where = [];
  const params = [];
  const scoped = scopedClassIds(req.user);

  if (scoped === null) {
    if (classId) { where.push('a.class_id = ?'); params.push(classId); }
  } else {
    if (!scoped.length) return res.json({ assignments: [], total: 0 });
    if (classId) {
      if (!scoped.includes(classId)) return res.status(403).json({ error: 'You do not have access to that class.' });
      where.push('a.class_id = ?'); params.push(classId);
    } else {
      where.push(`a.class_id IN (${scoped.map(() => '?').join(',')})`); params.push(...scoped);
    }
  }
  if (subject) { where.push('a.subject = ?'); params.push(subject); }
  if (status && ['active', 'archived'].includes(status)) { where.push('a.status = ?'); params.push(status); }
  if (search) { where.push('(a.title LIKE ? OR a.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) c FROM assignments a ${whereSql}`, params).c;
  const assignments = all(
    `SELECT a.*, c.name AS class_name, c.stream AS class_stream,
            t.full_name AS teacher_name,
            (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) AS submission_count
     FROM assignments a
     LEFT JOIN classes c ON c.id = a.class_id
     LEFT JOIN teachers t ON t.id = a.teacher_id
     ${whereSql} ORDER BY a.due_date IS NULL, a.due_date ASC, a.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]
  );
  res.json({ assignments: withSubmissionsCount(assignments, req.user), total, limit, offset });
});

/** POST /api/assignments — teacher creates for their class. */
router.post('/', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const title = cleanString(req.body.title, 200);
  const description = cleanString(req.body.description, 4000);
  const classId = asInt(req.body.classId);
  const subject = cleanString(req.body.subject, 120);
  const dueDate = cleanString(req.body.dueDate, 20);
  const resources = Array.isArray(req.body.resources) ? req.body.resources.map(asInt).filter(Boolean) : [];

  if (!title || !classId) return res.status(400).json({ error: 'Title and class are required.' });
  if (!get('SELECT id FROM classes WHERE id = ?', [classId])) return res.status(404).json({ error: 'Class not found.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(classId)) {
    return res.status(403).json({ error: 'You can only create assignments for your own classes.' });
  }
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return res.status(400).json({ error: 'Due date must be YYYY-MM-DD.' });

  const teacherRow = get('SELECT id FROM teachers WHERE user_id = ?', [req.user.id]);
  const info = run(
    `INSERT INTO assignments (title, description, class_id, subject, teacher_id, due_date, resources, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    [title, description || null, classId, subject || null, teacherRow ? teacherRow.id : null, dueDate || null, JSON.stringify(resources)]
  );

  // Notify students of the class
  const userIds = studentUserIdsForClass(classId);
  notifyMany(userIds, 'assignment', 'New assignment', `"${title}" — due ${dueDate || 'soon'}.`, '/assignments');
  log(req.user, 'ASSIGNMENT_CREATED', `Created assignment "${title}" for class ${classId}`, req.ip);
  res.status(201).json({ message: 'Assignment created.', assignment: get('SELECT * FROM assignments WHERE id = ?', [info.lastInsertRowid]) });
});

/** GET /api/assignments/:id */
router.get('/:id', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  const a = get('SELECT * FROM assignments WHERE id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  const scoped = scopedClassIds(req.user);
  if (scoped !== null && !scoped.includes(a.class_id)) return res.status(403).json({ error: 'You do not have access to this assignment.' });
  try { a.resources = JSON.parse(a.resources || '[]'); } catch { a.resources = []; }
  const cls = get('SELECT name, stream FROM classes WHERE id = ?', [a.class_id]);
  a.class_name = cls ? `${cls.name} ${cls.stream}` : '';

  if (['super_admin', 'admin', 'teacher'].includes(req.user.role)) {
    const canGrade = req.user.role !== 'teacher' || classIdsForTeacherUserId(req.user.id).includes(a.class_id);
    if (canGrade) {
      a.submissions = all(
        `SELECT s.*, st.full_name AS student_name, st.student_code, u.full_name AS graded_by_name,
                d.name AS attachment_name
         FROM assignment_submissions s
         JOIN students st ON st.id = s.student_id
         LEFT JOIN users u ON u.id = s.graded_by
         LEFT JOIN documents d ON d.id = s.attachment_id
         WHERE s.assignment_id = ? ORDER BY s.submitted_at DESC`, [id]
      );
      a.submission_count = a.submissions.length;
    }
  } else if (req.user.role === 'student') {
    const me = get('SELECT id, class_id, full_name FROM students WHERE user_id = ?', [req.user.id]);
    if (me) {
      const my = get('SELECT * FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?', [id, me.id]);
      if (my && !my.released) {
        // Hide grades/comments until the teacher releases them.
        my.grade = null;
        my.grade_comment = null;
      }
      a.my_submission = my;
    } else {
      a.my_submission = null;
    }
  }
  res.json({ assignment: a });
});

/** PUT /api/assignments/:id — edit (teacher of class or admin). */
router.put('/:id', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const id = asInt(req.params.id);
  const a = get('SELECT * FROM assignments WHERE id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(a.class_id)) {
    return res.status(403).json({ error: 'You can only edit assignments for your own classes.' });
  }
  const title = cleanString(req.body.title, 200) || a.title;
  const description = req.body.description !== undefined ? cleanString(req.body.description, 4000) : a.description;
  const subject = req.body.subject !== undefined ? cleanString(req.body.subject, 120) : a.subject;
  const dueDate = req.body.dueDate !== undefined ? cleanString(req.body.dueDate, 20) : a.due_date;
  const status = req.body.status !== undefined ? cleanString(req.body.status, 20) : a.status;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return res.status(400).json({ error: 'Due date must be YYYY-MM-DD.' });
  if (status && !['active', 'archived'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  run('UPDATE assignments SET title = ?, description = ?, subject = ?, due_date = ?, status = ?, updated_at = ? WHERE id = ?',
    [title, description || null, subject || null, dueDate || null, status || 'active', new Date().toISOString(), id]);
  log(req.user, 'ASSIGNMENT_UPDATED', `Updated assignment "${title}"`, req.ip);
  res.json({ message: 'Assignment updated.' });
});

/** DELETE /api/assignments/:id */
router.delete('/:id', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const id = asInt(req.params.id);
  const a = get('SELECT * FROM assignments WHERE id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(a.class_id)) {
    return res.status(403).json({ error: 'You can only delete assignments for your own classes.' });
  }
  run('DELETE FROM assignments WHERE id = ?', [id]);
  log(req.user, 'ASSIGNMENT_DELETED', `Deleted assignment "${a.title}"`, req.ip);
  res.json({ message: 'Assignment deleted.' });
});

/** POST /api/assignments/:id/submit — student submits (or resubmits). */
router.post('/:id/submit', authenticate, requireRole('student'), (req, res) => {
  const id = asInt(req.params.id);
  const a = get('SELECT * FROM assignments WHERE id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  const me = get('SELECT id, class_id, full_name FROM students WHERE user_id = ?', [req.user.id]);
  if (!me || me.class_id !== a.class_id) return res.status(403).json({ error: 'This assignment is not for your class.' });
  const content = cleanString(req.body.content, 4000);
  const attachmentId = asInt(req.body.attachmentId);
  if (!content && !attachmentId) return res.status(400).json({ error: 'Add some work text or an attachment.' });
  if (attachmentId) {
    const doc = get('SELECT * FROM documents WHERE id = ?', [attachmentId]);
    if (!doc || doc.uploaded_by !== req.user.id) return res.status(403).json({ error: 'You can only attach your own documents.' });
  }
  run(
    `INSERT INTO assignment_submissions (assignment_id, student_id, content, attachment_id, submitted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(assignment_id, student_id) DO UPDATE SET content = excluded.content, attachment_id = excluded.attachment_id, submitted_at = excluded.submitted_at, updated_at = excluded.updated_at`,
    [id, me.id, content, attachmentId || null, new Date().toISOString(), new Date().toISOString()]
  );
  // notify the teacher
  const tUser = get('SELECT user_id FROM teachers WHERE id = ?', [a.teacher_id]);
  if (tUser && tUser.user_id) {
    notify(tUser.user_id, 'assignment', 'New submission', `${me.full_name || 'A student'} submitted "${a.title}"`, '/assignments');
  }
  log(req.user, 'ASSIGNMENT_SUBMITTED', `Submitted "${a.title}"`, req.ip);
  res.json({ message: 'Assignment submitted.' });
});

/** PUT /api/assignments/:id/grade/:submissionId — teacher grades. */
router.put('/:id/grade/:submissionId', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const id = asInt(req.params.id);
  const submissionId = asInt(req.params.submissionId);
  const a = get('SELECT * FROM assignments WHERE id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(a.class_id)) {
    return res.status(403).json({ error: 'You can only grade assignments for your own classes.' });
  }
  const sub = get('SELECT * FROM assignment_submissions WHERE id = ? AND assignment_id = ?', [submissionId, id]);
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  const grade = parseFloat(req.body.grade);
  const comment = cleanString(req.body.comment, 1000);
  const released = req.body.released !== undefined ? (asBool(req.body.released) ? 1 : 0) : sub.released;
  if (req.body.grade !== undefined && (isNaN(grade) || grade < 0 || grade > 100)) {
    return res.status(400).json({ error: 'Grade must be a number between 0 and 100.' });
  }
  run('UPDATE assignment_submissions SET grade = ?, grade_comment = ?, graded_by = ?, released = ?, updated_at = ? WHERE id = ?',
    [isNaN(grade) ? null : grade, comment || null, req.user.id, released, new Date().toISOString(), submissionId]);
  log(req.user, 'ASSIGNMENT_GRADED', `Graded submission for "${a.title}" (${req.body.grade !== undefined ? grade : 'feedback only'})`, req.ip);
  // notify the student when the grade is released
  if (released && req.body.grade !== undefined) {
    const st = get('SELECT user_id FROM students WHERE id = ?', [sub.student_id]);
    if (st && st.user_id) {
      notify(st.user_id, 'results', 'Assignment graded', `Your submission for "${a.title}" was graded: ${grade}%`, '/assignments');
    }
  }
  res.json({ message: 'Submission graded.' });
});

/** POST /api/assignments/:id/publish — release all grades/feedback to students. */
router.post('/:id/publish', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const id = asInt(req.params.id);
  const a = get('SELECT * FROM assignments WHERE id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(a.class_id)) {
    return res.status(403).json({ error: 'You can only publish grades for your own classes.' });
  }
  run('UPDATE assignment_submissions SET released = 1 WHERE assignment_id = ?', [id]);
  const studentIds = classStudents(a.class_id);
  for (const s of studentIds) {
    if (s.user_id) notify(s.user_id, 'results', `Results released: "${a.title}"`, `Your grade for "${a.title}" is now available.`, '/assignments');
  }
  log(req.user, 'ASSIGNMENT_PUBLISHED', `Published grades for assignment "${a.title}"`, req.ip);
  res.json({ message: 'Grades published to the class.' });
});

module.exports = router;
