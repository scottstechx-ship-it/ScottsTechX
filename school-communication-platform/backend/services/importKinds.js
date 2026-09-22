'use strict';
/**
 * IMPORT KINDS — the ten files the office can hand the platform, and exactly
 * what each one builds.
 *
 * Every kind is written the same way: a row is validated (and the work it would
 * do is described) BEFORE anything is written. `dryRun` returns those
 * descriptions as a plan, so "Preview" can never lie about what "Import" will
 * do. Only the `apply` callbacks write, and the whole import runs in one
 * transaction: either the file lands whole, or nothing changes.
 *
 * The order matters to the school (classes and subjects must exist before
 * timetables can name them), which is why PIPELINE below is also what the
 * Import Center shows as the guided steps.
 */
const bcrypt = require('bcryptjs');
const hub = require('./importHub');
const { all, get, run } = require('../database/db');
const { currentTerm, termWindow, normaliseTerm } = require('./termCalendar');

const MAX_ROWS = {
  students: 5000, teachers: 1000, guardians: 5000, classes: 500, subjects: 500,
  timetable: 3000, attendance: 20000, fees: 1000, payments: 20000, reports: 20000,
};

const MAX_DOC_EXT = ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'odt', 'rtf', 'txt'];

// ------------------------------------------------------------------ helpers
const clean = (v, n) => hub.clean(v, n);
const num = (v) => {
  const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** "2026-04-12", "12/04/2026", "12 Apr 2026", Excel serial -> ISO date or ''. */
function toDate(v) {
  const s = clean(v, 30);
  if (!s) return '';
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {           // Excel serial date
    const serial = Math.floor(parseFloat(s));
    const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);   // day-first (school practice)
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  m = /^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{4})$/.exec(s);
  if (m) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const idx = months.indexOf(m[2].slice(0, 3).toLowerCase());
    if (idx >= 0) return `${m[3]}-${String(idx + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

/** "08:30", "8.30", "8:30 am", "0830" -> "08:30" */
function toTime(v) {
  const s = clean(v, 12).toLowerCase().replace(/\./g, ':');
  if (!s) return '';
  const m = /^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/.exec(s.replace(' ', ''));
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function toDay(v) {
  const s = clean(v, 12).toLowerCase();
  if (!s) return '';
  const hit = DAYS.find((d) => d.toLowerCase() === s || d.toLowerCase().startsWith(s.slice(0, 3)));
  return hit || '';
}

function aliases(map) {
  const out = {};
  for (const [field, list] of Object.entries(map)) {
    out[field] = list.map((s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim());
  }
  return out;
}

/** Read a lowercase-header row object by field, trying every known alias. */
function field(row, map, name) {
  const keys = map[name] || [name];
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  // tolerate headers with punctuation stripped ("student's name" -> "students name")
  for (const rk of Object.keys(row)) {
    const norm = rk.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    if (keys.includes(norm) && String(row[rk]).trim() !== '') return String(row[rk]).trim();
  }
  return '';
}

function nextReportExamTitle(term, year, subject) {
  return `${term || 'Report'} ${year || ''} — ${subject}`.replace(/\s+/g, ' ').trim();
}

/** Find or create the exam that holds imported marks for a class+subject+term. */
function resolveReportExam(classId, subject, term, year, userId) {
  const title = nextReportExamTitle(term, year, subject);
  const existing = get(
    `SELECT * FROM exams WHERE title = ? AND class_id = ? AND subject = ? AND COALESCE(term,'') = COALESCE(?,'') AND status != 'archived' ORDER BY id LIMIT 1`,
    [title, classId, subject, term || null]
  );
  if (existing) return { id: existing.id, created: false, title };
  const info = run(
    `INSERT INTO exams (title, class_id, subject, term, status, created_by, date) VALUES (?, ?, ?, ?, 'published', ?, date('now'))`,
    [title, classId, subject, term || null, userId || null]
  );
  return { id: info.lastInsertRowid, created: true, title };
}

// ------------------------------------------------------------------ COLUMNS
const COLS = {
  classes: aliases({
    name: ['class', 'class name', 'level', 'grade'],
    stream: ['stream', 'section'],
    teacher: ['class teacher', 'teacher', 'class teacher name'],
    year: ['year', 'academic year'],
  }),
  subjects: aliases({
    name: ['subject', 'subject name'],
    code: ['code', 'subject code'],
    department: ['department', 'faculty'],
    teachers: ['teachers', 'teacher', 'taught by'],
    classes: ['classes', 'class'],
  }),
  teachers: aliases({
    staffCode: ['staff id', 'staff code', 'staff no', 'code'],
    name: ['full name', 'name', 'teacher', 'teacher name'],
    email: ['email', 'email address'],
    phone: ['phone', 'phone number', 'telephone', 'contact'],
    subjects: ['subjects', 'subject', 'teaching subjects'],
    classes: ['classes', 'class', 'class teacher of'],
    role: ['role', 'position', 'duty'],
    qualification: ['qualification', 'education'],
    dateJoined: ['date joined', 'joined', 'employment date'],
  }),
  students: aliases({
    admissionNo: ['student id', 'admission no', 'admission number', 'admissionno', 'student code', 'adm no', 'reg no'],
    name: ['full name', 'name', 'student', 'student name', 'names'],
    className: ['class', 'class name', 'level'],
    stream: ['stream', 'section'],
    gender: ['gender', 'sex'],
    dob: ['date of birth', 'dob', 'birth date'],
    parentName: ['parent name', 'guardian name', 'father name', 'mother name', 'parent'],
    parentPhone: ['parent phone', 'guardian phone', 'phone', 'parent telephone'],
    parentEmail: ['parent email', 'guardian email', 'email'],
    relationship: ['relationship', 'relation', 'parent relationship'],
    parentCode: ['parent id', 'guardian id', 'parent code'],
    address: ['address', 'home address', 'residence'],
    enrollmentDate: ['enrollment date', 'enrolment date', 'date enrolled', 'admission date'],
    username: ['username', 'login'],
    password: ['password', 'default password'],
  }),
  guardians: aliases({
    parentCode: ['parent id', 'guardian id', 'parent code', 'code'],
    name: ['full name', 'name', 'parent name', 'guardian name', 'parent'],
    phone: ['phone', 'phone number', 'telephone', 'contact', 'mobile'],
    email: ['email', 'email address'],
    occupation: ['occupation', 'job', 'profession'],
    address: ['address', 'home address', 'residence'],
    children: ['children', 'child', 'students', 'children admission no', 'child admission no', 'ward'],
    relationship: ['relationship', 'relation'],
    username: ['username', 'login'],
    password: ['password', 'default password'],
  }),
  timetable: aliases({
    day: ['day', 'day of week'],
    start: ['start', 'start time', 'from', 'period start'],
    end: ['end', 'end time', 'to', 'period end'],
    className: ['class', 'class name', 'level'],
    stream: ['stream', 'section'],
    subject: ['subject', 'subject name', 'lesson'],
    teacher: ['teacher', 'teacher name', 'staff', 'staff id', 'staff code', 'teacher staff id'],
    room: ['room', 'venue', 'location'],
    year: ['year', 'academic year'],
  }),
  attendance: aliases({
    className: ['class', 'class name', 'level'],
    stream: ['stream', 'section'],
    date: ['date', 'day'],
    admissionNo: ['student id', 'admission no', 'admission number', 'student code', 'adm no', 'reg no'],
    studentName: ['student', 'student name', 'name', 'full name'],
    status: ['status', 'attendance', 'mark', 'present/absent'],
    note: ['note', 'notes', 'remark', 'remarks', 'reason'],
    term: ['term'],
    year: ['year', 'academic year'],
  }),
  fees: aliases({
    name: ['fee name', 'name', 'fee', 'item'],
    amount: ['amount', 'amount ugx', 'fee amount', 'amount (ugx)'],
    year: ['year', 'academic year'],
    term: ['term'],
    className: ['class', 'class name', 'level', 'applies to class'],
    stream: ['stream'],
    admissionNo: ['student id', 'admission no', 'admission number', 'student code', 'student'],
  }),
  payments: aliases({
    receiptNo: ['receipt no', 'receipt', 'receipt number', 'ref no', 'reference no'],
    admissionNo: ['student id', 'admission no', 'admission number', 'student code', 'adm no'],
    studentName: ['student', 'student name', 'name', 'full name'],
    amount: ['amount', 'amount paid', 'paid', 'amount ugx'],
    method: ['method', 'payment method', 'mode'],
    date: ['date', 'paid at', 'paid on', 'payment date'],
    term: ['term'],
    year: ['year', 'academic year'],
    reference: ['reference', 'bank ref', 'transaction id', 'mobile money ref'],
    note: ['note', 'notes', 'remark'],
  }),
  reports: aliases({
    admissionNo: ['student id', 'admission no', 'admission number', 'student code', 'adm no', 'reg no'],
    studentName: ['student', 'student name', 'name', 'full name'],
    className: ['class', 'class name', 'level'],
    stream: ['stream', 'section'],
    term: ['term'],
    year: ['year', 'academic year'],
    subject: ['subject', 'subject name', 'paper'],
    score: ['score', 'marks', 'mark', 'obtained', 'result', 'points'],
    grade: ['grade', 'letter grade'],
    outOf: ['out of', 'total marks', 'maximum', 'max'],
    remarks: ['remarks', 'remark', 'comment', 'teacher comment', 'subject comment'],
    total: ['total', 'total marks obtained', 'aggregate'],
    average: ['average', 'mean', 'average score'],
    position: ['position', 'rank', 'pos'],
    classSize: ['class size', 'out of', 'students in class'],
    teacherComment: ['teacher comment', 'class teacher comment', 'comment on student', 'conduct'],
    relationship: [],
  }),
};

// ------------------------------------------------------------------ KINDS
/**
 * Each kind: { key, label, template, columns, help, plan(row, ctx) }
 * `plan` returns { status, errors[], warnings[], create[], apply() }
 * where `create` describes what will be built, for the preview the office sees.
 */
const KINDS = {
  // ------------------------------------------------------------- classes
  classes: {
    label: 'Classes & streams',
    template: 'classes-import-template.csv',
    order: 1,
    help: 'Usually not needed — the timetable import creates classes automatically. Use this to fix names, add streams or set class teachers.',
    columns: ['Class', 'Stream', 'Class Teacher', 'Year'],
    plan(row, ctx) {
      const name = field(row, COLS.classes, 'name');
      const stream = field(row, COLS.classes, 'stream');
      const teacherName = field(row, COLS.classes, 'teacher');
      const year = field(row, COLS.classes, 'year') || ctx.year;
      const errors = [];
      const warnings = [];
      const create = [];
      if (!name) errors.push('Class name is required');
      if (errors.length) return { status: 'error', errors, warnings, create };

      const teacher = teacherName ? hub.findTeacher({ name: teacherName }) : null;
      if (teacherName && !teacher) warnings.push(`No teacher matches "${teacherName}" — the class will be created without a class teacher`);

      return {
        status: warnings.length ? 'warning' : 'valid',
        errors, warnings, create,
        summary: `${name}${stream ? ' ' + stream : ''}${teacher ? ' · class teacher ' + teacher.full_name : ''}`,
        apply() {
          const cls = hub.resolveClass(name, stream, year, { create: true });
          const out = { created: [], linked: [] };
          if (cls.created) out.created.push(`class ${name}${stream ? ' ' + stream : ''}`);
          if (teacher) {
            const link = hub.linkTeacherClass(teacher.id, cls.id, '', { asClassTeacher: true });
            if (link.classTeacher) out.linked.push(`${teacher.full_name} → class teacher of ${name}`);
          }
          return out;
        },
      };
    },
  },

  // ------------------------------------------------------------ subjects
  subjects: {
    label: 'Subjects',
    template: 'subjects-import-template.csv',
    order: 2,
    help: 'Creates the subject list used by the timetable, exams and report cards. Teachers named here are linked to the subject.',
    columns: ['Subject', 'Code', 'Department', 'Teachers'],
    plan(row, ctx) {
      const name = field(row, COLS.subjects, 'name');
      const code = field(row, COLS.subjects, 'code');
      const department = field(row, COLS.subjects, 'department');
      const teachers = hub.splitList(field(row, COLS.subjects, 'teachers'));
      const errors = [];
      const warnings = [];
      if (!name) errors.push('Subject name is required');
      if (errors.length) return { status: 'error', errors, warnings, create: [] };

      const teacherRows = [];
      for (const t of teachers) {
        const found = hub.findTeacher({ name: t, staffCode: t });
        if (found) teacherRows.push(found);
        else warnings.push(`No teacher matches "${t}"`);
      }
      return {
        status: warnings.length ? 'warning' : 'valid',
        errors, warnings, create: [],
        summary: `${name}${code ? ' (' + code + ')' : ''}${teacherRows.length ? ' · ' + teacherRows.length + ' teacher(s)' : ''}`,
        apply() {
          const created = [];
          const linked = [];
          const subj = hub.resolveSubject(name, { code, department, create: ctx.createMissing });
          if (subj.created) created.push(`subject ${name}`);
          // link every class a teacher of this subject teaches (from the timetable)
          for (const t of teacherRows) {
            const classes = all('SELECT class_id FROM teacher_classes WHERE teacher_id = ?', [t.id]);
            for (const c of classes) {
              const r = hub.linkTeacherClass(t.id, c.class_id, subj.name || name);
              if (r.linked) linked.push(`${t.full_name} → ${subj.name || name}`);
            }
          }
          return { created, linked };
        },
      };
    },
  },

  // ------------------------------------------------------------ teachers
  teachers: {
    label: 'Teachers & staff',
    template: 'teacher-import-template.csv',
    order: 3,
    help: 'Creates teacher logins (username = staff ID). Subjects are created from the Subjects column and the teacher is linked to every class listed.',
    columns: ['Full Name', 'Staff ID', 'Email', 'Phone', 'Subjects', 'Classes', 'Role', 'Qualification', 'Date Joined'],
    plan(row, ctx) {
      const name = field(row, COLS.teachers, 'name');
      const staffCode = field(row, COLS.teachers, 'staffCode');
      const email = field(row, COLS.teachers, 'email');
      const phone = field(row, COLS.teachers, 'phone');
      const subjects = hub.splitList(field(row, COLS.teachers, 'subjects'));
      const classLabels = hub.splitList(field(row, COLS.teachers, 'classes'));
      const role = field(row, COLS.teachers, 'role');
      const qualification = field(row, COLS.teachers, 'qualification');
      const dateJoined = toDate(field(row, COLS.teachers, 'dateJoined'));

      const errors = [];
      const warnings = [];
      if (!name) errors.push('Full name is required');
      if (email && !hub.isEmail(email)) errors.push(`Invalid email "${email}"`);
      if (email && get("SELECT id FROM users WHERE lower(COALESCE(email,'')) = ? AND role = 'teacher'", [email.toLowerCase()])) {
        const existing = hub.findTeacher({ email });
        if (!existing) errors.push(`Email "${email}" already belongs to another account`);
      }
      if (errors.length) return { status: 'error', errors, warnings, create: [] };

      const already = hub.findTeacher({ staffCode, name, email });
      const created = [];
      const linked = [];
      if (!already) {
        created.push(`teacher account ${name}${staffCode ? ' (' + staffCode + ')' : ''}`);
        for (const s of subjects) created.push(`subject ${s}`);
        for (const label of classLabels) {
          const { name: cn, stream } = hub.splitClassLabel(label);
          if (typeof ctx.classExists === 'function' && !ctx.classExists(cn, stream) && !ctx.createMissing) {
            warnings.push(`Class "${label}" does not exist yet — import the timetable first, or tick "create missing classes"`);
          } else {
            created.push(`class ${cn}${stream ? ' ' + stream : ''}`);
          }
        }
      } else {
        warnings.push(`${name} already exists (${already.staff_code}) — subjects and class links will be updated`);
      }
      const asClassTeacher = /class\s*teacher|head of class|form master|form mistress/i.test(role);

      return {
        status: warnings.length ? 'warning' : 'valid',
        errors, warnings, create: created,
        summary: `${name}${staffCode ? ' · ' + staffCode : ''}${subjects.length ? ' · ' + subjects.join(', ') : ''}`,
        apply() {
          const out = { created: [], linked: [] };
          const teacher = hub.resolveTeacher({
            staffCode, name, email, phone,
            subjects: subjects.join(', '), qualification, dateJoined,
            password: ctx.defaultTeacherPassword || 'Teacher@123', bcrypt,
          });
          if (teacher.created) {
            out.created.push(`teacher ${name}`);
            ctx.credentials.push(teacher.credentials);
          }
          for (const s of subjects) {
            const subj = hub.resolveSubject(s, { create: ctx.createMissing });
            if (subj.created) out.created.push(`subject ${s}`);
          }
          for (const label of classLabels) {
            const { name: cn, stream } = hub.splitClassLabel(label);
            const cls = hub.resolveClass(cn, stream, ctx.year, { create: ctx.createMissing });
            if (!cls.id) continue;
            if (cls.created) out.created.push(`class ${cn}${stream ? ' ' + stream : ''}`);
            // one link per subject this teacher teaches, plus a plain class link
            const subjList = subjects.length ? subjects : [''];
            for (const s of subjList) {
              const r = hub.linkTeacherClass(teacher.id, cls.id, s, { asClassTeacher: asClassTeacher && s === subjList[0] });
              if (r.linked) out.linked.push(`${name} → ${s ? s + ' in ' : ''}${cn}${stream ? ' ' + stream : ''}`);
              if (r.classTeacher) out.linked.push(`${name} → class teacher of ${cn}`);
            }
          }
          return out;
        },
      };
    },
  },

  // ------------------------------------------------------------ students
  students: {
    label: 'Students',
    template: 'student-import-template.csv',
    order: 4,
    help: 'Creates student logins and puts each student in their class (classes are created if missing). Parent details in the file create the guardian and link them to the child automatically.',
    columns: ['Full Name', 'Student ID', 'Class', 'Stream', 'Gender', 'Date of Birth', 'Parent Name', 'Parent Phone', 'Parent Email', 'Relationship', 'Address', 'Enrollment Date'],
    plan(row, ctx) {
      const admissionNo = field(row, COLS.students, 'admissionNo');
      const name = field(row, COLS.students, 'name');
      const className = field(row, COLS.students, 'className');
      const stream = field(row, COLS.students, 'stream');
      const parentName = field(row, COLS.students, 'parentName');
      const parentPhone = field(row, COLS.students, 'parentPhone');
      const parentEmail = field(row, COLS.students, 'parentEmail');
      const relationship = field(row, COLS.students, 'relationship');

      const errors = [];
      const warnings = [];
      if (!name) errors.push('Full name is required');
      if (errors.length) return { status: 'error', errors, warnings, create: [] };

      const created = [];
      const already = hub.findStudent({ admissionNo, name });
      if (already) warnings.push(`${name} is already registered (${already.student_code}) — their record will be updated, not duplicated`);
      else {
        created.push(`student ${name}${admissionNo ? ' (' + admissionNo + ')' : ''}`);
        if (!admissionNo) warnings.push('No student ID — one will be generated');
      }
      let cls = null;
      if (className) {
        cls = hub.findClass(className, stream, ctx.year);
        if (!cls && ctx.createMissing) created.push(`class ${className}${stream ? ' ' + stream : ''}`);
        else if (!cls) warnings.push(`Class "${className}" does not exist — it will be created automatically`);
      } else warnings.push('No class given — the student will be created unassigned');

      let parent = null;
      if (parentName || parentPhone || parentEmail) {
        parent = hub.findParent({ phone: parentPhone, email: parentEmail, name: parentName });
        if (parent) warnings.push(`Guardian ${parent.full_name} already exists — the child will be linked to them`);
        else created.push(`guardian ${parentName || parentPhone || parentEmail}`);
      }

      return {
        status: warnings.length ? 'warning' : 'valid',
        errors, warnings, create: created,
        summary: `${name}${className ? ' · ' + className + (stream ? ' ' + stream : '') : ''}${parent ? ' · guardian ' + parent.full_name : ''}`,
        apply() {
          const out = { created: [], linked: [] };
          const klass = className ? hub.resolveClass(className, stream, ctx.year, { create: ctx.createMissing }) : { id: null };
          if (klass.created) out.created.push(`class ${className}${stream ? ' ' + stream : ''}`);
          const student = hub.resolveStudent({
            admissionNo, name, classId: klass.id, stream,
            gender: field(row, COLS.students, 'gender'),
            dob: toDate(field(row, COLS.students, 'dob')),
            address: field(row, COLS.students, 'address'),
            enrollmentDate: toDate(field(row, COLS.students, 'enrollmentDate')),
            password: ctx.defaultStudentPassword || 'Student@123', bcrypt,
          });
          if (student.created) {
            out.created.push(`student ${name}`);
            ctx.credentials.push(student.credentials);
          }
          if (parentName || parentPhone || parentEmail) {
            const guardian = hub.resolveParent({
              parentCode: field(row, COLS.students, 'parentCode'),
              name: parentName || `Parent of ${name}`,
              phone: parentPhone, email: parentEmail,
              password: ctx.defaultParentPassword || 'Parent@123', bcrypt,
            });
            if (guardian.created) {
              out.created.push(`guardian ${guardian.row.full_name}`);
              ctx.credentials.push(guardian.credentials);
            }
            const rel = hub.normaliseRelationship(relationship, name, guardian.row.full_name);
            const link = hub.linkParentStudent(guardian.id, student.id, rel);
            if (link.linked) out.linked.push(`${guardian.row.full_name} → ${name} (${rel})`);
          }
          return out;
        },
      };
    },
  },

  // ----------------------------------------------------------- guardians
  guardians: {
    label: 'Parents & guardians',
    template: 'guardian-import-template.csv',
    order: 5,
    help: 'Creates parent logins and links each guardian to the children named in the Children column (admission numbers are safest). Run this after the students import so every child already exists.',
    columns: ['Full Name', 'Parent ID', 'Phone', 'Email', 'Occupation', 'Address', 'Relationship', 'Children'],
    plan(row, ctx) {
      const name = field(row, COLS.guardians, 'name');
      const phone = field(row, COLS.guardians, 'phone');
      const email = field(row, COLS.guardians, 'email');
      const childrenRaw = field(row, COLS.guardians, 'children');
      const relationship = field(row, COLS.guardians, 'relationship');

      const errors = [];
      const warnings = [];
      if (!name) errors.push('Full name is required');
      if (email && !hub.isEmail(email)) errors.push(`Invalid email "${email}"`);
      if (!phone && !email) warnings.push('No phone or email — the guardian cannot be contacted');
      if (errors.length) return { status: 'error', errors, warnings, create: [] };

      const { found, missing } = childrenRaw ? hub.resolveChildren(childrenRaw) : { found: [], missing: [] };
      if (!childrenRaw) warnings.push('No children listed — the guardian will be created without links');
      for (const m of missing) warnings.push(`Child "${m}" not found — import the students first, then link them here`);

      const created = [];
      const already = hub.findParent({ parentCode: field(row, COLS.guardians, 'parentCode'), phone, email, name });
      if (already) warnings.push(`${name} already exists (${already.parent_code || already.id}) — missing links will be added`);
      else created.push(`guardian account ${name}`);

      return {
        status: warnings.length ? 'warning' : 'valid',
        errors, warnings, create: created,
        summary: `${name}${found.length ? ' · ' + found.length + ' child(ren): ' + found.map((c) => c.full_name).join(', ') : ''}`,
        apply() {
          const out = { created: [], linked: [] };
          const parent = hub.resolveParent({
            parentCode: field(row, COLS.guardians, 'parentCode'),
            name, phone, email,
            occupation: field(row, COLS.guardians, 'occupation'),
            address: field(row, COLS.guardians, 'address'),
            password: ctx.defaultParentPassword || 'Parent@123', bcrypt,
          });
          if (parent.created) {
            out.created.push(`guardian ${name}`);
            ctx.credentials.push(parent.credentials);
          }
          for (const child of found) {
            const rel = hub.normaliseRelationship(relationship, child.full_name, parent.row.full_name);
            const link = hub.linkParentStudent(parent.id, child.id, rel);
            if (link.linked) out.linked.push(`${name} → ${child.full_name} (${rel})`);
          }
          return out;
        },
      };
    },
  },

  // ----------------------------------------------------------- timetable
  timetable: {
    label: 'Timetable (start here)',
    template: 'timetable-import-template.csv',
    order: 0,
    help: 'Import this FIRST: each row creates the class, the subject and the lesson, and links the teacher to the class and subject automatically. Clashes are reported before anything is saved.',
    columns: ['Day', 'Start', 'End', 'Class', 'Stream', 'Subject', 'Teacher', 'Room', 'Year'],
    plan(row, ctx) {
      const day = toDay(field(row, COLS.timetable, 'day'));
      const start = toTime(field(row, COLS.timetable, 'start'));
      const end = toTime(field(row, COLS.timetable, 'end'));
      const className = field(row, COLS.timetable, 'className');
      const stream = field(row, COLS.timetable, 'stream');
      const subject = field(row, COLS.timetable, 'subject');
      const teacherLabel = field(row, COLS.timetable, 'teacher');
      const room = field(row, COLS.timetable, 'room');
      const year = field(row, COLS.timetable, 'year') || ctx.year;

      const errors = [];
      const warnings = [];
      if (!day) errors.push('Day is required (e.g. Monday)');
      if (!start || !end) errors.push('Start and end time are required (24-hour, e.g. 08:30)');
      else if (end <= start) errors.push(`End time ${end} must be after start time ${start}`);
      if (!className) errors.push('Class is required');
      if (!subject) warnings.push('No subject — the slot will be created as a class activity');
      if (errors.length) return { status: 'error', errors, warnings, create: [] };

      // clash checks against rows already accepted in this same file + the DB
      const clashKey = `${day}|${start}|${end}`;
      const classKey = `${className}|${stream}|${clashKey}`;
      if (ctx.seenTimetable && ctx.seenTimetable.has(classKey)) errors.push(`Clash in this file: ${className} already has a lesson at ${start}-${end} on ${day}`);
      const teacher = teacherLabel ? hub.findTeacher({ name: teacherLabel, staffCode: teacherLabel }) : null;
      if (teacherLabel && !teacher) warnings.push(`No teacher matches "${teacherLabel}" — the lesson will be created unassigned. Import teachers first to assign it automatically.`);
      if (teacher && ctx.seenTeacher && ctx.seenTeacher.has(`${teacher.id}|${clashKey}`)) {
        errors.push(`Clash in this file: ${teacher.full_name} is already teaching at ${start}-${end} on ${day}`);
      }
      if (errors.length) return { status: 'error', errors, warnings, create: [] };

      // Existing clashes. The first check is the friendly one: if this exact
      // lesson is already in the timetable, the file has simply been imported
      // before — say so, and change nothing rather than screaming "clash".
      const clsExisting = hub.findClass(className, stream, year);
      let alreadyThere = null;
      if (clsExisting) {
        // Matched on class + slot + subject only: the teacher and room are what a
        // corrected timetable is usually changing, so they must not disqualify it.
        alreadyThere = get(
          `SELECT * FROM timetable_entries
           WHERE class_id = ? AND day = ? AND start_time = ? AND end_time = ?
             AND COALESCE(academic_year, ?) = ?
             AND lower(COALESCE(subject,'')) = lower(?)`,
          [clsExisting.id, day, start, end, year, year, subject || '']
        );
      }
      if (alreadyThere) {
        // The slot is taken by the same subject: this is the same lesson, either
        // already imported or being corrected (new teacher, new room).
        const changed = [];
        if (teacher && alreadyThere.teacher_id !== teacher.id) changed.push(`teacher → ${teacher.full_name}`);
        if ((room || '') !== (alreadyThere.room || '')) changed.push(`room → ${room || 'none'}`);
        warnings.push(changed.length
          ? `${day} ${start} ${className}${stream ? ' ' + stream : ''} already has ${subject}: updated ${changed.join(', ')}`
          : `Already in the timetable (${day} ${start}-${end}) — nothing to change`);
        return {
          status: 'warning', errors, warnings, create: changed,
          summary: `${day} ${start}-${end} · ${className}${stream ? ' ' + stream : ''} · ${subject || 'class activity'}${changed.length ? ' (update)' : ' (already imported)'}`,
          apply() {
            const out = { created: [], linked: [] };
            if (changed.length) {
              run('UPDATE timetable_entries SET teacher_id = ?, room = ? WHERE id = ?',
                [teacher ? teacher.id : alreadyThere.teacher_id, room || null, alreadyThere.id]);
              out.created.push(`updated ${day} ${start} ${className}${stream ? ' ' + stream : ''}`);
            }
            if (teacher) {
              const link = hub.linkTeacherClass(teacher.id, alreadyThere.class_id, subject);
              if (link.linked) out.linked.push(`${teacher.full_name} → ${subject || 'class'} (${className}${stream ? ' ' + stream : ''})`);
            }
            if (subject) hub.resolveSubject(subject, { create: ctx.createMissing });
            return out;
          },
        };
      }
      // Same slot, different subject: two lessons cannot share one period.
      if (clsExisting) {
        const slot = get(
          `SELECT * FROM timetable_entries WHERE class_id = ? AND day = ? AND start_time = ? AND end_time = ?
             AND COALESCE(academic_year, ?) = ?`,
          [clsExisting.id, day, start, end, year, year]
        );
        if (slot && String(slot.subject || '').toLowerCase() !== String(subject || '').toLowerCase()) {
          errors.push(`${className}${stream ? ' ' + stream : ''} already has ${slot.subject || 'a lesson'} at ${start}-${end} on ${day}`);
          return { status: 'error', errors, warnings, create: [] };
        }
      }
      if (clsExisting) {
        for (const c of all('SELECT * FROM timetable_entries WHERE class_id = ? AND day = ? AND COALESCE(academic_year, ?) = ?', [clsExisting.id, day, year, year])) {
          const sameSlot = c.start_time === start && c.end_time === end;
          const sameSubject = String(c.subject || '').toLowerCase() === String(subject || '').toLowerCase();
          if (!sameSlot && c.start_time < end && start < c.end_time) {
            errors.push(`Class already has "${c.subject || 'a lesson'}" at ${c.start_time}-${c.end_time} on ${day}`);
          } else if (sameSlot && !sameSubject) {
            errors.push(`Class already has "${c.subject || 'a lesson'}" at ${c.start_time}-${c.end_time} on ${day}`);
          }
        }
      }
      if (teacher) {
        for (const c of all(
          `SELECT t.*, c.name AS class_name, c.stream AS class_stream FROM timetable_entries t
           LEFT JOIN classes c ON c.id = t.class_id
           WHERE t.teacher_id = ? AND t.day = ? AND COALESCE(t.academic_year, ?) = ?`, [teacher.id, day, year, year]
        )) {
          if (c.start_time < end && start < c.end_time) {
            errors.push(`${teacher.full_name} is already teaching ${c.class_name || ''} ${c.class_stream || ''} at ${c.start_time}-${c.end_time} on ${day}`);
          }
        }
      }
      if (room) {
        for (const c of all('SELECT * FROM timetable_entries WHERE lower(COALESCE(room,\'\')) = lower(?) AND day = ? AND COALESCE(academic_year, ?) = ?', [room, day, year, year])) {
          if (c.start_time < end && start < c.end_time) errors.push(`Room "${room}" is already booked at ${c.start_time}-${c.end_time} on ${day}`);
        }
      }
      if (errors.length) return { status: 'error', errors, warnings, create: [] };

      const created = [];
      if (!clsExisting) created.push(`class ${className}${stream ? ' ' + stream : ''}`);
      if (subject && !get('SELECT id FROM subjects WHERE lower(name) = lower(?)', [subject])) created.push(`subject ${subject}`);
      if (teacher) created.push(`${teacher.full_name} → ${subject || 'class'} in ${className}${stream ? ' ' + stream : ''}`);

      return {
        status: warnings.length ? 'warning' : 'valid',
        errors, warnings, create: created,
        summary: `${day} ${start}-${end} · ${className}${stream ? ' ' + stream : ''} · ${subject || 'class activity'}${teacher ? ' · ' + teacher.full_name : ''}`,
        apply() {
          const out = { created: [], linked: [] };
          const klass = hub.resolveClass(className, stream, year, { create: ctx.createMissing });
          if (klass.created) out.created.push(`class ${className}${stream ? ' ' + stream : ''}`);
          let subjectName = subject;
          if (subject) {
            const subj = hub.resolveSubject(subject, { create: ctx.createMissing });
            subjectName = subj.name || subject;
            if (subj.created) out.created.push(`subject ${subjectName}`);
          }
          let teacherId = null;
          if (teacher) {
            teacherId = teacher.id;
            const link = hub.linkTeacherClass(teacher.id, klass.id, subjectName);
            if (link.linked) out.linked.push(`${teacher.full_name} → ${subjectName || 'class'} (${className}${stream ? ' ' + stream : ''})`);
          }
          const info = run(
            `INSERT INTO timetable_entries (class_id, subject, teacher_id, room, day, start_time, end_time, academic_year)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [klass.id, subjectName || null, teacherId, room || null, day, start, end, year]
          );
          out.created.push(`lesson #${info.lastInsertRowid} ${day} ${start}-${end}`);
          return out;
        },
      };
    },
  },

  // ---------------------------------------------------------- attendance
  attendance: {
    label: 'Attendance registers',
    template: 'attendance-import-template.csv',
    order: 6,
    help: 'One row per student per day. The term is worked out from the date automatically, and the class is created if the file names a new one. Re-importing the same day corrects it instead of duplicating.',
    columns: ['Class', 'Stream', 'Date', 'Student ID', 'Student Name', 'Status', 'Note'],
    plan(row, ctx) {
      const className = field(row, COLS.attendance, 'className');
      const stream = field(row, COLS.attendance, 'stream');
      const date = toDate(field(row, COLS.attendance, 'date'));
      const admissionNo = field(row, COLS.attendance, 'admissionNo');
      const studentName = field(row, COLS.attendance, 'studentName');
      const status = hub.normaliseStatus(field(row, COLS.attendance, 'status'));
      const note = field(row, COLS.attendance, 'note');
      const rawStatus = field(row, COLS.attendance, 'status');

      const errors = [];
      const warnings = [];
      if (!date) errors.push('A valid date is required (YYYY-MM-DD)');
      if (!status) errors.push(`Status "${rawStatus || ''}" not understood — use present, absent, late or permission (or P / A / L / E)`);
      if (!admissionNo && !studentName) errors.push('Student ID or student name is required');
      if (errors.length) return { status: 'error', errors, warnings, create: [] };

      const klass = className ? hub.findClass(className, stream, ctx.year) : null;
      if (className && !klass && !ctx.createMissing) warnings.push(`Class "${className}" does not exist — it will be created`);
      const student = hub.findStudent({ admissionNo, name: studentName, classId: klass ? klass.id : null });
      if (!student) errors.push(`No student matches "${admissionNo || studentName}"${className ? ' in ' + className : ''}`);
      if (errors.length) return { status: 'error', errors, warnings, create: [] };
      if (student.status !== 'active') warnings.push(`${student.full_name} is marked ${student.status}`);

      const term = normaliseTerm(field(row, COLS.attendance, 'term')) || (currentTerm(date).term || '');
      const year = field(row, COLS.attendance, 'year') || (currentTerm(date).year || ctx.year);

      return {
        status: warnings.length ? 'warning' : 'valid',
        errors, warnings, create: [],
        dedupeKey: `${student.id}|${date}`,
        summary: `${date} · ${student.full_name} · ${status}`,
        apply() {
          const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
          const existing = get('SELECT id FROM attendance WHERE student_id = ? AND date = ?', [student.id, date]);
          if (existing) {
            run('UPDATE attendance SET status = ?, note = ?, term = ?, academic_year = ?, updated_at = ? WHERE id = ?',
              [status, note || null, term || null, year || null, now, existing.id]);
          } else {
            run(
              `INSERT INTO attendance (student_id, class_id, date, status, note, marked_by, term, academic_year, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [student.id, klass ? klass.id : student.class_id, date, status, note || null, ctx.userId || null, term || null, year || null, now]
            );
          }
          return { created: [], linked: [] };
        },
      };
    },
  },

  // ---------------------------------------------------------------- fees
  fees: {
    label: 'Fee structures',
    template: 'fees-import-template.csv',
    order: 7,
    help: 'Each row becomes a fee and is assigned to every active student in the class named (leave Class blank for the whole school). Put a student ID in the row to bill one student only.',
    columns: ['Fee Name', 'Amount', 'Year', 'Term', 'Class', 'Student ID'],
    plan(row, ctx) {
      const name = field(row, COLS.fees, 'name');
      const amount = num(field(row, COLS.fees, 'amount'));
      const year = field(row, COLS.fees, 'year') || ctx.year;
      const term = normaliseTerm(field(row, COLS.fees, 'term')) || '';
      const className = field(row, COLS.fees, 'className');
      const stream = field(row, COLS.fees, 'stream');
      const admissionNo = field(row, COLS.fees, 'admissionNo');

      const errors = [];
      const warnings = [];
      if (!name) errors.push('Fee name is required');
      if (!amount || amount <= 0) errors.push('A positive amount is required');
      if (errors.length) return { status: 'error', errors, warnings, create: [] };

      let students = [];
      if (admissionNo) {
        const s = hub.findStudent({ admissionNo, name: field(row, COLS.fees, 'name') });
        if (!s) errors.push(`No student matches "${admissionNo}"`);
        else students = [s];
      } else if (className) {
        const cls = hub.findClass(className, stream, year) || hub.findClass(className, stream);
        if (!cls) errors.push(`Class "${className}" not found — import the timetable or students first`);
        else students = all("SELECT * FROM students WHERE class_id = ? AND status = 'active'", [cls.id]);
      } else {
        students = all("SELECT * FROM students WHERE status = 'active'");
      }
      if (errors.length) return { status: 'error', errors, warnings, create: [] };
      if (!students.length) warnings.push('No active students match this row — the fee will be created but assigned to nobody');

      const clsForRow = className ? hub.findClass(className, stream, year) : null;
      const existingFee = get(
        `SELECT * FROM fee_structures WHERE lower(name) = lower(?) AND COALESCE(academic_year,'') = ? AND COALESCE(term,'') = ? AND class_id IS ?`,
        [name, year || '', term || '', clsForRow ? clsForRow.id : null]
      );
      if (existingFee) warnings.push(`"${name}" is already set up for ${term || 'this year'} — the amount will be refreshed and missing students billed`);

      return {
        status: warnings.length ? 'warning' : 'valid',
        errors, warnings, create: existingFee ? [] : [`fee ${name} (UGX ${amount.toLocaleString('en-US')})`],
        summary: `${name} · UGX ${amount.toLocaleString('en-US')}${className ? ' · ' + className : ' · all classes'} · ${students.length} student(s)`,
        apply() {
          const out = { created: [], linked: [] };
          const cls = clsForRow;
          let feeId;
          const again = get(
            `SELECT * FROM fee_structures WHERE lower(name) = lower(?) AND COALESCE(academic_year,'') = ? AND COALESCE(term,'') = ? AND class_id IS ?`,
            [name, year || '', term || '', cls ? cls.id : null]
          );
          if (again) {
            feeId = again.id;
            if (Number(again.amount) !== amount) {
              run('UPDATE fee_structures SET amount = ? WHERE id = ?', [amount, feeId]);
              out.linked.push(`amount updated to UGX ${amount.toLocaleString('en-US')}`);
            }
          } else {
            const info = run(
              'INSERT INTO fee_structures (name, amount, academic_year, term, class_id) VALUES (?, ?, ?, ?, ?)',
              [name, amount, year, term || null, cls ? cls.id : null]
            );
            feeId = info.lastInsertRowid;
            out.created.push(`fee ${name} (UGX ${amount.toLocaleString('en-US')})`);
          }
          let billed = 0;
          for (const s of students) {
            const already = get('SELECT id FROM student_fees WHERE student_id = ? AND fee_structure_id = ?', [s.id, feeId]);
            if (already) continue;
            run('INSERT INTO student_fees (student_id, fee_structure_id, amount) VALUES (?, ?, ?)', [s.id, feeId, amount]);
            billed += 1;
          }
          out.linked.push(billed ? `billed to ${billed} student(s)` : `already billed to all ${students.length} student(s)`);
          return out;
        },
      };
    },
  },

  // ------------------------------------------------------------ payments
  payments: {
    label: 'Fee payments received',
    template: 'payments-import-template.csv',
    order: 8,
    help: 'Records what has been paid, so the system knows which children have cleared their fees. Rows are matched to students by admission number; a receipt number that already exists is skipped, never doubled.',
    columns: ['Receipt No', 'Student ID', 'Student Name', 'Amount', 'Method', 'Date', 'Term', 'Year', 'Reference', 'Note'],
    plan(row, ctx) {
      const receiptNo = field(row, COLS.payments, 'receiptNo');
      const admissionNo = field(row, COLS.payments, 'admissionNo');
      const studentName = field(row, COLS.payments, 'studentName');
      const amount = num(field(row, COLS.payments, 'amount'));
      const method = field(row, COLS.payments, 'method') || 'Cash';
      const date = toDate(field(row, COLS.payments, 'date'));
      const term = normaliseTerm(field(row, COLS.payments, 'term')) || '';
      const year = field(row, COLS.payments, 'year') || ctx.year;
      const reference = field(row, COLS.payments, 'reference');
      const note = field(row, COLS.payments, 'note');

      const errors = [];
      const warnings = [];
      if (!amount || amount <= 0) errors.push('A positive amount is required');
      if (!admissionNo && !studentName) errors.push('Student ID or student name is required');
      if (receiptNo && get('SELECT id FROM fee_payments WHERE upper(COALESCE(receipt_no,\'\')) = upper(?)', [receiptNo])) {
        warnings.push(`Receipt ${receiptNo} is already recorded — this row is skipped`);
      }
      const student = (admissionNo || studentName) ? hub.findStudent({ admissionNo, name: studentName }) : null;
      if (!student && !errors.length) errors.push(`No student matches "${admissionNo || studentName}"`);
      if (errors.length) return { status: 'error', errors, warnings, create: [] };

      const reportTerm = term || currentTerm(date || undefined).term || '';

      return {
        status: warnings.length ? 'warning' : 'valid',
        errors, warnings, create: [],
        dedupeKey: receiptNo ? receiptNo.toUpperCase() : '',
        summary: `${student.full_name} · UGX ${amount.toLocaleString('en-US')} · ${method}${date ? ' · ' + date : ''}`,
        apply() {
          const out = { created: [], linked: [] };
          if (receiptNo && get('SELECT id FROM fee_payments WHERE upper(COALESCE(receipt_no,\'\')) = upper(?)', [receiptNo])) return out;  // idempotent
          const receipt = receiptNo || `RCP-${year}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;
          const paidAt = date ? `${date} ${new Date().toISOString().slice(11, 19)}` : new Date().toISOString().replace('T', ' ').slice(0, 19);
          run(
            `INSERT INTO fee_payments (student_id, amount, method, reference, receipt_no, recorded_by, paid_at, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [student.id, amount, method, reference || null, receipt, ctx.userId || null, paidAt,
              [note, reportTerm ? `Term: ${reportTerm}` : '', year ? `Year: ${year}` : ''].filter(Boolean).join(' · ') || null]
          );
          out.created.push(`payment UGX ${amount.toLocaleString('en-US')} for ${student.full_name}`);
          return out;
        },
      };
    },
  },

  // ------------------------------------------------------------- reports
  reports: {
    label: 'Report cards (marks)',
    template: 'report-card-import-template.csv',
    order: 9,
    help: 'One row per subject per student, or upload the PDFs themselves. Totals, averages and positions are worked out from a spreadsheet. PDF report cards are matched by the file name — download the PDF format, keep each file name, and upload the PDF or the zip.',
    columns: ['Student ID', 'Student Name', 'Class', 'Term', 'Year', 'Subject', 'Score', 'Out Of', 'Grade', 'Remarks', 'Teacher Comment'],
    plan(row, ctx) {
      const admissionNo = field(row, COLS.reports, 'admissionNo');
      const studentName = field(row, COLS.reports, 'studentName');
      const className = field(row, COLS.reports, 'className');
      const stream = field(row, COLS.reports, 'stream');
      const term = normaliseTerm(field(row, COLS.reports, 'term')) || normaliseTerm(ctx.term) || currentTerm().term || 'Term 3';
      const year = field(row, COLS.reports, 'year') || ctx.year;
      const subject = field(row, COLS.reports, 'subject');
      const score = num(field(row, COLS.reports, 'score'));
      const outOf = num(field(row, COLS.reports, 'outOf')) || 100;
      const grade = field(row, COLS.reports, 'grade');
      const remarks = field(row, COLS.reports, 'remarks');
      const teacherComment = field(row, COLS.reports, 'teacherComment');

      const errors = [];
      const warnings = [];
      if (!admissionNo && !studentName) errors.push('Student ID or student name is required');
      if (!subject) errors.push('Subject is required');
      if (score === null) errors.push('Score is required');
      if (errors.length) return { status: 'error', errors, warnings, create: [] };

      const klass = className ? hub.findClass(className, stream, year) : null;
      const student = hub.findStudent({ admissionNo, name: studentName, classId: klass ? klass.id : null });
      if (!student) errors.push(`No student matches "${admissionNo || studentName}"${className ? ' in ' + className : ''}`);
      if (errors.length) return { status: 'error', errors, warnings, create: [] };

      const pct = outOf ? Math.round((score / outOf) * 1000) / 10 : score;
      return {
        status: warnings.length ? 'warning' : 'valid',
        errors, warnings, create: [],
        summary: `${student.full_name} · ${subject} · ${score}/${outOf} (${pct}%)`,
        apply() {
          const out = { created: [], linked: [] };
          const classId = student.class_id || (klass ? klass.id : null);
          if (classId && ctx.touchedClasses) ctx.touchedClasses.add(classId);
          ctx.touchedReports = true;
          const subj = hub.resolveSubject(subject, { create: ctx.createMissing });
          if (subj.created) out.created.push(`subject ${subj.name}`);
          const exam = resolveReportExam(classId, subj.name || subject, term, year, ctx.userId);
          if (exam.created) out.created.push(`exam “${exam.title}”`);
          const existing = get('SELECT id FROM exam_results WHERE exam_id = ? AND student_id = ?', [exam.id, student.id]);
          if (existing) {
            run('UPDATE exam_results SET marks = ?, grade = ?, comments = ?, entered_by = ?, updated_at = ? WHERE id = ?',
              [pct, grade || null, [remarks, teacherComment].filter(Boolean).join(' — ') || null, ctx.userId || null,
                new Date().toISOString().replace('T', ' ').slice(0, 19), existing.id]);
          } else {
            run('INSERT INTO exam_results (exam_id, student_id, marks, grade, comments, entered_by) VALUES (?, ?, ?, ?, ?, ?)',
              [exam.id, student.id, pct, grade || null, [remarks, teacherComment].filter(Boolean).join(' — ') || null, ctx.userId || null]);
          }
          out.linked.push(`${student.full_name} → ${subj.name || subject}`);
          return out;
        },
      };
    },
  },
};

/** The guided order shown in the Import Center (and in the starter pack README). */
const PIPELINE = [
  { key: 'timetable', label: '1. Timetable', why: 'Creates the classes and subjects, and links every teacher to the class and subject they teach.', requirement: 'Your master timetable (Day, Start, End, Class, Subject, Teacher).' },
  { key: 'teachers', label: '2. Teachers & staff', why: 'Creates the teacher logins and links each teacher to the classes and subjects from step 1.', requirement: 'Staff list with names; subjects and classes if you have them.' },
  { key: 'students', label: '3. Students', why: 'Creates student logins and fills the classes (missing classes are created). Guardian details in the file link parents straight away.', requirement: 'Class list (names + admission numbers or names).' },
  { key: 'guardians', label: '4. Parents & guardians', why: 'Creates parent logins and links each guardian to their children.', requirement: 'Guardian list with phone numbers and the child each one follows.' },
  { key: 'attendance', label: '5. Attendance', why: 'Loads historical registers so attendance reports are complete from day one.', requirement: 'Attendance sheets (or one file per class).' },
  { key: 'fees', label: '6. Fees', why: 'Creates fee structures and bills the right students automatically.', requirement: 'Fee structure per class/term.' },
  { key: 'payments', label: '7. Payments', why: 'Records what has been paid, so the system knows which children have cleared.', requirement: 'Receipts / payment records.' },
  { key: 'reports', label: '8. Report cards', why: 'Loads a spreadsheet of marks, or the PDF report cards the school already prints, then sends each child their report.', requirement: 'A marks spreadsheet, or PDF report cards named with the student ID. Download the PDF format, keep the file names, and upload the PDF or the zip.' },
  { key: 'classes', label: 'Optional: classes', why: 'Fix class names, add streams or set class teachers.', requirement: 'Only when something needs correcting.' },
  { key: 'subjects', label: 'Optional: subjects', why: 'Add or correct subjects, codes and departments.', requirement: 'Only when something needs correcting.' },
];

module.exports = { KINDS, PIPELINE, COLS, MAX_ROWS, MAX_DOC_EXT, toDate, toTime, toDay, num, field, nextReportExamTitle, resolveReportExam };
