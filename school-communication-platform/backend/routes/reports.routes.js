'use strict';
/**
 * /api/reports — report cards: who has one, who has paid, who has been sent
 * theirs, and the click that delivers them.
 *
 * The office screen answers one question: "for this term, which children's
 * reports can go out now?" — so the inventory lines every child up with their
 * report card and their fee position, auto-selects the cleared ones, and sends
 * the chosen cards to that child's parents (in-app alert + optional email).
 */
const express = require('express');
const fs = require('fs');
const router = express.Router();

const { all, get, run } = require('../database/db');
const { authenticate, requireStaffAdmin } = require('../middleware/auth');
const { cleanString, asInt } = require('../middleware/validate');
const { log } = require('../services/audit');
const { notify } = require('../services/notify');
const { sendEmail } = require('../services/mailer');
const reports = require('../services/reports');
const { currentTerm, termWindow, normaliseTerm } = require('../services/termCalendar');

function resolveTerm(req) {
  const term = normaliseTerm(req.query.term || req.body.term) || '';
  const year = cleanString(req.query.year || req.body.year, 10) || String(new Date().getFullYear());
  const fallback = currentTerm();
  return { term: term || fallback.term || '', year: year || fallback.year || '' };
}

/** Every active student in scope with report + fee + parent state. */
function inventory({ term, year, classId = null, includeStudentsWithoutCards = true }) {
  const params = [];
  let where = "WHERE s.status = 'active'";
  if (classId) { where += ' AND s.class_id = ?'; params.push(classId); }

  const students = all(
    `SELECT s.id, s.full_name, s.student_code, s.class_id, c.name AS class_name, c.stream AS class_stream
     FROM students s LEFT JOIN classes c ON c.id = s.class_id ${where}
     ORDER BY c.name, c.stream, s.full_name`, params
  );

  const rows = [];
  for (const s of students) {
    const card = get(
      `SELECT rc.*, u.full_name AS sent_by_name FROM report_cards rc
       LEFT JOIN users u ON u.id = rc.sent_by
       WHERE rc.student_id = ? AND COALESCE(rc.term,'') = COALESCE(?,'') AND COALESCE(rc.academic_year,'') = COALESCE(?,'')
         AND rc.source != 'unmatched'`,
      [s.id, term || '', year || '']
    );
    if (!card && !includeStudentsWithoutCards) continue;
    const fees = reports.studentFeePosition(s.id);
    const parent = reports.parentFor(s.id);
    rows.push({
      studentId: s.id,
      name: s.full_name,
      studentCode: s.student_code,
      classId: s.class_id,
      className: [s.class_name, s.class_stream].filter(Boolean).join(' '),
      reportId: card ? card.id : null,
      reportSource: card ? card.source : null,
      reportFileName: card ? card.original_name : null,
      total: card ? card.total : null,
      average: card ? card.average : null,
      position: card ? card.position : null,
      classSize: card ? card.class_size : null,
      hasFile: !!(card && card.storage_path),
      sentAt: card ? card.sent_at : null,
      sentByName: card ? card.sent_by_name : null,
      parentName: parent ? parent.full_name : null,
      parentLinked: !!parent,
      ...fees,
    });
  }
  const totals = {
    students: rows.length,
    withReport: rows.filter((r) => r.reportId).length,
    cleared: rows.filter((r) => r.reportId && r.cleared).length,
    owing: rows.filter((r) => r.reportId && !r.cleared).length,
    alreadySent: rows.filter((r) => r.reportId && r.sentAt).length,
    readyToSend: rows.filter((r) => r.reportId && r.cleared && !r.sentAt && r.parentLinked).length,
    noParent: rows.filter((r) => r.reportId && !r.parentLinked).length,
  };
  return { rows, totals };
}

/** GET /api/reports — the office inventory for a term. */
router.get('/', authenticate, requireStaffAdmin, (req, res) => {
  const { term, year } = resolveTerm(req);
  const classId = asInt(req.query.classId) || null;
  const only = cleanString(req.query.only, 20);
  let { rows, totals } = inventory({ term, year, classId });
  if (only === 'ready') rows = rows.filter((r) => r.reportId && r.cleared && !r.sentAt);
  if (only === 'owing') rows = rows.filter((r) => r.reportId && !r.cleared);
  if (only === 'sent') rows = rows.filter((r) => r.reportId && r.sentAt);
  if (only === 'missing') rows = rows.filter((r) => !r.reportId);
  if (only === 'unmatched') rows = rows.filter((r) => !r.parentLinked);
  res.json({ term, year, window: termWindow(term, year), rows, totals });
});

