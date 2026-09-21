'use strict';
/**
 * IMPORT TEMPLATES — one place that produces the starter file for every kind
 * of import, plus the "starter pack" the office can download in one go.
 *
 * Every template carries comment rows (starting with #) that the parsers skip,
 * so a school that has never done this before can read the instructions inside
 * the very file they are filling in.
 */

const ORDER = ['timetable', 'teachers', 'students', 'guardians', 'attendance', 'fees', 'payments', 'reports', 'classes', 'subjects'];

const TEMPLATES = {
  timetable: {
    filename: '1-timetable.csv',
    title: 'Timetable (import this FIRST)',
    content:
      'Day,Start,End,Class,Stream,Subject,Teacher,Room,Year\n' +
      'Monday,08:00,08:40,Senior 2,A,Mathematics,Ms. Grace Atim,Room 12,2026\n' +
      'Monday,08:40,09:20,Senior 2,A,English,Mr. Peter Okoth,Room 12,2026\n' +
      'Monday,09:20,10:00,Senior 1,A,Mathematics,Ms. Grace Atim,Room 8,2026\n' +
      'Tuesday,08:00,08:40,Senior 2,A,Physics,Mr. Peter Okoth,Lab 1,2026\n' +
      '"# Importing the timetable creates the classes and subjects automatically, and links each teacher to the class + subject they teach.",,,,,,,,\n' +
      '"# Times are 24-hour (08:00, 14:30). Day can be Mon or Monday. If a teacher is not known yet, leave Teacher blank — the lesson is created unassigned.",,,,,,,,\n' +
      '"# Clashes are checked before anything is saved: a class cannot have two lessons at once, and neither can a teacher or a room.",,,,,,,,\n',
  },
  teachers: {
    filename: '2-teachers.csv',
    title: 'Teachers & staff',
    content:
      'Full Name,Staff ID,Email,Phone,Subjects,Classes,Role,Qualification,Date Joined\n' +
      'Ms. Grace Atim,TCH-2026-01,grace@example.com,+256700000040,"Mathematics, Physics",Senior 2 A,Teacher,BSc Education,2024-02-01\n' +
      'Mr. Peter Okoth,,peter@example.com,+256700000041,English,Senior 1 A,Class Teacher,BA Arts with Education,\n' +
      '"# Staff ID is optional - leave it blank and the system generates one (TCH-2026-03).",,,,,,,,\n' +
      '"# Every teacher gets a login account: username = staff ID, default password, changed on first login.",,,,,,,,\n' +
      '"# Subjects listed here are created automatically. Classes listed here are linked to the teacher; put Class Teacher in Role to make them the class teacher.",,,,,,,,\n',
  },
  students: {
    filename: '3-students.csv',
    title: 'Students',
    content:
      'Full Name,Student ID,Class,Stream,Gender,Date of Birth,Parent Name,Parent Phone,Parent Email,Relationship,Address,Enrollment Date\n' +
      'Sarah Namuli,STU-2026-100,Senior 2,A,Female,2010-04-12,John Namuli,+256700000030,john@example.com,Father,Kampala,\n' +
      'Brian Mukasa,,Senior 2,A,Male,2009-07-19,Peter Mukasa,+256700000031,,Guardian,Entebbe,2026-02-01\n' +
      '"# Student ID is optional - one is generated when it is blank (STU-2026-101).",,,,,,,,,,,\n' +
      '"# The class in the file is created automatically if it does not exist yet, so this import also fills classes.",,,,,,,,,,,\n' +
      '"# Guardian columns create the parent account AND link them to the child, so steps 3 and 4 can be done in one file.",,,,,,,,,,,\n' +
      '"# Dates are YYYY-MM-DD (2026-02-01). Gender can be M/F or Male/Female.",,,,,,,,,,,\n',
  },
  guardians: {
    filename: '4-guardians.csv',
    title: 'Parents & guardians',
    content:
      'Full Name,Parent ID,Phone,Email,Occupation,Address,Relationship,Children\n' +
      'John Namuli,,+256700000030,john@example.com,Farmer,Kampala,Father,STU-2026-100\n' +
      'Mary Nakato,PAR-2026-002,+256700000031,mary@example.com,Teacher,Ntinda,Mother,"STU-2026-101; STU-2026-102"\n' +
      '"# Parent ID is optional - one is generated when blank. Every guardian gets a login (username = parent ID).",,,,,,,,\n' +
      '"# Children: admission numbers separated by ; (safest) or full names. Import the students first so every child exists.",,,,,,,,\n' +
      '"# One guardian may follow several children in the same cell, and several guardians may follow the same child.",,,,,,,,\n',
  },
  attendance: {
    filename: '5-attendance.csv',
    title: 'Attendance registers',
    content:
      'Class,Stream,Date,Student ID,Student Name,Status,Note\n' +
      'Senior 2,A,2026-09-14,STU-2026-100,,Present,\n' +
      'Senior 2,A,2026-09-14,,Brian Mukasa,Absent,Sick\n' +
      '"# One row per student per day. Status accepts present/absent/late/permission or P/A/L/E.",,,,,,,\n' +
      '"# The term is worked out from the date using the school calendar, so term reports just work.",,,,,,,\n' +
      '"# Re-importing the same day corrects it - it never creates a duplicate mark.",,,,,,,\n',
  },
  fees: {
    filename: '6-fees.csv',
    title: 'Fee structures',
    content:
      'Fee Name,Amount,Year,Term,Class,Student ID\n' +
      'Term 3 Tuition,850000,2026,Term 3,Senior 2 A,\n' +
      'Development Fee,150000,2026,Term 3,,\n' +
      'Boarding,400000,2026,Term 3,,STU-2026-100\n' +
      '"# Leave Class blank to bill the whole school; put a Class to bill just that class; put a Student ID to bill one student.",,,,,,\n' +
      '"# Amounts are plain numbers in UGX (850000, no commas). Every student in scope is billed automatically.",,,,,,\n',
  },
  payments: {
    filename: '7-payments.csv',
    title: 'Fee payments received',
    content:
      'Receipt No,Student ID,Student Name,Amount,Method,Date,Term,Year,Reference,Note\n' +
      'RCP-1001,STU-2026-100,,850000,Bank,2026-09-05,Term 3,2026,Stanbic ref 4412,Cleared in full\n' +
      ',STU-2026-101,Brian Mukasa,300000,Mobile Money,2026-09-08,Term 3,2026,MTN 77xxxx,Part payment\n' +
      '"# Receipt No is optional; when given, a receipt that already exists is skipped so nothing is counted twice.",,,,,,,,,,\n' +
      '"# Method can be Cash, Bank, Mobile Money, Cheque, Scholarship. Payments decide who is cleared for report cards.",,,,,,,,,,\n',
  },
  reports: {
    filename: '8-report-cards.csv',
    title: 'Report cards (marks)',
    content:
      'Student ID,Student Name,Class,Term,Year,Subject,Score,Out Of,Grade,Remarks,Teacher Comment\n' +
      'STU-2026-100,,Senior 2 A,Term 3,2026,Mathematics,78,100,A,Good work,Improved a lot this term\n' +
      'STU-2026-100,,Senior 2 A,Term 3,2026,English,64,100,C,Keep reading,\n' +
      ',Brian Mukasa,Senior 2 A,Term 3,2026,Physics,55,100,D,Needs practice,\n' +
      '"# One row per subject per student. Totals, averages and class positions are worked out automatically.",,,,,,,,,,\n' +
      '"# These marks appear in Exams & Results as well, and the report card is built from them.",,,,,,,,,,\n' +
      '"# Already have report cards as PDFs? Upload them on the Reports screen - bulk zips are supported.",,,,,,,,,,\n',
  },
  classes: {
    filename: 'optional-classes.csv',
    title: 'Classes & streams (optional)',
    content:
      'Class,Stream,Class Teacher,Year\n' +
      'Senior 2,A,Ms. Grace Atim,2026\n' +
      'Senior 2,B,,2026\n' +
      '"# Only needed to fix names, add streams or set class teachers - timetables and students already create classes.",,,,\n',
  },
  subjects: {
    filename: 'optional-subjects.csv',
    title: 'Subjects (optional)',
    content:
      'Subject,Code,Department,Teachers\n' +
      'Mathematics,MAT,Sciences,"Ms. Grace Atim"\n' +
      'Literature,LIT,Languages,\n' +
      '"# Only needed to add or correct subjects, codes and departments.",,,,\n',
  },
};

