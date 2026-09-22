'use strict';
/**
 * BUILD THE IMPORT-CENTER TEST PACK  →  test-files/
 *
 * One ready-to-upload file for every Import Center step, a matching set of
 * deliberate-problem files (edge-cases/), and report-card documents (PDF /
 * PNG scan / a zip of them) for the reports step.
 *
 * The school under test is S1 A / S1 B / … / S4 B (eight classes, written as
 * Class "S1" + Stream "A"/"B" — the form the platform's schema expects).
 *
 * The data is a story: import the numbered files in order on a freshly seeded
 * database and every step has something real to do — the timetable creates the
 * eight classes and the subjects, teachers/students/guardians get logins, fees
 * are billed per class, receipts are recorded, and by the end three children
 * are fully cleared for the fee gate while three still owe.
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
const q = (v) => (/[",;\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const row = (cells) => cells.map(q).join(',');

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
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** A tiny valid PNG (a grey rectangle) — stands in for a phone scan of a report card. */
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

// ------------------------------------------------------- the school under test
const CLASSES = [['S1', 'A'], ['S1', 'B'], ['S2', 'A'], ['S2', 'B'], ['S3', 'A'], ['S3', 'B'], ['S4', 'A'], ['S4', 'B']];
const label = (i) => `${CLASSES[i][0]} ${CLASSES[i][1]}`;

const SUBJECTS = ['Mathematics', 'English', 'Biology', 'Physics', 'Chemistry'];
const TEACHER_OF = {
  Mathematics: 'Ms. Mary Nakato',       // seeded (TCH-1001)
  English: 'Mr. John Okello',           // seeded (TCH-1002)
  Biology: 'Ms. Grace Atim',            // seeded (TCH-1003)
  Physics: 'Mr. Robert Ssentongo',      // created by 2-teachers.csv
  Chemistry: 'Ms. Rebecca Auma',        // created by 2-teachers.csv
};
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// 16 students: two per class. Explicit codes on the first of each pair
// (STU-2026-401, 403, … 415); the second of each pair leaves the ID blank so
// the import generates it (deterministically 402, 404, … 416 on a fresh DB).
const STUDENTS = [
  ['Emmanuel Kato', 'STU-2026-401', 0, 'Male', '2013-03-12', 'John Kato', '+256700000060', 'john.kato@example.com', 'Father', 'Kampala'],
  ['Joshua Wasswa', '', 0, 'Male', '2013-07-25', '', '', '', '', 'Mukono'],
  ['Patricia Akello', 'STU-2026-403', 1, 'Female', '2013-11-02', 'Margaret Akello', '+256700000061', '', 'Mother', 'Ntinda'],
  ['Derrick Mugisha', '', 1, 'Male', '2013-01-30', '', '', '', '', 'Kampala'],
  ['Aisha Nansubuga', 'STU-2026-405', 2, 'Female', '2012-04-18', 'Halima Nansubuga', '+256700000062', 'halima.n@example.com', 'Mother', 'Kampala'],
  ['Ivan Ssemakula', '', 2, 'Male', '2012-09-05', '', '', '', '', 'Entebbe'],
  ['Prossy Nabukenya', 'STU-2026-407', 3, 'Female', '2012-06-21', 'Rose Nabukenya', '+256700000063', '', 'Mother', 'Kampala'],
  ['Kenneth Opio', '', 3, 'Male', '2012-02-14', '', '', '', '', 'Gulu'],
  ['Lydia Amoding', 'STU-2026-409', 4, 'Female', '2011-08-09', 'George Amoding', '+256700000064', 'george.amoding@example.com', 'Father', 'Mbale'],
  ['Felix Odongo', '', 4, 'Male', '2011-12-01', '', '', '', '', 'Tororo'],
  ['Sharon Atuhaire', 'STU-2026-411', 5, 'Female', '2011-05-15', 'Jennifer Atuhaire', '+256700000065', '', 'Mother', 'Mbarara'],
  ['Hassan Kirumira', '', 5, 'Male', '2011-10-27', '', '', '', '', 'Kampala'],
  ['Nicholas Tumusiime', 'STU-2026-413', 6, 'Male', '2010-02-23', 'Charles Tumusiime', '+256700000066', 'charles.t@example.com', 'Father', 'Kabale'],
  ['Grace Nalubega', '', 6, 'Female', '2010-09-16', '', '', '', '', 'Masaka'],
  ['Pius Byaruhanga', 'STU-2026-415', 7, 'Male', '2010-04-04', 'Joyce Byaruhanga', '+256700000067', '', 'Mother', 'Hoima'],
  ['Esther Namara', '', 7, 'Female', '2010-12-12', '', '', '', '', 'Kampala'],
];