/** GET /api/reports/summary — lightweight counts for the sidebar/notifications. */
router.get('/summary', authenticate, requireStaffAdmin, (req, res) => {
  const { term, year } = resolveTerm(req);
  const { totals } = inventory({ term, year });
  const unmatched = get("SELECT COUNT(*) c FROM report_cards WHERE source = 'unmatched'").c;
  res.json({ term, year, totals: { ...totals, unmatched } });
});

/** GET /api/reports/unmatched — imported files still waiting for a child. */
router.get('/unmatched', authenticate, requireStaffAdmin, (req, res) => {
  const rows = all(
    `SELECT rc.*, rc.teacher_comment AS why FROM report_cards rc WHERE rc.source = 'unmatched' ORDER BY rc.id DESC LIMIT 300`
  );
  res.json({
    files: rows.map((r) => ({
      id: r.id, fileName: r.original_name, size: r.size, term: r.term, year: r.academic_year,
      why: r.teacher_comment, uploadedAt: r.created_at,
    })),
  });
});

/** POST /api/reports/:id/match — say which child an unmatched file belongs to. */
router.post('/:id/match', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const studentId = asInt(req.body.studentId);
  const card = get("SELECT * FROM report_cards WHERE id = ? AND source = 'unmatched'", [id]);
  if (!card) return res.status(404).json({ error: 'That file is not waiting to be matched.' });
  const student = get('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!student) return res.status(400).json({ error: 'Choose a student for this file.' });

  const term = cleanString(req.body.term, 30) || card.term || '';
  const year = cleanString(req.body.year, 10) || card.academic_year || String(new Date().getFullYear());
  const existing = get(
    "SELECT id FROM report_cards WHERE student_id = ? AND COALESCE(term,'') = COALESCE(?,'') AND COALESCE(academic_year,'') = COALESCE(?,'') AND source != 'unmatched'",
    [studentId, term, year]
  );
  if (existing) {
    // replace the older card's file with this one, then discard the placeholder
    run('UPDATE report_cards SET storage_path = ?, original_name = ?, mime_type = ?, size = ?, source = \'file\', class_id = ?, sent_at = NULL WHERE id = ?',
      [card.storage_path, card.original_name, card.mime_type, card.size, student.class_id || null, existing.id]);
    run('DELETE FROM report_cards WHERE id = ?', [id]);
    log(req.user, 'REPORT_MATCHED', `Report file "${card.original_name}" matched to ${student.full_name} (replaced)`, req.ip);
    return res.json({ message: `Report card matched to ${student.full_name}.`, reportId: existing.id, replaced: true });
  }
  run("UPDATE report_cards SET student_id = ?, class_id = ?, source = 'file', term = ?, academic_year = ?, teacher_comment = NULL WHERE id = ?",
    [studentId, student.class_id || null, term || null, year || null, id]);
  log(req.user, 'REPORT_MATCHED', `Report file "${card.original_name}" matched to ${student.full_name}`, req.ip);
  res.json({ message: `Report card matched to ${student.full_name}.`, reportId: id });
});

/**
 * POST /api/reports/send — deliver the chosen report cards to parents.
 * body: { term, year, studentIds: [..] | reportIds: [..], note }
 */
