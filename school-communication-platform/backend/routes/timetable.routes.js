/**
 * /api/timetable — weekly timetable with conflict prevention.
 * Admins manage entries; teachers see theirs; students/parents see the class.
 */
const express = require('express');
const router = express.Router();
const { all, get, run, tx } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { cleanString, asInt } = require('../middleware/validate');
const { log } = require('../services/audit');
const {
  classIdsForTeacherUserId,
  classIdForStudentUserId,
  classIdsForParentUserId,
} = require('../services/permissions');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function timeToMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Detect overlap between two time ranges (half-open). */
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function scopedClassIds(user) {
  if (['super_admin', 'admin'].includes(user.role)) return null;
  if (user.role === 'teacher') return classIdsForTeacherUserId(user.id);
  if (user.role === 'student') { const c = classIdForStudentUserId(user.id); return c ? [c] : []; }
  if (user.role === 'parent') return classIdsForParentUserId(user.id);
  return [];
}

/** GET /api/timetable — optional ?classId= / ?teacherId= / ?day= */
router.get('/', authenticate, (req, res) => {
  const classId = asInt(req.query.classId);
  const teacherId = asInt(req.query.teacherId);
  const day = cleanString(req.query.day, 20);
  const academicYear = cleanString(req.query.academicYear, 20) || '2026';

  const where = ['t.academic_year = ?'];
  const params = [academicYear];
  const scoped = scopedClassIds(req.user);

  if (scoped === null) {
    if (classId) { where.push('t.class_id = ?'); params.push(classId); }
  } else {
    if (!scoped.length) return res.json({ entries: [] });
    if (classId) {
      if (!scoped.includes(classId)) return res.status(403).json({ error: 'You do not have access to that class.' });
      where.push('t.class_id = ?'); params.push(classId);
    } else {
      where.push(`t.class_id IN (${scoped.map(() => '?').join(',')})`); params.push(...scoped);
    }
  }
  if (teacherId) {
    if (req.user.role === 'teacher' && teacherId !== get('SELECT id FROM teachers WHERE user_id = ?', [req.user.id]).id) {
      return res.status(403).json({ error: 'You can only view your own timetable.' });
    }
    where.push('t.teacher_id = ?'); params.push(teacherId);
  }
  if (day && DAYS.includes(day)) { where.push('t.day = ?'); params.push(day); }

  const entries = all(
    `SELECT t.*, c.name AS class_name, c.stream AS class_stream,
            tc.full_name AS teacher_name
     FROM timetable_entries t
     LEFT JOIN classes c ON c.id = t.class_id
     LEFT JOIN teachers tc ON tc.id = t.teacher_id
     WHERE ${where.join(' AND ')} ORDER BY t.day, t.start_time`, params
  );
  res.json({ entries, days: DAYS });
});