// ------------------------------------------------------------ 1. the timetable
// One lesson per class per day. S1/S2 lessons sit at 08:00–08:40 and S3/S4 at
// 08:50–09:30 — the A and B streams of a form run in parallel, each in its own
// room, and the rotating subjects keep every teacher clash-free.
// Mr. Ssentongo and Ms. Auma are NOT in the system yet — their 16 lessons load
// unassigned on purpose: re-importing this same file after step 2 assigns them
// (the timetable-correction flow). The last row is a subject-less activity.
const tt = ['Day,Start,End,Class,Stream,Subject,Teacher,Room,Year'];
CLASSES.forEach(([cls, stream], i) => {
  DAYS.forEach((day, d) => {
    const subject = SUBJECTS[(i + d) % 5];
    tt.push(row([day, i < 4 ? '08:00' : '08:50', i < 4 ? '08:40' : '09:30', cls, stream, subject, TEACHER_OF[subject], `Room ${i + 1}`, '2026']));
  });
});
tt.push(row(['Friday', '14:00', '14:40', 'S4', 'B', '', '', 'Room 8', '2026']));

// ------------------------------------------------------------- 3. the students
const st = ['Full Name,Student ID,Class,Stream,Gender,Date of Birth,Parent Name,Parent Phone,Parent Email,Relationship,Address,Enrollment Date'];
STUDENTS.forEach(([name, code, ci, gender, dob, pName, pPhone, pEmail, rel, addr]) => {
  st.push(row([name, code, CLASSES[ci][0], CLASSES[ci][1], gender, dob, pName, pPhone, pEmail, rel, addr, code ? '2026-02-03' : '']));
});

// ------------------------------------------------------------ 5. the registers
const att = ['Class,Stream,Date,Student ID,Student Name,Status,Note'];
CLASSES.forEach(([c, s], i) => att.push(row([c, s, '2026-09-14', `STU-2026-${401 + i * 2}`, '', i % 2 ? 'Present' : 'P', ''])));
att.push(row(['S2', 'A', '2026-09-15', 'STU-2026-405', '', 'L', '']));
att.push(row(['S3', 'A', '2026-09-15', '', 'Lydia Amoding', 'A', 'Sick']));
att.push(row(['S3', 'B', '2026-09-15', 'STU-2026-411', '', 'E', 'Family function']));

// ----------------------------------------------------------- 6. the fee structure
const fees = ['Fee Name,Amount,Year,Term,Class,Student ID'];
CLASSES.forEach((c, i) => fees.push(row(['Term 3 Tuition', i < 4 ? '300000' : '350000', '2026', 'Term 3', label(i), ''])));
fees.push(row(['Development Fee', '50000', '2026', 'Term 3', '', '']));                 // whole school
fees.push(row(['Boarding Fee', '200000', '2026', 'Term 3', '', 'STU-2026-411']));      // one student

