/**
 * /api/imports — bulk student import (Excel / CSV) with administrator review.
 *
 * Workflow (each step is its own endpoint so the UI can walk the admin through):
 *  1. upload  -> parse file, return headers + sample rows + importId
 *  2. analyze -> (client) choose column mapping
 *  3. validate -> per-row validation: missing fields, duplicates, bad dates,
 *                 unknown classes, invalid phones/emails
 *  4. preview -> same validation data (client renders)
 *  5. import  -> transactional insert of valid records; skips errors safely
 *  6. report  -> counts + downloadable CSV of failures
 *
 * Extracted data is NEVER written to the database before the admin confirms.
 * Every import is recorded in the imports table (audit).
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { all, get, run, tx } = require('../database/db');
const env = require('../config/env');
const { authenticate, requireStaffAdmin } = require('../middleware/auth');
const { upload, handleUploadErrors } = require('../middleware/upload');
const { cleanString, isEmail, isPhone, asInt } = require('../middleware/validate');
const { log } = require('../services/audit');

const IMPORT_TYPES = ['csv', 'xlsx', 'xls'];
const MAX_ROWS = 5000;

// In-memory cache of parsed import sessions (survives the wizard steps).
const sessions = new Map();
function session(id) { return sessions.get(id); }
function putSession(s) { sessions.set(s.id, s); setTimeout(() => sessions.delete(s.id), 60 * 60 * 1000); return s; }

const FIELD_LABELS = {
  fullName: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  studentCode: 'Student ID',
  className: 'Class',
  stream: 'Stream',
  gender: 'Gender',
  dateOfBirth: 'Date of birth',
  parentName: 'Parent/guardian name',
  parentPhone: 'Parent phone',
  parentEmail: 'Parent email',
  address: 'Address',
  enrollmentDate: 'Enrollment date',
  username: 'Login username',
  password: 'Login password',
};

/** Format a JS date as YYYY-MM-DD (local). */
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeDate(v) {
  if (v === undefined || v === null || v === '') return { value: null };
  // Excel often converts CSV date cells into serial numbers (e.g. 40179).
  if (typeof v === 'number') {
    const days = Math.floor(v);
    if (days >= 1 && days <= 80000) {
      const d = new Date(Math.round((days - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) return { value: isoDate(d), normalized: true };
    }
    return { error: `Invalid date value "${v}"` };
  }
  const s = String(v).trim();
  if (/^\d{4,5}$/.test(s)) {
    // serial date arriving as a numeric string
    const days = parseInt(s, 10);
    const d = new Date(Math.round((days - 25569) * 86400 * 1000));
    if (days >= 1 && days <= 80000 && !isNaN(d.getTime())) return { value: isoDate(d), normalized: true };
    return { error: `Invalid date value "${s}"` };
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1) return { value: s };
    return { error: 'Invalid date' };
  }
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (d.getDate() === Number(m[1])) {
      return { value: `${m[3]}-${m[2]}-${m[1]}`, normalized: true };
    }
    return { error: 'Invalid date' };
  }
  return { error: `Unrecognised date format "${s}"` };
}

function classForName(name, stream, academicYear) {
  if (!name) return null;
  const n = String(name).trim();
  const s = (stream || '').trim() || 'A';
  const direct = get('SELECT id FROM classes WHERE name = ? AND stream = ? AND academic_year = ?', [n, s, academicYear]);
  if (direct) return direct.id;
  // try name containing stream, e.g. "Senior 2 A"
  const m = /^(.*?)\s+([A-Z])$/.exec(n);
  if (m) {
    const alt = get('SELECT id FROM classes WHERE name = ? AND stream = ? AND academic_year = ?', [m[1].trim(), m[2], academicYear]);
    if (alt) return alt.id;
  }
  const fallback = get('SELECT id FROM classes WHERE name = ? AND academic_year = ?', [n, academicYear]);
  if (fallback) return fallback.id;
  return null;
}