/** POST /api/timetable — create an entry with conflict detection. */
router.post('/', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  const classId = asInt(req.body.classId);
  const subject = cleanString(req.body.subject, 120);
  const teacherId = asInt(req.body.teacherId);
  const room = cleanString(req.body.room, 60);
  const day = cleanString(req.body.day, 20);
  const startTime = cleanString(req.body.startTime, 10);
  const endTime = cleanString(req.body.endTime, 10);
  const academicYear = cleanString(req.body.academicYear, 20) || '2026';

  if (!classId || !day || !startTime || !endTime) return res.status(400).json({ error: 'classId, day, startTime and endTime are required.' });
  if (!DAYS.includes(day)) return res.status(400).json({ error: `day must be one of: ${DAYS.join(', ')}` });
  const s = timeToMin(startTime); const e = timeToMin(endTime);
  if (s === null || e === null || e <= s) return res.status(400).json({ error: 'Times must be HH:MM and end must be after start.' });
  if (!get('SELECT id FROM classes WHERE id = ?', [classId])) return res.status(404).json({ error: 'Class not found.' });
  if (teacherId && !get('SELECT id FROM teachers WHERE id = ?', [teacherId])) return res.status(404).json({ error: 'Teacher not found.' });

  // Conflict checks (same academic year)
  const conflicts = [];
  const classConflicts = all(
    'SELECT * FROM timetable_entries WHERE class_id = ? AND day = ? AND academic_year = ?',
    [classId, day, academicYear]
  );
  for (const c of classConflicts) {
    if (overlaps(s, e, timeToMin(c.start_time), timeToMin(c.end_time))) {
      conflicts.push(`Class already has "${c.subject || 'a lesson'}" at ${c.start_time}-${c.end_time}`);
    }
  }
  if (teacherId) {
    const teacherConflicts = all(
      'SELECT t.*, c.name AS class_name FROM timetable_entries t LEFT JOIN classes c ON c.id = t.class_id WHERE t.teacher_id = ? AND t.day = ? AND t.academic_year = ?',
      [teacherId, day, academicYear]
    );
    for (const c of teacherConflicts) {
      if (overlaps(s, e, timeToMin(c.start_time), timeToMin(c.end_time))) {
        conflicts.push(`Teacher is already teaching ${c.class_name} at ${c.start_time}-${c.end_time}`);
      }
    }
  }
  if (room) {
    const roomConflicts = all(
      'SELECT * FROM timetable_entries WHERE room = ? AND day = ? AND academic_year = ? AND room != \'\'',
      [room, day, academicYear]
    );
    for (const c of roomConflicts) {
      if (overlaps(s, e, timeToMin(c.start_time), timeToMin(c.end_time))) {
        conflicts.push(`Room "${room}" is already booked at ${c.start_time}-${c.end_time}`);
      }
    }
  }
  if (conflicts.length) {
    return res.status(409).json({ error: 'Scheduling conflict: ' + conflicts.join('; ') + '.', conflicts });
  }

  const info = run(
    `INSERT INTO timetable_entries (class_id, subject, teacher_id, room, day, start_time, end_time, academic_year)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [classId, subject || null, teacherId || null, room || null, day, startTime, endTime, academicYear]
  );
  log(req.user, 'TIMETABLE_CREATED', `Added ${subject || 'lesson'} ${day} ${startTime}-${endTime}`, req.ip);
  res.status(201).json({ message: 'Timetable entry added.', entry: get('SELECT * FROM timetable_entries WHERE id = ?', [info.lastInsertRowid]) });
});

/** PUT /api/timetable/:id — edit with conflict re-check (excludes self). */
router.put('/:id', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  const id = asInt(req.params.id);
  const existing = get('SELECT * FROM timetable_entries WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Timetable entry not found.' });
  const classId = asInt(req.body.classId) || existing.class_id;
  const subject = req.body.subject !== undefined ? cleanString(req.body.subject, 120) : existing.subject;
  const teacherId = req.body.teacherId !== undefined && req.body.teacherId !== null && req.body.teacherId !== '' ? asInt(req.body.teacherId) : existing.teacher_id;
  const room = req.body.room !== undefined ? cleanString(req.body.room, 60) : existing.room;
  const day = cleanString(req.body.day, 20) || existing.day;
  const startTime = cleanString(req.body.startTime, 10) || existing.start_time;
  const endTime = cleanString(req.body.endTime, 10) || existing.end_time;
  const academicYear = cleanString(req.body.academicYear, 20) || existing.academic_year;
  const s = timeToMin(startTime); const e = timeToMin(endTime);
  if (s === null || e === null || e <= s) return res.status(400).json({ error: 'Times must be HH:MM and end must be after start.' });

  const conflicts = [];
  const classConflicts = all(
    'SELECT * FROM timetable_entries WHERE class_id = ? AND day = ? AND academic_year = ? AND id != ?',
    [classId, day, academicYear, id]
  );
  for (const c of classConflicts) {
    if (overlaps(s, e, timeToMin(c.start_time), timeToMin(c.end_time))) {
      conflicts.push(`Class already has "${c.subject || 'a lesson'}" at ${c.start_time}-${c.end_time}`);
    }
  }
  if (teacherId) {
    const tc = all(
      'SELECT t.*, c.name AS class_name FROM timetable_entries t LEFT JOIN classes c ON c.id = t.class_id WHERE t.teacher_id = ? AND t.day = ? AND t.academic_year = ? AND t.id != ?',
      [teacherId, day, academicYear, id]
    );
    for (const c of tc) {
      if (overlaps(s, e, timeToMin(c.start_time), timeToMin(c.end_time))) {
        conflicts.push(`Teacher is already teaching ${c.class_name} at ${c.start_time}-${c.end_time}`);
      }
    }
  }
  if (conflicts.length) return res.status(409).json({ error: 'Scheduling conflict: ' + conflicts.join('; '), conflicts });

  run('UPDATE timetable_entries SET class_id = ?, subject = ?, teacher_id = ?, room = ?, day = ?, start_time = ?, end_time = ?, academic_year = ? WHERE id = ?',
    [classId, subject || null, teacherId || null, room || null, day, startTime, endTime, academicYear, id]);
  log(req.user, 'TIMETABLE_UPDATED', `Updated timetable entry ${day} ${startTime}-${endTime}`, req.ip);
  res.json({ message: 'Timetable entry updated.' });
});

/** DELETE /api/timetable/:id */
router.delete('/:id', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  const id = asInt(req.params.id);
  const existing = get('SELECT * FROM timetable_entries WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Timetable entry not found.' });
  run('DELETE FROM timetable_entries WHERE id = ?', [id]);
  log(req.user, 'TIMETABLE_DELETED', `Deleted timetable entry ${existing.day} ${existing.start_time}`, req.ip);
  res.json({ message: 'Timetable entry deleted.' });
});

module.exports = router;
