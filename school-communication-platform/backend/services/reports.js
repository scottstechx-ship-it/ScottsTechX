'use strict';
/**
 * REPORT CARDS — from an import to a parent's phone.
 *
 * The office gets report cards in whatever form the school already uses:
 * a spreadsheet of marks, a PDF printed by another system, a scan, or a whole
 * zip of PDFs named after the children. This service:
 *
 *   1. matches each file to the right child (admission number in the file name
 *      first, then the child's name, then anything the office confirms by hand);
 *   2. keeps one card per child per term (re-importing replaces it);
 *   3. works out totals, averages and class position when marks were imported;
 *   4. and, before anything is sent, pairs every card with that child's fee
 *      position — so the office sees exactly who is cleared and can send the
 *      cleared ones in one click.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { all, get, run } = require('../database/db');
const env = require('../config/env');
const hub = require('./importHub');

const REPORT_DIR = path.join(env.UPLOAD_DIR, 'reports');

function ensureDir() {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
}

const MIME = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

function mimeFor(name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function baseName(name) {
  return path.basename(String(name || 'report'));
}

/** Store a report card file on disk. Returns the relative storage path. */
function storeFile(originalName, buffer) {
  ensureDir();
  const safe = baseName(originalName).replace(/[^\w.\- ]+/g, '_').slice(-80);
  const stored = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}-${safe}`;
  fs.writeFileSync(path.join(REPORT_DIR, stored), buffer);
  return stored;
}

function filePath(card) {
  return path.join(REPORT_DIR, path.basename(card.storage_path || ''));
}

/**
 * Work out which child a file belongs to.
 * Tries, in order: an admission number anywhere in the name, then the child's
 * full name, then their surname + first name. Returns { student, how } or
 * { student: null, why }.
 */
function matchStudentFromName(fileName, { classId = null } = {}) {
  const raw = String(fileName || '').replace(/\.[a-z0-9]+$/i, '');
  const cleaned = raw.replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ').trim();
  const upper = raw.toUpperCase();

  // 1. admission number (STU-2026-100, 2026100, any 4+ digit run also tried)
  const codeHit = all('SELECT * FROM students').find((s) => s.student_code && upper.includes(String(s.student_code).toUpperCase()));
  if (codeHit) return { student: codeHit, how: `admission number ${codeHit.student_code}` };

  const digits = cleaned.match(/\b(\d{4,})\b/);
  if (digits) {
    const byDigits = all('SELECT * FROM students').find((s) => String(s.student_code || '').includes(digits[1]));
    if (byDigits) return { student: byDigits, how: `admission number ${byDigits.student_code}` };
  }

  // 2. full name (order-insensitive, punctuation-insensitive)
  const pool = classId ? all('SELECT * FROM students WHERE class_id = ?', [classId]) : all('SELECT * FROM students');
  const key = hub.nameKey(cleaned);
  if (key) {
    const exact = pool.find((s) => hub.nameKey(s.full_name) === key);
    if (exact) return { student: exact, how: 'name' };
    // every word of the child's name present in the file name
    const subset = pool.find((s) => {
      const words = hub.nameKey(s.full_name).split(' ').filter((w) => w.length > 2);
      return words.length >= 2 && words.every((w) => key.includes(w));
    });
    if (subset) return { student: subset, how: 'name (partial)' };
    const first = pool.find((s) => {
      const words = hub.nameKey(s.full_name).split(' ').filter((w) => w.length > 3);
      return words.length && words.every((w) => key.includes(w));
    });
    if (first) return { student: first, how: 'name (partial)' };
  }
  return { student: null, why: 'No admission number or name in the file name' };
}

/** One card per child per term; re-importing the same term replaces the file. */
function upsertFileCard({ studentId, classId = null, term, academicYear, originalName, buffer, batch = '', userId = null }) {
  const student = get('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!student) return { error: 'Student not found' };
  const mime = mimeFor(originalName);

  const existing = get(
    'SELECT * FROM report_cards WHERE student_id = ? AND COALESCE(term,\'\') = COALESCE(?,\'\') AND COALESCE(academic_year,\'\') = COALESCE(?,\'\')',
    [studentId, term || '', academicYear || '']
  );
  if (existing && existing.storage_path) {
    try { fs.unlinkSync(filePath(existing)); } catch { /* already gone */ }
  }
  const stored = storeFile(originalName, buffer);
  const cls = classId || student.class_id || null;
  const safeTerm = term || null;
  const safeYear = academicYear || null;
  const original = baseName(originalName);
  const safeBatch = batch || null;
  const by = userId || null;

  if (existing) {
    run(
      `UPDATE report_cards SET class_id = ?, term = ?, academic_year = ?, source = 'file', storage_path = ?, original_name = ?,
         mime_type = ?, size = ?, import_batch = ?, created_by = ?, sent_at = NULL, sent_by = NULL
       WHERE id = ?`,
      [cls, safeTerm, safeYear, stored, original, mime, buffer.length, safeBatch, by, existing.id]
    );
    return { id: existing.id, replaced: true, student: student.full_name };
  }
  const info = run(
    `INSERT INTO report_cards (student_id, class_id, term, academic_year, source, storage_path, original_name, mime_type, size, import_batch, created_by)
     VALUES (?, ?, ?, ?, 'file', ?, ?, ?, ?, ?, ?)`,
    [studentId, cls, safeTerm, safeYear, stored, original, mime, buffer.length, safeBatch, by]
  );
  return { id: info.lastInsertRowid, replaced: false, student: student.full_name };
}

/** Unmatched files wait here until the office says which child they belong to. */
function stashUnmatched({ originalName, buffer, term, academicYear, reason, batch, userId = null }) {
  const stored = storeFile(originalName, buffer);
  const info = run(
    `INSERT INTO report_cards (student_id, class_id, term, academic_year, source, storage_path, original_name,
       mime_type, size, import_batch, created_by, teacher_comment)
     VALUES (NULL, NULL, ?, ?, 'unmatched', ?, ?, ?, ?, ?, ?, ?)`,
    [term || null, academicYear || null, stored, baseName(originalName), mimeFor(originalName), buffer.length,
      batch || null, userId || null, reason || null]
  );
  return info.lastInsertRowid;
}

/** Card id -> student, with the class and fee position that matter for sending. */
function studentFeePosition(studentId) {
  const due = get('SELECT COALESCE(SUM(amount),0) AS v FROM student_fees WHERE student_id = ?', [studentId]).v || 0;
  const paid = get('SELECT COALESCE(SUM(amount),0) AS v FROM fee_payments WHERE student_id = ?', [studentId]).v || 0;
  const balance = Math.round((due - paid) * 100) / 100;
  return {
    billed: Math.round(due * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    balance,
    // no fees recorded at all means the school has not billed yet, which must
    // not block a report: cleared requires either nothing owed or nothing billed
    cleared: balance <= 0,
    hasFees: due > 0,
  };
}

function parentFor(studentId) {
  return get(
    `SELECT p.id, p.user_id, p.full_name, p.phone, p.email, ps.relationship
     FROM parent_students ps JOIN parents p ON p.id = ps.parent_id
     WHERE ps.student_id = ? AND p.status = 'active' ORDER BY ps.id LIMIT 1`,
    [studentId]
  );
}

/** Recompute total/average/position for a class+term from the imported marks. */
function recomputeClassCards(classId, term, academicYear) {
  const students = all(
    `SELECT DISTINCT s.id, s.full_name FROM students s
     LEFT JOIN report_cards rc ON rc.student_id = s.id AND COALESCE(rc.term,'') = COALESCE(?,'')
     WHERE s.class_id = ? AND s.status = 'active' AND (rc.id IS NOT NULL OR EXISTS (
       SELECT 1 FROM exam_results er JOIN exams e ON e.id = er.exam_id
       WHERE er.student_id = s.id AND e.class_id = ? AND COALESCE(e.term,'') = COALESCE(?,'')))
     ORDER BY s.id`,
    [term || '', classId, classId, term || '']
  );

  const scored = [];
  for (const s of students) {
    const marks = all(
      `SELECT e.subject AS subject, er.marks, er.grade, er.comments FROM exam_results er
       JOIN exams e ON e.id = er.exam_id
       WHERE er.student_id = ? AND e.class_id = ? AND COALESCE(e.term,'') = COALESCE(?,'')`,
      [s.id, classId, term || '']
    );
    if (!marks.length) continue;
    const total = marks.reduce((acc, m) => acc + (Number(m.marks) || 0), 0);
    const average = Math.round((total / marks.length) * 10) / 10;
    scored.push({ student: s, marks, total: Math.round(total * 10) / 10, average });
  }
  scored.sort((a, b) => b.average - a.average || b.total - a.total);

  const classSize = scored.length;
  let position = 0;
  let lastAvg = null;
  scored.forEach((row, i) => {
    if (lastAvg === null || row.average !== lastAvg) position = i + 1;
    lastAvg = row.average;

    let card = get(
      'SELECT * FROM report_cards WHERE student_id = ? AND COALESCE(term,\'\') = COALESCE(?,\'\') AND COALESCE(academic_year,\'\') = COALESCE(?,\'\')',
      [row.student.id, term || '', academicYear || '']
    );
    if (!card) {
      const info = run(
        `INSERT INTO report_cards (student_id, class_id, term, academic_year, source) VALUES (?, ?, ?, ?, 'marks')`,
        [row.student.id, classId, term || null, academicYear || null]
      );
      card = { id: info.lastInsertRowid, teacher_comment: null };
    }
    // keep a teacher comment that was written by hand / imported
    const commentRow = get(
      `SELECT comments FROM exam_results er JOIN exams e ON e.id = er.exam_id
       WHERE er.student_id = ? AND e.class_id = ? AND COALESCE(e.term,'') = COALESCE(?,'') AND COALESCE(er.comments,'') != ''
       ORDER BY length(er.comments) DESC LIMIT 1`,
      [row.student.id, classId, term || '']
    );
    run(
      `UPDATE report_cards SET class_id = ?, total = ?, average = ?, position = ?, class_size = ?,
         teacher_comment = COALESCE(?, teacher_comment), source = CASE WHEN source = 'file' THEN source ELSE 'marks' END
       WHERE id = ?`,
      [classId, row.total, row.average, position, classSize, commentRow ? commentRow.comments : null, card.id]
    );
    run('DELETE FROM report_card_subjects WHERE report_card_id = ?', [card.id]);
    for (const m of row.marks) {
      const clean = hub.clean(m.subject, 80) || 'Subject';
      const pct = m.marks === null || m.marks === undefined ? null : Math.round(Number(m.marks) * 10) / 10;
      run(
        'INSERT INTO report_card_subjects (report_card_id, subject, score, out_of, percentage, grade, remarks) VALUES (?, ?, ?, 100, ?, ?, ?)',
        [card.id, clean, m.marks === null ? null : Number(m.marks), pct, m.grade || null, m.comments || null]
      );
    }
  });
  return { students: scored.length, classSize };
}

module.exports = {
  REPORT_DIR, ensureDir, storeFile, filePath, mimeFor, matchStudentFromName,
  upsertFileCard, stashUnmatched, studentFeePosition, parentFor, recomputeClassCards,
};
