/**
 * /api/parents — parent dashboard endpoints + parent management for admins.
 *
 * Parent-facing routes resolve "who is this parent allowed to contact" on the
 * backend: Child -> Class -> Class teacher / subject teachers -> communication.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { all, get, run, tx } = require('../database/db');
const { authenticate, requireRole, requireStaffAdmin } = require('../middleware/auth');
const { cleanString, isEmail, isPhone, asInt, passwordError } = require('../middleware/validate');
const { log } = require('../services/audit');
const { notify } = require('../services/notify');
const { sendEmail } = require('../services/mailer');
const {
  classIdsForParentUserId,
  classIdsForTeacherUserId,
  teachersForClass,
  classTeacherUserId,
  parentUserIdsForClass,
} = require('../services/permissions');

const { canAccessDocument } = require('../services/permissions');

function parentByUserId(userId) {
  return get('SELECT * FROM parents WHERE user_id = ?', [userId]);
}

/** GET /api/parents/profile */
router.get('/profile', authenticate, requireRole('parent'), (req, res) => {
  const p = parentByUserId(req.user.id);
  if (!p) return res.status(404).json({ error: 'Parent profile not found.' });
  res.json({ profile: p });
});

/** GET /api/parents/children — all linked children with class + class teacher. */
router.get('/children', authenticate, requireRole('parent'), (req, res) => {
  const p = parentByUserId(req.user.id);
  if (!p) return res.status(404).json({ error: 'Parent profile not found.' });
  const children = all(
    `SELECT s.id, s.student_code, s.full_name, s.class_id, c.name AS class_name, c.stream,
            c.academic_year, s.status,
            (SELECT t.full_name FROM teachers t WHERE t.id = c.class_teacher_id) AS class_teacher_name,
            (SELECT t.user_id FROM teachers t WHERE t.id = c.class_teacher_id) AS class_teacher_user_id
     FROM parent_students ps
     JOIN students s ON s.id = ps.student_id
     LEFT JOIN classes c ON c.id = s.class_id
     WHERE ps.parent_id = ? ORDER BY s.full_name`, [p.id]
  );
  res.json({ children });
});

/** GET /api/parents/children/:id — single child details (access verified). */
router.get('/children/:id', authenticate, requireRole('parent'), (req, res) => {
  const p = parentByUserId(req.user.id);
  const childId = asInt(req.params.id);
  const link = get('SELECT 1 FROM parent_students WHERE parent_id = ? AND student_id = ?', [p.id, childId]);
  if (!link) return res.status(403).json({ error: 'You are not linked to this child.' });
  const child = get(
    `SELECT s.*, c.name AS class_name, c.stream, c.academic_year,
            (SELECT t.full_name FROM teachers t WHERE t.id = c.class_teacher_id) AS class_teacher_name,
            (SELECT t.phone FROM teachers t WHERE t.id = c.class_teacher_id) AS class_teacher_phone
     FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`, [childId]
  );
  if (!child) return res.status(404).json({ error: 'Child not found.' });
  res.json({ child });
});

/** GET /api/parents/contacts — who this parent may message, grouped by child. */
router.get('/contacts', authenticate, requireRole('parent'), (req, res) => {
  const p = parentByUserId(req.user.id);
  const children = all(
    `SELECT s.id, s.full_name, s.class_id, c.name AS class_name, c.stream
     FROM parent_students ps JOIN students s ON s.id = ps.student_id
     LEFT JOIN classes c ON c.id = s.class_id
     WHERE ps.parent_id = ?`, [p.id]
  );

  const groups = [];
  for (const child of children) {
    if (!child.class_id) continue;
    const teachers = teachersForClass(child.class_id)
      .map((t) => get(
        'SELECT id, full_name, role FROM users WHERE id = ?', [t.userId]
      ))
      .filter(Boolean)
      .map((u) => ({ userId: u.id, name: u.full_name, role: u.role }));
    const ctUserId = classTeacherUserId(child.class_id);
    groups.push({
      childId: child.id,
      childName: child.full_name,
      className: child.class_name ? `${child.class_name}${child.stream ? ' ' + child.stream : ''}` : 'Unassigned',
      classTeacherUserId: ctUserId,
      teachers,
    });
  }

  const admins = all(
    "SELECT id, full_name FROM users WHERE role = 'admin' AND status = 'active'"
  ).map((a) => ({ userId: a.id, name: a.full_name, role: 'admin' }));

  res.json({ groups, administration: admins });
});

