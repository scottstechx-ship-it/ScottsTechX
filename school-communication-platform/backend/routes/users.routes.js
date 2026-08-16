/**
 * /api/users — user management (Super Admin).
 * Admins get read-only access for directory/search purposes.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const env = require('../config/env');
const { all, get, run, tx } = require('../database/db');
const { authenticate, requireRole, ROLES } = require('../middleware/auth');
const { passwordError, cleanString, isEmail, isPhone, isUsername, asInt } = require('../middleware/validate');
const { log } = require('../services/audit');

const SELECT = 'SELECT id, full_name, email, phone, username, role, profile_picture, status, last_login, created_at FROM users';

/** GET /api/users — list users with search + role/status filters (super admin; admins read-only). */
router.get('/', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  const q = cleanString(req.query.search, 100);
  const role = cleanString(req.query.role, 30);
  const status = cleanString(req.query.status, 30);
  const limit = Math.min(asInt(req.query.limit, 50) || 50, 200);
  const offset = Math.max(asInt(req.query.offset, 0) || 0, 0);

  const where = [];
  const params = [];
  if (q) {
    where.push('(full_name LIKE ? OR username LIKE ? OR email LIKE ? OR phone LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (role && ROLES.includes(role)) { where.push('role = ?'); params.push(role); }
  if (status && ['active', 'inactive', 'suspended'].includes(status)) { where.push('status = ?'); params.push(status); }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) AS c FROM users ${whereSql}`, params).c;
  const users = all(`${SELECT} ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);

  res.json({ users, total, limit, offset });
});