// ------------------------------------------------------------ the CSV files
const FILES = {
  '1-timetable.csv': tt.join('\n') + '\n',

  '2-teachers.csv': csv(`
Full Name,Staff ID,Email,Phone,Subjects,Classes,Role,Qualification,Date Joined
Mr. Robert Ssentongo,TCH-2026-01,robert.ssentongo@school.test,+256700000050,"Physics, Mathematics","S3 A; S4 A",Teacher,BSc Education,2025-01-20
Ms. Rebecca Auma,,rebecca.auma@school.test,+256700000051,Chemistry,S1 B,Class Teacher,MSc Chemistry,2024-09-01
Ms. Mary Nakato,TCH-1001,mary@school.test,+256700000011,"Mathematics, Physics",S1 A,Teacher,BSc Education,2020-01-15
`),

  '3-students.csv': st.join('\n') + '\n',

  '4-guardians.csv': csv(`
Full Name,Parent ID,Phone,Email,Occupation,Address,Relationship,Children
Mrs. Betty Wasswa,,+256700000070,betty.wasswa@example.com,Nurse,Mukono,Mother,Joshua Wasswa
Mr. Samuel Okiror,PAR-2026-010,+256700000071,,Farmer,Soroti,Uncle,"STU-2026-403; STU-2026-405"
Mrs. Joy Nabukenya,PAR-2026-011,+256700000072,joy.nabukenya@example.com,Trader,Kampala,Mother,Brenda Kaboyo
`),

  '5-attendance.csv': att.join('\n') + '\n',

  '6-fees.csv': fees.join('\n') + '\n',

  '7-payments.csv': csv(`
Receipt No,Student ID,Student Name,Amount,Method,Date,Term,Year,Reference,Note
RCP-2026-6001,STU-2026-401,,350000,Bank,2026-09-10,Term 3,2026,Stanbic 4412,Cleared in full
RCP-2026-6002,STU-2026-413,,400000,Bank,2026-09-11,Term 3,2026,,Cleared in full
RCP-2026-6003,,Kenneth Opio,100000,Mobile Money,2026-09-12,Term 3,2026,MTN 77XX,Part payment
,STU-2026-415,,150000,Cash,2026-09-12,Term 3,2026,,Part payment
RCP-2026-6004,STU-2026-411,,250000,Mobile Money,2026-09-15,Term 3,2026,MTN 88XX,Part payment
RCP-2026-6005,STU-2024-001,,50000,Cash,2026-09-08,Term 3,2026,,Development fee
`),

  '8-report-cards.csv': csv(`
Student ID,Student Name,Class,Term,Year,Subject,Score,Out Of,Grade,Remarks,Teacher Comment
STU-2026-401,,S1 A,Term 3,2026,Mathematics,82,100,D1,Excellent work,Best in class
STU-2026-401,,S1 A,Term 3,2026,English,74,100,C2,Good,
STU-2026-401,,S1 A,Term 3,2026,Biology,68,100,C3,,
STU-2026-401,,S1 A,Term 3,2026,Physics,45,50,B,Strong practical,
STU-2026-413,,S4 A,Term 3,2026,Mathematics,91,100,D1,Excellent work,
STU-2026-413,,S4 A,Term 3,2026,Chemistry,88,100,D1,Outstanding,Keep it up
STU-2026-413,,S4 A,Term 3,2026,English,65,100,C3,,
,Kenneth Opio,S2 B,Term 3,2026,Mathematics,58,100,C3,Needs practice,
,Kenneth Opio,S2 B,Term 3,2026,English,71,100,C2,,
STU-2026-411,,S3 B,Term 3,2026,Biology,77,100,B,,
STU-2026-411,,S3 B,Term 3,2026,Mathematics,39,100,E,Must improve,Please meet the parents
STU-2024-001,,Senior 2 A,Term 3,2026,Mathematics,91,100,D1,Excellent work,
`),

  '9-optional-classes.csv': csv(`
Class,Stream,Class Teacher,Year
S1,A,Ms. Mary Nakato,2026
S4,B,Mr. Robert Ssentongo,2026
`),

  '10-optional-subjects.csv': csv(`
Subject,Code,Department,Teachers
Mathematics,MAT,Sciences,"Ms. Mary Nakato"
Literature in English,LIT,Languages,
Entrepreneurship,ENT,Commercial,
`),
};

