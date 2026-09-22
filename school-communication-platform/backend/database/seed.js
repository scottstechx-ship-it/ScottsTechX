/**
 * Demo data seed.
 * - run automatically on first start (SEED_DEMO_DATA=1)
 * - or manually:  node backend/database/seed.js --reset
 *
 * Demo accounts (all clearly marked as development/demo):
 *   superadmin / SuperAdmin@123   -> /super-admin
 *   admin      / Admin@123        -> /admin
 *   teacher1   / Teacher@123      -> /teacher
 *   student1   / Student@123      -> /student
 *   parent1    / Parent@123       -> /parent
 *
 * Demo classes: Senior 1–6, streams A and B (12 classes). No Primary 7.
 * There is no primary class — Kalinabiri is a secondary school.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, all, get, run, tx, setSetting } = require('./db');
const env = require('../config/env');

function hash(pw) { return bcrypt.hashSync(pw, 10); }

function uid(username) { return get('SELECT id FROM users WHERE username = ?', [username]).id; }

function insertUser({ username, password, fullName, email, phone, role, status = 'active' }) {
  // Demo accounts are pre-approved and email-verified (they are created by the
  // school, not self-registered). must_change_password stays 0 so demos can log in.
  run(
    `INSERT OR IGNORE INTO users (full_name, email, phone, username, password_hash, role, status, registration_status, email_verified, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', 1, 0)`,
    [fullName, email || null, phone || null, username, hash(password), role, status]
  );
  return uid(username);
}

/** Minimal single-page PDF generator (so seeded PDFs actually download). */
function makePdf(lines) {
  let content = 'BT\n/F1 12 Tf\n14 760 Td\n';
  const body = lines.slice(0, 48);
  body.forEach((line, i) => {
    content += `${escapePdf(line)} Tj\n0 -18 Td\n`;
  });
  content += 'ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}
function escapePdf(s) { return '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')'; }

function writeSampleFile(filename, buffer) {
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  const full = path.join(env.UPLOAD_DIR, filename);
  if (!fs.existsSync(full)) fs.writeFileSync(full, buffer);
  return filename;
}

function seeded() {
  const n = get('SELECT COUNT(*) AS c FROM users').c;
  const s = get('SELECT COUNT(*) AS c FROM settings WHERE key = ?', ['seeded']).c;
  return n > 0 && s > 0;
}

function runSeed() {
  console.log('Seeding demo data...');
  tx(() => {
    // ---------------- classes ----------------
    // S.1A then S.1B through S.6A then S.6B, so a fresh database keeps
    // Senior 2 A at id 3 and Senior 3 B at id 6.
    const classes = [];
    for (const name of ['Senior 1', 'Senior 2', 'Senior 3', 'Senior 4', 'Senior 5', 'Senior 6']) {
      for (const stream of ['A', 'B']) classes.push({ name, stream, year: '2026' });
    }
    for (const c of classes) {
      run('INSERT OR IGNORE INTO classes (name, stream, academic_year) VALUES (?, ?, ?)', [c.name, c.stream, c.year]);
    }
    const clsId = (name, stream) => get('SELECT id FROM classes WHERE name = ? AND stream = ?', [name, stream]).id;

    // ---------------- users ----------------
    const saId = insertUser({ username: 'superadmin', password: 'SuperAdmin@123', fullName: 'System Administrator', email: 'superadmin@school.test', phone: '+256700000001', role: 'super_admin' });
    const adId = insertUser({ username: 'admin', password: 'Admin@123', fullName: 'Mr. David Kiggundu', email: 'admin@school.test', phone: '+256700000002', role: 'admin' });

    const t1Id = insertUser({ username: 'teacher1', password: 'Teacher@123', fullName: 'Ms. Mary Nakato', email: 'mary@school.test', phone: '+256700000011', role: 'teacher' });
    const s1Id = insertUser({ username: 'student1', password: 'Student@123', fullName: 'Sarah Okello', email: 'sarah@school.test', role: 'student' });
    const p1Id = insertUser({ username: 'parent1', password: 'Parent@123', fullName: 'Mr. John Okello', email: 'parent@school.test', phone: '+256700000020', role: 'parent' });

    // ---------------- teachers ----------------
    run('INSERT OR IGNORE INTO teachers (user_id, staff_code, full_name, subjects, phone, email, qualification, date_joined, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [t1Id, 'TCH-1001', 'Ms. Mary Nakato', JSON.stringify(['Mathematics', 'Physics']), '+256700000011', 'mary@school.test', 'BSc Education', '2020-01-15', 'active']);

    const t1row = get('SELECT id FROM teachers WHERE user_id = ?', [t1Id]).id;

    // Class teacher of Sarah's class only — not every Senior 2 stream.
    run('UPDATE classes SET class_teacher_id = ? WHERE name = ? AND stream = ?', [t1row, 'Senior 2', 'A']);

    const assign = (tid, cid, subject) => run('INSERT OR IGNORE INTO teacher_classes (teacher_id, class_id, subject) VALUES (?, ?, ?)', [tid, cid, subject]);
    assign(t1row, clsId('Senior 2', 'A'), 'Mathematics');

    // ---------------- students ----------------
    run(`INSERT OR IGNORE INTO students (user_id, student_code, full_name, class_id, stream, gender, date_of_birth, parent_name, parent_phone, parent_email, address, enrollment_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [s1Id, 'STU-2024-001', 'Sarah Okello', clsId('Senior 2', 'A'), 'A', 'Female', '2010-04-12', 'Mr. John Okello', '+256700000020', 'parent@school.test', 'Kampala, Uganda', '2024-02-05']);

    // ---------------- parent ----------------
    run('INSERT OR IGNORE INTO parents (user_id, parent_code, full_name, phone, email, address, occupation, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [p1Id, 'PAR-2024-001', 'Mr. John Okello', '+256700000020', 'parent@school.test', 'Kampala, Uganda', 'Businessman', 'active']);
    const pRow = get('SELECT id FROM parents WHERE user_id = ?', [p1Id]).id;
    run('INSERT OR IGNORE INTO parent_students (parent_id, student_id, relationship) VALUES (?, ?, ?)',
      [pRow, get('SELECT id FROM students WHERE user_id = ?', [s1Id]).id, 'Father']);

    // ---------------- folders & documents ----------------
    const fNotices = run('INSERT OR IGNORE INTO folders (name, owner_id) VALUES (\'School Notices\', ?)', [saId]).lastInsertRowid;
    const fExams = run('INSERT OR IGNORE INTO folders (name, owner_id) VALUES (\'Examinations\', ?)', [t1Id]).lastInsertRowid;

    const doc1 = writeSampleFile('term-calendar.pdf', makePdf([
      'KAMPALA DEMO SCHOOL - TERM 1 CALENDAR 2026',
      '',
      'Term 1 begins: Monday 2 February 2026',
      'Mid-term break: 16-20 March 2026',
      'Term 1 ends: Friday 24 April 2026',
      '',
      'Key events:',
      ' - Sports day: Friday 13 March',
      ' - Parent-teacher meeting: Saturday 28 March',
      ' - Inter-house drama: 8 April',
      '',
      '(DEMO DOCUMENT - generated for testing)',
    ]));
    const doc2 = writeSampleFile('school-rules.txt', Buffer.from(
      'DEMO SCHOOL RULES AND CODE OF CONDUCT\n' +
      '1. Arrive at school by 7:45am.\n' +
      '2. Wear the full school uniform.\n' +
      '3. Mobile phones must stay in the office during lessons.\n' +
      '4. Respect teachers and fellow students.\n' +
      '5. Homework is due on the assigned day.\n\n(DEMO DOCUMENT)'
    ));
    const doc3 = writeSampleFile('maths-notes.pdf', makePdf([
      'MATHEMATICS NOTES - QUADRATIC EQUATIONS',
      '',
      'A quadratic equation has the form ax^2 + bx + c = 0.',
      'Example: x^2 - 5x + 6 = 0',
      'Factors: (x - 2)(x - 3) = 0',
      'Solutions: x = 2 or x = 3',
      '',
      'Homework: page 45, exercises 1-8.',
      '',
      '(DEMO DOCUMENT - generated for testing)',
    ]));

    const d1 = run(`INSERT OR IGNORE INTO documents (name, original_name, mime_type, size, storage_path, uploaded_by, folder_id, description)
                   VALUES ('Term 1 Calendar 2026.pdf', 'Term 1 Calendar 2026.pdf', 'application/pdf', ?, ?, ?, ?, 'Official school term calendar')`,
      [fs.statSync(path.join(env.UPLOAD_DIR, doc1)).size, doc1, saId, fNotices]);
    const d2 = run(`INSERT OR IGNORE INTO documents (name, original_name, mime_type, size, storage_path, uploaded_by, folder_id, description)
                   VALUES ('School Rules and Code of Conduct.txt', 'School Rules and Code of Conduct.txt', 'text/plain', ?, ?, ?, ?, 'Read the school rules')`,
      [fs.statSync(path.join(env.UPLOAD_DIR, doc2)).size, doc2, adId, fNotices]);
    const d3 = run(`INSERT OR IGNORE INTO documents (name, original_name, mime_type, size, storage_path, uploaded_by, folder_id, description)
                   VALUES ('Mathematics Notes - Quadratic Equations.pdf', 'Mathematics Notes - Quadratic Equations.pdf', 'application/pdf', ?, ?, ?, ?, 'Shared with Senior 2A')`,
      [fs.statSync(path.join(env.UPLOAD_DIR, doc3)).size, doc3, t1Id, fExams]);

    const docRow = (name) => get('SELECT id FROM documents WHERE name = ?', [name]).id;
    const addAccess = (docId, type, target) => run('INSERT OR IGNORE INTO document_access (document_id, target_type, target_id) VALUES (?, ?, ?)', [docId, type, String(target)]);
    addAccess(docRow('Term 1 Calendar 2026.pdf'), 'all', 'all');
    addAccess(docRow('School Rules and Code of Conduct.txt'), 'all', 'all');
    addAccess(docRow('Mathematics Notes - Quadratic Equations.pdf'), 'class', clsId('Senior 2', 'A'));
    addAccess(docRow('Mathematics Notes - Quadratic Equations.pdf'), 'user', p1Id); // parent of Sarah

    // ---------------- conversations & messages ----------------
    const conv = (type, title, classId, creator) => {
      const info = run('INSERT OR IGNORE INTO conversations (type, title, class_id, created_by) VALUES (?, ?, ?, ?)', [type, title, classId || null, creator]);
      return get('SELECT id FROM conversations WHERE type = ? AND title = ?', [type, title]).id;
    };
    const part = (c, u) => run('INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [c, u]);
    const msg = (c, sender, content) => run('INSERT OR IGNORE INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)', [c, sender, content]);

    // Parent <-> class teacher (Mary) about Sarah
    const cPar = conv('direct', 'Ms. Mary Nakato', null, p1Id);
    part(cPar, p1Id); part(cPar, t1Id);
    msg(cPar, p1Id, 'Good morning Ms. Mary. How is Sarah progressing in Mathematics this term?');
    msg(cPar, t1Id, 'Good morning Mr. Okello. Sarah is doing very well — she scored 86% in the last test. She could improve her homework consistency though.');
    msg(cPar, p1Id, 'Thank you! I will encourage her to do her homework daily.');

    // Teacher Mary <-> Sarah
    const cT1S = conv('direct', 'Sarah Okello', null, t1Id);
    part(cT1S, t1Id); part(cT1S, s1Id);
    msg(cT1S, t1Id, 'Sarah, please bring your textbook tomorrow — we start quadratic equations.');
    msg(cT1S, s1Id, 'Okay ma\'am, I will bring it.');

    // Class chat Senior 2A — only the remaining demo teacher and student.
    const cClass = conv('class', 'Senior 2 A', clsId('Senior 2', 'A'), t1Id);
    for (const sid of [t1Id, s1Id]) part(cClass, sid);
    msg(cClass, t1Id, 'Welcome to the Senior 2A class chat! Use this for class communication.');
    msg(cClass, s1Id, 'Thank you Ms. Mary!');
    msg(cClass, t1Id, 'Reminder: Mathematics test on Friday. Revise chapters 4 and 5.');

    // ---------------- announcements ----------------
    const ann = (title, content, targetType, targetValue, sender, important) => {
      const info = run('INSERT OR IGNORE INTO announcements (title, content, target_type, target_value, sender_id, important) VALUES (?, ?, ?, ?, ?, ?)',
        [title, content, targetType, targetValue || null, sender, important ? 1 : 0]);
      return info.lastInsertRowid;
    };
    ann('Term 1 Has Begun — Welcome Back!', 'Dear parents and students, we warmly welcome you to Term 1 of 2026. Lessons begin at 8:00am sharp. Please ensure all fees are cleared by the 15th of the month.', 'all', null, adId, true);
    ann('Parent-Teacher Meeting', 'A parent-teacher meeting for Senior 2 will be held on Saturday 28 March at 10:00am in the main hall. Parents are encouraged to attend.', 'class', String(clsId('Senior 2', 'A')), adId, false);
    ann('Mathematics Test on Friday', 'There will be a Mathematics test this Friday covering chapters 4 and 5. Study hard!', 'class', String(clsId('Senior 2', 'A')), t1Id, false);
    ann('School Fees Reminder', 'Parents are reminded that termly fees are payable by the 15th of the first month of term.', 'role', 'parent', adId, true);

    // ---------------- notifications ----------------
    const ntf = (userId, type, title, body, link, read) =>
      run('INSERT OR IGNORE INTO notifications (user_id, type, title, body, link, read) VALUES (?, ?, ?, ?, ?, ?)', [userId, type, title, body, link || '', read ? 1 : 0]);
    ntf(p1Id, 'message', 'New message from Ms. Mary Nakato', 'Sarah is doing very well in Mathematics', '/messages', 0);
    ntf(t1Id, 'message', 'New message from Mr. John Okello', 'How is Sarah progressing?', '/messages', 0);
    ntf(s1Id, 'announcement', 'Mathematics Test on Friday', 'Test covering chapters 4 and 5', '/announcements', 0);
    ntf(adId, 'document', 'New document uploaded', 'Mathematics Notes - Quadratic Equations.pdf', '/documents', 0);
    ntf(saId, 'system', 'Welcome to the platform', 'You are logged in as Super Admin', '/', 0);
    ntf(s1Id, 'document', 'New document shared', 'Mathematics Notes - Quadratic Equations.pdf', '/documents', 0);

    // ---------------- activity logs ----------------
    const act = (user, name, role, action, details) =>
      run('INSERT OR IGNORE INTO activity_logs (user_id, user_name, role, action, details) VALUES (?, ?, ?, ?, ?)', [user, name, role, action, details]);
    act(saId, 'System Administrator', 'super_admin', 'LOGIN', 'Super admin logged in');
    act(adId, 'Mr. David Kiggundu', 'admin', 'LOGIN', 'Admin logged in');
    act(t1Id, 'Ms. Mary Nakato', 'teacher', 'DOCUMENT_UPLOADED', 'Uploaded "Mathematics Notes - Quadratic Equations.pdf"');
    act(adId, 'Mr. David Kiggundu', 'admin', 'ANNOUNCEMENT_CREATED', 'Announcement "Term 1 Has Begun" (all)');
    act(p1Id, 'Mr. John Okello', 'parent', 'MESSAGE_SENT', 'Sent a message to Ms. Mary Nakato');

    // ---------------- settings ----------------
    setSetting('school', {
      name: 'Kalinabiri Secondary School',
      motto: 'Determined To Excel With Trust In God',
      logo: null,
      phone: '0792 861 645',
      email: 'kalinabirisecsch@gmail.com',
      address: 'Kalinabiri Road, Ntinda, Kampala, Uganda',
      website: 'https://schoolnet.africa/ug/lower/secondary-schools/kalinabiri-secondary-school/',
      academicYears: ['2025', '2026'],
      currentAcademicYear: '2026',
      streams: ['A', 'B', 'C'],
      departments: ['Science', 'Humanities', 'Languages', 'Administration'],
      sessionDurationDays: 7,
    });
    setSetting('permissions', {
      student: { messageTeacher: true, messageAdmin: true, messageClassChat: true, sendAttachments: true },
      parent: { messageClassTeacher: true, messageSubjectTeacher: true, messageAdmin: true, sendAttachments: true },
      teacher: { messageStudents: true, messageParents: true, messageAdmin: true, messageClassChat: true, sendAttachments: true },
      admin: { messageEveryone: true, sendAttachments: true },
      studentMessagingEnabled: true,
      parentMessagingEnabled: true,
    });
    setSetting('notifications', {
      newMessage: true, newDocument: true, newAnnouncement: true, importantNotices: true, accountChanges: true,
    });
    setSetting('security', { strongPasswords: true, sessionExpiryDays: 1, loginRateLimit: 20, allowParentRegistration: false });
    setSetting('api', { apiDocsUrl: '/docs/api.html', maxFileSizeMB: env.MAX_FILE_SIZE / 1024 / 1024 });
    setSetting('backup', { autoBackup: false, lastBackupAt: null });

    // ---------------- website gallery (managed media) ----------------
    // The school's existing photos/videos become manageable records so the
    // super admin can edit or remove every one of them from the dashboard.
    // Every item below is genuine, publicly published Kalinabiri Secondary
    // School media: the campus photograph from the school's national schools
    // directory profile (schoolnet.africa), and still frames from the school's
    // own published lesson-practical and community videos on YouTube.
    // The super admin can edit or remove any of them from the dashboard.
    const media = [
      ['Kalinabiri Secondary School Campus', 'Our school in Ntinda, Kampala', 'https://schoolnet.africa/ug/wp-content/uploads/sites/2/2016/07/Kalinabiri-ss.jpeg', 'image', 'Campus', 1],
      ['School Grounds and Buildings', 'Our campus in Ntinda, Kampala', 'https://schoolnet.africa/ug/wp-content/uploads/sites/2/2016/07/Kalinabiri-ss-1.jpeg', 'image', 'Campus', 2],
      ['Locally Made Thermometer Practical', 'S.1 physics: heat and measurement', 'https://i.ytimg.com/vi/mYhX2lFCMtE/hq720.jpg', 'image', 'Academics', 3],
      ['Magnetism Demonstration', 'Students demonstrating magnetic fields', 'https://i.ytimg.com/vi/YsB_nSzRTbI/hq720.jpg', 'image', 'Academics', 4],
      ['Electricity Practical', 'S.1 students building simple circuits', 'https://i.ytimg.com/vi/UoC0lHpgYCA/hq720.jpg', 'image', 'Academics', 5],
      ['Heat and Energy Practical', 'Conduction and radiation with local materials', 'https://i.ytimg.com/vi/Ab96mYU4UcY/hq720.jpg', 'image', 'Academics', 6],
      ['Light Demonstration', 'S.1 students demonstrating reflection', 'https://i.ytimg.com/vi/CBs7v5OIjpw/hq720.jpg', 'image', 'Academics', 7],
      ['Community Health Outreach', 'Reusable sanitary towel campaign at the school', 'https://i.ytimg.com/vi/O1A6aQcmlmg/hq720.jpg', 'image', 'Community', 8],
      ['Talent and Mentorship Day', 'SMASHED youth mentoring live at Kalinabiri SS', 'https://i.ytimg.com/vi/pMDWl5NuGWw/hq720.jpg', 'image', 'Events', 9],
    ];
    for (const [title, caption, url, type, cat, sort] of media) {
      run('INSERT OR IGNORE INTO site_gallery (title, caption, url, media_type, category, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [title, caption, url, type, cat, sort]);
    }

    // ---------------- website news (genuine, published school events) --------
    // Each item below corresponds to a publicly published video recorded at
    // Kalinabiri SS, with a still from that same footage as its picture.
    const news = [
      ['Reusable Sanitary Towel Campaign at Kalinabiri SS',
        'Kalinabiri Secondary School hosted a reusable sanitary towel campaign run in partnership with the Joel Ssenyonyi Foundation and She for She. The campaign equips girls with washable, long-lasting sanitary towels so that no learner has to miss lessons every month, and it includes practical hygiene education for the whole school.',
        'https://i.ytimg.com/vi/O1A6aQcmlmg/hq720.jpg'],
      ['S.1 Learners Demonstrate Science With Local Materials',
        'Our Senior One learners continue to show that science needs curiosity more than expensive equipment. Working in groups, they built and demonstrated their own thermometer, simple electric circuits, magnetism and heat experiments using materials available around the school. Teaching science through practicals like these is at the heart of learning at Kalinabiri.',
        'https://i.ytimg.com/vi/mYhX2lFCMtE/hq720.jpg'],
      ['Youth Mentorship Day: SMASHED Live at Kalinabiri SS',
        'Topowa Youth Mentoring Uganda brought the SMASHED youth mentorship experience to our campus. Learners spent the day in sessions on purpose, discipline and making positive life choices, closing with music and testimonies from the mentees themselves.',
        'https://i.ytimg.com/vi/pMDWl5NuGWw/hq720.jpg'],
      ['Guidance Session for Our Candidate Classes',
        'Our S.4 and S.6 candidates were taken through an inspiring guidance and motivation session ahead of their national examinations. The session covered revision strategy, examination discipline, managing pressure and keeping faith, and the learners gave a vote of thanks on behalf of the whole candidate class.',
        'https://i.ytimg.com/vi/sblZex31Ufk/hq720.jpg'],
    ];
    for (const [title, body, img] of news) {
      run('INSERT OR IGNORE INTO site_news (title, body, image_url, published) VALUES (?, ?, ?, 1)', [title, body, img]);
    }

    setSetting('seeded', true);
  });

  console.log('Demo data seeded. Accounts:');
  console.log('  superadmin / SuperAdmin@123');
  console.log('  admin      / Admin@123');
  console.log('  teacher1   / Teacher@123');
  console.log('  student1   / Student@123');
  console.log('  parent1    / Parent@123');
}

const DEMO_KEEP = new Set(['superadmin', 'admin', 'teacher1', 'student1', 'parent1']);

/**
 * Bring an already-seeded database in line with the demo catalog without
 * wiping admin work. Adds any missing Senior 1–6 A/B class, drops an empty
 * Primary 7 row, and removes leftover @school.test demo accounts.
 */
function alignDemoCatalog() {
  for (const name of ['Senior 1', 'Senior 2', 'Senior 3', 'Senior 4', 'Senior 5', 'Senior 6']) {
    for (const stream of ['A', 'B']) {
      run('INSERT OR IGNORE INTO classes (name, stream, academic_year) VALUES (?, ?, ?)', [name, stream, '2026']);
    }
  }
  for (const c of all("SELECT id FROM classes WHERE name LIKE 'Primary%'")) {
    const n = get('SELECT COUNT(*) AS c FROM students WHERE class_id = ?', [c.id]).c;
    if (!n) run('DELETE FROM classes WHERE id = ?', [c.id]);
  }
  const extras = all(
    `SELECT id, username FROM users
     WHERE username IN ('teacher2','teacher3','student2','student3','student4','student5','student6')
        OR lower(COALESCE(email, '')) LIKE '%@school.test'`
  );
  for (const u of extras) {
    if (DEMO_KEEP.has(u.username)) continue;
    run('DELETE FROM users WHERE id = ?', [u.id]);
  }
}

function ensureSeeded() {
  if (env.SEED_DEMO_DATA && !seeded()) {
    // Seed ONLY a brand-new database. An existing database is NEVER reseeded or
    // overwritten — every change an admin makes (news, gallery, users, settings,
    // messages…) survives server restarts and redeploys.
    runSeed();
  }
  alignDemoCatalog();
}

if (require.main === module) {
  if (process.argv.includes('--reset')) {
    console.log('Resetting database...');
    db.exec('PRAGMA foreign_keys = OFF');
    // EVERY content table must be dropped here, otherwise --reset leaves
    // stale rows behind (e.g. old gallery items surviving into a fresh seed).
    const tables = ['announcement_reads', 'announcements', 'notifications', 'message_reads', 'messages',
      'conversation_participants', 'conversations', 'document_access', 'documents', 'folders',
      'parent_students', 'parents', 'students', 'teacher_classes', 'teachers', 'classes', 'users',
      'activity_logs', 'settings',
      'site_gallery', 'site_news', 'contact_messages', 'admission_applications',
      'assignment_submissions', 'assignments', 'attendance', 'exam_results', 'exams',
      'timetable_entries', 'fee_payments', 'student_fees', 'fee_structures', 'subjects',
      'imports', 'email_verifications', 'password_resets', 'user_preferences',
      'sessions', 'login_attempts'];
    for (const t of tables) db.exec(`DROP TABLE IF EXISTS ${t}`);
    db.exec('PRAGMA foreign_keys = ON');
    // re-apply schema
    const fs2 = require('fs');
    db.exec(fs2.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    // run migrations (same as db.js does)
    function ensureColumn(table, column, ddl) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all();
      if (cols.some((c) => c.name === column)) return;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
    ensureColumn('users', 'registration_status', "TEXT NOT NULL DEFAULT 'approved' CHECK (registration_status IN ('approved','pending','rejected'))");
    ensureColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
    runSeed();
  } else {
    ensureSeeded();
    console.log('Seeding already done (or disabled). To force reset: node backend/database/seed.js --reset');
  }
}

module.exports = { ensureSeeded, runSeed, alignDemoCatalog };
