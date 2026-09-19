/**
 * /api/stats — role-specific dashboard statistics.
 */
const express = require('express');
const router = express.Router();
const { all, get } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { classIdsForTeacherUserId, classIdForStudentUserId, classIdsForParentUserId, studentIdsForClass } = require('../services/permissions');

/** Assignments due within the next N days for a set of classes. */
function upcomingAssignments(classIds, days = 7) {
  if (!classIds.length) return [];
  return all(
    `SELECT id, title, class_id, subject, due_date, description FROM assignments
     WHERE status = 'active' AND due_date IS NOT NULL
       AND due_date <= date('now', '+' || ? || ' days')
       AND class_id IN (${classIds.map(() => '?').join(',')})
     ORDER BY due_date ASC LIMIT 8`, [days, ...classIds]
  );
}

/** Exams within the next N days for a set of classes. */
function upcomingExams(classIds, days = 14) {
  if (!classIds.length) return [];
  return all(
    `SELECT id, title, class_id, subject, date, start_time, end_time, status FROM exams
     WHERE date IS NOT NULL AND date >= date('now')
       AND date <= date('now', '+' || ? || ' days')
       AND class_id IN (${classIds.map(() => '?').join(',')})
     ORDER BY date ASC LIMIT 8`, [days, ...classIds]
  );
}

function unreadMessagesSql() {
  return `SELECT COUNT(*) c FROM messages m JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
          WHERE m.sender_id != ? AND cp.muted = 0
            AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)`;
}