const README = `SCHOOL COMMUNICATION PLATFORM — IMPORT STARTER PACK
===================================================

Import the files in this order. Each step builds on the one before it, so by the
end every class, subject, teacher, student and guardian is connected without
typing anything twice.

  1. 1-timetable.csv     Creates the CLASSES and SUBJECTS, and links every
                         teacher to the class + subject they teach.
  2. 2-teachers.csv      Creates teacher logins, subjects and class links.
  3. 3-students.csv      Creates student logins and fills the classes.
  4. 4-guardians.csv     Creates parent logins and links them to their children.
  5. 5-attendance.csv    Loads historical registers (optional but recommended).
  6. 6-fees.csv          Creates fee structures and bills the right students.
  7. 7-payments.csv      Records payments, so the system knows who has cleared.
  8. 8-report-cards.csv  Loads marks (or upload the PDFs on the Reports screen),
                         then send each report to its parent in a few clicks.

optional-classes.csv and optional-subjects.csv are there only if something
needs correcting later.

HOW TO USE
----------
* Open each file in Excel, replace the example rows with your own, save as CSV
  or .xlsx.
* Delete the lines that begin with # — they are only instructions.
* Blank Student ID / Staff ID / Parent ID are fine: the system generates them.
* Upload the files in the Import Center, one step at a time. Every step shows a
  preview of exactly what will be created BEFORE anything is saved.

MARKING SHEET TIP
-----------------
You can hand the same spreadsheet to different people: one fills the timetable,
another fills the marks. The import engine matches names loosely (capitals and
spaces do not matter) and never creates the same person twice.
`;

function template(kind) {
  const t = TEMPLATES[kind];
  if (!t) return null;
  return { filename: t.filename, content: t.content, title: t.title };
}

function allTemplates() {
  return ORDER.filter((k) => TEMPLATES[k]).map((k) => ({ kind: k, ...TEMPLATES[k] }));
}

module.exports = { TEMPLATES, ORDER, template, allTemplates, README };
