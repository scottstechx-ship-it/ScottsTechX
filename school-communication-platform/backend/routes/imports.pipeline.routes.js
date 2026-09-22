'use strict';
/**
 * /api/imports — the guided IMPORT PIPELINE (timetable → teachers → students →
 * guardians → attendance → fees → payments → reports).
 *
 * One endpoint does all of it: POST /api/imports/run
 *   - `kind`     which file this is (see services/importKinds.js)
 *   - `dryRun`   true = describe exactly what would happen, write nothing
 *   - the file   .csv / .xlsx for data, or for `kind=reports` also PDFs, scans
 *                or a .zip full of them
 *
 * Because the preview and the real run share one code path, the preview cannot
 * disagree with what the import then does.
 *
 * Existing dedicated endpoints (/upload, /validate, /import, /teachers, /fees)
 * are untouched for compatibility; they are mounted after this router.
 */
const express = require('express');
const fs = require('fs');
const router = express.Router();
const bcrypt = require('bcryptjs');

const { all, get, run, tx } = require('../database/db');
const { authenticate, requireStaffAdmin } = require('../middleware/auth');
const { upload, handleUploadErrors } = require('../middleware/upload');
const { cleanString } = require('../middleware/validate');
const { log } = require('../services/audit');
const { readSpreadsheet, DANGEROUS_KEYS } = require('../services/spreadsheet');
const { KINDS, PIPELINE, MAX_ROWS, MAX_DOC_EXT } = require('../services/importKinds');
const templates = require('../services/importTemplates');
const reports = require('../services/reports');
const reportFormat = require('../services/reportFormatPdf');
const { readZip, writeZip } = require('../services/zip');
const { readSettings } = require('../services/settingsService');
const hub = require('../services/importHub');

