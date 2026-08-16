/**
 * Permission engine — the single source of truth for what each role may do.
 *
 * The backend ALWAYS verifies permissions. The frontend only hides buttons.
 *
 * Covers:
 *  - who may message whom (direct conversations)
 *  - which conversation types a user may create / participate in
 *  - document access rules (backend enforced at list & download time)
 *  - announcement targeting
 */
const { all, get } = require('../database/db');

// ---------------------------------------------------------------------------
// Messaging permissions
// ---------------------------------------------------------------------------

/** Teacher ids assigned to a class (class teacher + subject teachers). */
function teachersForClass(classId) {
  const rows = all(
    `SELECT t.id, t.user_id FROM teachers t
     JOIN teacher_classes tc ON tc.teacher_id = t.id
     WHERE tc.class_id = ?`, [classId]
  );
  return rows.map((r) => ({ id: r.id, userId: r.user_id }));
}

function classTeacherUserId(classId) {
  const row = get(
    `SELECT c.class_teacher_id, t.user_id FROM classes c
     LEFT JOIN teachers t ON t.id = c.class_teacher_id
     WHERE c.id = ?`, [classId]
  );
  return row && row.user_id ? row.user_id : null;
}

/** Classes a teacher is assigned to (by teacher.user_id). */
function classIdsForTeacherUserId(userId) {
  return all(
    `SELECT tc.class_id FROM teacher_classes tc
     JOIN teachers t ON t.id = tc.teacher_id
     WHERE t.user_id = ?`, [userId]
  ).map((r) => r.class_id);
}

/** Class id of a student (by student.user_id). */
function classIdForStudentUserId(userId) {
  const row = get('SELECT class_id FROM students WHERE user_id = ?', [userId]);
  return row ? row.class_id : null;
}

/** All user ids of students in a class. */
function studentUserIdsForClass(classId) {
  return all('SELECT user_id FROM students WHERE class_id = ? AND status = \'active\'', [classId])
    .map((r) => r.user_id)
    .filter(Boolean);
}

/** Parent user ids whose children are in a class. */
function parentUserIdsForClass(classId) {
  return all(
    `SELECT DISTINCT p.user_id FROM parents p
     JOIN parent_students ps ON ps.parent_id = p.id
     JOIN students s ON s.id = ps.student_id
     WHERE s.class_id = ? AND p.status = 'active'`, [classId]
  ).map((r) => r.user_id).filter(Boolean);
}

/** Student ids for a class (student table ids). */
function studentIdsForClass(classId) {
  return all('SELECT id FROM students WHERE class_id = ? AND status = \'active\'', [classId]).map((r) => r.id);
}

/** Class ids of the children linked to a parent user. */
function classIdsForParentUserId(userId) {
  return all(
    `SELECT DISTINCT s.class_id FROM parents p
     JOIN parent_students ps ON ps.parent_id = p.id
     JOIN students s ON s.id = ps.student_id
     WHERE p.user_id = ?`, [userId]
  ).map((r) => r.class_id).filter(Boolean);
}

/**
 * Can `sender` open a direct conversation with `recipient`?
 * Permission rules are enforced HERE, never on the client.
 */
function canMessageUser(sender, recipient) {
  if (!sender || !recipient) return false;
  if (sender.id === recipient.id) return true;

  const s = sender.role;
  const r = recipient.role;

  // Super admin may talk to anyone.
  if (s === 'super_admin') return true;
  if (r === 'super_admin') return s === 'admin' || s === 'teacher';

  // Admin <-> everyone (staff, teachers, students, parents).
  if (s === 'admin') return true;
  if (r === 'admin') return ['teacher', 'student', 'parent', 'admin'].includes(s);

  // Teacher -> teacher (staff room), teacher -> student (own classes), teacher -> parent (parents of own classes)
  if (s === 'teacher') {
    if (r === 'teacher') return true;
    if (r === 'student') {
      const classId = classIdForStudentUserId(recipient.id);
      return classId ? classIdsForTeacherUserId(sender.id).includes(classId) : false;
    }
    if (r === 'parent') {
      const pClassIds = classIdsForParentUserId(recipient.id);
      const tClassIds = classIdsForTeacherUserId(sender.id);
      return pClassIds.some((c) => tClassIds.includes(c));
    }
    return false;
  }

  // Student -> teacher (teachers of their class), student -> admin
  if (s === 'student') {
    if (r === 'teacher') {
      const classId = classIdForStudentUserId(sender.id);
      if (!classId) return false;
      const tIds = teachersForClass(classId).map((t) => t.userId);
      return tIds.includes(recipient.id);
    }
    return r === 'admin';
  }

  // Parent -> teacher (teachers of their children's classes), parent -> admin
  if (s === 'parent') {
    if (r === 'teacher') {
      const pClassIds = classIdsForParentUserId(sender.id);
      const teacherClassIds = classIdsForTeacherUserId(recipient.id);
      return pClassIds.some((c) => teacherClassIds.includes(c));
    }
    return r === 'admin';
  }

  return false;
}

