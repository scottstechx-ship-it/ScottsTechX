'use strict';
/**
 * BUILD THE IMPORT-CENTER TEST PACK  →  test-files/
 *
 * One ready-to-upload file for every Import Center step, a matching set of
 * deliberate-problem files (edge-cases/), and report-card documents (PDF /
 * PNG scan / a zip of them) for the reports step.
 *
 * The data is a story: import the numbered files in order on a freshly seeded
 * database and every step has something real to do — classes and subjects are
 * created by the timetable, teachers/students/guardians get logins, fees are
 * billed, receipts are recorded, and two children end up fully cleared for the
 * fee gate while two still owe.
 *
 * Run:  node tests/_import-test-files.js      (from school-communication-platform/)
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-files');
const { buildXlsx } = require('./_xlsx-fixture');
const { writeZip } = require('../backend/services/zip');

// ------------------------------------------------------------------ helpers
function csv(text) { return text.replace(/^\n/, '').replace(/\n$/, '') + '\n'; }

/** A genuinely valid one-page PDF (no dependencies), like the seed's makePdf. */
function pdf(lines) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = lines.map((l, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 60 ${760 - i * 22} Td (${esc(l)}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** A tiny valid PNG (1x1 px) — stands in for a phone scan of a report card. */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function scanPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(120, 0); ihdr.writeUInt32BE(60, 4);        // 120x60 “scan”
  ihdr[8] = 8; ihdr[9] = 2;                                      // 8-bit RGB
  const raw = Buffer.concat([Buffer.from([0]), Buffer.alloc(120 * 3, 0xf0)]); // one grey row
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(Array(60).fill(raw)))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------ the CSV files
const FILES = {
  '1-timetable.csv': csv(`
Day,Start,End,Class,Stream,Subject,Teacher,Room,Year
Monday,08:00,08:40,Primary 6,A,Mathematics,Ms. Mary Nakato,Room 7,2026
Monday,08:40,09:20,Primary 6,A,English,Mr. John Okello,Room 7,2026
Monday,10:00,10:40,Primary 6,A,Biology,Ms. Grace Atim,Lab 1,2026
Monday,10:40,11:20,Primary 6,A,Physics,Mr. Robert Ssentongo,Lab 2,2026
Tuesday,08:00,08:40,Primary 6,A,English,Mr. John Okello,Room 7,2026
Tuesday,08:40,09:20,Primary 6,A,Mathematics,Ms. Mary Nakato,Room 7,2026
Tuesday,10:00,10:40,Primary 6,A,Chemistry,Ms. Rebecca Auma,Lab 1,2026
Tuesday,10:40,11:20,Primary 6,A,Biology,Ms. Grace Atim,Lab 1,2026
Wednesday,08:00,08:40,Primary 6,A,Biology,Ms. Grace Atim,Lab 1,2026
Wednesday,08:40,09:20,Primary 6,A,Physics,Mr. Robert Ssentongo,Lab 2,2026
Wednesday,10:00,10:40,Primary 6,A,Mathematics,Ms. Mary Nakato,Room 7,2026
Wednesday,10:40,11:20,Primary 6,A,English,Mr. John Okello,Room 7,2026
Thursday,08:00,08:40,Primary 6,A,Chemistry,Ms. Rebecca Auma,Lab 1,2026
Thursday,08:40,09:20,Primary 6,A,Biology,Ms. Grace Atim,Lab 1,2026
Thursday,10:00,10:40,Primary 6,A,English,Mr. John Okello,Room 7,2026
Thursday,10:40,11:20,Primary 6,A,Mathematics,Ms. Mary Nakato,Room 7,2026
Friday,08:00,08:40,Primary 6,A,Physics,Mr. Robert Ssentongo,Lab 2,2026
Friday,08:40,09:20,Primary 6,A,Chemistry,Ms. Rebecca Auma,Lab 1,2026
Friday,10:00,10:40,Primary 6,A,Mathematics,Ms. Mary Nakato,Room 7,2026
Friday,10:40,11:20,Primary 6,A,,,Field,2026
`),

  '2-teachers.csv': csv(`
Full Name,Staff ID,Email,Phone,Subjects,Classes,Role,Qualification,Date Joined
Mr. Robert Ssentongo,TCH-2026-01,robert.ssentongo@school.test,+256700000050,"Physics, Mathematics",Primary 6 A,Teacher,BSc Education,2025-01-20
Ms. Rebecca Auma,,rebecca.auma@school.test,+256700000051,Chemistry,Primary 6 A,Class Teacher,MSc Chemistry,2024-09-01
Ms. Mary Nakato,TCH-1001,mary@school.test,+256700000011,"Mathematics, Physics",Primary 6 A,Teacher,BSc Education,2020-01-15
`),

  '3-students.csv': csv(`
Full Name,Student ID,Class,Stream,Gender,Date of Birth,Parent Name,Parent Phone,Parent Email,Relationship,Address,Enrollment Date
Emmanuel Kato,STU-2026-301,Primary 6,A,Male,2010-02-14,John Kato,+256700000060,john.kato@example.com,Father,Kampala,2026-02-03
Patricia Akello,STU-2026-302,Primary 6,A,Female,2009-11-02,Margaret Akello,+256700000061,,Mother,Ntinda,2026-02-03
Joshua Wasswa,,Primary 6,A,Male,2010-05-30,,,,,Mukono,
Sarah Okello,STU-2024-001,Senior 2,A,Female,2010-04-12,Mr. John Okello,+256700000020,parent@school.test,Father,Kampala,
`),

  '4-guardians.csv': csv(`
Full Name,Parent ID,Phone,Email,Occupation,Address,Relationship,Children
Mrs. Betty Wasswa,,+256700000062,betty.wasswa@example.com,Nurse,Mukono,Mother,Joshua Wasswa
Mr. Samuel Okiror,PAR-2026-010,+256700000063,,Farmer,Soroti,Uncle,STU-2024-006; STU-2026-302
Mrs. Joy Nabukenya,PAR-2026-011,+256700000064,joy.nabukenya@example.com,Trader,Kampala,Mother,Brenda Wanjala
`),

  '5-attendance.csv': csv(`
Class,Stream,Date,Student ID,Student Name,Status,Note
Primary 6,A,2026-09-14,STU-2026-301,,P,
Primary 6,A,2026-09-14,STU-2026-302,,Present,
Primary 6,A,2026-09-14,,Joshua Wasswa,A,Sick
Primary 6,A,2026-09-15,STU-2026-301,,Present,
Primary 6,A,2026-09-15,STU-2026-302,,L,
Senior 2,A,2026-09-14,STU-2024-001,,Present,
Senior 2,A,2026-09-14,STU-2024-005,,E,Family function
`),

  '6-fees.csv': csv(`
Fee Name,Amount,Year,Term,Class,Student ID
Term 3 Tuition,350000,2026,Term 3,Primary 6 A,
Term 3 Tuition,320000,2026,Term 3,Senior 2 A,
Development Fee,50000,2026,Term 3,,
Boarding Fee,250000,2026,Term 3,,STU-2026-301
`),

  '7-payments.csv': csv(`
Receipt No,Student ID,Student Name,Amount,Method,Date,Term,Year,Reference,Note
RCP-2026-3001,STU-2026-301,,400000,Bank,2026-09-15,Term 3,2026,Stanbic 4412,Tuition + development
RCP-2026-3002,STU-2026-301,,250000,Mobile Money,2026-09-18,Term 3,2026,MTN 77XX,Boarding fee
RCP-2026-3003,STU-2026-302,,150000,Mobile Money,2026-09-16,Term 3,2026,MTN 88XX,Part payment
,,Joshua Wasswa,50000,Cash,2026-09-16,Term 3,2026,,Part payment
RCP-2026-3004,STU-2024-001,,370000,Bank,2026-09-10,Term 3,2026,,Cleared in full
`),

  '8-report-cards.csv': csv(`
Student ID,Student Name,Class,Term,Year,Subject,Score,Out Of,Grade,Remarks,Teacher Comment
STU-2026-301,,Primary 6 A,Term 3,2026,Mathematics,82,100,D1,Excellent work,Best in class
STU-2026-301,,Primary 6 A,Term 3,2026,English,74,100,C2,Good,
STU-2026-301,,Primary 6 A,Term 3,2026,Biology,68,100,C3,,
STU-2026-301,,Primary 6 A,Term 3,2026,Physics,45,50,B,Strong practical,
STU-2026-302,,Primary 6 A,Term 3,2026,Mathematics,58,100,C3,Needs practice,
STU-2026-302,,Primary 6 A,Term 3,2026,English,71,100,C2,,
STU-2026-302,,Primary 6 A,Term 3,2026,Chemistry,88,100,D1,Outstanding,Encourage her to keep it up
,Joshua Wasswa,Primary 6 A,Term 3,2026,Mathematics,39,100,E,Must improve,Please meet the parents
,Joshua Wasswa,Primary 6 A,Term 3,2026,English,52,100,C4,,
STU-2024-001,,Senior 2 A,Term 3,2026,Mathematics,91,100,D1,Excellent work,
`),

  '9-optional-classes.csv': csv(`
Class,Stream,Class Teacher,Year
Primary 6,A,Ms. Rebecca Auma,2026
Primary 5,C,,2026
`),

  '10-optional-subjects.csv': csv(`
Subject,Code,Department,Teachers
Mathematics,MAT,Sciences,"Ms. Mary Nakato"
Literature in English,LIT,Languages,
Entrepreneurship,ENT,Commercial,
`),
};

const EDGE = {
  'timetable-clashes.csv': {
    note: 'Upload AFTER 1-timetable.csv. Rows 2-6 are errors, the last two are warnings.',
    body: csv(`
Day,Start,End,Class,Stream,Subject,Teacher,Room,Year
Monday,08:00,08:40,Primary 6,A,Geography,,Room 7,2026
Monday,08:00,08:40,Senior 4,A,Mathematics,Ms. Mary Nakato,Room 3,2026
Monday,08:00,08:40,Senior 5,A,English,Mr. John Okello,Room 7,2026
Tuesday,09:20,08:40,Senior 4,A,History,,Room 3,2026
Funday,08:00,08:40,Senior 4,A,Mathematics,,Room 3,2026
Monday,08:00,08:40,Primary 6,A,Mathematics,,Room 7,2026
Monday,08:00,08:40,Primary 6,A,Mathematics,Ms. Mary Nakato,Room 12,2026
`),
  },
  'students-problems.csv': {
    note: 'Row 2 is an error, rows 3-4 only warn. (The students step only rejects a blank name —\ninvalid emails are caught by the guardians step, see guardians-problems.csv.)',
    body: csv(`
Full Name,Student ID,Class,Stream,Gender,Date of Birth,Parent Name,Parent Phone,Parent Email,Relationship,Address,Enrollment Date
,STU-2026-901,Primary 6,A,Male,2010-01-01,,,,,Kampala,
No Class Kid,STU-2026-903,,,,,,,,,
Sarah Okello,STU-2024-001,Senior 2,A,Female,2010-04-12,Mr. John Okello,+256700000020,parent@school.test,Father,Kampala,
`),
  },
  'guardians-problems.csv': {
    note: 'Row 2 is an error (bad email), rows 3-4 warn (uncontactable guardian, no children listed).',
    body: csv(`
Full Name,Parent ID,Phone,Email,Occupation,Address,Relationship,Children
Bad Email Parent,PAR-2026-020,+256700000098,not-an-email,Trader,Kampala,Father,STU-2026-301
Mrs. No Contact,PAR-2026-021,,,,Kampala,Mother,STU-2026-301
Mrs. No Children,PAR-2026-022,+256700000095,,,Kampala,Mother,
`),
  },
  'attendance-problems.csv': {
    note: 'Only row 5 imports; the rest show the friendly rejections.',
    body: csv(`
Class,Stream,Date,Student ID,Student Name,Status,Note
Primary 6,A,not a date,STU-2026-301,,Present,
Primary 6,A,2026-09-15,STU-2026-301,,Maybe,
Primary 6,A,2026-09-15,STU-2026-999,,Present,
Primary 6,A,2026-09-16,STU-2026-302,,Present,
Primary 6,A,2026-09-16,STU-2026-302,,Absent,Duplicate of the row above
`),
  },
  'payments-problems.csv': {
    note: 'Upload AFTER 7-payments.csv to see the already-recorded receipt warning.',
    body: csv(`
Receipt No,Student ID,Student Name,Amount,Method,Date,Term,Year,Reference,Note
RCP-2026-9999,STU-2026-301,,0,Cash,2026-09-16,Term 3,2026,,Zero amount
RCP-2026-9998,STU-2026-999,,1000,Cash,2026-09-16,Term 3,2026,,Unknown student
RCP-2026-3001,STU-2026-302,,100,Cash,2026-09-16,Term 3,2026,,Receipt already recorded
DUP-RCP,STU-2026-301,,100,Cash,2026-09-16,Term 3,2026,,First copy is fine
DUP-RCP,STU-2026-302,,100,Cash,2026-09-16,Term 3,2026,,Second copy is caught
`),
  },
  'reports-problems.csv': {
    note: 'All four rows are errors — the preview should refuse to import them.',
    body: csv(`
Student ID,Student Name,Class,Term,Year,Subject,Score,Out Of,Grade,Remarks,Teacher Comment
STU-2026-301,,Primary 6 A,Term 3,2026,,75,100,C,,Missing subject
STU-2026-301,,Primary 6 A,Term 3,2026,History,,,C,,Missing score
STU-2026-999,,Primary 6 A,Term 3,2026,History,60,100,C,,Unknown student
,Joshua Wasswa,Primary 6 A,Term 3,2026,English,eighty,100,,,Score is not a number
`),
  },
};

// ---------------------------------------------------------- report documents
// Deliberately different children from 8-report-cards.csv, so the marks path
// (computed cards) and the files path (uploaded cards) can both be seen on the
// Reports screen. The one overlap — Sarah Okello — shows a file card replacing
// a computed card for the same child + term.
const REPORT_DOCS = {
  // matched by admission number
  'STU-2024-002.pdf': pdf([
    'KAMPALA DEMO SCHOOL - SENIOR 5 TERM 3 2026',
    '', 'Student: David Okello (STU-2024-002)',
    'This report card PDF is named by admission number,',
    'so the import matches it to the child by the code.',
    '', '(TEST DOCUMENT - Import Center test pack)',
  ]),
  // matched by full name
  'Amelia Namutebi.pdf': pdf([
    'KAMPALA DEMO SCHOOL - SENIOR 2 TERM 3 2026',
    '', 'Student: Amelia Namutebi',
    'This report card PDF is named with the child full name,',
    'so the import matches it by name.',
    '', '(TEST DOCUMENT - Import Center test pack)',
  ]),
  // matched by name, as a phone “scan”
  'scan-michael-okello.png': scanPng(),
  // matched by name (seeded child, fees cleared) — replaces her computed card
  'Sarah Okello.pdf': pdf([
    'KAMPALA DEMO SCHOOL - SENIOR 2 TERM 3 2026',
    '', 'Student: Sarah Okello (STU-2024-001)',
    'Sarah has cleared her fees in 7-payments.csv, so the fee',
    'gate lets her report card be sent to her parent.',
    '', '(TEST DOCUMENT - Import Center test pack)',
  ]),
  // matches nobody on purpose
  'UNKNOWN-STUDENT.pdf': pdf([
    'KAMPALA DEMO SCHOOL - TERM 3 2026',
    '', 'No admission number or known name in this file name.',
    'The import parks it for the office to match by hand.',
    '', '(TEST DOCUMENT - Import Center test pack)',
  ]),
};

// ------------------------------------------------------------------- write
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'edge-cases'), { recursive: true });
fs.mkdirSync(path.join(OUT, '8b-report-card-files'), { recursive: true });

