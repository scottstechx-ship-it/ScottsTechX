/**
 * /api/print — printable school documents rendered as standalone HTML pages.
 *
 * Report cards, results slips, fee statements and receipts are opened in a new
 * tab and printed from the browser (Ctrl/Cmd+P → "Save as PDF"), so the app
 * needs no PDF engine and the output is a real page a school can file.
 *
 * Everything here is role-checked: staff may print any student they can see,
 * a student may print their own, and a parent may print their own children's.
 */
const express = require('express');
const router = express.Router();
const { all, get } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { asInt, cleanString } = require('../middleware/validate');
const { readSettings } = require('../services/settingsService');
const { log } = require('../services/audit');
const { termWindow, currentTerm, normaliseTerm } = require('../services/termCalendar');

// ---------------------------------------------------------------- helpers

/** May this user read this student's academic/financial records? */
function mayViewStudent(user, student) {
  if (!student) return false;
  if (['super_admin', 'admin'].includes(user.role)) return true;
  if (user.role === 'teacher') {
    // any class this teacher teaches
    return !!get(
      `SELECT 1 FROM teacher_classes tc
       JOIN teachers t ON t.id = tc.teacher_id
       WHERE t.user_id = ? AND tc.class_id = ?`,
      [user.id, student.class_id]
    );
  }
  if (user.role === 'student') {
    return !!get('SELECT 1 FROM students WHERE id = ? AND user_id = ?', [student.id, user.id]);
  }
  if (user.role === 'parent') {
    return !!get(
      `SELECT 1 FROM parent_students ps JOIN parents p ON p.id = ps.parent_id
       WHERE ps.student_id = ? AND p.user_id = ?`,
      [student.id, user.id]
    );
  }
  return false;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(n) {
  const v = Number(n || 0);
  return 'UGX ' + v.toLocaleString('en-UG', { maximumFractionDigits: 0 });
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('T') ? '' : 'Z'));
  if (isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The printable shell: school letterhead, print styles, one Print button. */
function page({ title, subtitle, body, footer }) {
  const s = readSettings().school || {};
  const logo = s.logoUrl ? `<img class="logo" src="${esc(s.logoUrl)}" alt="">` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${esc(s.name || 'School')}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px 18px 60px; background: #eef2f7; color: #0f172a;
         font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  .sheet { max-width: 820px; margin: 0 auto; background: #fff; border-radius: 12px;
           box-shadow: 0 10px 30px rgba(15,23,42,.12); padding: 30px 34px 26px; }
  .head { display: flex; gap: 16px; align-items: center; border-bottom: 3px double #0f172a; padding-bottom: 14px; }
  .logo { width: 62px; height: 62px; object-fit: contain; border-radius: 10px; }
  .head h1 { margin: 0; font-size: 22px; letter-spacing: .2px; }
  .head .motto { color: #475569; font-size: 12.5px; }
  .head .meta { margin-left: auto; text-align: right; font-size: 12px; color: #475569; }
  h2.doc-title { margin: 18px 0 2px; font-size: 16px; text-transform: uppercase; letter-spacing: 1.4px; }
  .sub { color: #475569; font-size: 12.5px; margin-bottom: 16px; }
  .facts { display: flex; flex-wrap: wrap; gap: 10px 26px; margin: 0 0 16px; padding: 12px 14px;
           background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 9px; }
  .facts div { font-size: 13px; }
  .facts strong { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .6px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
  th { background: #f1f5f9; font-size: 11.5px; text-transform: uppercase; letter-spacing: .5px; color: #475569; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; border-top: 2px solid #0f172a; border-bottom: none; }
  .pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 700; }
  .ok { background: #dcfce7; color: #15803d; }
  .due { background: #fee2e2; color: #b91c1c; }
  .muted { color: #64748b; font-size: 12px; }
  .sign { display: flex; justify-content: space-between; gap: 30px; margin-top: 34px; }
  .sign div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 11.5px; color: #475569; }
  .foot-note { margin-top: 20px; font-size: 11px; color: #64748b; }
  .toolbar { max-width: 820px; margin: 0 auto 14px; display: flex; gap: 10px; }
  .toolbar button, .toolbar a { font: inherit; font-weight: 600; padding: 9px 16px; border-radius: 8px;
      border: 1px solid #cbd5e1; background: #fff; color: #0f172a; cursor: pointer; text-decoration: none; }
  .toolbar button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { box-shadow: none; border-radius: 0; padding: 0 6mm; max-width: none; }
    .toolbar { display: none; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
  @page { margin: 12mm; }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="primary" onclick="window.print()">Print / Save as PDF</button>
    <a href="javascript:window.close()">Close</a>
  </div>
  <div class="sheet">
    <div class="head">
      ${logo}
      <div>
        <h1>${esc(s.name || 'School')}</h1>
        <div class="motto">${esc(s.motto || '')}</div>
        ${s.address ? `<div class="motto">${esc(s.address)}</div>` : ''}
      </div>
      <div class="meta">
        ${s.phone ? `<div>${esc(s.phone)}</div>` : ''}
        ${s.email ? `<div>${esc(s.email)}</div>` : ''}
        <div>Printed ${fmtDate(new Date().toISOString())}</div>
      </div>
    </div>
    <h2 class="doc-title">${esc(title)}</h2>
    ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
    ${body}
    ${footer || ''}
    <div class="foot-note">Generated by the school platform — this document is valid without a signature only when stamped by the school.</div>
  </div>
  <script>if (location.hash === '#print') window.addEventListener('load', function () { window.print(); });</script>
</body>
</html>`;
}

/** Per-student figures for one term (or the whole year when term is blank). */
function reportCardData(student, term, academicYear) {
  const params = [student.class_id, student.id];
  let where = "WHERE e.class_id = ? AND e.status = 'published'";
  if (term) { where += ' AND e.term = ?'; params.push(term); }
  const exams = all(
    `SELECT e.id, e.title, e.subject, e.term, e.date,
            r.marks, r.grade, r.comments
     FROM exams e
     LEFT JOIN exam_results r ON r.exam_id = e.id AND r.student_id = ?
     ${where}
     ORDER BY e.date IS NULL, e.date, e.subject`,
    [student.id, student.class_id, ...(term ? [term] : [])]
  );

  // class average per exam (same filter), for context on the card
  const classAvg = {};
  for (const e of exams) {
    const row = get('SELECT AVG(marks) avg, COUNT(*) n FROM exam_results WHERE exam_id = ? AND marks IS NOT NULL', [e.id]);
    classAvg[e.id] = row && row.avg != null ? { avg: Math.round(row.avg * 10) / 10, n: row.n } : null;
  }

  // position in class across the same set
  const totals = all(
    `SELECT r.student_id, SUM(r.marks) total, COUNT(*) n
     FROM exam_results r JOIN exams e ON e.id = r.exam_id
     WHERE e.class_id = ? AND e.status = 'published' AND r.marks IS NOT NULL
       ${term ? 'AND e.term = ?' : ''}
     GROUP BY r.student_id ORDER BY total DESC`,
    term ? [student.class_id, term] : [student.class_id]
  );
  const myTotal = totals.find((t) => t.student_id === student.id);
  const position = myTotal ? totals.findIndex((t) => t.student_id === student.id) + 1 : null;

  // attendance for the term (or the whole year)
  let attWhere = 'WHERE a.student_id = ?';
  const attParams = [student.id];
  if (term) { attWhere += ' AND a.term = ?'; attParams.push(term); }
  const att = get(
    `SELECT COUNT(*) total, SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) present,
            SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) absent,
            SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) late
     FROM attendance a ${attWhere}`,
    attParams
  ) || { total: 0, present: 0, absent: 0, late: 0 };

  const marked = exams.filter((e) => e.marks != null);
  const average = marked.length ? Math.round((marked.reduce((s, e) => s + e.marks, 0) / marked.length) * 10) / 10 : null;

  return { exams, classAvg, position, classSize: totals.length, att, average, marked: marked.length };
}

// ------------------------------------------------------------------ routes

/** GET /api/print/report-card/:studentId?term=&year= — printable report card. */
router.get('/report-card/:studentId', authenticate, (req, res) => {
  const student = get(
    `SELECT s.*, c.name AS class_name, c.stream AS class_stream, c.academic_year
     FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
    [asInt(req.params.studentId)]
  );
  if (!student) return res.status(404).send(page({ title: 'Not found', body: '<p>Student not found.</p>' }));
  if (!mayViewStudent(req.user, student)) {
    return res.status(403).send(page({ title: 'Not allowed', body: '<p>You do not have access to this student\'s records.</p>' }));
  }
  const term = cleanString(req.query.term, 30);
  const year = cleanString(req.query.year, 9) || student.academic_year || String(new Date().getFullYear());
  const d = reportCardData(student, term, year);

  const rows = d.exams.length
    ? d.exams.map((e) => {
      const avg = d.classAvg[e.id];
      return `<tr>
        <td>${esc(e.subject || e.title)}</td>
        <td>${esc(e.date || '—')}</td>
        <td class="num">${e.marks == null ? '—' : e.marks}</td>
        <td class="num">${e.grade ? esc(e.grade) : '—'}</td>
        <td class="num">${avg ? avg.avg : '—'}</td>
        <td>${esc(e.comments || '')}</td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="6" class="muted">No published results for this period.</td></tr>';

  const attPct = d.att.total ? Math.round((d.att.present / d.att.total) * 100) : null;
  const body = `
    <div class="facts">
      <div><strong>Student</strong>${esc(student.full_name)}</div>
      <div><strong>Student code</strong>${esc(student.student_code || '—')}</div>
      <div><strong>Class</strong>${esc((student.class_name || '') + ' ' + (student.class_stream || ''))}</div>
      <div><strong>Period</strong>${esc(term || 'Whole year')} ${esc(year)}</div>
      <div><strong>Subjects assessed</strong>${d.marked}</div>
      <div><strong>Average</strong>${d.average == null ? '—' : d.average + '%'}</div>
      <div><strong>Position</strong>${d.position ? d.position + ' of ' + d.classSize : '—'}</div>
      <div><strong>Attendance</strong>${attPct == null ? 'not recorded' : attPct + '% (' + d.att.present + '/' + d.att.total + ' days)'}</div>
    </div>
    <table>
      <thead><tr><th>Subject</th><th>Date</th><th class="num">Marks</th><th class="num">Grade</th><th class="num">Class avg</th><th>Teacher's comment</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sign">
      <div>Class teacher</div>
      <div>Head teacher</div>
      <div>Date</div>
    </div>`;
  log(req.user, 'REPORT_CARD_PRINTED', `Printed report card for ${student.full_name}`, req.ip);
  res.type('html').send(page({
    title: 'Report card',
    subtitle: `${student.full_name} · ${(student.class_name || '')} ${(student.class_stream || '')} · ${term || 'Whole year'} ${year}`,
    body,
  }));
});

/** GET /api/print/receipt/:studentId/:paymentId — printable fee receipt. */
router.get('/receipt/:studentId/:paymentId', authenticate, (req, res) => {
  const student = get('SELECT s.*, c.name AS class_name, c.stream AS class_stream FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?', [asInt(req.params.studentId)]);
  if (!student || !mayViewStudent(req.user, student)) return res.status(403).send(page({ title: 'Not allowed', body: '<p>You do not have access to this receipt.</p>' }));
  const p = get('SELECT * FROM fee_payments WHERE id = ? AND student_id = ?', [asInt(req.params.paymentId), student.id]);
  if (!p) return res.status(404).send(page({ title: 'Not found', body: '<p>Payment not found.</p>' }));

  const fees = feeSummary(student.id);
  const body = `
    <div class="facts">
      <div><strong>Receipt no.</strong>${esc(p.receipt_no || 'RCPT-' + String(p.id).padStart(5, '0'))}</div>
      <div><strong>Date</strong>${fmtDate(p.paid_at || p.created_at)}</div>
      <div><strong>Student</strong>${esc(student.full_name)}</div>
      <div><strong>Class</strong>${esc((student.class_name || '') + ' ' + (student.class_stream || ''))}</div>
      <div><strong>Method</strong>${esc(p.method || '—')}</div>
      <div><strong>Reference</strong>${esc(p.reference || '—')}</div>
    </div>
    <table>
      <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
      <tbody>
        <tr><td>${esc(p.note || 'School fees payment')}</td><td class="num">${money(p.amount)}</td></tr>
      </tbody>
      <tfoot><tr><td>Received</td><td class="num">${money(p.amount)}</td></tr></tfoot>
    </table>
    <div class="facts">
      <div><strong>Billed this year</strong>${money(fees.due)}</div>
      <div><strong>Paid to date</strong>${money(fees.paid)}</div>
      <div><strong>Balance after this receipt</strong>${money(fees.balance)}</div>
    </div>
    <div class="sign"><div>Received by</div><div>Signature / stamp</div></div>`;
  log(req.user, 'RECEIPT_PRINTED', `Printed receipt ${p.id} for ${student.full_name}`, req.ip);
  res.type('html').send(page({ title: 'Fee receipt', subtitle: `Payment recorded ${fmtDate(p.paid_at || p.created_at)}`, body }));
});

/** Billed / paid / balance for a student. */
function feeSummary(studentId) {
  const due = get('SELECT COALESCE(SUM(amount),0) d FROM student_fees WHERE student_id = ?', [studentId]);
  const paid = get('SELECT COALESCE(SUM(amount),0) p FROM fee_payments WHERE student_id = ?', [studentId]);
  const d = due ? Number(due.d) : 0;
  const p = paid ? Number(paid.p) : 0;
  return { due: d, paid: p, balance: d - p };
}

/** GET /api/print/fee-statement/:studentId — printable statement of account. */
router.get('/fee-statement/:studentId', authenticate, (req, res) => {
  const student = get(
    `SELECT s.*, c.name AS class_name, c.stream AS class_stream FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
    [asInt(req.params.studentId)]
  );
  if (!student) return res.status(404).send(page({ title: 'Not found', body: '<p>Student not found.</p>' }));
  if (!mayViewStudent(req.user, student)) return res.status(403).send(page({ title: 'Not allowed', body: '<p>You do not have access to this statement.</p>' }));

  const billed = all(
    `SELECT sf.*, f.name, f.term, f.academic_year FROM student_fees sf
     LEFT JOIN fee_structures f ON f.id = sf.fee_structure_id
     WHERE sf.student_id = ? ORDER BY f.academic_year, f.term, sf.id`,
    [student.id]
  );
  const paid = all('SELECT * FROM fee_payments WHERE student_id = ? ORDER BY COALESCE(paid_at, created_at)', [student.id]);
  const s = feeSummary(student.id);
  let running = 0;
  const ledger = [
    ...billed.map((b) => ({ date: b.created_at, label: `${b.name || 'Fee'}${b.term ? ' · ' + b.term : ''}${b.academic_year ? ' · ' + b.academic_year : ''}`, charge: Number(b.amount || 0), credit: 0 })),
    ...paid.map((p) => ({ date: p.paid_at || p.created_at, label: `Payment received${p.method ? ' · ' + p.method : ''}${p.reference ? ' · ref ' + p.reference : ''}`, charge: 0, credit: Number(p.amount || 0) })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const body = `
    <div class="facts">
      <div><strong>Student</strong>${esc(student.full_name)}</div>
      <div><strong>Student code</strong>${esc(student.student_code || '—')}</div>
      <div><strong>Class</strong>${esc((student.class_name || '') + ' ' + (student.class_stream || ''))}</div>
      <div><strong>Status</strong><span class="pill ${s.balance > 0 ? 'due' : 'ok'}">${s.balance > 0 ? 'Balance outstanding' : 'Fully paid'}</span></div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th class="num">Charged</th><th class="num">Paid</th><th class="num">Running balance</th></tr></thead>
      <tbody>
        ${ledger.length ? ledger.map((l) => {
    running += l.charge - l.credit;
    return `<tr><td>${fmtDate(l.date)}</td><td>${esc(l.label)}</td><td class="num">${l.charge ? money(l.charge) : '—'}</td><td class="num">${l.credit ? money(l.credit) : '—'}</td><td class="num">${money(running)}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="muted">No billing or payments recorded yet.</td></tr>'}
      </tbody>
      <tfoot>
        <tr><td colspan="2">Totals</td><td class="num">${money(s.due)}</td><td class="num">${money(s.paid)}</td><td class="num">${money(s.balance)}</td></tr>
      </tfoot>
    </table>
    <div class="sign"><div>Bursar</div><div>Parent / guardian</div><div>Date</div></div>`;
  log(req.user, 'FEE_STATEMENT_PRINTED', `Printed fee statement for ${student.full_name}`, req.ip);
  res.type('html').send(page({ title: 'Statement of fees', subtitle: `${student.full_name} · ${(student.class_name || '')} ${(student.class_stream || '')}`, body }));
});

/** GET /api/print/fee-statements?classId= — every learner's statement, one page each. */
router.get('/fee-statements', authenticate, (req, res) => {
  if (!['super_admin', 'admin'].includes(req.user.role)) return res.status(403).send(page({ title: 'Not allowed', body: '<p>Administrators only.</p>' }));
  const classId = asInt(req.query.classId);
  const rows = classId
    ? all('SELECT id FROM students WHERE class_id = ? AND status = \'active\' ORDER BY full_name', [classId])
    : all('SELECT id FROM students WHERE status = \'active\' ORDER BY full_name');
  const items = rows.map((r) => {
    const s = feeSummary(r.id);
    const st = get('SELECT full_name, student_code FROM students WHERE id = ?', [r.id]);
    return `<tr><td>${esc(st.full_name)}</td><td>${esc(st.student_code || '')}</td>
      <td class="num">${money(s.due)}</td><td class="num">${money(s.paid)}</td>
      <td class="num">${s.balance > 0 ? money(s.balance) : '—'}</td></tr>`;
  }).join('');
  const total = rows.reduce((acc, r) => {
    const s = feeSummary(r.id);
    return { due: acc.due + s.due, paid: acc.paid + s.paid, balance: acc.balance + s.balance };
  }, { due: 0, paid: 0, balance: 0 });
  const cls = classId ? get('SELECT name, stream FROM classes WHERE id = ?', [classId]) : null;
  res.type('html').send(page({
    title: 'Fee collection report',
    subtitle: cls ? `${cls.name} ${cls.stream || ''}` : 'Whole school',
    body: `<table>
      <thead><tr><th>Student</th><th>Code</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead>
      <tbody>${items || '<tr><td colspan="5" class="muted">No students found.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="2">Totals</td><td class="num">${money(total.due)}</td><td class="num">${money(total.paid)}</td><td class="num">${money(total.balance)}</td></tr></tfoot>
    </table>`,
  }));
});

/**
 * GET /api/print/attendance/:classId?term=&year= — printable term attendance
 * report: one row per learner, day counts, percentage and a flag for anyone
 * below the chronic-absence threshold.
 */
router.get('/attendance/:classId', authenticate, (req, res) => {
  const classId = asInt(req.params.classId);
  const klass = get('SELECT * FROM classes WHERE id = ?', [classId]);
  if (!klass) return res.status(404).send(page({ title: 'Class not found', body: '<p>That class does not exist.</p>' }));

  const allowed = ['super_admin', 'admin'].includes(req.user.role) || (req.user.role === 'teacher' && !!get(
    `SELECT 1 FROM teacher_classes tc JOIN teachers t ON t.id = tc.teacher_id WHERE t.user_id = ? AND tc.class_id = ?`,
    [req.user.id, classId]
  ));
  if (!allowed) return res.status(403).send(page({ title: 'Not allowed', body: '<p>You can only print attendance for your own classes.</p>' }));

  const win = resolveTerm(req.query);
  const f = attendanceFilter(win, 'a');
  const where = ['a.class_id = ?'];
  const params = [classId];
  if (f.sql) { where.push(f.sql); params.push(...f.params); }

  const rows = all(
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
    [...f.params, classId]
  );

  const threshold = 80;
  const filled = rows.map((r) => {
    const attended = (r.present || 0) + (r.late || 0) + (r.permission || 0);
    const pct = r.marked ? Math.round((attended / r.marked) * 1000) / 10 : null;
    return { ...r, attended, pct, chronic: pct !== null && pct < threshold };
  });
  const marked = filled.reduce((n, r) => n + r.marked, 0);
  const attended = filled.reduce((n, r) => n + r.attended, 0);
  const days = get(`SELECT COUNT(DISTINCT a.date) d FROM attendance a WHERE ${where.join(' AND ')}`, params).d || 0;
  const chronic = filled.filter((r) => r.chronic);

  const body = `
    <div class="facts">
      <div><strong>Class</strong>${esc(klass.name)} ${esc(klass.stream || '')}</div>
      <div><strong>Period</strong>${esc(win.label)}</div>
      <div><strong>School days recorded</strong>${days}</div>
      <div><strong>Class attendance</strong><span class="pill ${marked && attended / marked >= 0.8 ? 'ok' : 'due'}">${marked ? Math.round((attended / marked) * 1000) / 10 + '%' : '—'}</span></div>
      <div><strong>Chronically absent</strong>${chronic.length} of ${filled.length}</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Student</th><th>Admission no</th><th class="num">Present</th><th class="num">Late</th><th class="num">Permission</th><th class="num">Absent</th><th class="num">Rate</th></tr></thead>
      <tbody>
        ${filled.length ? filled.map((r, i) => `<tr>
          <td>${i + 1}</td><td>${esc(r.full_name)}${r.chronic ? ' <span class="pill due">at risk</span>' : ''}</td>
          <td>${esc(r.student_code || '')}</td>
          <td class="num">${r.present || 0}</td><td class="num">${r.late || 0}</td><td class="num">${r.permission || 0}</td>
          <td class="num">${r.absent || 0}</td><td class="num">${r.pct === null ? '—' : r.pct + '%'}</td></tr>`).join('')
    : '<tr><td colspan="8" class="muted">No active students in this class.</td></tr>'}
      </tbody>
      <tfoot><tr><td colspan="3">Class totals</td><td class="num">${filled.reduce((n, r) => n + (r.present || 0), 0)}</td>
        <td class="num">${filled.reduce((n, r) => n + (r.late || 0), 0)}</td>
        <td class="num">${filled.reduce((n, r) => n + (r.permission || 0), 0)}</td>
        <td class="num">${filled.reduce((n, r) => n + (r.absent || 0), 0)}</td>
        <td class="num">${marked ? Math.round((attended / marked) * 1000) / 10 + '%' : '—'}</td></tr></tfoot>
    </table>
    ${chronic.length ? `<h3 style="font-size:14px">Follow-up list (below ${threshold}%)</h3>
      <ul class="muted">${chronic.map((r) => `<li>${esc(r.full_name)} — ${r.pct}% (absent ${r.absent} of ${r.marked} days)</li>`).join('')}</ul>` : ''}
    <div class="sign"><div>Class teacher</div><div>Head teacher</div><div>Date</div></div>`;

  log(req.user, 'ATTENDANCE_REPORT_PRINTED', `Printed attendance report for ${klass.name} ${klass.stream || ''} (${win.label})`, req.ip);
  res.type('html').send(page({
    title: 'Attendance report',
    subtitle: `${klass.name} ${klass.stream || ''} · ${win.label}`,
    body,
  }));
});

/** Term/date window for printable reports (query string driven). */
function resolveTerm(query) {
  const from = String(query.from || '').slice(0, 10);
  const to = String(query.to || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return {
      term: null, year: null,
      from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null,
      to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null,
      label: `${from || 'the beginning'} to ${to || 'today'}`,
    };
  }
  const term = normaliseTerm(query.term) || currentTerm().term;
  const year = String(query.year || '').slice(0, 4) || currentTerm().year;
  const win = termWindow(term, year) || { term, year, from: null, to: null };
  return { ...win, label: `${win.term || term} ${year}${win.from ? ` (${fmtDate(win.from)} – ${fmtDate(win.to)})` : ''}` };
}

function attendanceFilter(win, alias) {
  const where = [];
  const params = [];
  if (win.from && win.to) {
    const stamp = win.term && win.year ? `(${alias}.term = ? AND ${alias}.academic_year = ?)` : null;
    if (stamp) { where.push(`(${stamp} OR ((${alias}.term IS NULL) AND ${alias}.date BETWEEN ? AND ?))`); params.push(win.term, win.year, win.from, win.to); }
    else { where.push(`${alias}.date BETWEEN ? AND ?`); params.push(win.from, win.to); }
  } else if (win.term && win.year) {
    where.push(`((${alias}.term = ? AND ${alias}.academic_year = ?))`);
    params.push(win.term, win.year);
  }
  return { sql: where.length ? where.join(' AND ') : null, params };
}

module.exports = router;
module.exports.page = page;