/** GET /api/parents/documents — documents shared with the parent or their children's classes. */
router.get('/documents', authenticate, requireRole('parent'), (req, res) => {
  const q = cleanString(req.query.search, 100);
  const classId = asInt(req.query.classId);
  const p = parentByUserId(req.user.id);
  const myClassIds = classIdsForParentUserId(req.user.id);

  const where = [];
  const params = [];
  where.push('d.uploaded_by IS NOT NULL');
  if (classId) {
    if (!myClassIds.includes(classId)) return res.status(403).json({ error: 'You do not have access to that class.' });
    where.push('(da.target_type = \'class\' AND da.target_id = ?)');
    params.push(classId);
  } else {
    const grants = [];
    grants.push("da.target_type = 'role' AND da.target_id = 'parent'");
    grants.push("da.target_type = 'all'");
    if (myClassIds.length) {
      grants.push(`(da.target_type = 'class' AND da.target_id IN (${myClassIds.map(() => '?').join(',')}))`);
      params.push(...myClassIds);
    }
    grants.push('da.target_type = \'user\' AND da.target_id = ?');
    params.push(String(req.user.id));
    where.push(`(${grants.join(' OR ')})`);
  }
  if (q) { where.push('(d.name LIKE ? OR d.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

  const docs = all(
    `SELECT DISTINCT d.*, u.full_name AS uploader_name
     FROM documents d
     JOIN document_access da ON da.document_id = d.id
     LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE ${where.join(' AND ')}
     ORDER BY d.created_at DESC LIMIT 200`, params
  );
  res.json({ documents: docs });
});

/** GET /api/parents/announcements — announcements for the parent (school-wide + their children's classes). */
router.get('/announcements', authenticate, requireRole('parent'), (req, res) => {
  const p = parentByUserId(req.user.id);
  const myClassIds = classIdsForParentUserId(req.user.id);

  const announcements = all(
    `SELECT a.*, u.full_name AS sender_name,
            (SELECT 1 FROM announcement_reads ar WHERE ar.announcement_id = a.id AND ar.user_id = ?) AS is_read
     FROM announcements a LEFT JOIN users u ON u.id = a.sender_id
     ORDER BY a.important DESC, a.created_at DESC LIMIT 100`, [req.user.id]
  ).filter((a) => {
    if (a.target_type === 'all') return true;
    if (a.target_type === 'role' && a.target_value === 'parent') return true;
    if (a.target_type === 'class' && myClassIds.includes(Number(a.target_value))) return true;
    if (a.target_type === 'parents_of_class' && myClassIds.includes(Number(a.target_value))) return true;
    if (['super_admin', 'admin'].includes(req.user.role)) return true;
    return false;
  });

  res.json({ announcements });
});

/** GET /api/parents/notifications — own notifications (all roles can use /api/notifications too). */
router.get('/notifications', authenticate, requireRole('parent'), (req, res) => {
  const items = all(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
    [req.user.id]
  );
  res.json({ notifications: items });
});

/** PUT /api/parents/notifications/:id/read */
router.put('/notifications/:id/read', authenticate, requireRole('parent'), (req, res) => {
  run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [asInt(req.params.id), req.user.id]);
  res.json({ message: 'Notification marked as read.' });
});

// ===========================================================================
// Admin management of parents
// ===========================================================================

/** GET /api/parents (admin list) */
router.get('/', authenticate, requireStaffAdmin, (req, res) => {
  const q = cleanString(req.query.search, 100);
  const limit = Math.min(asInt(req.query.limit, 100) || 100, 500);
  const offset = Math.max(asInt(req.query.offset, 0) || 0, 0);
  const where = [];
  const params = [];
  if (q) {
    where.push('(p.full_name LIKE ? OR p.phone LIKE ? OR p.email LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) AS c FROM parents p ${whereSql}`, params).c;
  const parents = all(`SELECT p.*, u.username, u.status AS user_status FROM parents p LEFT JOIN users u ON u.id = p.user_id ${whereSql} ORDER BY p.full_name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  for (const par of parents) {
    par.children = all(
      `SELECT s.id, s.full_name, s.student_code, c.name AS class_name, c.stream
       FROM parent_students ps JOIN students s ON s.id = ps.student_id
       LEFT JOIN classes c ON c.id = s.class_id WHERE ps.parent_id = ?`, [par.id]
    );
  }
  res.json({ parents, total, limit, offset });
});

/** POST /api/parents — create a parent (+ account + optional child links). */
router.post('/', authenticate, requireStaffAdmin, (req, res) => {
  const fullName = cleanString(req.body.fullName, 120);
  const parentCode = cleanString(req.body.parentCode, 40);
  const phone = cleanString(req.body.phone, 30);
  const email = cleanString(req.body.email, 160);
  const address = cleanString(req.body.address, 300);
  const occupation = cleanString(req.body.occupation, 120);
  const username = cleanString(req.body.username, 40);
  const password = cleanString(req.body.password, 200);
  const childIds = Array.isArray(req.body.childIds) ? req.body.childIds.map(asInt).filter(Boolean) : [];

  if (!fullName || !parentCode) return res.status(400).json({ error: 'fullName and parentCode are required.' });
  if (email && !isEmail(email)) return res.status(400).json({ error: 'Invalid email.' });
  if (phone && !isPhone(phone)) return res.status(400).json({ error: 'Invalid phone.' });
  if (get('SELECT id FROM parents WHERE parent_code = ?', [parentCode])) {
    return res.status(409).json({ error: 'A parent with that code already exists.' });
  }

  const parentId = tx(() => {
    let userId = null;
    if (username && password) {
      if (get('SELECT id FROM users WHERE username = ?', [username])) { const e = new Error('That username is already taken.'); e.status = 409; throw e; }
      if (email && get('SELECT id FROM users WHERE lower(email) = lower(?)', [email])) { const e = new Error('That email is already registered.'); e.status = 409; throw e; }
      const pwErr = passwordError(password, { strong: require('../config/env').STRONG_PASSWORDS });
      if (pwErr) { const e = new Error(pwErr); e.status = 400; throw e; }
      const info = run(
        `INSERT INTO users (full_name, email, phone, username, password_hash, role, status)
         VALUES (?, ?, ?, ?, ?, 'parent', 'active')`,
        [fullName, email || null, phone || null, username, bcrypt.hashSync(password, 10)]
      );
      userId = info.lastInsertRowid;
    }
    const info = run(
      `INSERT INTO parents (user_id, parent_code, full_name, phone, email, address, occupation, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [userId, parentCode, fullName, phone || null, email || null, address || null, occupation || null]
    );
    const pid = info.lastInsertRowid;
    for (const cid of childIds) {
      if (get('SELECT id FROM students WHERE id = ?', [cid])) {
        run('INSERT OR IGNORE INTO parent_students (parent_id, student_id) VALUES (?, ?)', [pid, cid]);
      }
    }
    return pid;
  });

  log(req.user, 'PARENT_CREATED', `Created parent "${fullName}"`, req.ip);
  res.status(201).json({ message: 'Parent created successfully.', parent: get('SELECT * FROM parents WHERE id = ?', [parentId]) });
});

/** GET /api/parents/:id (admin view) */
/** GET /api/parents/pending — registrations awaiting approval (admin). */
router.get('/pending', authenticate, requireStaffAdmin, (req, res) => {
  const pending = all(
    `SELECT p.*, u.username, u.email AS user_email, u.registration_status, u.email_verified, u.created_at AS registered_at
     FROM parents p JOIN users u ON u.id = p.user_id
     WHERE u.registration_status = 'pending'
     ORDER BY u.created_at DESC`
  );
  res.json({ pending });
});

router.get('/:id', authenticate, requireStaffAdmin, (req, res) => {
  const p = get('SELECT p.*, u.username, u.status AS user_status FROM parents p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?', [asInt(req.params.id)]);
  if (!p) return res.status(404).json({ error: 'Parent not found.' });
  p.children = all(
    `SELECT s.id, s.full_name, s.student_code, s.class_id, c.name AS class_name, c.stream, ps.relationship
     FROM parent_students ps JOIN students s ON s.id = ps.student_id
     LEFT JOIN classes c ON c.id = s.class_id WHERE ps.parent_id = ?`, [p.id]
  );
  res.json({ parent: p });
});

/** PUT /api/parents/:id */
router.put('/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const existing = get('SELECT * FROM parents WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Parent not found.' });

  const fullName = cleanString(req.body.fullName, 120) || existing.full_name;
  const phone = cleanString(req.body.phone, 30) || existing.phone;
  const email = cleanString(req.body.email, 160) || existing.email;
  const address = cleanString(req.body.address, 300) || existing.address;
  const occupation = cleanString(req.body.occupation, 120) || existing.occupation;
  const status = cleanString(req.body.status, 20) || existing.status;
  const childIds = Array.isArray(req.body.childIds) ? req.body.childIds.map(asInt).filter(Boolean) : null;
  const userId = req.body.userId ? asInt(req.body.userId) : null;

  if (email && !isEmail(email)) return res.status(400).json({ error: 'Invalid email.' });
  if (phone && !isPhone(phone)) return res.status(400).json({ error: 'Invalid phone.' });
  if (status && !['active', 'inactive', 'suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  if (userId !== null && !get('SELECT id FROM users WHERE id = ?', [userId])) {
    return res.status(400).json({ error: 'Invalid userId.' });
  }

  tx(() => {
    run('UPDATE parents SET full_name = ?, phone = ?, email = ?, address = ?, occupation = ?, status = ?, user_id = ? WHERE id = ?',
      [fullName, phone || null, email || null, address || null, occupation || null, status, userId, id]);
    if (existing.user_id) run('UPDATE users SET full_name = ?, email = ?, phone = ?, status = ? WHERE id = ?', [fullName, email || null, phone || null, status, existing.user_id]);
    if (userId && !existing.user_id) run('UPDATE users SET full_name = ?, email = ?, phone = ?, status = ? WHERE id = ?', [fullName, email || null, phone || null, 'active', userId]);
    if (childIds) {
      run('DELETE FROM parent_students WHERE parent_id = ?', [id]);
      for (const cid of childIds) {
        if (get('SELECT id FROM students WHERE id = ?', [cid])) {
          run('INSERT OR IGNORE INTO parent_students (parent_id, student_id) VALUES (?, ?)', [id, cid]);
        }
      }
    }
  });
  log(req.user, 'PARENT_UPDATED', `Updated parent "${fullName}"`, req.ip);
  res.json({ message: 'Parent updated.' });
});

/** DELETE /api/parents/:id */
router.delete('/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const p = get('SELECT * FROM parents WHERE id = ?', [id]);
  if (!p) return res.status(404).json({ error: 'Parent not found.' });
  tx(() => {
    run('DELETE FROM parent_students WHERE parent_id = ?', [id]);
    run('DELETE FROM parents WHERE id = ?', [id]);
    if (p.user_id) run('DELETE FROM users WHERE id = ?', [p.user_id]);
  });
  log(req.user, 'PARENT_DELETED', `Deleted parent "${p.full_name}"`, req.ip);
  res.json({ message: 'Parent deleted.' });
});

module.exports = router;
module.exports.parentByUserId = parentByUserId;
module.exports.parentUserIdsForClass = parentUserIdsForClass;

// ===========================================================================
// Parent registration approval workflow (admin)
// ===========================================================================

/** POST /api/parents/:id/approve — approve a registration (admin). */
router.post('/:id/approve', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const p = get('SELECT * FROM parents WHERE id = ?', [id]);
  if (!p) return res.status(404).json({ error: 'Parent not found.' });
  const u = get('SELECT * FROM users WHERE id = ?', [p.user_id]);
  if (!u) return res.status(404).json({ error: 'Parent account not found.' });
  if (u.registration_status === 'rejected') {
    return res.status(400).json({ error: 'This registration was previously rejected. Edit the parent to approve it.' });
  }
  run('UPDATE users SET registration_status = \'approved\', status = \'active\' WHERE id = ?', [u.id]);
  notify(u.id, 'account', 'Your registration was approved',
    'Welcome! You can now log in with your parent account.', '/');
  log(req.user, 'PARENT_APPROVED', `Approved parent registration for ${p.full_name}`, req.ip);
  sendEmail({
    to: u.email,
    subject: 'Your parent account was approved',
    html: `<p>Hello ${p.full_name},</p><p>Your parent registration has been approved. You can now log in to view your children's school information.</p><p><a href="${require('../config/env').FRONTEND_URL}/login.html">Log in here</a></p>`,
  }).catch(() => {});
  res.json({ message: `Parent ${p.full_name} approved. They can now log in.` });
});

/** POST /api/parents/:id/reject — reject a registration (admin). */
router.post('/:id/reject', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const p = get('SELECT * FROM parents WHERE id = ?', [id]);
  if (!p) return res.status(404).json({ error: 'Parent not found.' });
  const u = get('SELECT * FROM users WHERE id = ?', [p.user_id]);
  if (!u) return res.status(404).json({ error: 'Parent account not found.' });
  run('UPDATE users SET registration_status = \'rejected\' WHERE id = ?', [u.id]);
  notify(u.id, 'account', 'Your registration was not approved',
    'Please contact the school administration for assistance.', '/');
  log(req.user, 'PARENT_REJECTED', `Rejected parent registration for ${p.full_name}`, req.ip);
  sendEmail({
    to: u.email,
    subject: 'Your parent registration',
    html: `<p>Hello ${p.full_name},</p><p>Your parent registration was not approved. Please contact the school administration if you believe this is a mistake.</p>`,
  }).catch(() => {});
  res.json({ message: `Parent ${p.full_name} rejected.` });
});
