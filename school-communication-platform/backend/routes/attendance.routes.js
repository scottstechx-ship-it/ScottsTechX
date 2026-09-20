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
const { termWindow, currentTerm, normaliseTerm, availableTerms } = require('../services/termCalendar');

function statusValid(s) { return ['present', 'absent', 'late', 'permission'].includes(s); }

/** Attendance rule used here: 'present', 'late' and 'permission' all count as
 *  attending; a student below CHRONIC_THRESHOLD% over the period is flagged. */
const CHRONIC_THRESHOLD = 80;

/** Class ids the caller may report on, or null when unrestricted. */
function reportScope(req) {
  if (['super_admin', 'admin'].includes(req.user.role)) return null;
  if (req.user.role === 'teacher') return classIdsForTeacherUserId(req.user.id);
  return [];
}

/**
 * Resolve the report window from the query string. Either an explicit
 * from/to range, or a term (+ year) which resolves through the school
 * calendar; falls back to the current term.
 */
function resolveWindow(query) {
  const from = String(query.from || '').slice(0, 10);
  const to = String(query.to || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null, to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null, term: null, year: null, source: 'range' };
  }
  const wantedTerm = normaliseTerm(query.term);
  let year = String(query.year || '').slice(0, 4);
  if (!wantedTerm && !/^\d{4}$/.test(year)) {
    const now = currentTerm();
    return { ...termWindow(now.term, now.year), source: 'current' };
  }
  if (!/^\d{4}$/.test(year)) year = String(new Date().getFullYear());
  const win = termWindow(wantedTerm, year);
  return win ? { ...win, source: 'term' } : { term: wantedTerm, year, from: null, to: null, configured: false, source: 'term' };
}

/** SQL fragment + params matching rows inside the window. */
function windowFilter(win, alias = 'a') {
  const where = [];
  const params = [];
  if (win.from && win.to) {
    // a row belongs to the term when its stamped term matches OR (unstamped
    // rows) when its date falls inside the window
    const stamp = win.term && win.year ? `(${alias}.term = ? AND ${alias}.academic_year = ?)` : null;
    if (stamp) { where.push(`(${stamp} OR ((${alias}.term IS NULL) AND ${alias}.date BETWEEN ? AND ?))`); params.push(win.term, win.year, win.from, win.to); }
    else { where.push(`${alias}.date BETWEEN ? AND ?`); params.push(win.from, win.to); }
  } else if (win.term && win.year) {
    where.push(`${alias}.term = ? AND ${alias}.academic_year = ?`);
    params.push(win.term, win.year);
  }
  return { sql: where.length ? where.join(' AND ') : null, params };
}