// ---------------------------------------------------------------------------
// Step 1 — upload & parse
// ---------------------------------------------------------------------------
router.post('/upload', authenticate, requireStaffAdmin, upload.single('file'), handleUploadErrors, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
  const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
  if (!IMPORT_TYPES.includes(ext)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Only Excel (.xlsx, .xls) and CSV (.csv) files are supported.' });
  }
  const size = fs.statSync(req.file.path).size;
  if (size > 5 * 1024 * 1024) {
    fs.unlinkSync(req.file.path);
    return res.status(413).json({ error: 'File is too large. Maximum is 5 MB.' });
  }

  let rows;
  try {
    if (ext === 'csv') {
      const text = fs.readFileSync(req.file.path, 'utf8');
      const wb = XLSX.read(text, { type: 'string' });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    } else {
      const wb = XLSX.readFile(req.file.path);
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    }
  } catch (e) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Unable to read that file. Check that it is a valid spreadsheet and try again.' });
  }
  fs.unlinkSync(req.file.path);

  if (!rows.length) return res.status(400).json({ error: 'The file contains no data rows.' });
  if (rows.length > MAX_ROWS) return res.status(400).json({ error: `Too many rows (${rows.length}). Maximum is ${MAX_ROWS}.` });

  // Normalise headers to keys
  const headers = Object.keys(rows[0] || {});
  const normalized = rows.map((r) => {
    const o = {};
    for (const h of headers) {
      const val = r[h];
      o[String(h).trim()] = val === undefined ? '' : (typeof val === 'number' ? val : String(val).trim());
    }
    return o;
  });

  const id = crypto.randomBytes(8).toString('hex');
  const info = run('INSERT INTO imports (filename, kind, status, created_by) VALUES (?, ?, \'uploaded\', ?)', [req.file.originalname, 'students', req.user.id]);
  const sess = putSession({
    id,
    kind: 'students',
    filename: req.file.originalname,
    headers,
    rows: normalized,
    total: normalized.length,
    importDbId: info.lastInsertRowid,
    createdAt: Date.now(),
  });

  log(req.user, 'IMPORT_UPLOADED', `Uploaded "${req.file.originalname}" (${normalized.length} rows) for review`, req.ip);
  res.json({
    importId: id,
    importDbId: info.lastInsertRowid,
    filename: req.file.originalname,
    headers,
    total: normalized.length,
    sample: normalized.slice(0, 5),
    fields: FIELD_LABELS,
  });
});

// ---------------------------------------------------------------------------
// Steps 3 & 4 — validate / preview
// ---------------------------------------------------------------------------
router.post('/validate', authenticate, requireStaffAdmin, (req, res) => {
  const sess = session(cleanString(req.body.importId, 40));
  if (!sess) return res.status(404).json({ error: 'Import session expired. Upload the file again.' });
  const mapping = req.body.mapping || {};
  const academicYear = cleanString(req.body.academicYear, 20) || '2026';

  const results = sess.rows.map((row, index) => validateRow(row, mapping, academicYear, index, sess));
  const summary = summarize(results);
  run('UPDATE imports SET status = \'validated\', counts = ? WHERE id = ?',
    [JSON.stringify({ valid: summary.valid, errors: summary.errors, warnings: summary.warnings }), sess.importDbId || 0]);
  res.json({ rows: results, summary });
});

router.post('/preview', authenticate, requireStaffAdmin, (req, res) => {
  const sess = session(cleanString(req.body.importId, 40));
  if (!sess) return res.status(404).json({ error: 'Import session expired. Upload the file again.' });
  const mapping = req.body.mapping || {};
  const academicYear = cleanString(req.body.academicYear, 20) || '2026';
  const limit = Math.min(parseInt(req.body.limit || '50', 10) || 50, 200);
  const results = sess.rows.slice(0, limit).map((row, index) => validateRow(row, mapping, academicYear, index, sess));
  res.json({ rows: results, summary: summarize(results), total: sess.total });
});

