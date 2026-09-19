/**
 * /api/attendance — attendance marking & history.
 *  - Teachers/admins mark attendance for their classes
 *  - Students & parents see only their own / their children's records
 */
const express = require('express');
const router = express.Router();
const { all, get, run, tx } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { cleanString, asInt } = require('../middleware/validate');
const { log } = require('../services/audit');
const { notify } = require('../services/notify');
const {
  classIdsForTeacherUserId,
  classIdForStudentUserId,
  classIdsForParentUserId,
  studentIdsForClass,
} = require('../services/permissions');

function statusValid(s) { return ['present', 'absent', 'late', 'permission'].includes(s); }

/** GET /api/attendance — filter by classId, date, studentId, month. Scoped by role. */
router.get('/', authenticate, (req, res) => {
  const classId = asInt(req.query.classId);
  const date = cleanString(req.query.date, 20);
  const studentId = asInt(req.query.studentId);
  const month = cleanString(req.query.month, 10); // YYYY-MM
  const limit = Math.min(asInt(req.query.limit, 500) || 500, 1000);
  const offset = Math.max(asInt(req.query.offset, 0) || 0, 0);

  const where = [];
  const params = [];

  // Scope by role
  if (req.user.role === 'student') {
    const sid = get('SELECT id FROM students WHERE user_id = ?', [req.user.id]);
    if (!sid) return res.json({ attendance: [], total: 0 });
    if (studentId && studentId !== sid.id) {
      return res.status(403).json({ error: 'You can only view your own attendance.' });
    }
    where.push('a.student_id = ?'); params.push(sid.id);
  } else if (req.user.role === 'parent') {
    const sids = all(
      `SELECT s.id FROM parent_students ps JOIN students s ON s.id = ps.student_id
       WHERE ps.parent_id = (SELECT id FROM parents WHERE user_id = ?)`, [req.user.id]
    ).map((r) => r.id);
    if (!sids.length) return res.json({ attendance: [], total: 0 });
    if (studentId) {
      if (!sids.includes(studentId)) return res.status(403).json({ error: 'You can only view attendance for your own children.' });
      where.push('a.student_id = ?'); params.push(studentId);
    } else {
      where.push(`a.student_id IN (${sids.map(() => '?').join(',')})`); params.push(...sids);
    }
  } else if (req.user.role === 'teacher') {
    const myClasses = classIdsForTeacherUserId(req.user.id);
    if (!myClasses.length) return res.json({ attendance: [], total: 0 });
    if (classId) {
      if (!myClasses.includes(classId)) return res.status(403).json({ error: 'You can only view attendance for your own classes.' });
      where.push('a.class_id = ?'); params.push(classId);
    } else {
      where.push(`a.class_id IN (${myClasses.map(() => '?').join(',')})`); params.push(...myClasses);
    }
  } else if (classId) {
    where.push('a.class_id = ?'); params.push(classId);
  }

  if (studentId && !['parent', 'student'].includes(req.user.role)) { where.push('a.student_id = ?'); params.push(studentId); }
  if (date) { where.push('a.date = ?'); params.push(date); }
  if (month) { where.push("a.date LIKE ?"); params.push(month + '%'); }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) c FROM attendance a ${whereSql}`, params).c;
  const attendance = all(
    `SELECT a.*, s.full_name AS student_name, s.student_code, c.name AS class_name, c.stream AS class_stream,
            u.full_name AS marked_by_name
     FROM attendance a
     JOIN students s ON s.id = a.student_id
     LEFT JOIN classes c ON c.id = a.class_id
     LEFT JOIN users u ON u.id = a.marked_by
     ${whereSql} ORDER BY a.date DESC, a.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]
  );
  res.json({ attendance, total, limit, offset });
});

/**
 * POST /api/attendance — mark a day for a class.
 * body: { classId, date, records: [{studentId, status, note?}] }
 * Teachers: only their own classes. Admins: any class.
 */
