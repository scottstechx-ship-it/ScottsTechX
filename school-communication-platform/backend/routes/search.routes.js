/**
 * /api/search — one search box for the whole platform.
 *
 * Every dashboard gets the same endpoint, but each user only ever sees rows
 * their role is allowed to see: the visibility rules from the individual
 * routes (documents, announcements, messages, students) are applied here too,
 * so search can never become a way around them.
 *
 * Response shape:
 *   { query, total, groups: [ { key, label, count, items: [ item ] } ] }
 *   item = { type, id, title, subtitle, badge, nav, meta: [{label,value}], href? }
 * "nav" is the dashboard section to jump to and "meta" lets the client show a
 * detail card without a second request.
 */
const express = require('express');
const router = express.Router();
const { all, get } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { cleanString } = require('../middleware/validate');
const {
  canAccessDocument,
  announcementReachesUser,
  classIdsForTeacherUserId,
  classIdForStudentUserId,
  classIdsForParentUserId,
} = require('../services/permissions');

/** Escape the LIKE wildcards so a search for "50%" means fifty percent. */
function like(term) {
  return '%' + term.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

const money = (n) => 'UGX ' + Number(n || 0).toLocaleString('en-UG', { maximumFractionDigits: 0 });

/** "2026-02-14T08:12:00.000Z" -> "14 Feb 2026" */
function niceDate(v) {
  if (!v) return '';
  const d = new Date(String(v).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Class ids the user may look inside (null = every class). */
function visibleClassIds(user) {
  if (user.role === 'super_admin' || user.role === 'admin') return null;
  if (user.role === 'teacher') return classIdsForTeacherUserId(user.id);
  if (user.role === 'student') {
    const c = classIdForStudentUserId(user.id);
    return c ? [c] : [];
  }
  if (user.role === 'parent') return classIdsForParentUserId(user.id);
  return [];
}

/** Students the user is allowed to see. */
function visibleStudents(user, term) {
  const L = like(term);
  const base = `SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id = s.class_id`;
  const where = `(s.full_name LIKE ? ESCAPE '\\' OR s.student_code LIKE ? ESCAPE '\\' OR s.parent_name LIKE ? ESCAPE '\\' OR s.parent_phone LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')`;
  const params = [L, L, L, L, L];

  if (user.role === 'super_admin' || user.role === 'admin') {
    return all(`${base} WHERE ${where} ORDER BY s.full_name LIMIT 8`, params);
  }
  if (user.role === 'teacher') {
    const ids = classIdsForTeacherUserId(user.id);
    if (!ids.length) return [];
    const ph = ids.map(() => '?').join(',');
    return all(`${base} WHERE s.class_id IN (${ph}) AND ${where} ORDER BY s.full_name LIMIT 8`, [...ids, ...params]);
  }
  if (user.role === 'student') {
    return all(`${base} WHERE s.user_id = ? AND ${where} ORDER BY s.full_name LIMIT 8`, [user.id, ...params]);
  }
  if (user.role === 'parent') {
    // the real parent -> child link is parent_students (same as /api/parents/children)
    return all(
      `${base} JOIN parent_students ps ON ps.student_id = s.id
        JOIN parents p ON p.id = ps.parent_id
       WHERE p.user_id = ? AND ${where} ORDER BY s.full_name LIMIT 8`,
      [user.id, ...params]
    );
  }
  return [];
}

/** Documents the user may open — same rules as /api/documents. */
function visibleDocuments(user, term) {
  const L = like(term);
  const sql = `SELECT DISTINCT d.*, u.full_name AS uploader_name FROM documents d
    LEFT JOIN users u ON u.id = d.uploaded_by
    LEFT JOIN document_access da ON da.document_id = d.id
    WHERE (d.name LIKE ? ESCAPE '\\' OR d.description LIKE ? ESCAPE '\\' OR d.original_name LIKE ? ESCAPE '\\')
      AND (d.uploaded_by = ? OR da.target_type = 'all' OR (da.target_type = 'role' AND da.target_id = ?)
           OR (da.target_type = 'user' AND da.target_id = ?) OR da.target_type = 'class')
    ORDER BY d.created_at DESC LIMIT 40`;
  const rows = all(sql, [L, L, L, user.id, user.role, String(user.id)]);
  return rows.filter((d) => canAccessDocument(user, d)).slice(0, 8);
}

/** Announcements that reach this user (plus their own drafts/scheduled ones). */
function visibleAnnouncements(user, term) {
  const L = like(term);
  const rows = all(
    `SELECT a.*, u.full_name AS sender_name FROM announcements a
     LEFT JOIN users u ON u.id = a.sender_id
     WHERE a.title LIKE ? ESCAPE '\\' OR a.content LIKE ? ESCAPE '\\'
     ORDER BY a.created_at DESC LIMIT 60`,
    [L, L]
  );
  return rows
    .filter((a) => announcementReachesUser(user, a))
    .filter((a) => a.status !== 'scheduled' || a.sender_id === user.id || ['super_admin', 'admin'].includes(user.role))
    .slice(0, 8);
}

/** Messages inside conversations the user is part of. */
function visibleMessages(user, term) {
  const L = like(term);
  return all(
    `SELECT m.id, m.content, m.created_at, m.conversation_id, u.full_name AS sender_name, c.type AS conv_type, c.title AS conv_title
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     JOIN conversation_participants p ON p.conversation_id = c.id AND p.user_id = ?
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.content LIKE ? ESCAPE '\\'
     ORDER BY m.created_at DESC LIMIT 8`,
    [user.id, L]
  );
}

/** Staff / user accounts: admins only. */
function visibleUsers(user, term) {
  if (!['super_admin', 'admin'].includes(user.role)) return [];
  const L = like(term);
  return all(
    `SELECT id, full_name, username, email, phone, role, status FROM users
     WHERE full_name LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\'
     ORDER BY full_name LIMIT 8`,
    [L, L, L, L]
  );
}

function searchClasses(user, term) {
  const L = like(term);
  const ids = visibleClassIds(user);
  let rows = all(
    `SELECT c.*, u.full_name AS teacher_name FROM classes c LEFT JOIN users u ON u.id = c.class_teacher_id
     WHERE c.name LIKE ? ESCAPE '\\' OR c.stream LIKE ? ESCAPE '\\' ORDER BY c.name LIMIT 20`,
    [L, L]
  );
  if (ids) rows = rows.filter((c) => ids.includes(c.id));
  return rows.slice(0, 8).map((c) => ({
    ...c,
    students: (get('SELECT COUNT(*) n FROM students WHERE class_id = ? AND status = \'active\'', [c.id]) || {}).n || 0,
  }));
}

function searchSubjects(term) {
  const L = like(term);
  return all(
    `SELECT * FROM subjects WHERE name LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\' OR department LIKE ? ESCAPE '\\' ORDER BY name LIMIT 8`,
    [L, L, L]
  );
}

function searchAssignments(user, term) {
  const L = like(term);
  const ids = visibleClassIds(user);
  let rows = all(
    `SELECT a.*, c.name AS class_name, u.full_name AS teacher_name FROM assignments a
     LEFT JOIN classes c ON c.id = a.class_id LEFT JOIN users u ON u.id = a.teacher_id
     WHERE a.title LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\' OR a.subject LIKE ? ESCAPE '\\'
     ORDER BY a.created_at DESC LIMIT 20`,
    [L, L, L]
  );
  if (ids) rows = rows.filter((a) => ids.includes(a.class_id));
  if (user.role === 'teacher') rows = rows.filter((a) => a.teacher_id === user.id || ids.includes(a.class_id));
  return rows.slice(0, 8);
}

function searchExams(user, term) {
  const L = like(term);
  const ids = visibleClassIds(user);
  let rows = all(
    `SELECT e.*, c.name AS class_name FROM exams e LEFT JOIN classes c ON c.id = e.class_id
     WHERE e.title LIKE ? ESCAPE '\\' OR e.subject LIKE ? ESCAPE '\\' ORDER BY e.date DESC LIMIT 20`,
    [L, L]
  );
  if (ids) rows = rows.filter((e) => ids.includes(e.class_id));
  return rows.slice(0, 8);
}

/** Fee receipts: admins see all, students/parents only their own. */
function searchPayments(user, term) {
  const L = like(term);
  if (['super_admin', 'admin'].includes(user.role)) {
    return all(
      `SELECT p.*, s.full_name AS student_name FROM fee_payments p LEFT JOIN students s ON s.id = p.student_id
       WHERE p.receipt_no LIKE ? ESCAPE '\\' OR p.reference LIKE ? ESCAPE '\\' OR s.full_name LIKE ? ESCAPE '\\'
       ORDER BY p.paid_at DESC LIMIT 8`,
      [L, L, L]
    );
  }
  if (user.role === 'student') {
    return all(
      `SELECT p.*, s.full_name AS student_name FROM fee_payments p JOIN students s ON s.id = p.student_id
       WHERE s.user_id = ? AND (p.receipt_no LIKE ? ESCAPE '\\' OR p.reference LIKE ? ESCAPE '\\' OR s.full_name LIKE ? ESCAPE '\\')
       ORDER BY p.paid_at DESC LIMIT 8`,
      [user.id, L, L, L]
    );
  }
  if (user.role === 'parent') {
    return all(
      `SELECT p.*, s.full_name AS student_name FROM fee_payments p JOIN students s ON s.id = p.student_id
       JOIN parent_students ps ON ps.student_id = s.id JOIN parents pa ON pa.id = ps.parent_id
       WHERE pa.user_id = ? AND (p.receipt_no LIKE ? ESCAPE '\\' OR p.reference LIKE ? ESCAPE '\\' OR s.full_name LIKE ? ESCAPE '\\')
       ORDER BY p.paid_at DESC LIMIT 8`,
      [user.id, L, L, L]
    );
  }
  return [];
}

/** GET /api/search?q=... — grouped, role-filtered results. */
router.get('/', authenticate, (req, res) => {
  const q = cleanString(req.query.q || req.query.search, 80).trim();
  if (q.length < 2) {
    return res.json({ query: q, total: 0, groups: [], hint: 'Type at least two characters.' });
  }

  const groups = [];
  const push = (key, label, items) => { if (items.length) groups.push({ key, label, count: items.length, items }); };

  push('students', 'Students', visibleStudents(req.user, q).map((s) => ({
    type: 'student', id: s.id, title: s.full_name, subtitle: `${s.class_name || 'No class'} · ${s.student_code || '—'}`,
    badge: s.status, nav: 'students',
    meta: [
      ['Admission no', s.student_code || '—'], ['Class', s.class_name || '—'], ['Stream', s.stream || '—'],
      ['Gender', s.gender || '—'], ['Guardian', s.parent_name || '—'], ['Guardian phone', s.parent_phone || '—'],
      ['Status', s.status || '—'], ['Enrolled', niceDate(s.enrollment_date)],
    ],
  })));

  push('staff', 'Staff & users', visibleUsers(req.user, q).map((u) => ({
    type: 'user', id: u.id, title: u.full_name, subtitle: `${String(u.role || '').replace('_', ' ')} · ${u.username || u.email || ''}`,
    badge: u.status, nav: 'users',
    meta: [['Role', String(u.role || '').replace('_', ' ')], ['Username', u.username || '—'], ['Email', u.email || '—'], ['Phone', u.phone || '—'], ['Status', u.status || '—']],
  })));

  push('classes', 'Classes', searchClasses(req.user, q).map((c) => ({
    type: 'class', id: c.id, title: c.name + (c.stream ? ' ' + c.stream : ''), subtitle: `${c.students} students · ${c.teacher_name || 'no class teacher'}`,
    nav: 'classes', meta: [['Class', c.name], ['Stream', c.stream || '—'], ['Students', String(c.students)], ['Class teacher', c.teacher_name || '—'], ['Year', c.academic_year || '—']],
  })));

  push('subjects', 'Subjects', searchSubjects(q).map((s) => ({
    type: 'subject', id: s.id, title: s.name, subtitle: s.code || s.department || '',
    nav: 'subjects', meta: [['Name', s.name], ['Code', s.code || '—'], ['Department', s.department || '—']],
  })));

  push('documents', 'Documents', visibleDocuments(req.user, q).map((d) => ({
    type: 'document', id: d.id, title: d.name, subtitle: `${d.mime_type || 'file'} · ${(d.size / 1024 / 1024).toFixed(2)} MB${d.uploader_name ? ' · ' + d.uploader_name : ''}`,
    nav: 'documents', href: `/api/documents/${d.id}/preview`,
    meta: [['Name', d.name], ['Type', d.mime_type || '—'], ['Size', (d.size / 1024 / 1024).toFixed(2) + ' MB'], ['Uploaded by', d.uploader_name || '—'], ['Uploaded', niceDate(d.created_at)], ['Expires', d.expire_date ? niceDate(d.expire_date) : 'never']],
  })));

  push('announcements', 'Announcements', visibleAnnouncements(req.user, q).map((a) => ({
    type: 'announcement', id: a.id, title: a.title,
    subtitle: `${(a.sender_name || 'School')} · ${niceDate(a.created_at)}${a.status === 'scheduled' ? ' · scheduled' : ''}`,
    badge: a.important ? 'important' : (a.status === 'scheduled' ? 'scheduled' : ''),
    nav: 'announcements',
    meta: [['From', a.sender_name || 'School'], ['Posted', niceDate(a.created_at)], ['Audience', (a.target_type || 'all').replace('_', ' ')], ['Status', a.status || 'published'], ['Message', String(a.content || '').slice(0, 240)]],
  })));

  push('messages', 'Messages', visibleMessages(req.user, q).map((m) => ({
    type: 'message', id: m.id, title: (m.sender_name || 'Someone') + ' · ' + (m.conv_title || String(m.conv_type || 'chat').replace('_', ' ')),
    subtitle: String(m.content || '').slice(0, 90), nav: 'messages',
    meta: [['From', m.sender_name || '—'], ['When', niceDate(m.created_at)], ['Conversation', m.conv_title || m.conv_type || '—'], ['Message', String(m.content || '').slice(0, 400)]],
  })));

  push('assignments', 'Assignments', searchAssignments(req.user, q).map((a) => ({
    type: 'assignment', id: a.id, title: a.title, subtitle: `${a.class_name || 'All classes'} · ${a.subject || ''} · due ${niceDate(a.due_date)}`,
    badge: a.status, nav: 'assignments',
    meta: [['Class', a.class_name || '—'], ['Subject', a.subject || '—'], ['Teacher', a.teacher_name || '—'], ['Due', niceDate(a.due_date)], ['Status', a.status || '—'], ['Details', String(a.description || '').slice(0, 240)]],
  })));

  push('exams', 'Exams & results', searchExams(req.user, q).map((e) => ({
    type: 'exam', id: e.id, title: e.title, subtitle: `${e.class_name || 'All classes'} · ${e.subject || ''} · ${niceDate(e.date)}`,
    nav: 'exams', meta: [['Class', e.class_name || '—'], ['Subject', e.subject || '—'], ['Date', niceDate(e.date)], ['Term', e.term || '—'], ['Status', e.status || '—']],
  })));

  push('payments', 'Fee receipts', searchPayments(req.user, q).map((p) => ({
    type: 'payment', id: p.id, studentId: p.student_id, title: p.receipt_no || `Payment #${p.id}`,
    subtitle: `${p.student_name || ''} · ${money(p.amount)} · ${niceDate(p.paid_at)}`,
    nav: 'fees', href: `/api/print/receipt/${p.student_id}/${p.id}`,
    meta: [['Receipt no', p.receipt_no || '—'], ['Student', p.student_name || '—'], ['Amount', money(p.amount)], ['Method', p.method || '—'], ['Reference', p.reference || '—'], ['Paid', niceDate(p.paid_at)]],
  })));

  const total = groups.reduce((n, g) => n + g.count, 0);
  res.json({ query: q, total, groups });
});

module.exports = router;