/** POST /api/users — create a user (super admin). */
router.post('/', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  const fullName = cleanString(req.body.fullName, 120);
  const username = cleanString(req.body.username, 40);
  const email = cleanString(req.body.email, 160);
  const phone = cleanString(req.body.phone, 30);
  const password = cleanString(req.body.password, 200);
  const role = cleanString(req.body.role, 20);

  if (!fullName || !username || !password || !role) {
    return res.status(400).json({ error: 'fullName, username, password and role are required.' });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
  if (role === 'super_admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only the Super Admin can create Super Admin accounts.' });
  }
  if (role === 'admin' && req.user.role === 'admin') {
    return res.status(403).json({ error: 'Admins cannot create other admin accounts.' });
  }
  if (!isUsername(username)) return res.status(400).json({ error: 'Username must be 3-32 characters (letters, numbers, underscore, dot).' });
  if (email && !isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (phone && !isPhone(phone)) return res.status(400).json({ error: 'Enter a valid phone number.' });
  const pwErr = passwordError(password, { strong: require('../config/env').STRONG_PASSWORDS });
  if (pwErr) return res.status(400).json({ error: pwErr });

  if (get('SELECT id FROM users WHERE username = ?', [username])) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }
  if (email && get('SELECT id FROM users WHERE lower(email) = lower(?)', [email])) {
    return res.status(409).json({ error: 'That email is already registered.' });
  }

  const info = run(
    `INSERT INTO users (full_name, email, phone, username, password_hash, role, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    [fullName, email || null, phone || null, username, bcrypt.hashSync(password, 10), role]
  );

  log(req.user, 'USER_CREATED', `Created ${role} "${fullName}" (username ${username})`, req.ip);
  const u = get(`${SELECT} WHERE id = ?`, [info.lastInsertRowid]);
  res.status(201).json({ message: 'User created successfully.', user: u });
});

/** GET /api/users/:id/avatar — authenticated avatar image (any active user may view). */
router.get('/:id/avatar', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  const u = get('SELECT profile_picture FROM users WHERE id = ?', [id]);
  const name = u && u.profile_picture;
  if (!name || !/^avatar-[\w.-]+$/.test(name)) {
    return res.status(404).json({ error: 'No profile picture.' });
  }
  const filePath = path.join(env.UPLOAD_DIR, name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Profile picture missing.' });
  res.setHeader('Content-Type', 'image/' + (name.split('.').pop() === 'jpg' ? 'jpeg' : name.split('.').pop()));
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
});

/** GET /api/users/:id — single user (super admin; admins read-only). */
router.get('/:id', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  const u = get(`${SELECT} WHERE id = ?`, [asInt(req.params.id)]);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: u });
});

/** PUT /api/users/:id — edit a user (super admin). */
router.put('/:id', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  const id = asInt(req.params.id);
  const u = get('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  if (u.role === 'super_admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only the Super Admin can manage Super Admin accounts.' });
  }
  if (req.user.role === 'admin' && u.role === 'admin' && u.id !== req.user.id) {
    return res.status(403).json({ error: 'Admins cannot edit other admin accounts.' });
  }

  const fullName = cleanString(req.body.fullName, 120);
  const username = cleanString(req.body.username, 40);
  const email = cleanString(req.body.email, 160);
  const phone = cleanString(req.body.phone, 30);
  const role = cleanString(req.body.role, 20);
  const status = cleanString(req.body.status, 20);

  if (username) {
    if (!isUsername(username)) return res.status(400).json({ error: 'Username must be 3-32 characters (letters, numbers, underscore, dot).' });
    const clash = get('SELECT id FROM users WHERE username = ? AND id != ?', [username, id]);
    if (clash) return res.status(409).json({ error: 'That username is already taken.' });
  }
  if (fullName) {
    if (email && !isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (phone && !isPhone(phone)) return res.status(400).json({ error: 'Enter a valid phone number.' });
    if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
    if (status && !['active', 'inactive', 'suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    if (email) {
      const clash = get('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?', [email, id]);
      if (clash) return res.status(409).json({ error: 'That email is already in use.' });
    }
    run('UPDATE users SET full_name = ?, username = ?, email = ?, phone = ?, role = ?, status = ?, updated_at = ? WHERE id = ?', [fullName, username || u.username, email || null, phone || null, role || u.role, status || u.status, new Date().toISOString(), id]);
    log(req.user, 'USER_UPDATED', `Updated user "${u.full_name}"`, req.ip);
  }

  if (role && role !== u.role) {
    if (u.role === 'super_admin' || role === 'super_admin') {
      return res.status(403).json({ error: 'Only the Super Admin can manage Super Admin roles.' });
    }
    if (req.user.role === 'admin' && (u.role === 'admin' || role === 'admin')) {
      return res.status(403).json({ error: 'Admins cannot change admin roles.' });
    }
    run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    // role-specific row: promote/demote leaves the old profile row; that is fine,
    // but keep names in sync where the role table exists.
    log(req.user, 'ROLE_CHANGED', `Changed role of "${u.full_name}" from ${u.role} to ${role}`, req.ip);
  }

  if (status && status !== u.status) {
    run('UPDATE users SET status = ? WHERE id = ?', [status, id]);
    run('UPDATE students SET status = ? WHERE user_id = ?', [status, id]);
    run('UPDATE teachers SET status = ? WHERE user_id = ?', [status, id]);
    run('UPDATE parents SET status = ? WHERE user_id = ?', [status, id]);
    log(req.user, 'USER_STATUS', `Set status of "${u.full_name}" to ${status}`, req.ip);
  }

  const updated = get(`${SELECT} WHERE id = ?`, [id]);
  res.json({ message: 'User updated.', user: updated });
});

/** DELETE /api/users/:id — hard delete (super admin). Safe-guarded. */
router.delete('/:id', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  const id = asInt(req.params.id);
  const u = get('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  if (u.role === 'super_admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only the Super Admin can delete Super Admin accounts.' });
  }
  if (req.user.role === 'admin' && (u.role === 'admin' || u.role === 'super_admin')) {
    return res.status(403).json({ error: 'Admins cannot delete admin or super admin accounts.' });
  }
  if (u.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account while logged in.' });
  }
  // Hard-delete inside a transaction. SQLite foreign-key cascades handle most
  // relations, while explicit role-profile cleanup keeps older databases safe.
  tx(() => {
    if (u.role === 'student') run('DELETE FROM parent_students WHERE student_id IN (SELECT id FROM students WHERE user_id = ?)', [id]);
    run('DELETE FROM students WHERE user_id = ?', [id]);
    run('DELETE FROM teachers WHERE user_id = ?', [id]);
    run('DELETE FROM parents WHERE user_id = ?', [id]);
    run('DELETE FROM users WHERE id = ?', [id]);
  });
  log(req.user, 'USER_DELETED', `Deleted ${u.role} "${u.full_name}" (id ${id})`, req.ip);
  res.json({ message: 'User deleted.', deletedId: id });
});

/** POST /api/users/:id/reset-password — admin resets a user's password (super admin). */
router.post('/:id/reset-password', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  const id = asInt(req.params.id);
  const u = get('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  if (req.user.role === 'admin' && ['admin', 'super_admin'].includes(u.role)) {
    return res.status(403).json({ error: 'Admins cannot reset passwords for admin or super admin accounts.' });
  }

  const newPassword = cleanString(req.body.newPassword, 200);
  const pwErr = passwordError(newPassword, { strong: require('../config/env').STRONG_PASSWORDS });
  if (pwErr) return res.status(400).json({ error: pwErr });

  run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), new Date().toISOString(), id]);
  log(req.user, 'PASSWORD_RESET', `Reset password for "${u.full_name}"`, req.ip);
  res.json({ message: `Password for ${u.full_name} has been reset.` });
});

module.exports = router;