function validateRow(row, mapping, academicYear, index, sess) {
  const errors = [];
  const warnings = [];
  const data = {};

  const fullName = firstNonEmpty(mapping.fullName && row[mapping.fullName], mapping.firstName && row[mapping.firstName], mapping.lastName && row[mapping.lastName]);
  data.fullName = fullName;
  if (!fullName) errors.push('Missing full name');

  const firstName = mapping.firstName ? row[mapping.firstName] : '';
  const lastName = mapping.lastName ? row[mapping.lastName] : '';
  if (mapping.firstName && !firstName) errors.push('Missing first name');
  if (mapping.lastName && !lastName) errors.push('Missing last name');

  data.studentCode = mapping.studentCode ? row[mapping.studentCode] : '';
  if (data.studentCode) {
    // Keep the FIRST occurrence of a duplicate ID; flag only later rows.
    const dupInFile = sess.rows.slice(0, index).some((r, i) => r[mapping.studentCode] && r[mapping.studentCode] === data.studentCode);
    if (dupInFile) errors.push(`Duplicate student ID "${data.studentCode}" in file`);
    else if (get('SELECT id FROM students WHERE student_code = ?', [data.studentCode])) errors.push(`Student ID "${data.studentCode}" already exists`);
  } else {
    warnings.push('No student ID — one will be auto-generated');
  }

  data.className = mapping.className ? row[mapping.className] : '';
  data.stream = mapping.stream ? row[mapping.stream] : '';
  const classId = classForName(data.className, data.stream, academicYear);
  if (data.className && !classId) {
    errors.push(`Unknown class "${data.className}" — create it first or fix the value`);
  } else if (!data.className) {
    warnings.push('No class — student will be unassigned');
  }
  data.classId = classId;

  data.gender = mapping.gender ? row[mapping.gender] : '';
  if (data.gender && !['Male', 'Female', 'M', 'F', 'male', 'female', 'm', 'f'].includes(data.gender)) {
    warnings.push(`Unrecognised gender "${data.gender}" — leave blank to correct`);
  }

  const dob = normalizeDate(mapping.dateOfBirth ? row[mapping.dateOfBirth] : '');
  if (dob.error) errors.push(`Invalid date of birth: ${dob.error}`);
  else if (dob.value) { data.dateOfBirth = dob.value; if (dob.normalized) warnings.push('Date of birth converted to YYYY-MM-DD'); }
  data.dateOfBirth = data.dateOfBirth || '';

  data.parentName = mapping.parentName ? row[mapping.parentName] : '';
  data.parentPhone = mapping.parentPhone ? row[mapping.parentPhone] : '';
  if (data.parentPhone && !isPhone(data.parentPhone)) warnings.push(`Invalid parent phone "${data.parentPhone}"`);
  data.parentEmail = mapping.parentEmail ? row[mapping.parentEmail] : '';
  if (data.parentEmail && !isEmail(data.parentEmail)) warnings.push(`Invalid parent email "${data.parentEmail}"`);
  data.address = mapping.address ? row[mapping.address] : '';

  const enr = normalizeDate(mapping.enrollmentDate ? row[mapping.enrollmentDate] : '');
  if (enr.error) errors.push(`Invalid enrollment date: ${enr.error}`);
  data.enrollmentDate = enr.value || '';

  data.username = mapping.username ? row[mapping.username] : '';
  data.password = mapping.password ? row[mapping.password] : '';
  if (data.username && data.password && data.password.length < 8) warnings.push('Password shorter than 8 characters');
  if (data.username && get('SELECT id FROM users WHERE username = ?', [data.username])) errors.push(`Username "${data.username}" already exists`);

  const status = errors.length ? 'error' : (warnings.length ? 'warning' : 'valid');
  return { index, data, status, errors, warnings };
}