// --------------------------------------------------------------------- guide
/** GET /api/imports/guide — the ordered steps + per-kind metadata for the UI. */
router.get('/guide', authenticate, requireStaffAdmin, (req, res) => {
  const kinds = {};
  for (const [key, k] of Object.entries(KINDS)) {
    kinds[key] = {
      label: k.label, help: k.help, columns: k.columns, order: k.order,
      template: templates.template(key) ? templates.template(key).filename : null,
      fileTypes: key === 'reports'
        ? ['csv', 'xlsx', 'pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'zip']
        : ['csv', 'xlsx'],
    };
  }
  // live counts, so the guide can show what is already loaded
  const counts = {
    classes: get('SELECT COUNT(*) c FROM classes').c,
    subjects: get('SELECT COUNT(*) c FROM subjects').c,
    teachers: get("SELECT COUNT(*) c FROM teachers WHERE status='active'").c,
    students: get("SELECT COUNT(*) c FROM students WHERE status='active'").c,
    parents: get("SELECT COUNT(*) c FROM parents WHERE status='active'").c,
    attendance: get('SELECT COUNT(*) c FROM attendance').c,
    feeStructures: get('SELECT COUNT(*) c FROM fee_structures').c,
    payments: get('SELECT COUNT(*) c FROM fee_payments').c,
    reportCards: get('SELECT COUNT(*) c FROM report_cards WHERE source != \'unmatched\'').c,
    reportFiles: get("SELECT COUNT(*) c FROM report_cards WHERE source IN ('file','unmatched')").c,
  };
  res.json({ pipeline: PIPELINE, kinds, counts });
});

// ------------------------------------------------------------------ templates
/** GET /api/imports/template.csv?type=<kind> — the starter file for one step. */
router.get('/template.csv', authenticate, requireStaffAdmin, (req, res) => {
  const kind = cleanString(req.query.type, 30) || 'students';
  const t = templates.template(kind);
  if (!t) return res.status(404).json({ error: `Unknown import type "${kind}".` });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${t.filename.replace(/^\d+-/, '')}"`);
  res.send(t.content);
});

/** GET /api/imports/report-format.pdf — the blank report card the school fills and uploads. */
router.get('/report-format.pdf', authenticate, requireStaffAdmin, (req, res) => {
  const school = readSettings().school || {};
  const pdf = reportFormat.blankPdf({ schoolName: school.name || 'School' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="report-card-format.pdf"');
  res.send(pdf);
});

/** GET /api/imports/starter-pack.zip — every template + the order to use them. */
router.get('/starter-pack.zip', authenticate, requireStaffAdmin, (req, res) => {
  const school = readSettings().school || {};
  const files = [{ name: 'README-FIRST.txt', data: templates.README }];
  for (const t of templates.allTemplates()) files.push({ name: t.filename, data: t.content });
  files.push({
    name: '8-report-card-format.pdf',
    data: reportFormat.blankPdf({ schoolName: school.name || 'School' }),
  });
  const zip = writeZip(files);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="import-starter-pack.zip"');
  res.send(zip);
});

// ---------------------------------------------------------------------- run
/** Report documents inside a zip. Instruction files that travel with the format pack are not cards. */
function isReportDocument(name) {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  const ext = (base.split('.').pop() || '').toLowerCase();
  if (!MAX_DOC_EXT.includes(ext)) return false;
  if (/^readme/i.test(base)) return false;
  return true;
}

async function rowsFromSpreadsheet(filePath, ext) {
  const rows = await readSpreadsheet(filePath, ext);
  return rows
    .map((r) => {
      const o = {};
      for (const k of Object.keys(r)) {
        const key = String(k).trim().toLowerCase().replace(/\s+/g, ' ');
        if (DANGEROUS_KEYS.has(key)) continue;
        o[key] = typeof r[k] === 'number' ? r[k] : String(r[k] == null ? '' : r[k]).trim();
      }
      return o;
    })
    .filter((r) => {
      const first = String(Object.values(r)[0] || '').trim();
      if (first.startsWith('#')) return false;                      // template instruction rows
      return Object.values(r).some((v) => String(v).trim() !== ''); // blank lines
    });
}

/** Build the context object the per-row planners read. */
function makeContext({ userId, options, rows }) {
  const school = readSettings().school || {};
  return {
    userId,
    year: options.year || String(new Date().getFullYear()),
    term: options.term || '',
    createMissing: options.createMissing !== false,      // default: yes, that is the point
    defaultStudentPassword: school.defaultStudentPassword || 'Student@123',
    defaultTeacherPassword: school.defaultTeacherPassword || 'Teacher@123',
    defaultParentPassword: school.defaultParentPassword || 'Parent@123',
    credentials: [],
    seenTimetable: new Set(),
    seenTeacher: new Set(),
    seenKeys: new Set(),
    touchedClasses: new Set(),
    classExists: (name, stream) => !!hub.findClass(name, stream, options.year || String(new Date().getFullYear())),
    rows,
  };
}

/** Apply the accepted rows, collecting everything that was created or linked. */
function applyRows(kindDef, accepted, ctx) {
  const created = [];
  const linked = [];
  const failures = [];
  tx(() => {
    for (const item of accepted) {
      try {
        const out = item.plan.apply();
        if (out) {
          created.push(...(out.created || []));
          linked.push(...(out.linked || []));
        }
      } catch (e) {
        failures.push({ row: item.row, reason: e.message, summary: item.summary });
      }
    }
  });
  return { created, linked, failures };
}

/**
 * POST /api/imports/run
 * body (multipart): file, kind, options (JSON string), dryRun ("1"/"0")
 */
router.post('/run', authenticate, requireStaffAdmin, upload.single('file'), handleUploadErrors, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });

  const kind = cleanString(req.body.kind, 30) || 'students';
  const kindDef = KINDS[kind];
  let options = {};
  try { options = JSON.parse(req.body.options || '{}'); } catch { options = {}; }
  const dryRun = req.body.dryRun === '1' || req.body.dryRun === 'true' || options.dryRun === true;
  const originalName = req.file.originalname;
  const ext = (originalName.split('.').pop() || '').toLowerCase();

  const cleanup = () => { try { fs.unlinkSync(req.file.path); } catch { /* already gone */ } };

  try {
    if (!kindDef) { cleanup(); return res.status(400).json({ error: `Unknown import type "${kind}".` }); }

    // ------------------------------------------------------------- reports
    // Report cards arrive either as a spreadsheet of marks or as the documents
    // themselves (PDF / scan / a zip of them).
    if (kind === 'reports' && (ext === 'zip' || MAX_DOC_EXT.includes(ext))) {
      const buffer = fs.readFileSync(req.file.path);
      cleanup();
      const term = cleanString(options.term, 30) || '';
      const year = cleanString(options.year, 10) || String(new Date().getFullYear());
      const batch = `RB-${Date.now().toString(36).toUpperCase()}`;
      const incoming = ext === 'zip'
        ? readZip(buffer)
            // a school zip often carries the class list or a spreadsheet too — take the documents
            .filter((f) => isReportDocument(f.name))
            .map((f) => ({ name: f.name.split(/[\\/]/).pop(), data: f.data }))   // keep the file, drop the folder
        : [{ name: originalName, data: buffer }];
      if (!incoming.length) {
        return res.status(400).json({ error: 'That archive holds no report files. Zip up the PDFs, Word files or scans and try again.' });
      }

      const classHint = options.classId ? Number(options.classId) : null;
      const preview = incoming.map((f) => {
        const m = reports.matchStudentFromName(f.name, { classId: classHint });
        return m.student
          ? { file: f.name, student: m.student.full_name, studentCode: m.student.student_code, how: m.how, bytes: f.data.length, ok: true }
          : { file: f.name, why: m.why, bytes: f.data.length, ok: false };
      });

      if (dryRun) {
        const matchedCount = preview.filter((p) => p.ok).length;
        return res.json({
          kind, dryRun: true,
          message: `${incoming.length} file(s) read: ${matchedCount} matched to a child, ${incoming.length - matchedCount} need a child chosen.`,
          counts: { files: incoming.length, matched: matchedCount, unmatched: incoming.length - matchedCount },
          matched: preview.filter((p) => p.ok), unmatched: preview.filter((p) => !p.ok),
          rows: [], created: [], linked: [],
        });
      }

      // A real run reports what it actually did — the preview above only predicted it.
      const matched = [];
      const unmatched = [];

      const created = [];
      const linked = [];
      const failed = [];
      for (const f of incoming) {
        try {
          const m = reports.matchStudentFromName(f.name, { classId: classHint });
          if (m.student) {
            const r = reports.upsertFileCard({
              studentId: m.student.id, term, academicYear: year,
              originalName: f.name, buffer: f.data, batch, userId: req.user.id,
            });
            if (r.error) {
              // the child was recognised but the card could not be saved: park the
              // file so the office can match it by hand instead of losing it
              reports.stashUnmatched({ originalName: f.name, buffer: f.data, term, academicYear: year, reason: r.error, batch, userId: req.user.id });
              failed.push({ file: f.name, why: r.error });
            } else {
              created.push(`report card for ${m.student.full_name}`);
              linked.push(`${f.name} → ${m.student.full_name} (${m.how})`);
              matched.push({ file: f.name, student: m.student.full_name, studentCode: m.student.student_code, how: m.how, bytes: f.data.length });
            }
          } else {
            reports.stashUnmatched({ originalName: f.name, buffer: f.data, term, academicYear: year, reason: m.why, batch, userId: req.user.id });
            unmatched.push({ file: f.name, why: m.why });
          }
        } catch (err) {
          console.error('[imports] report file failed:', f.name, err);
          failed.push({ file: f.name, why: 'Could not be saved — try that file on its own' });
        }
      }
      const counts2 = JSON.stringify({ imported: created.length, unmatched: unmatched.length, failed: failed.length });
      run("INSERT INTO imports (filename, kind, status, counts, created_by) VALUES (?, 'reports', 'imported', ?, ?)",
        [originalName, counts2, req.user.id]);
      log(req.user, 'REPORTS_IMPORTED', `Uploaded ${created.length} report card file(s), ${unmatched.length} unmatched`, req.ip);
      return res.json({
        kind, dryRun: false,
        message: `${created.length} report card(s) filed${unmatched.length ? `, ${unmatched.length} need a child chosen` : ''}${failed.length ? `, ${failed.length} could not be read` : ''}. Open Reports to send them to parents.`,
        counts: { files: incoming.length, imported: created.length, unmatched: unmatched.length, failed: failed.length },
        matched, unmatched, failed, created, linked, rows: [],
      });
    }

    // ------------------------------------------------- spreadsheet-based kinds
    if (!['csv', 'xlsx'].includes(ext)) {
      cleanup();
      return res.status(400).json({ error: 'Use an Excel (.xlsx) or CSV (.csv) file for this step. Report cards can also be PDFs or a zip of PDFs.' });
    }

    let rows;
    try { rows = await rowsFromSpreadsheet(req.file.path, ext); }
    catch (e) {
      cleanup();
      return res.status(400).json({
        error: ext === 'xlsx'
          ? 'Unable to read that workbook. Save it as .xlsx (Excel 2007 or newer) or .csv and try again.'
          : 'Unable to read that file. Check that it is a valid spreadsheet and try again.',
      });
    }
    cleanup();

    if (!rows.length) return res.status(400).json({ error: 'The file contains no data rows.' });
    const cap = MAX_ROWS[kind] || 5000;
    if (rows.length > cap) return res.status(400).json({ error: `Too many rows (${rows.length}). Maximum for this step is ${cap}.` });

    const ctx = makeContext({ userId: req.user.id, options, rows });
    const results = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      let planned;
      try { planned = kindDef.plan(row, ctx); }
      catch (e) { planned = { status: 'error', errors: [`Could not read this row: ${e.message}`], warnings: [], create: [] }; }

      // The same child twice on one day, or the same receipt twice in one file,
      // is nearly always a copy-paste slip: catch it before anything is saved.
      if (!planned.errors.length && planned.dedupeKey) {
        const key = `${kind}|${planned.dedupeKey}`;
        if (ctx.seenKeys.has(key)) {
          planned = { ...planned, status: 'error', errors: ['Appears twice in this file — remove the duplicate row'] };
        } else ctx.seenKeys.add(key);
      }

      results.push({
        row: i + 2,
        status: planned.errors.length ? 'error' : planned.status,
        summary: planned.summary || '',
        errors: planned.errors,
        warnings: planned.warnings,
        willCreate: planned.create || [],
        plan: planned,
      });
    }

    const summary = {
      rows: rows.length,
      valid: results.filter((r) => r.status === 'valid').length,
      warnings: results.filter((r) => r.status === 'warning').length,
      errors: results.filter((r) => r.status === 'error').length,
    };
    const accepted = results.filter((r) => r.status !== 'error');

    if (dryRun) {
      return res.json({
        kind, dryRun: true,
        message: `${summary.rows} row(s) read: ${accepted.length} ready, ${summary.errors} with problems. Nothing has been saved yet.`,
        counts: summary,
        rows: results.map(({ plan, ...rest }) => rest),   // plans are not serialisable
        created: [], linked: [], credentials: [],
      });
    }

    const applied = applyRows(kindDef, accepted, ctx);
    const counts = { ...summary, imported: accepted.length - applied.failures.length, failed: applied.failures.length };

    // Report marks: work out totals, averages and the class position now, so the
    // office sees a finished report card rather than raw marks.
    const reportTerms = new Set();
    if (kind === 'reports' && ctx.touchedClasses && ctx.touchedClasses.size) {
      for (const cid of ctx.touchedClasses) {
        const terms = all('SELECT DISTINCT term FROM report_cards WHERE class_id = ?', [cid]).map((r) => r.term).filter(Boolean);
        for (const t of (terms.length ? terms : [ctx.term])) reportTerms.add(`${cid}|${t}`);
      }
      for (const pair of reportTerms) {
        const [cid, term] = pair.split('|');
        reports.recomputeClassCards(Number(cid), term, ctx.year);
      }
    }

    run("INSERT INTO imports (filename, kind, status, counts, credentials, created_by) VALUES (?, ?, 'imported', ?, ?, ?)",
      [originalName, kind, JSON.stringify(counts), JSON.stringify(ctx.credentials), req.user.id]);
    log(req.user, 'IMPORT_RUN', `${kind}: ${counts.imported} row(s) imported from "${originalName}" (${counts.errors} rejected, ${counts.warnings} warnings)`, req.ip);

    res.json({
      kind, dryRun: false,
      message: `${counts.imported} row(s) imported${counts.warnings ? `, ${counts.warnings} with a warning` : ''}${counts.errors ? `, ${counts.errors} rejected` : ''}.`,
      counts,
      rows: results.map(({ plan, ...rest }) => rest),
      created: applied.created,
      linked: applied.linked,
      failures: applied.failures,
      credentials: ctx.credentials,
    });
  } catch (e) {
    cleanup();
    console.error('[imports] run failed:', e);
    res.status(e.status || 500).json({ error: e.message || 'The import failed. Nothing was saved.' });
  }
});

module.exports = router;