/** GET /api/stats/overview — returns data shaped for the caller's role. */
router.get('/overview', authenticate, (req, res) => {
  const role = req.user.role;
  const uid = req.user.id;
  const payload = { role, user: req.user };

  if (role === 'super_admin') {
    payload.counts = {
      students: get("SELECT COUNT(*) c FROM students WHERE status='active'").c,
      teachers: get("SELECT COUNT(*) c FROM teachers WHERE status='active'").c,
      admins: get("SELECT COUNT(*) c FROM users WHERE role='admin' AND status='active'").c,
      parents: get("SELECT COUNT(*) c FROM parents WHERE status='active'").c,
      activeUsers: get("SELECT COUNT(*) c FROM users WHERE status='active'").c,
      classes: get('SELECT COUNT(*) c FROM classes').c,
      documents: get('SELECT COUNT(*) c FROM documents').c,
      messages: get('SELECT COUNT(*) c FROM messages').c,
      announcements: get('SELECT COUNT(*) c FROM announcements').c,
      assignments: get('SELECT COUNT(*) c FROM assignments').c,
      exams: get('SELECT COUNT(*) c FROM exams').c,
      unreadNotifications: get('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0', [uid]).c,
      unreadMessages: get(unreadMessagesSql(), [uid, uid, uid]).c,
    };
    payload.recentActivity = all('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 8');
    payload.recentDocuments = all('SELECT d.*, u.full_name AS uploader_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by ORDER BY d.id DESC LIMIT 5');
    payload.recentAnnouncements = all('SELECT a.*, u.full_name AS sender_name FROM announcements a LEFT JOIN users u ON u.id = a.sender_id ORDER BY a.id DESC LIMIT 5');
    payload.recentNotifications = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 8', [uid]);
    payload.usersByRole = all('SELECT role, COUNT(*) c FROM users WHERE status=\'active\' GROUP BY role');
    payload.studentsPerClass = all(
      `SELECT c.name || ' ' || c.stream AS label, (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status='active') AS value
       FROM classes c ORDER BY c.name LIMIT 12`
    );
    payload.attendanceToday = get("SELECT COUNT(*) c FROM attendance WHERE date = date('now')").c;
    payload.fees = get(
      `SELECT (SELECT COALESCE(SUM(amount),0) FROM student_fees) AS due,
              (SELECT COALESCE(SUM(amount),0) FROM fee_payments) AS paid`
    );
  } else if (role === 'admin') {
    payload.counts = {
      students: get("SELECT COUNT(*) c FROM students WHERE status='active'").c,
      teachers: get("SELECT COUNT(*) c FROM teachers WHERE status='active'").c,
      parents: get("SELECT COUNT(*) c FROM parents WHERE status='active'").c,
      classes: get('SELECT COUNT(*) c FROM classes').c,
      documents: get('SELECT COUNT(*) c FROM documents').c,
      announcements: get('SELECT COUNT(*) c FROM announcements').c,
      assignments: get('SELECT COUNT(*) c FROM assignments').c,
      exams: get('SELECT COUNT(*) c FROM exams').c,
      messagesToday: get("SELECT COUNT(*) c FROM messages WHERE date(created_at) = date('now')").c,
      attendanceToday: get("SELECT COUNT(*) c FROM attendance WHERE date = date('now')").c,
      unreadNotifications: get('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0', [uid]).c,
      unreadMessages: get(unreadMessagesSql(), [uid, uid, uid]).c,
    };
    payload.recentDocuments = all('SELECT d.*, u.full_name AS uploader_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by ORDER BY d.id DESC LIMIT 5');
    payload.recentAnnouncements = all('SELECT a.*, u.full_name AS sender_name FROM announcements a LEFT JOIN users u ON u.id = a.sender_id ORDER BY a.id DESC LIMIT 5');
    payload.classes = all('SELECT c.id, c.name, c.stream, (SELECT COUNT(*) FROM students s WHERE s.class_id=c.id AND s.status=\'active\') student_count FROM classes c ORDER BY c.name LIMIT 20');
    payload.recentActivity = all('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 8');
    payload.studentsPerClass = all(
      `SELECT c.name || ' ' || c.stream AS label, (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status='active') AS value
       FROM classes c ORDER BY c.name LIMIT 12`
    );
    payload.fees = get(
      `SELECT (SELECT COALESCE(SUM(amount),0) FROM student_fees) AS due,
              (SELECT COALESCE(SUM(amount),0) FROM fee_payments) AS paid,
              (SELECT COUNT(*) FROM student_fees sf WHERE NOT EXISTS (SELECT 1 FROM fee_payments p WHERE p.student_id = sf.student_id)) AS with_outstanding`
    );
    payload.upcomingExams = upcomingExams(all('SELECT id FROM classes').map((r) => r.id));
    payload.upcomingAssignments = upcomingAssignments(all('SELECT id FROM classes').map((r) => r.id));
  } else if (role === 'teacher') {
    const myClassIds = classIdsForTeacherUserId(uid);
    const classPlaceholder = myClassIds.length ? myClassIds.map(() => '?').join(',') : 'NULL';
    const studentCount = myClassIds.length
      ? get(`SELECT COUNT(*) c FROM students WHERE status='active' AND class_id IN (${classPlaceholder})`, myClassIds).c : 0;
    payload.counts = {
      classes: myClassIds.length,
      students: studentCount,
      documents: get('SELECT COUNT(*) c FROM documents WHERE uploaded_by = ?', [uid]).c,
      assignments: myClassIds.length ? get(`SELECT COUNT(*) c FROM assignments WHERE class_id IN (${classPlaceholder})`, myClassIds).c : 0,
      attendanceToday: myClassIds.length ? get(`SELECT COUNT(*) c FROM attendance WHERE date = date('now') AND class_id IN (${classPlaceholder})`, myClassIds).c : 0,
      unreadMessages: get(unreadMessagesSql(), [uid, uid, uid]).c,
      unreadNotifications: get('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0', [uid]).c,
      unreadAnnouncements: get(
        `SELECT COUNT(*) c FROM announcements a WHERE NOT EXISTS (SELECT 1 FROM announcement_reads ar WHERE ar.announcement_id = a.id AND ar.user_id = ?)`, [uid]).c,
    };
    payload.classes = myClassIds.length ? all(
      `SELECT c.id, c.name, c.stream, (SELECT COUNT(*) FROM students s WHERE s.class_id=c.id AND s.status='active') student_count,
              (SELECT COUNT(*) FROM messages m JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ? AND m.sender_id != ?
                AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)) AS unread
       FROM classes c WHERE c.id IN (${classPlaceholder})`, [uid, uid, uid, ...myClassIds]) : [];
    payload.upcomingAssignments = upcomingAssignments(myClassIds, 14);
    payload.upcomingExams = upcomingExams(myClassIds);
    payload.recentDocuments = all('SELECT d.*, u.full_name AS uploader_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by ORDER BY d.id DESC LIMIT 5');
    payload.recentAnnouncements = all('SELECT a.*, u.full_name AS sender_name FROM announcements a LEFT JOIN users u ON u.id = a.sender_id ORDER BY a.id DESC LIMIT 5');
    payload.recentNotifications = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 8', [uid]);
  } else if (role === 'student') {
    const cid = classIdForStudentUserId(uid);
    const myClassIds = cid ? [cid] : [];
    const me = get('SELECT id FROM students WHERE user_id = ?', [uid]);
    payload.counts = {
      className: cid ? (get('SELECT name, stream FROM classes WHERE id = ?', [cid]) || {}).name : null,
      unreadMessages: get(unreadMessagesSql(), [uid, uid, uid]).c,
      unreadNotifications: get('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0', [uid]).c,
      unreadAnnouncements: get(
        `SELECT COUNT(*) c FROM announcements a WHERE NOT EXISTS (SELECT 1 FROM announcement_reads ar WHERE ar.announcement_id = a.id AND ar.user_id = ?)`, [uid]).c,
      openAssignments: me ? get("SELECT COUNT(*) c FROM assignments WHERE status='active' AND class_id = ? AND due_date >= date('now') AND id NOT IN (SELECT assignment_id FROM assignment_submissions WHERE student_id = ?)", [cid, me.id]).c : 0,
      examsUpcoming: myClassIds.length ? get("SELECT COUNT(*) c FROM exams WHERE class_id = ? AND date >= date('now')", [cid]).c : 0,
    };
    if (me) {
      payload.attendance = get(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN status='late' THEN 1 ELSE 0 END) AS late
         FROM attendance WHERE student_id = ?`, [me.id]
      );
    }
    payload.upcomingAssignments = upcomingAssignments(myClassIds);
    payload.upcomingExams = upcomingExams(myClassIds);
    payload.recentAnnouncements = all('SELECT a.*, u.full_name AS sender_name FROM announcements a LEFT JOIN users u ON u.id = a.sender_id ORDER BY a.id DESC LIMIT 5');
    payload.recentDocuments = all('SELECT d.*, u.full_name AS uploader_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by ORDER BY d.id DESC LIMIT 5');
    payload.recentNotifications = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 8', [uid]);
  } else if (role === 'parent') {
    const children = all(
      `SELECT s.id, s.full_name, s.class_id, c.name AS class_name, c.stream FROM parent_students ps
       JOIN students s ON s.id = ps.student_id LEFT JOIN classes c ON c.id = s.class_id
       WHERE ps.parent_id = (SELECT id FROM parents WHERE user_id = ?)`, [uid]);
    const myClassIds = classIdsForParentUserId(uid);
    payload.children = children;
    payload.counts = {
      children: children.length,
      unreadMessages: get(unreadMessagesSql(), [uid, uid, uid]).c,
      unreadNotifications: get('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0', [uid]).c,
    };
    // fee summary across children
    if (children.length) {
      const childIds = children.map((c) => c.id);
      payload.fees = {
        children,
        totalDue: get(`SELECT COALESCE(SUM(amount),0) AS due FROM student_fees WHERE student_id IN (${childIds.map(() => '?').join(',')})`, childIds).due,
        totalPaid: get(`SELECT COALESCE(SUM(amount),0) AS paid FROM fee_payments WHERE student_id IN (${childIds.map(() => '?').join(',')})`, childIds).paid,
      };
    }
    payload.upcomingAssignments = upcomingAssignments(myClassIds);
    payload.upcomingExams = upcomingExams(myClassIds);
    payload.recentAnnouncements = all('SELECT a.*, u.full_name AS sender_name FROM announcements a LEFT JOIN users u ON u.id = a.sender_id ORDER BY a.id DESC LIMIT 5')
      .filter((a) => {
        if (a.target_type === 'all') return true;
        if (a.target_type === 'role' && a.target_value === 'parent') return true;
        if (a.target_type === 'class' && myClassIds.includes(Number(a.target_value))) return true;
        if (a.target_type === 'parents_of_class' && myClassIds.includes(Number(a.target_value))) return true;
        return false;
      });
    payload.recentNotifications = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 8', [uid]);
  }

  res.json(payload);
});

module.exports = router;