function summarize(results) {
  return {
    total: results.length,
    valid: results.filter((r) => r.status === 'valid').length,
    warnings: results.filter((r) => r.status === 'warning').length,
    errors: results.filter((r) => r.status === 'error').length,
  };
}

function firstNonEmpty(...vals) {
  for (const v of vals) if (v && String(v).trim()) return String(v).trim();
  return '';
}

function nextStudentCode() {
  const year = new Date().getFullYear();
  const prefix = `STU-${year}-`;
  const last = get('SELECT student_code FROM students WHERE student_code LIKE ? ORDER BY id DESC LIMIT 1', [prefix + '%']);
  let n = 1;
  if (last) {
    const m = /\d+$/.exec(last.student_code);
    if (m) n = parseInt(m[0], 10) + 1;
  }
  return prefix + String(n).padStart(4, '0');
}

// ---------------------------------------------------------------------------
// Step 5 — import (transactional)
// ---------------------------------------------------------------------------
router.post('/import', authenticate, requireStaffAdmin, (req, res) => {
  const sess = session(cleanString(req.body.importId, 40));
  if (!sess) return res.status(404).json({ error: 'Import session expired. Upload the file again.' });
  const mapping = req.body.mapping || {};
  const academicYear = cleanString(req.body.academicYear, 20) || '2026';

  const results = sess.rows.map((row, index) => validateRow(row, mapping, academicYear, index, sess));
  const validRows = results.filter((r) => r.status !== 'error');

  const school = require('../services/settingsService').readSettings().school;
  const defaultPassword = school.defaultStudentPassword || 'Student@123';

  // username helper: make a unique, username-safe login code from a base string
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

  let imported = 0;
  const failures = [];
  const credentials = []; // {name, username, password}

  try {
    tx(() => {
      for (const r of validRows) {
        const d = r.data;
        try {
          const studentCode = d.studentCode || nextStudentCode();
          // username = provided value OR a code derived from the student ID
          let username = d.username;
          if (!username) username = makeUsername(d.studentCode || ('stu_' + studentCode));
          const password = d.password || defaultPassword;

          if (!get('SELECT id FROM users WHERE username = ?', [username])) {
            const info = run(
              `INSERT INTO users (full_name, email, phone, username, password_hash, role, status, registration_status, email_verified, must_change_password)
               VALUES (?, ?, ?, ?, ?, 'student', 'active', 'approved', 1, 1)`,
              [d.fullName, d.parentEmail || null, d.parentPhone || null, username, bcrypt.hashSync(password, 10)]
            );
            const userId = info.lastInsertRowid;
            run(
              `INSERT INTO students (user_id, student_code, full_name, class_id, stream, gender, date_of_birth,
                                     parent_name, parent_phone, parent_email, address, enrollment_date, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
              [userId, studentCode, d.fullName, d.classId || null, d.stream || null, d.gender || null, d.dateOfBirth || null,
               d.parentName || null, d.parentPhone || null, d.parentEmail || null, d.address || null, d.enrollmentDate || null]
            );
            credentials.push({ name: d.fullName, username, password });
            imported++;
          } else {
            failures.push({ row: r.index + 2, name: d.fullName, reason: `Username "${username}" already exists` });
          }
        } catch (e) {
          failures.push({ row: r.index + 2, name: d.fullName, reason: e.message });
        }
      }
    });
  } catch (e) {
    run('UPDATE imports SET status = \'failed\' WHERE id = ?', [sess.importDbId || 0]);
    log(req.user, 'IMPORT_FAILED', `Import "${sess.filename}" failed: ${e.message}`, req.ip);
    return res.status(500).json({ error: 'The import failed and was rolled back. No partial data was saved.' });
  }

  const counts = { imported, failed: failures.length, skipped: results.filter((r) => r.status === 'error').length + failures.length, warnings: results.filter((r) => r.status === 'warning').length };
  const payload = { status: 'imported', counts: JSON.stringify(counts), credentials: JSON.stringify(credentials) };
  run('UPDATE imports SET status = ?, counts = ?, credentials = ? WHERE id = ?', [payload.status, payload.counts, payload.credentials, sess.importDbId || 0]);
  log(req.user, 'STUDENT_IMPORTED', `Imported ${imported} students from "${sess.filename}" (${counts.skipped} skipped)`, req.ip);

  res.json({
    message: `Import complete: ${imported} student${imported === 1 ? '' : 's'} imported. Each student was given a login code (username) and a default password — they will be asked to change it on first login.`,
    counts,
    failures: failures.slice(0, 100),
    credentials: credentials.slice(0, 200),
    credentialsCount: credentials.length,
  });
});

// ---------------------------------------------------------------------------
// Step 7 — report download + history + template
// ---------------------------------------------------------------------------

/** GET /api/imports/:id/report.csv — download an error report for an import. */
router.get('/:id/report.csv', authenticate, requireStaffAdmin, (req, res) => {
  const imp = get('SELECT * FROM imports WHERE id = ?', [asInt(req.params.id)]);
  if (!imp) return res.status(404).json({ error: 'Import record not found.' });
  let counts = {};
  try { counts = JSON.parse(imp.counts || '{}'); } catch {}
  let csv = 'Import report for "' + imp.filename + '"\n';
  csv += `Imported,${counts.imported || 0}\nSkipped,${counts.skipped || 0}\nFailed,${counts.failed || 0}\nWarnings,${counts.warnings || 0}\n`;
  csv += '\nNote: per-row failure details are returned to the browser in the import dialog.\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="import-report-${imp.id}.csv"`);
  res.send(csv);
});

/** GET /api/imports — import history. */
router.get('/', authenticate, requireStaffAdmin, (req, res) => {
  const imports = all(
    `SELECT i.*, u.full_name AS created_by_name FROM imports i
     LEFT JOIN users u ON u.id = i.created_by ORDER BY i.id DESC LIMIT 100`
  );
  for (const i of imports) { try { i.counts = JSON.parse(i.counts || '{}'); } catch { i.counts = {}; } }
  res.json({ imports });
});

/** GET /api/imports/template.csv — downloadable starter template. */
router.get('/template.csv', authenticate, requireStaffAdmin, (req, res) => {
  const header = 'Full Name,Student ID,Class,Stream,Gender,Date of Birth,Parent Name,Parent Phone,Parent Email,Address,Enrollment Date,Username,Password\n';
  const sample = 'Sarah Namuli,STU-2026-100,Senior 2,A,Female,2010-04-12,John Namuli,+256700000030,john@example.com,Kampala,,sarah2026,Student@123\n';
  const sample2 = 'Brian Mukasa,STU-2026-101,Senior 2,A,Male,2009-07-19,Peter Mukasa,+256700000031,,Entebbe,2026-02-01,,\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="student-import-template.csv"');
  res.send(header + sample + sample2);
});

module.exports = router;

/** GET /api/imports/:id/credentials.csv — download login codes for an import. */
router.get('/:id/credentials.csv', authenticate, requireStaffAdmin, (req, res) => {
  const imp = get('SELECT * FROM imports WHERE id = ?', [asInt(req.params.id)]);
  if (!imp) return res.status(404).json({ error: 'Import record not found.' });
  let creds = [];
  try { creds = JSON.parse(imp.credentials || '[]'); } catch { creds = []; }
  if (!creds.length) return res.status(404).json({ error: 'No credentials stored for this import.' });
  let csv = 'Name,Username (login code),Default Password\n';
  for (const c of creds) {
    csv += `"${String(c.name).replace(/"/g, '""')}",${c.username},${c.password}\n`;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="import-credentials-${imp.id}.csv"`);
  res.send(csv);
});