/** Which conversation types may a user create? */
function canCreateConversationType(user, type) {
  switch (type) {
    case 'direct':
      return true;
    case 'class':
      return ['super_admin', 'admin', 'teacher'].includes(user.role);
    case 'group':
      return ['super_admin', 'admin', 'teacher'].includes(user.role);
    case 'broadcast':
      // Role-wide broadcasts are an administrative action.
      return ['super_admin', 'admin'].includes(user.role);
    case 'channel':
      // Announcement channels are created by administrators.
      return ['super_admin', 'admin'].includes(user.role);
    default:
      return false;
  }
}

/** Is the user a participant of the conversation? */
function isParticipant(userId, conversationId) {
  return !!get(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
    [conversationId, userId]
  );
}

/** Class chat members: students + class teacher + subject teachers + admins. */
function classConversationUserIds(classId) {
  const ids = new Set();
  for (const sid of studentUserIdsForClass(classId)) ids.add(sid);
  for (const t of teachersForClass(classId)) if (t.userId) ids.add(t.userId);
  const ct = classTeacherUserId(classId);
  if (ct) ids.add(ct);
  const admins = all("SELECT id FROM users WHERE role = 'admin' AND status = 'active'").map((r) => r.id);
  for (const a of admins) ids.add(a);
  return [...ids];
}

// ---------------------------------------------------------------------------
// Document permissions
// ---------------------------------------------------------------------------

/**
 * Can `user` access a document?
 * - uploader / super admin always
 * - explicit grants: user, role, class, all
 * - class grants also reach teachers assigned to that class, students of that
 *   class and parents whose children are in that class
 */
function canAccessDocument(user, doc) {
  if (!user || !doc) return false;
  // Super admins and admins have full oversight of every document in the
  // school — they can view, edit, share and delete anything.
  if (user.role === 'super_admin' || user.role === 'admin') return true;
  if (doc.uploaded_by === user.id) return true;

  const grants = all(
    'SELECT target_type, target_id FROM document_access WHERE document_id = ?',
    [doc.id]
  );

  for (const g of grants) {
    if (g.target_type === 'all') return true;
    if (g.target_type === 'role' && g.target_id === user.role) return true;
    if (g.target_type === 'user' && String(g.target_id) === String(user.id)) return true;
    if (g.target_type === 'class') {
      const classId = Number(g.target_id);
      if (user.role === 'student' && classIdForStudentUserId(user.id) === classId) return true;
      if (user.role === 'teacher' && classIdsForTeacherUserId(user.id).includes(classId)) return true;
      if (user.role === 'parent' && classIdsForParentUserId(user.id).includes(classId)) return true;
      if (user.role === 'admin' || user.role === 'super_admin') return true;
    }
  }
  return false;
}

/** Who is allowed to upload documents? */
function canUpload(user) {
  return ['super_admin', 'admin', 'teacher', 'student', 'parent'].includes(user.role);
}

/** Who can delete a document? Uploader, super_admin, admins. */
function canDeleteDocument(user, doc) {
  if (user.role === 'super_admin') return true;
  if (user.role === 'admin') return true;
  return doc.uploaded_by === user.id;
}

// ---------------------------------------------------------------------------
// Announcement visibility
// ---------------------------------------------------------------------------

/** Does an announcement (with given target) reach this user? */
function announcementReachesUser(user, ann) {
  if (user.role === 'super_admin') return true;
  const t = ann.target_type;
  const v = ann.target_value;

  if (t === 'all') return true;
  if (t === 'role') {
    if (v === 'staff') return ['teacher', 'admin', 'super_admin'].includes(user.role);
    return v === user.role;
  }
  if (t === 'class') {
    const classId = Number(v);
    if (user.role === 'student') return classIdForStudentUserId(user.id) === classId;
    if (user.role === 'teacher') return classIdsForTeacherUserId(user.id).includes(classId);
    if (user.role === 'parent') return classIdsForParentUserId(user.id).includes(classId);
    return ['admin', 'super_admin'].includes(user.role);
  }
  if (t === 'parents_of_class') {
    const classId = Number(v);
    return user.role === 'parent' && classIdsForParentUserId(user.id).includes(classId);
  }
  if (t === 'students') {
    if (user.role !== 'student') return ['admin', 'super_admin', 'teacher'].includes(user.role);
    const ids = safeIds(v);
    const s = get('SELECT id FROM students WHERE user_id = ?', [user.id]);
    return s ? ids.includes(s.id) : false;
  }
  if (t === 'users') {
    return safeIds(v).includes(user.id);
  }
  return false;
}

function safeIds(v) {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(Number);
    } catch { /* ignore */ }
  }
  return [];
}

module.exports = {
  canMessageUser,
  canCreateConversationType,
  isParticipant,
  canAccessDocument,
  canUpload,
  canDeleteDocument,
  announcementReachesUser,
  teachersForClass,
  classTeacherUserId,
  classIdsForTeacherUserId,
  classIdForStudentUserId,
  studentUserIdsForClass,
  parentUserIdsForClass,
  studentIdsForClass,
  classIdsForParentUserId,
  classConversationUserIds,
};