router.post('/', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const classId = asInt(req.body.classId);
  const date = cleanString(req.body.date, 20);
  const records = Array.isArray(req.body.records) ? req.body.records : [];
  if (!classId || !date) return res.status(400).json({ error: 'classId and date are required.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
  if (!records.length) return res.status(400).json({ error: 'Provide at least one attendance record.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(classId)) {
    return res.status(403).json({ error: 'You can only mark attendance for your own classes.' });
  }
  if (!get('SELECT id FROM classes WHERE id = ?', [classId])) return res.status(404).json({ error: 'Class not found.' });

  const classStudentIds = studentIdsForClass(classId);
  let marked = 0;
  tx(() => {
    for (const rec of records) {
      const studentId = asInt(rec.studentId);
      const status = cleanString(rec.status, 20);
      const note = cleanString(rec.note, 300);
      if (!studentId || !classStudentIds.includes(studentId)) continue;
      if (!statusValid(status)) continue;
      run(
        `INSERT INTO attendance (student_id, class_id, date, status, note, marked_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status, note = excluded.note, marked_by = excluded.marked_by, updated_at = excluded.updated_at`,
        [studentId, classId, date, status, note || null, req.user.id, new Date().toISOString()]
      );
      marked++;
      // Alert the parent when a student is marked absent/late
      if (status === 'absent' || status === 'late') {
        const parentLink = get(
          `SELECT p.user_id FROM parent_students ps JOIN parents p ON p.id = ps.parent_id WHERE ps.student_id = ? AND p.status = 'active'`,
          [studentId]
        );
        if (parentLink && parentLink.user_id) {
          notify(parentLink.user_id, 'attendance', `${req.user.full_name}: attendance alert`,
            `Your child was marked ${status} on ${date}.`, '/attendance');
        }
      }
    }
  });
  log(req.user, 'ATTENDANCE_MARKED', `Marked ${marked} records for class ${classId} on ${date}`, req.ip);
  res.json({ message: `${marked} attendance record${marked === 1 ? '' : 's'} saved.`, marked });
});

/** PUT /api/attendance/:id — correct a single record (authorized roles). */
router.put('/:id', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const id = asInt(req.params.id);
  const a = get('SELECT * FROM attendance WHERE id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'Attendance record not found.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(a.class_id)) {
    return res.status(403).json({ error: 'You can only edit attendance for your own classes.' });
  }
  const status = cleanString(req.body.status, 20);
  if (!statusValid(status)) return res.status(400).json({ error: 'Invalid attendance status.' });
  const note = req.body.note !== undefined ? cleanString(req.body.note, 300) : a.note;
  run('UPDATE attendance SET status = ?, note = ?, updated_at = ? WHERE id = ?', [status, note || null, new Date().toISOString(), id]);
  log(req.user, 'ATTENDANCE_UPDATED', `Corrected attendance for student ${a.student_id} on ${a.date} -> ${status}`, req.ip);
  res.json({ message: 'Attendance updated.' });
});

/** DELETE /api/attendance/:id */
router.delete('/:id', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const id = asInt(req.params.id);
  const a = get('SELECT * FROM attendance WHERE id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'Attendance record not found.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(a.class_id)) {
    return res.status(403).json({ error: 'You can only delete attendance for your own classes.' });
  }
  run('DELETE FROM attendance WHERE id = ?', [id]);
  log(req.user, 'ATTENDANCE_DELETED', `Deleted attendance record for student ${a.student_id} on ${a.date}`, req.ip);
  res.json({ message: 'Attendance record deleted.' });
});

/** GET /api/attendance/summary/student/:studentId — percentages + absences. */
router.get('/summary/student/:studentId', authenticate, (req, res) => {
  const studentId = asInt(req.params.studentId);
  const s = get('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!s) return res.status(404).json({ error: 'Student not found.' });

  // access: student self, parent of the student, teacher of the class, admins
  let allowed = ['super_admin', 'admin'].includes(req.user.role);
  if (!allowed && req.user.role === 'student') {
    const self = get('SELECT id FROM students WHERE user_id = ?', [req.user.id]);
    allowed = self && self.id === studentId;
  }
  if (!allowed && req.user.role === 'parent') {
    allowed = !!get(
      'SELECT 1 FROM parent_students ps WHERE ps.student_id = ? AND ps.parent_id = (SELECT id FROM parents WHERE user_id = ?)',
      [studentId, req.user.id]
    );
  }
  if (!allowed && req.user.role === 'teacher' && s.class_id) {
    allowed = classIdsForTeacherUserId(req.user.id).includes(s.class_id);
  }
  if (!allowed) return res.status(403).json({ error: 'You do not have access to this student\'s attendance.' });

  const rows = all('SELECT status, COUNT(*) c FROM attendance WHERE student_id = ? GROUP BY status', [studentId]);
  const total = rows.reduce((sum, r) => sum + r.c, 0);
  const byStatus = {};
  for (const r of rows) byStatus[r.status] = r.c;
  const presentDays = (byStatus.present || 0) + (byStatus.late || 0) + (byStatus.permission || 0);
  const recentAbsences = all(
    `SELECT date, status, note FROM attendance WHERE student_id = ? AND status IN ('absent','late') ORDER BY date DESC LIMIT 10`, [studentId]
  );

  res.json({
    studentId,
    total,
    present: byStatus.present || 0,
    absent: byStatus.absent || 0,
    late: byStatus.late || 0,
    permission: byStatus.permission || 0,
    percentage: total ? Math.round((presentDays / total) * 1000) / 10 : null,
    recentAbsences,
  });
});

module.exports = router;