/** GET /api/attendance — filter by classId, date, studentId, month. Scoped by role. */
router.get('/', authenticate, (req, res) => {
  const classId = asInt(req.query.classId);
  const date = cleanString(req.query.date, 20);
  const studentId = asInt(req.query.studentId);
  const month = cleanString(req.query.month, 10); // YYYY-MM
  const term = normaliseTerm(req.query.term);
  const year = cleanString(req.query.year, 4);
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
  // term filter: prefer the stamped term, but include older unstamped rows
  // whose date falls inside that term's window
  if (term) {
    const win = termWindow(term, year || String(new Date().getFullYear()));
    const f = windowFilter(win);
    if (f.sql) { where.push(f.sql); params.push(...f.params); }
  }

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
  let records = Array.isArray(req.body.records) ? req.body.records : [];
  // "mark everyone present" (or everyone as one given status) in one request
  const markAll = req.body.markAll === true || req.body.markAll === 1 || req.body.markAll === 'true';
  const allStatus = cleanString(req.body.status, 20) || 'present';
  if (!classId || !date) return res.status(400).json({ error: 'classId and date are required.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
  if (markAll && !statusValid(allStatus)) return res.status(400).json({ error: 'Invalid attendance status.' });
  if (!markAll && !records.length) return res.status(400).json({ error: 'Provide at least one attendance record.' });
  if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(classId)) {
    return res.status(403).json({ error: 'You can only mark attendance for your own classes.' });
  }
  if (!get('SELECT id FROM classes WHERE id = ?', [classId])) return res.status(404).json({ error: 'Class not found.' });

  const classStudentIds = studentIdsForClass(classId);
  // who gets no parent alert when marking in bulk
  if (markAll) records = classStudentIds.map((studentId) => ({ studentId, status: allStatus, note: 'Marked for everyone' }));

  // the term this date belongs to (explicit choice wins, else the calendar)
  const term = normaliseTerm(req.body.term) || currentTerm(date).term;
  const academicYear = String(req.body.year || req.body.academicYear || currentTerm(date).year || '').slice(0, 4) || null;
  const ts = new Date().toISOString();

  let marked = 0;
  tx(() => {
    for (const rec of records) {
      const studentId = asInt(rec.studentId);
      const status = cleanString(rec.status, 20);
      const note = cleanString(rec.note, 300);
      if (!studentId || !classStudentIds.includes(studentId)) continue;
      if (!statusValid(status)) continue;
      run(
        `INSERT INTO attendance (student_id, class_id, date, status, note, marked_by, term, academic_year, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status, note = excluded.note, marked_by = excluded.marked_by,
           term = excluded.term, academic_year = excluded.academic_year, updated_at = excluded.updated_at`,
        [studentId, classId, date, status, note || null, req.user.id, term, academicYear, ts]
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
  log(req.user, 'ATTENDANCE_MARKED',
    `Marked ${marked} record${marked === 1 ? '' : 's'} for class ${classId} on ${date}${markAll ? ` (all ${allStatus})` : ''}${term ? ` [${term} ${academicYear || ''}]` : ''}`,
    req.ip);
  res.json({
    message: markAll
      ? `${marked} student${marked === 1 ? '' : 's'} marked ${allStatus}.`
      : `${marked} attendance record${marked === 1 ? '' : 's'} saved.`,
    marked, term, year: academicYear,
  });
});

/**
 * GET /api/attendance/term-report?classId=&term=&year=&threshold=
 * Per-student attendance for one school term (defaults to the current term),
 * with the class total and a chronic-absence flag for anyone below the
 * threshold. Teachers: their own classes only. Admins: any class.
 */
router.get('/term-report', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const scope = reportScope(req);
  const wanted = asInt(req.query.classId);
  if (!wanted) return res.status(400).json({ error: 'classId is required.' });
  if (scope && !scope.includes(wanted)) return res.status(403).json({ error: 'You can only report on your own classes.' });
  const klass = get('SELECT * FROM classes WHERE id = ?', [wanted]);
  if (!klass) return res.status(404).json({ error: 'Class not found.' });

  const win = resolveWindow(req.query);
  const threshold = Math.min(Math.max(asInt(req.query.threshold, CHRONIC_THRESHOLD) || CHRONIC_THRESHOLD, 1), 100);
  const f = windowFilter(win);

  const where = ['a.class_id = ?'];
  const params = [wanted];
  if (f.sql) { where.push(f.sql); params.push(...f.params); }

  // totals per student, including those with no marks at all
  const totals = all(
    `SELECT s.id, s.full_name, s.student_code,
            SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present,
            SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent,
            SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late,
            SUM(CASE WHEN a.status = 'permission' THEN 1 ELSE 0 END) AS permission,
            COUNT(a.id) AS marked
     FROM students s
     LEFT JOIN attendance a ON a.student_id = s.id AND ${f.sql ? f.sql : '1=1'}
     WHERE s.class_id = ? AND s.status = 'active'
     GROUP BY s.id ORDER BY s.full_name`,
    [...f.params, wanted]
  );

  const students = totals.map((r) => {
    const attended = (r.present || 0) + (r.late || 0) + (r.permission || 0);
    const marked = r.marked || 0;
    const percentage = marked ? Math.round((attended / marked) * 1000) / 10 : null;
    return {
      id: r.id, name: r.full_name, code: r.student_code,
      present: r.present || 0, absent: r.absent || 0, late: r.late || 0, permission: r.permission || 0,
      marked, percentage,
      chronic: percentage !== null && percentage < threshold,
    };
  });

  const days = get(
    `SELECT COUNT(DISTINCT a.date) d FROM attendance a WHERE a.class_id = ?${f.sql ? ' AND ' + f.sql : ''}`,
    [wanted, ...f.params]
  ).d || 0;

  const markedTotal = students.reduce((n, s) => n + s.marked, 0);
  const attendedTotal = students.reduce((n, s) => n + s.present + s.late + s.permission, 0);
  const chronic = students.filter((s) => s.chronic);

  res.json({
    class: { id: klass.id, name: klass.name, stream: klass.stream, academicYear: klass.academic_year },
    term: win.term, year: win.year,
    from: win.from, to: win.to,
    calendarConfigured: win.configured !== false,
    threshold, days,
    students,
    summary: {
      students: students.length,
      marked: markedTotal,
      attended: attendedTotal,
      absent: students.reduce((n, s) => n + s.absent, 0),
      late: students.reduce((n, s) => n + s.late, 0),
      permission: students.reduce((n, s) => n + s.permission, 0),
      percentage: markedTotal ? Math.round((attendedTotal / markedTotal) * 1000) / 10 : null,
      chronicCount: chronic.length,
      chronic,
    },
  });
});

/**
 * GET /api/attendance/trend?classId=&term=&year=&weeks=
 * Week-by-week attendance for a class plus the students drifting below the
 * threshold — the "who is quietly disappearing?" view, which a single-day
 * register never shows.
 */
router.get('/trend', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const scope = reportScope(req);
  const classId = asInt(req.query.classId);
  if (classId && scope && !scope.includes(classId)) return res.status(403).json({ error: 'You can only report on your own classes.' });
  const classIds = classId ? [classId] : (scope || all('SELECT id FROM classes').map((c) => c.id));
  if (!classIds.length) return res.json({ weeks: [], chronic: [], summary: { percentage: null } });

  const win = resolveWindow(req.query);
  const threshold = Math.min(Math.max(asInt(req.query.threshold, CHRONIC_THRESHOLD) || CHRONIC_THRESHOLD, 1), 100);
  const weeks = Math.min(Math.max(asInt(req.query.weeks, 8) || 8, 2), 26);

  let from = win.from;
  let to = win.to;
  let filter;
  if (from && to) {
    // same rule the term report uses: the term stamp counts, and rows that
    // predate the stamp are matched by their date inside the window
    filter = windowFilter(win);
  } else {
    from = from || new Date(Date.now() - weeks * 7 * 864e5).toISOString().slice(0, 10);
    to = to || new Date().toISOString().slice(0, 10);
    filter = { sql: 'a.date BETWEEN ? AND ?', params: [from, to] };
  }
  const placeholders = classIds.map(() => '?').join(',');
  const periodSql = filter.sql ? ' AND ' + filter.sql : '';

  // weekly series (ISO-ish week buckets computed in SQLite so no library is needed)
  const rows = all(
    `SELECT strftime('%Y-W%W', a.date) AS bucket,
            MIN(a.date) AS week_start, MAX(a.date) AS week_end,
            COUNT(a.id) AS marked,
            SUM(CASE WHEN a.status IN ('present','late','permission') THEN 1 ELSE 0 END) AS attended,
            SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent
     FROM attendance a
     WHERE a.class_id IN (${placeholders})${periodSql}
     GROUP BY bucket ORDER BY bucket`,
    [...classIds, ...filter.params]
  );
  const series = rows.map((r) => ({
    label: r.week_start,
    weekStart: r.week_start, weekEnd: r.week_end,
    marked: r.marked, attended: r.attended, absent: r.absent,
    percentage: r.marked ? Math.round((r.attended / r.marked) * 1000) / 10 : null,
  }));

  const totals = all(
    `SELECT a.student_id, s.full_name, s.student_code,
            COUNT(a.id) AS marked,
            SUM(CASE WHEN a.status IN ('present','late','permission') THEN 1 ELSE 0 END) AS attended,
            SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent
     FROM attendance a JOIN students s ON s.id = a.student_id
     WHERE a.class_id IN (${placeholders})${periodSql}
     GROUP BY a.student_id ORDER BY absent DESC`,
    [...classIds, ...filter.params]
  );

  // longest run of consecutive missed days inside the window, per student
  const absences = all(
    `SELECT a.student_id, a.date, a.status FROM attendance a
     WHERE a.class_id IN (${placeholders})${periodSql}
     ORDER BY a.student_id, a.date`,
    [...classIds, ...filter.params]
  );
  const runs = {};
  let prevStudent = null;
  let prevDate = null;
  for (const row of absences) {
    const missed = row.status === 'absent';
    if (row.student_id !== prevStudent) { runs[row.student_id] = { longest: 0, current: 0 }; prevDate = null; }
    const gapDays = prevDate ? (new Date(row.date) - new Date(prevDate)) / 864e5 : null;
    if (missed && (gapDays === null || gapDays <= 4)) runs[row.student_id].current += 1;
    else if (missed) runs[row.student_id].current = 1;
    else runs[row.student_id].current = 0;
    runs[row.student_id].longest = Math.max(runs[row.student_id].longest, runs[row.student_id].current);
    prevStudent = row.student_id;
    prevDate = row.date;
  }

  const chronic = totals
    .map((r) => {
      const percentage = r.marked ? Math.round((r.attended / r.marked) * 1000) / 10 : null;
      return {
        studentId: r.student_id, name: r.full_name, code: r.student_code,
        marked: r.marked, attended: r.attended, absent: r.absent, percentage,
        missedRun: (runs[r.student_id] || {}).longest || 0,
      };
    })
    .filter((s) => s.percentage !== null && s.percentage < threshold)
    .sort((a, b) => (a.percentage - b.percentage) || (b.missedRun - a.missedRun));

  const markedTotal = totals.reduce((n, r) => n + r.marked, 0);
  const attendedTotal = totals.reduce((n, r) => n + r.attended, 0);

  res.json({
    from, to, term: win.term, year: win.year, threshold, weeks: series.length,
    classes: classIds,
    series,
    chronic,
    summary: {
      students: totals.length,
      marked: markedTotal,
      attended: attendedTotal,
      absent: totals.reduce((n, r) => n + r.absent, 0),
      percentage: markedTotal ? Math.round((attendedTotal / markedTotal) * 1000) / 10 : null,
      chronicCount: chronic.length,
    },
  });
});

/**
 * GET /api/attendance/terms — the terms this school has a calendar for.
 * Used by the term pickers so the UI never guesses at dates.
 */
router.get('/terms', authenticate, (req, res) => {
  res.json({ terms: availableTerms(), current: currentTerm() });
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

  // Optional period: ?term=Term 1&year=2026, or ?from=&to=. With none of those
  // the summary stays all-time, exactly as it always has.
  const wantsPeriod = !!(req.query.term || req.query.year || req.query.from || req.query.to);
  const win = wantsPeriod ? resolveWindow(req.query) : { term: null, year: null, from: null, to: null, source: 'all' };
  const f = windowFilter(win, 'attendance');
  const periodSql = f.sql ? ' AND ' + f.sql : '';
  const periodParams = [...f.params];

  const rows = all(
    `SELECT status, COUNT(*) c FROM attendance WHERE student_id = ?${periodSql} GROUP BY status`,
    [studentId, ...periodParams]
  );
  const total = rows.reduce((sum, r) => sum + r.c, 0);
  const byStatus = {};
  for (const r of rows) byStatus[r.status] = r.c;
  const presentDays = (byStatus.present || 0) + (byStatus.late || 0) + (byStatus.permission || 0);
  const recentAbsences = all(
    `SELECT date, status, note FROM attendance WHERE student_id = ? AND status IN ('absent','late')${periodSql}
     ORDER BY date DESC LIMIT 10`,
    [studentId, ...periodParams]
  );

  // week-by-week series, so a slow slide is visible and not just a single number
  const series = all(
    `SELECT strftime('%Y-W%W', date) AS bucket, MIN(date) AS week_start, MAX(date) AS week_end,
            COUNT(*) AS marked,
            SUM(CASE WHEN status IN ('present','late','permission') THEN 1 ELSE 0 END) AS attended,
            SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent
     FROM attendance WHERE student_id = ?${periodSql}
     GROUP BY bucket ORDER BY bucket`,
    [studentId, ...periodParams]
  ).map((r) => ({
    label: r.week_start,
    weekStart: r.week_start, weekEnd: r.week_end,
    marked: r.marked, attended: r.attended, absent: r.absent,
    percentage: r.marked ? Math.round((r.attended / r.marked) * 1000) / 10 : null,
  }));

  const percentage = total ? Math.round((presentDays / total) * 1000) / 10 : null;

  res.json({
    studentId,
    term: win.term, year: win.year, from: win.from, to: win.to,
    total,
    present: byStatus.present || 0,
    absent: byStatus.absent || 0,
    late: byStatus.late || 0,
    permission: byStatus.permission || 0,
    percentage,
    // chronic absence: below the threshold, or a long unbroken run of missed days
    chronic: percentage !== null && percentage < CHRONIC_THRESHOLD,
    threshold: CHRONIC_THRESHOLD,
    missedRun: longestAbsenceRun(studentId, win),
    series,
    recentAbsences,
  });
});

/** Longest run of consecutive school days missed inside the period. */
function longestAbsenceRun(studentId, win) {
  const f = windowFilter(win, 'attendance');
  const rows = all(
    `SELECT date, status FROM attendance WHERE student_id = ?${f.sql ? ' AND ' + f.sql : ''} ORDER BY date`,
    [studentId, ...f.params]
  );
  let longest = 0;
  let current = 0;
  let prev = null;
  for (const r of rows) {
    const gap = prev ? (new Date(r.date) - new Date(prev)) / 864e5 : null;
    if (r.status === 'absent') current = (current && gap !== null && gap <= 4) ? current + 1 : 1;
    else current = 0;
    longest = Math.max(longest, current);
    prev = r.date;
  }
  return longest;
}

module.exports = router;