const EDGE = {
  // Row 1: S1 A already has Mathematics at Monday 08:00 (slot taken).
  // Row 2: Ms. Mary Nakato is teaching S1 A at that exact time (teacher clash).
  // Row 3: Room 1 is S1 A's room at that time (room clash).
  // Row 4: end before start. Row 5: not a day.
  // Row 6: the same lesson, imported before → "nothing to change" (warning).
  // Row 7: the same lesson with a new room → a real correction (warning).
  'timetable-clashes.csv': {
    note: 'Upload AFTER 1-timetable.csv. Rows 2-6 are errors, the last two are warnings.',
    body: csv(`
Day,Start,End,Class,Stream,Subject,Teacher,Room,Year
Monday,08:00,08:40,S1,A,Geography,,Room 7,2026
Monday,08:00,08:40,S3,A,History,Ms. Mary Nakato,Room 9,2026
Monday,08:00,08:40,S3,B,Chemistry,,Room 1,2026
Tuesday,09:20,08:40,S1,A,History,,Room 1,2026
Funday,08:00,08:40,S1,A,Mathematics,,Room 1,2026
Monday,08:00,08:40,S1,A,Mathematics,,,2026
Monday,08:00,08:40,S1,A,Mathematics,Ms. Mary Nakato,Room 12,2026
`),
  },
  'students-problems.csv': {
    note: 'Row 2 is an error, rows 3-4 only warn. (The students step only rejects a blank name —\ninvalid emails are caught by the guardians step, see guardians-problems.csv.)',
    body: csv(`
Full Name,Student ID,Class,Stream,Gender,Date of Birth,Parent Name,Parent Phone,Parent Email,Relationship,Address,Enrollment Date
,STU-2026-901,S1,A,Male,2010-01-01,,,,,Kampala,
No Class Kid,STU-2026-903,,,,,,,,,
Sarah Okello,STU-2024-001,Senior 2,A,Female,2010-04-12,Mr. John Okello,+256700000020,parent@school.test,Father,Kampala,
`),
  },
  'guardians-problems.csv': {
    note: 'Row 2 is an error (bad email), rows 3-4 warn (uncontactable guardian, no children listed).',
    body: csv(`
Full Name,Parent ID,Phone,Email,Occupation,Address,Relationship,Children
Bad Email Parent,PAR-2026-020,+256700000098,not-an-email,Trader,Kampala,Father,STU-2026-401
Mrs. No Contact,PAR-2026-021,,,,Kampala,Mother,STU-2026-403
Mrs. No Children,PAR-2026-022,+256700000095,,,Kampala,Mother,
`),
  },
  'attendance-problems.csv': {
    note: 'Only row 5 imports; the rest show the friendly rejections.',
    body: csv(`
Class,Stream,Date,Student ID,Student Name,Status,Note
S1,A,not a date,STU-2026-401,,Present,
S1,A,2026-09-15,STU-2026-401,,Maybe,
S1,A,2026-09-15,STU-2026-999,,Present,
S1,A,2026-09-16,STU-2026-403,,Present,
S1,A,2026-09-16,STU-2026-403,,Absent,Duplicate of the row above
`),
  },
  'payments-problems.csv': {
    note: 'Upload AFTER 7-payments.csv to see the already-recorded receipt warning.',
    body: csv(`
Receipt No,Student ID,Student Name,Amount,Method,Date,Term,Year,Reference,Note
RCP-2026-9999,STU-2026-401,,0,Cash,2026-09-16,Term 3,2026,,Zero amount
RCP-2026-9998,STU-2026-999,,1000,Cash,2026-09-16,Term 3,2026,,Unknown student
RCP-2026-6001,STU-2026-403,,100,Cash,2026-09-16,Term 3,2026,,Receipt already recorded
DUP-RCP,STU-2026-401,,100,Cash,2026-09-16,Term 3,2026,,First copy is fine
DUP-RCP,STU-2026-403,,100,Cash,2026-09-16,Term 3,2026,,Second copy is caught
`),
  },
  'reports-problems.csv': {
    note: 'All four rows are errors — the preview should refuse to import them.',
    body: csv(`
Student ID,Student Name,Class,Term,Year,Subject,Score,Out Of,Grade,Remarks,Teacher Comment
STU-2026-401,,S1 A,Term 3,2026,,75,100,C,,Missing subject
STU-2026-401,,S1 A,Term 3,2026,History,,,C,,Missing score
STU-2026-999,,S1 A,Term 3,2026,History,60,100,C,,Unknown student
,Joshua Wasswa,S1 A,Term 3,2026,English,eighty,100,,,Score is not a number
`),
  },
};

// ---------------------------------------------------------- report documents
// Seeded children, deliberately different from 8-report-cards.csv, so the marks
// path (computed cards) and the files path (uploaded cards) can both be seen on
// the Reports screen. The one overlap — Sarah Okello — shows a file card
// replacing a computed card for the same child + term.
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
// Only the files this script owns are removed, so anything else the user keeps
// in test-files/ (e.g. this pack's README.md) survives a regeneration.
fs.mkdirSync(OUT, { recursive: true });
for (const name of [...Object.keys(FILES), '3-students.xlsx', '8c-report-cards.zip']) {
  fs.rmSync(path.join(OUT, name), { force: true });
}
fs.rmSync(path.join(OUT, 'edge-cases'), { recursive: true, force: true });
fs.rmSync(path.join(OUT, '8b-report-card-files'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'edge-cases'), { recursive: true });
fs.mkdirSync(path.join(OUT, '8b-report-card-files'), { recursive: true });

for (const [name, body] of Object.entries(FILES)) fs.writeFileSync(path.join(OUT, name), body);

// the same students data as a real .xlsx workbook, to test the Excel path
const xlsxRows = [st[0].split(','), ...STUDENTS.map(([name, code, ci, gender, dob, pName, pPhone, pEmail, rel, addr]) =>
  [name, code, CLASSES[ci], '', gender, dob, pName, pPhone, pEmail, rel, addr, code ? '2026-02-03' : ''])];
fs.writeFileSync(path.join(OUT, '3-students.xlsx'), buildXlsx(xlsxRows));

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