for (const [name, body] of Object.entries(FILES)) fs.writeFileSync(path.join(OUT, name), body);

// same students data as a real .xlsx workbook, to test the Excel path
const studentRows = FILES['3-students.csv'].trim().split('\n').map((line) => {
  // naive but sufficient: our students CSV has no quoted commas
  return line.split(',').map((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : v));
});
fs.writeFileSync(path.join(OUT, '3-students.xlsx'), buildXlsx(studentRows));

for (const [name, { body }] of Object.entries(EDGE)) fs.writeFileSync(path.join(OUT, 'edge-cases', name), body);
fs.writeFileSync(path.join(OUT, 'edge-cases', 'not-a-spreadsheet.txt'),
  'This is deliberately not a spreadsheet.\nUpload it to any step except Report cards and\nwatch the friendly rejection message.\n');

for (const [name, data] of Object.entries(REPORT_DOCS)) fs.writeFileSync(path.join(OUT, '8b-report-card-files', name), data);

// the whole set as one zip, the way the office would send a term's cards
fs.writeFileSync(path.join(OUT, '8c-report-cards.zip'),
  writeZip(Object.entries(REPORT_DOCS).map(([name, data]) => ({ name, data }))));

const made = [...Object.keys(FILES), '3-students.xlsx', '8b-report-card-files/ (5 documents)', '8c-report-cards.zip',
  ...Object.keys(EDGE).map((k) => `edge-cases/${k}`), 'edge-cases/not-a-spreadsheet.txt'];
console.log(`test-files/ written (${made.length} items):`);
for (const m of made) console.log('  ' + m);