router.post('/send', authenticate, requireStaffAdmin, (req, res) => {
  const { term, year } = resolveTerm(req);
  const note = cleanString(req.body.note, 300);
  const studentIds = Array.isArray(req.body.studentIds) ? req.body.studentIds.map(asInt).filter(Boolean) : [];
  const reportIds = Array.isArray(req.body.reportIds) ? req.body.reportIds.map(asInt).filter(Boolean) : [];
  const onlyCleared = req.body.onlyCleared === true;

  let cards = [];
  if (reportIds.length) cards = all(`SELECT * FROM report_cards WHERE id IN (${reportIds.map(() => '?').join(',')})`, reportIds);
  else if (studentIds.length) {
    cards = all(
      `SELECT rc.* FROM report_cards rc
       WHERE rc.student_id IN (${studentIds.map(() => '?').join(',')})
         AND COALESCE(rc.term,'') = COALESCE(?,'') AND COALESCE(rc.academic_year,'') = COALESCE(?,'')
         AND rc.source != 'unmatched'`,
      [...studentIds, term || '', year || '']
    );
  }
  if (!cards.length) return res.status(400).json({ error: 'No report cards selected. Tick the children whose reports should go out.' });

  const results = [];
  let sent = 0;
  let skipped = 0;

  for (const card of cards) {
    const student = get('SELECT * FROM students WHERE id = ?', [card.student_id]);
    if (!student) { results.push({ reportId: card.id, ok: false, reason: 'Student missing' }); skipped += 1; continue; }

    const fees = reports.studentFeePosition(student.id);
    if (onlyCleared && !fees.cleared) {
      results.push({ reportId: card.id, student: student.full_name, ok: false, reason: `Owes UGX ${fees.balance.toLocaleString('en-US')}` });
      skipped += 1;
      continue;
    }
    const parent = reports.parentFor(student.id);
    if (!parent || !parent.user_id) {
      results.push({ reportId: card.id, student: student.full_name, ok: false, reason: 'No guardian linked to this child' });
      skipped += 1;
      continue;
    }
    if (!card.storage_path && card.source === 'file') {
      results.push({ reportId: card.id, student: student.full_name, ok: false, reason: 'The report file is missing from storage' });
      skipped += 1;
      continue;
    }

    const termLabel = `${card.term || term || 'Term'} ${card.academic_year || year || ''}`.trim();
    const scoreLine = card.average !== null && card.average !== undefined
      ? ` Average ${card.average}%${card.position ? `, position ${card.position} of ${card.class_size || '?'}` : ''}.`
      : '';
    const body = `The ${termLabel} report card for ${student.full_name} is ready.${scoreLine} Open Reports to view or download it.${note ? `\n\n${note}` : ''}`;

    run('UPDATE report_cards SET sent_at = ?, sent_by = ?, delivery_note = ? WHERE id = ?',
      [new Date().toISOString().replace('T', ' ').slice(0, 19), req.user.id, note || null, card.id]);

    // In-app notification is the reliable channel: it needs no mail server.
    notify(parent.user_id, 'system', `Report card ready — ${student.full_name}`,
      body, '/reports');

    // Best-effort email (never blocks, never throws).
    if (parent.email) {
      sendEmail({
        to: parent.email,
        subject: `${student.full_name} — ${termLabel} report card`,
        html: `<p>Dear ${parent.full_name || 'Parent/Guardian'},</p><p>${body.replace(/\n/g, '<br>')}</p>
               <p>Sign in to the school platform and open <b>Reports</b> to download the report card.</p>`,
      });
    }
    sent += 1;
    results.push({ reportId: card.id, student: student.full_name, ok: true, parent: parent.full_name });
  }

  log(req.user, 'REPORTS_SENT', `Sent ${sent} report card(s) for ${term} ${year}${skipped ? ` (${skipped} skipped)` : ''}`, req.ip);
  res.json({
    message: sent
      ? `${sent} report card${sent === 1 ? '' : 's'} sent to parent${sent === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped` : ''}.`
      : 'Nothing was sent — check the reasons below.',
    sent, skipped, results: results.slice(0, 500),
  });
});

/** GET /api/reports/my — a parent's / student's own report cards. */
router.get('/my', authenticate, (req, res) => {
  const role = req.user.role;
  let students = [];
  if (role === 'student') {
    students = all('SELECT * FROM students WHERE user_id = ?', [req.user.id]);
  } else if (role === 'parent') {
    students = all(
      `SELECT s.* FROM parent_students ps JOIN students s ON s.id = ps.student_id
       JOIN parents p ON p.id = ps.parent_id WHERE p.user_id = ? ORDER BY s.full_name`,
      [req.user.id]
    );
  } else {
    return res.status(403).json({ error: 'This view is for parents and students.' });
  }

  const out = [];
  for (const s of students) {
    const cards = all(
      `SELECT id, term, academic_year, source, original_name, total, average, position, class_size, teacher_comment, sent_at, created_at
       FROM report_cards WHERE student_id = ? AND source != 'unmatched' ORDER BY COALESCE(academic_year,'') DESC, id DESC LIMIT 40`,
      [s.id]
    );
    out.push({ studentId: s.id, studentName: s.full_name, studentCode: s.student_code, reports: cards });
  }
  res.json({ students: out });
});

/** GET /api/reports/:id/file — download one report card (access enforced). */
router.get('/:id/file', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  const card = get('SELECT * FROM report_cards WHERE id = ?', [id]);
  if (!card || card.source === 'unmatched') return res.status(404).json({ error: 'Report card not found.' });

  const role = req.user.role;
  let allowed = role === 'super_admin' || role === 'admin';
  if (!allowed && role === 'student') {
    allowed = !!get('SELECT 1 FROM students WHERE id = ? AND user_id = ?', [card.student_id, req.user.id]);
  }
  if (!allowed && role === 'parent') {
    allowed = !!get(
      `SELECT 1 FROM parent_students ps JOIN parents p ON p.id = ps.parent_id
       WHERE ps.student_id = ? AND p.user_id = ?`, [card.student_id, req.user.id]
    );
    // a parent may only open a report that has actually been released
    if (allowed && !card.sent_at) return res.status(403).json({ error: 'That report card has not been released yet.' });
  }
  if (!allowed && role === 'teacher') {
    const { classIdsForTeacherUserId } = require('../services/permissions');
    allowed = classIdsForTeacherUserId(req.user.id).includes(card.class_id);
  }
  if (!allowed) return res.status(403).json({ error: 'You do not have access to that report card.' });

  if (!card.storage_path) {
    // A card built from imported marks has no file of its own: hand back a
    // printable page the browser can save as PDF instead.
    const subjects = all('SELECT * FROM report_card_subjects WHERE report_card_id = ? ORDER BY subject', [card.id]);
    const student = get('SELECT s.*, c.name AS class_name, c.stream AS class_stream FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?', [card.student_id]);
    const school = require('../services/settingsService').readSettings().school || {};
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>${student.full_name} — ${card.term || ''} report card</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:28px;color:#111}h1{margin:0 0 2px;font-size:20px}
.meta{color:#555;margin-bottom:14px}table{border-collapse:collapse;width:100%;max-width:720px}td,th{border:1px solid #ddd;padding:7px 9px;text-align:left}
th{background:#f3f4f6}.sum{margin-top:14px;font-weight:600}@media print{body{margin:0}}
</style></head><body>
<h1>${school.name || 'School'} — ${card.term || ''} ${card.academic_year || ''} report card</h1>
<div class="meta">${student.full_name} · ${student.student_code} · ${[student.class_name, student.class_stream].filter(Boolean).join(' ')}</div>
<table><thead><tr><th>Subject</th><th>Score</th><th>Grade</th><th>Remarks</th></tr></thead><tbody>
${subjects.map((s) => `<tr><td>${s.subject}</td><td>${s.score === null ? '—' : s.score + '%'}</td><td>${s.grade || '—'}</td><td>${s.remarks || ''}</td></tr>`).join('')}
</tbody></table>
<div class="sum">Total: ${card.total ?? '—'} · Average: ${card.average ?? '—'}%${card.position ? ` · Position ${card.position} of ${card.class_size || '?'}` : ''}</div>
${card.teacher_comment ? `<p><b>Class teacher:</b> ${card.teacher_comment}</p>` : ''}
<p class="meta">Generated ${new Date().toLocaleDateString()}</p>
</body></html>`);
  }

  const file = reports.filePath(card);
  if (!fs.existsSync(file)) return res.status(410).json({ error: 'The stored report file is no longer on the server. Import it again.' });
  res.setHeader('Content-Type', card.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${(card.original_name || 'report-card').replace(/"/g, '')}"`);
  fs.createReadStream(file).pipe(res);
});

/** DELETE /api/reports/:id — remove a report card (and its file). */
router.delete('/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const card = get('SELECT * FROM report_cards WHERE id = ?', [id]);
  if (!card) return res.status(404).json({ error: 'Report card not found.' });
  if (card.storage_path) { try { fs.unlinkSync(reports.filePath(card)); } catch { /* already gone */ } }
  run('DELETE FROM report_card_subjects WHERE report_card_id = ?', [id]);
  run('DELETE FROM report_cards WHERE id = ?', [id]);
  log(req.user, 'REPORT_DELETED', `Deleted report card #${id}`, req.ip);
  res.json({ message: 'Report card deleted.' });
});

module.exports = router;
