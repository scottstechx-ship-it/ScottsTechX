'use strict';
/**
 * REPORT CARD PDF FORMAT — a real PDF the school can download, fill or replace,
 * and upload again.
 *
 * Two shapes:
 *   - a blank card (the layout, plus how to name the file)
 *   - one card per child, already named with the student ID, so a zip of them
 *     is the format the office uploads (Import Center or Report Cards)
 *
 * No PDF library: the files are plain PDF 1.4 with Helvetica, which every
 * viewer opens. Text is kept to WinAnsi-safe characters so a school name with
 * an accent cannot corrupt the file.
 */

const { writeZip } = require('./zip');

const SUBJECT_ROWS = 10;
const PAGE_W = 595;
const PAGE_H = 842;

function pdfSafe(value) {
  return String(value == null ? '' : value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function esc(value) {
  return pdfSafe(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function n(value) {
  return Math.round(Number(value) * 10) / 10;
}

/** Drawing helpers append PDF operators. Origin is the bottom-left of the page. */
function draw(ops) {
  const text = (x, y, size, str, { font = 'F1', color = null } = {}) => {
    const clean = pdfSafe(str);
    if (!clean) return;
    if (color) ops.push(color);
    ops.push(`BT /${font} ${size} Tf 1 0 0 1 ${n(x)} ${n(y)} Tm (${esc(clean)}) Tj ET`);
    if (color) ops.push('0 0 0 rg');
  };
  const fill = (color, x, y, w, h) => {
    ops.push(`${color} ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`);
    ops.push('0 0 0 rg');
  };
  const stroke = (x, y, w, h) => ops.push(`${n(x)} ${n(y)} ${n(w)} ${n(h)} re S`);
  const rule = (x1, y1, x2, y2) => ops.push(`${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);
  return { text, fill, stroke, rule };
}

function wrapPdf(stream) {
  const body = String(stream);
  const length = Buffer.byteLength(body, 'latin1');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${length} >>\nstream\n${body}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = [0];
  objs.forEach((obj, i) => {
    offsets.push(parts.reduce((sum, buf) => sum + buf.length, 0));
    parts.push(Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`, 'latin1'));
  });
  const xrefAt = parts.reduce((sum, buf) => sum + buf.length, 0);
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}

function fieldLine(d, label, value, x, y, lineEnd) {
  d.text(x, y, 10, label, { font: 'F2' });
  const labelWidth = 78;
  const start = x + labelWidth;
  if (value) d.text(start, y, 11, value);
  else d.rule(start, y - 2, lineEnd, y - 2);
}

/**
 * One A4 report card.
 * `student` null → the blank format (empty fields, naming instructions).
 * Otherwise the child's name, ID and class are already printed, and `fileName`
 * is the name the school must keep when they upload.
 */
function cardPdf({ schoolName = 'School', student = null, term = '', year = '', fileName = '' } = {}) {
  const ops = ['0.8 w', '0.55 0.60 0.66 RG'];
  const d = draw(ops);
  const school = pdfSafe(schoolName).slice(0, 72) || 'School';
  const name = student ? pdfSafe(student.full_name).slice(0, 48) : '';
  const code = student ? pdfSafe(student.student_code).slice(0, 28) : '';
  const klass = student
    ? pdfSafe([student.class_name, student.class_stream].filter(Boolean).join(' ')).slice(0, 28)
    : '';
  const termLabel = pdfSafe(term).slice(0, 18);
  const yearLabel = pdfSafe(year).slice(0, 8);
  const uploadName = pdfSafe(fileName) || (code ? `${code}.pdf` : 'STUDENT-ID.pdf');

  d.fill('0.10 0.27 0.48 rg', 0, 786, PAGE_W, 56);
  d.text(36, 814, 18, 'REPORT CARD', { font: 'F2', color: '1 1 1 rg' });
  d.text(36, 796, 10, school, { color: '0.86 0.91 0.97 rg' });

  d.fill('0.93 0.96 0.99 rg', 36, 742, 523, 36);
  d.stroke(36, 742, 523, 36);
  d.text(46, 760, 9, 'PDF format the school uploads. Keep the file name, then upload this PDF or a zip of them.', { font: 'F2' });
  d.text(46, 748, 9, `File name: ${uploadName}    ${termLabel || 'Term'} ${yearLabel}`.trim());

  fieldLine(d, 'Student', name, 36, 716, 340);
  fieldLine(d, 'Student ID', code, 350, 716, 559);
  fieldLine(d, 'Class', klass, 36, 692, 250);
  fieldLine(d, 'Term', termLabel, 270, 692, 400);
  fieldLine(d, 'Year', yearLabel, 420, 692, 559);

  const tableTop = 668;
  const rowH = 22;
  const cols = [36, 248, 312, 376, 440, 559];
  const headers = ['Subject', 'Score', 'Out of', 'Grade', 'Remarks'];
  d.fill('0.90 0.93 0.96 rg', 36, tableTop - rowH, 523, rowH);
  headers.forEach((h, i) => d.text(cols[i] + 6, tableTop - 15, 9, h, { font: 'F2' }));
  for (let r = 0; r <= SUBJECT_ROWS; r += 1) {
    const y = tableTop - rowH * (r + 1);
    d.rule(36, y, 559, y);
  }
  cols.forEach((x) => d.rule(x, tableTop - rowH * (SUBJECT_ROWS + 1), x, tableTop));
  d.text(36, tableTop - rowH * (SUBJECT_ROWS + 1) - 16, 8, 'Write one subject per row. Leave a row blank if the child does not take that subject.');

  const commentTop = tableTop - rowH * (SUBJECT_ROWS + 1) - 36;
  d.text(36, commentTop, 10, 'Class teacher comment', { font: 'F2' });
  d.stroke(36, commentTop - 62, 523, 54);
  d.text(36, commentTop - 84, 10, 'Head teacher comment', { font: 'F2' });
  d.stroke(36, commentTop - 146, 523, 54);

  const signY = 118;
  d.text(36, signY, 9, 'Class teacher', { font: 'F2' });
  d.rule(36, signY - 18, 190, signY - 18);
  d.text(214, signY, 9, 'Head teacher', { font: 'F2' });
  d.rule(214, signY - 18, 380, signY - 18);
  d.text(404, signY, 9, 'Date', { font: 'F2' });
  d.rule(404, signY - 18, 559, signY - 18);

  d.fill('0.96 0.97 0.98 rg', 0, 0, PAGE_W, 46);
  d.text(36, 26, 8, 'Upload in Import Center (Report cards) or on Report Cards. The file name must contain the student ID or the child\'s full name.');
  d.text(36, 14, 8, `This file should be uploaded as ${uploadName}. A zip of one PDF per child is accepted.`);

  return wrapPdf(`${ops.join('\n')}\n`);
}

function blankPdf(opts = {}) {
  return cardPdf({ ...opts, student: null, fileName: 'STUDENT-ID.pdf' });
}

/** A filename the import matcher can tie back to this child. */
function fileNameFor(student, used) {
  const raw = pdfSafe(student.student_code || student.full_name || `student-${student.id}`)
    .replace(/\.pdf$/i, '')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  const base = raw || `student-${student.id}`;
  let name = `${base}.pdf`;
  if (used.has(name.toLowerCase())) name = `${base}-${student.id}.pdf`;
  used.add(name.toLowerCase());
  return name;
}

function readme({ term, year, count }) {
  return `REPORT CARD PDF FORMAT
======================

This zip is the format the school uploads.

${count
    ? `There is one PDF per child, already named with the student ID (or the child's name when there is no ID). filenames.csv lists every name.`
    : 'No students are on the platform yet. Import students first, then download this format again — it will contain one named PDF per child. The blank card in this zip shows the layout.'}

HOW TO UPLOAD
-------------
1. Use these PDFs as they are, or replace each file with the school's own
   report card PDF. Keep the file name exactly (see filenames.csv).
2. Open Import Center, step "Report cards", or open Report Cards.
3. Press Upload and choose this zip, or choose the PDFs themselves.
4. The preview shows which child each file belongs to. Nothing is saved until
   you confirm. A file whose name matches nobody is kept so you can choose
   the child by hand.

Word files and photos of a scan use the same file names. A spreadsheet of
marks is a different format: use the marks template (CSV) in Import Center.

Term and year printed on these cards: ${term || '(not set)'} ${year || ''}
When you upload, leave the term and year on the screen set to the same values.
`;
}

function filenamesCsv(rows) {
  const header = 'Student ID,Student Name,Class,File name';
  const line = (values) => values.map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',');
  return [header, ...rows.map((r) => line([r.code, r.name, r.klass, r.fileName]))].join('\n') + '\n';
}

/**
 * Zip the school uploads: a readme, a filename index, and one PDF per child.
 * With no children, the blank card is included so there is still a PDF format.
 */
function formatPack(students, { schoolName = 'School', term = '', year = '' } = {}) {
  const used = new Set();
  const files = [];
  const index = [];
  for (const student of students || []) {
    const fileName = fileNameFor(student, used);
    const klass = [student.class_name, student.class_stream].filter(Boolean).join(' ');
    files.push({
      name: fileName,
      data: cardPdf({ schoolName, student, term, year, fileName }),
    });
    index.push({
      code: student.student_code || '',
      name: student.full_name || '',
      klass,
      fileName,
    });
  }
  if (!files.length) {
    files.push({ name: 'report-card-format.pdf', data: blankPdf({ schoolName, term, year }) });
  }
  files.unshift({ name: 'filenames.csv', data: filenamesCsv(index) });
  files.unshift({ name: 'README-FORMAT.txt', data: readme({ term, year, count: index.length }) });
  return writeZip(files);
}

module.exports = { blankPdf, cardPdf, formatPack, fileNameFor, pdfSafe };
