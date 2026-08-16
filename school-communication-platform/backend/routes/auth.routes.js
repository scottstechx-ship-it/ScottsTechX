/**
 * /api/auth — login, logout, current user, password & profile management.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { get, run, tx, all } = require('../database/db');
const env = require('../config/env');
const { authenticate, signToken } = require('../middleware/auth');
const { passwordError, cleanString, isEmail, isPhone } = require('../middleware/validate');
const { upload, handleUploadErrors } = require('../middleware/upload');
const { log } = require('../services/audit');
const { sendEmail } = require('../services/mailer');

/** Public user shape (never exposes password hash). */
function publicUser(u) {
  return {
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    phone: u.phone,
    username: u.username,
    role: u.role,
    profilePicture: u.profile_picture,
    status: u.status,
    lastLogin: u.last_login,
    createdAt: u.created_at,
    registrationStatus: u.registration_status || 'approved',
    emailVerified: !!u.email_verified,
    mustChangePassword: !!u.must_change_password,
  };
}

/** GET /api/auth/me — current user + role profile. */
router.get('/me', authenticate, (req, res) => {
  const u = get(
    'SELECT id, full_name, email, phone, username, role, profile_picture, status, last_login, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!u) return res.status(401).json({ error: 'Account not found.' });

  let profile = null;
  if (u.role === 'student') {
    profile = get('SELECT * FROM students WHERE user_id = ?', [u.id]);
    if (profile && profile.class_id) {
      profile.class_name = get('SELECT name, stream FROM classes WHERE id = ?', [profile.class_id]);
      const ct = get(
        `SELECT t.full_name, t.user_id FROM classes c LEFT JOIN teachers t ON t.id = c.class_teacher_id WHERE c.id = ?`,
        [profile.class_id]
      );
      profile.class_teacher = ct;
    }
  } else if (u.role === 'teacher') {
    profile = get('SELECT * FROM teachers WHERE user_id = ?', [u.id]);
    if (profile) {
      profile.classes = require('../database/db').all(
        `SELECT c.id, c.name, c.stream, c.academic_year, tc.subject
         FROM teacher_classes tc JOIN classes c ON c.id = tc.class_id
         WHERE tc.teacher_id = ?`, [profile.id]
      );
      try { profile.subjects = JSON.parse(profile.subjects || '[]'); } catch { profile.subjects = []; }
    }
  } else if (u.role === 'parent') {
    profile = get('SELECT * FROM parents WHERE user_id = ?', [u.id]);
    if (profile) {
      profile.children = require('../database/db').all(
        `SELECT s.id, s.student_code, s.full_name, s.class_id, c.name AS class_name, c.stream,
                (SELECT t.full_name FROM teachers t WHERE t.id = c.class_teacher_id) AS class_teacher,
                s.status
         FROM parent_students ps
         JOIN students s ON s.id = ps.student_id
         LEFT JOIN classes c ON c.id = s.class_id
         WHERE ps.parent_id = ?`, [profile.id]
      );
    }
  }

  // preferences (theme, notification toggles)
  const prefs = get('SELECT * FROM user_preferences WHERE user_id = ?', [u.id]);
  const preferences = prefs ? {
    theme: prefs.theme || 'system',
    notifPrefs: safeJson(prefs.notif_prefs, {}),
    communicationPrefs: safeJson(prefs.communication_prefs, {}),
    dashboardPrefs: safeJson(prefs.dashboard_prefs, {}),
  } : { theme: 'system', notifPrefs: {}, communicationPrefs: {}, dashboardPrefs: {} };

  res.json({ user: publicUser(u), profile, preferences });
});

/** POST /api/auth/login */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const ident = cleanString(username, 100);
  const pw = cleanString(password, 200);

  if (!ident || !pw) {
    return res.status(400).json({ error: 'Enter your username or email and password.' });
  }

  const u = get(
    'SELECT * FROM users WHERE username = ? OR lower(email) = lower(?)',
    [ident, ident]
  );
  if (!u || !bcrypt.compareSync(pw, u.password_hash)) {
    log(null, 'LOGIN_FAILED', `Failed login attempt for "${ident}"`, req.ip);
    return res.status(401).json({ error: 'Incorrect username/email or password.' });
  }
  if (u.status !== 'active') {
    if (u.role === 'parent' && u.registration_status === 'pending') {
      return res.status(403).json({ error: 'Your registration is awaiting admin approval. You will be able to log in once it is approved.' });
    }
    if (u.role === 'parent' && u.registration_status === 'rejected') {
      return res.status(403).json({ error: 'Your registration was not approved. Please contact the school administration.' });
    }
    return res.status(403).json({ error: 'Your account is not active. Contact the school administrator.' });
  }
  if (u.role === 'parent' && u.registration_status === 'pending') {
    return res.status(403).json({ error: 'Your registration is awaiting admin approval. You will be able to log in once it is approved.' });
  }
  if (u.role === 'parent' && u.registration_status === 'rejected') {
    return res.status(403).json({ error: 'Your registration was not approved. Please contact the school administration.' });
  }
  if (u.role === 'parent' && !u.email_verified) {
    return res.status(403).json({ error: 'Please verify your email address first. Check your inbox for the verification link (or request a new one).' });
  }

  const now = new Date().toISOString();
  run('UPDATE users SET last_login = ? WHERE id = ?', [now, u.id]);
  log(u, 'LOGIN', `${u.role} ${u.full_name} logged in`, req.ip);

  const token = signToken(u);
  res.json({ token, user: publicUser(u) });
});

/** POST /api/auth/logout — stateless JWT; record the logout in the audit log. */
router.post('/logout', authenticate, (req, res) => {
  log(req.user, 'LOGOUT', `${req.user.full_name} logged out`, req.ip);
  res.json({ message: 'Logged out successfully.' });
});

/** PUT /api/auth/change-password */
router.put('/change-password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  const u = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!u || !bcrypt.compareSync(currentPassword, u.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  const strong = require('../config/env').STRONG_PASSWORDS;
  const pwErr = passwordError(newPassword, { strong });
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from the current password.' });
  }

  run('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?', [
    bcrypt.hashSync(newPassword, 10),
    new Date().toISOString(),
    u.id,
  ]);
  log(req.user, 'PASSWORD_CHANGE', `${u.full_name} changed their password`, req.ip);
  res.json({ message: 'Password updated successfully.' });
});

/** PUT /api/auth/profile — update own basic details (name, phone, email). */
router.put('/profile', authenticate, (req, res) => {
  const fullName = cleanString(req.body.fullName, 120);
  const phone = cleanString(req.body.phone, 30);
  const email = cleanString(req.body.email, 160);

  if (!fullName) return res.status(400).json({ error: 'Full name is required.' });
  if (email && !isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (phone && !isPhone(phone)) return res.status(400).json({ error: 'Enter a valid phone number.' });

  if (email) {
    const clash = get('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?', [email, req.user.id]);
    if (clash) return res.status(400).json({ error: 'That email is already in use by another account.' });
  }

  run('UPDATE users SET full_name = ?, phone = ?, email = ?, updated_at = ? WHERE id = ?', [
    fullName, phone || null, email || null, new Date().toISOString(), req.user.id,
  ]);
  // Mirror into role tables where the name is duplicated.
  if (req.user.role === 'student') run('UPDATE students SET full_name = ? WHERE user_id = ?', [fullName, req.user.id]);
  if (req.user.role === 'teacher') run('UPDATE teachers SET full_name = ?, phone = ?, email = ? WHERE user_id = ?', [fullName, phone || null, email || null, req.user.id]);
  if (req.user.role === 'parent') run('UPDATE parents SET full_name = ?, phone = ?, email = ? WHERE user_id = ?', [fullName, phone || null, email || null, req.user.id]);

  log(req.user, 'PROFILE_UPDATE', `${fullName} updated their profile`, req.ip);
  const u = get('SELECT id, full_name, email, phone, username, role, profile_picture, status, last_login, created_at FROM users WHERE id = ?', [req.user.id]);
  res.json({ message: 'Profile updated.', user: publicUser(u) });
});

module.exports = router;

// ---------------------------------------------------------------------------
// Self-service password reset ("forgot password")
// ---------------------------------------------------------------------------

/** POST /api/auth/forgot-password — request a reset link for an email address. */
router.post('/forgot-password', (req, res) => {
  const email = cleanString((req.body || {}).email, 160).toLowerCase();
  if (!isEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  const u = get('SELECT * FROM users WHERE lower(email) = ?', [email]);
  // Always respond the same way to avoid account enumeration.
  if (!u) {
    return res.json({ message: 'If that email is registered, a reset link has been sent.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  run(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [u.id, hash, new Date(Date.now() + 3600 * 1000).toISOString()]
  );
  const link = `${env.FRONTEND_URL}/reset-password.html?token=${token}`;
  log(u, 'PASSWORD_RESET_REQUESTED', `Password reset link requested for ${u.full_name}`, req.ip);

  sendEmail({
    to: u.email,
    subject: 'Reset your password',
    html: `<p>Hello ${u.full_name},</p><p>You asked to reset your password.</p>
      <p><a href="${link}">Click here to choose a new password</a> (valid for 1 hour).</p>
      <p>If you did not request this, you can safely ignore this email.</p>`,
  }).then((sent) => {
    // In development without SMTP, surface the link so the flow stays usable.
    const devLink = !sent.sent && env.NODE_ENV !== 'production' ? link : undefined;
    res.json({
      message: sent.sent
        ? 'A reset link has been sent to your email.'
        : 'If that email is registered, a reset link has been sent.',
      devLink,
    });
  }).catch(() => {
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  });
});

/** POST /api/auth/reset-password — set a new password using a reset token. */
router.post('/reset-password', (req, res) => {
  const token = cleanString((req.body || {}).token, 300);
  const newPassword = cleanString((req.body || {}).newPassword, 200);
  if (!token) return res.status(400).json({ error: 'Reset token is required.' });
  const pwErr = passwordError(newPassword, { strong: env.STRONG_PASSWORDS });
  if (pwErr) return res.status(400).json({ error: pwErr });

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const row = get('SELECT * FROM password_resets WHERE token_hash = ? AND used = 0', [hash]);
  if (!row) return res.status(400).json({ error: 'This reset link is invalid or has already been used.' });
  if (new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This reset link has expired. Request a new one.' });
  }
  const u = get('SELECT * FROM users WHERE id = ?', [row.user_id]);
  if (!u) return res.status(400).json({ error: 'Account not found.' });

  tx(() => {
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), new Date().toISOString(), u.id]);
    run('UPDATE password_resets SET used = 1 WHERE id = ?', [row.id]);
    run('DELETE FROM password_resets WHERE user_id = ? AND id != ?', [u.id, row.id]);
  });
  log(u, 'PASSWORD_RESET', `${u.full_name} reset their password via email link`, req.ip);
  sendEmail({ to: u.email, subject: 'Your password was reset', html: `<p>Hi ${u.full_name}, your password was successfully reset.</p>` }).catch(() => {});
  res.json({ message: 'Your password has been reset. You can now log in.' });
});

// ---------------------------------------------------------------------------
// Profile picture
// ---------------------------------------------------------------------------

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

/** POST /api/auth/profile-picture — upload your avatar (image only, max 2MB). */
router.post('/profile-picture', authenticate, upload.single('file'), handleUploadErrors, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an image to upload.' });
  if (!AVATAR_TYPES.includes(req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Only JPG, PNG, GIF, WEBP or BMP images are allowed.' });
  }
  const old = get('SELECT profile_picture FROM users WHERE id = ?', [req.user.id]).profile_picture;
  const filename = 'avatar-' + path.basename(req.file.path);
  fs.renameSync(req.file.path, path.join(env.UPLOAD_DIR, filename));
  if (old && /^avatar-[\w.-]+$/.test(old)) {
    try { fs.unlinkSync(path.join(env.UPLOAD_DIR, old)); } catch { /* ignore */ }
  }
  run('UPDATE users SET profile_picture = ? WHERE id = ?', [filename, req.user.id]);
  log(req.user, 'PROFILE_PICTURE', `${req.user.full_name} updated their profile picture`, req.ip);
  const u = get('SELECT id, full_name, email, phone, username, role, profile_picture, status, last_login, created_at FROM users WHERE id = ?', [req.user.id]);
  res.json({ message: 'Profile picture updated.', user: publicUser(u) });
});

// ---------------------------------------------------------------------------
// User preferences (theme, notification toggles, dashboard preferences)
// ---------------------------------------------------------------------------

/** GET /api/auth/preferences */
router.get('/preferences', authenticate, (req, res) => {
  const row = get('SELECT * FROM user_preferences WHERE user_id = ?', [req.user.id]);
  res.json({
    preferences: row ? {
      theme: row.theme || 'system',
      notifPrefs: safeJson(row.notif_prefs, {}),
      communicationPrefs: safeJson(row.communication_prefs, {}),
      dashboardPrefs: safeJson(row.dashboard_prefs, {}),
    } : { theme: 'system', notifPrefs: {}, communicationPrefs: {}, dashboardPrefs: {} },
  });
});

/** PUT /api/auth/preferences — update any subset. */
router.put('/preferences', authenticate, (req, res) => {
  const body = req.body || {};
  const existing = get('SELECT * FROM user_preferences WHERE user_id = ?', [req.user.id]);
  const cur = existing || { theme: 'system', notif_prefs: '{}', communication_prefs: '{}', dashboard_prefs: '{}' };

  const theme = ['light', 'dark', 'system'].includes(body.theme) ? body.theme : cur.theme;
  const notifPrefs = body.notifPrefs !== undefined && typeof body.notifPrefs === 'object' ? { ...safeJson(cur.notif_prefs, {}), ...body.notifPrefs } : safeJson(cur.notif_prefs, {});
  const communicationPrefs = body.communicationPrefs !== undefined && typeof body.communicationPrefs === 'object' ? { ...safeJson(cur.communication_prefs, {}), ...body.communicationPrefs } : safeJson(cur.communication_prefs, {});
  const dashboardPrefs = body.dashboardPrefs !== undefined && typeof body.dashboardPrefs === 'object' ? { ...safeJson(cur.dashboard_prefs, {}), ...body.dashboardPrefs } : safeJson(cur.dashboard_prefs, {});

  run(
    `INSERT INTO user_preferences (user_id, theme, notif_prefs, communication_prefs, dashboard_prefs, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, notif_prefs = excluded.notif_prefs,
       communication_prefs = excluded.communication_prefs, dashboard_prefs = excluded.dashboard_prefs, updated_at = excluded.updated_at`,
    [req.user.id, theme, JSON.stringify(notifPrefs), JSON.stringify(communicationPrefs), JSON.stringify(dashboardPrefs), new Date().toISOString()]
  );
  log(req.user, 'PREFERENCES_UPDATED', `${req.user.full_name} updated their preferences (theme: ${theme})`, req.ip);
  res.json({ message: 'Preferences saved.', preferences: { theme, notifPrefs, communicationPrefs, dashboardPrefs } });
});

function safeJson(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Parent self-registration + email verification + forced password change
// ---------------------------------------------------------------------------

const crypto2 = require('crypto');
const { notifyMany, notify } = require('../services/notify');
const { readSettings } = require('../services/settingsService');

function createVerificationToken(userId) {
  const token = crypto2.randomBytes(24).toString('hex');
  const hash = crypto2.createHash('sha256').update(token).digest('hex');
  run(
    'INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, hash, new Date(Date.now() + 24 * 3600 * 1000).toISOString()]
  );
  return token;
}

/**
 * POST /api/auth/register — parent self-registration.
 * Creates a parent account + profile, marks it "pending approval" and emails a
 * verification link. The parent can only log in after email verification AND
 * admin approval.
 */
router.post('/register', (req, res) => {
  const fullName = cleanString((req.body || {}).fullName, 120);
  const email = cleanString((req.body || {}).email, 160).toLowerCase();
  const phone = cleanString((req.body || {}).phone, 30);
  const password = cleanString((req.body || {}).password, 200);
  const address = cleanString((req.body || {}).address, 300);

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Full name, email and password are required.' });
  }
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (phone && !isPhone(phone)) return res.status(400).json({ error: 'Enter a valid phone number.' });
  const pwErr = passwordError(password, { strong: env.STRONG_PASSWORDS });
  if (pwErr) return res.status(400).json({ error: pwErr });

  if (get('SELECT id FROM users WHERE lower(email) = lower(?)', [email])) {
    // Do not reveal whether the account exists; behave as success.
    return res.status(200).json({ message: 'Registration received. If your email is not already registered, a verification link has been sent to it.' });
  }

  const userId = tx(() => {
    const info = run(
      `INSERT INTO users (full_name, email, phone, username, password_hash, role, status, registration_status, email_verified, must_change_password)
       VALUES (?, ?, ?, ?, ?, 'parent', 'active', 'pending', 0, 0)`,
      [fullName, email, phone || null, 'parent_' + Date.now().toString(36), bcrypt.hashSync(password, 10)]
    );
    // unique username: parent_<timestamp>_<random>
    const username = 'parent_' + Date.now().toString(36) + '_' + crypto2.randomBytes(3).toString('hex');
    run('UPDATE users SET username = ? WHERE id = ?', [username, info.lastInsertRowid]);
    run(
      `INSERT INTO parents (user_id, parent_code, full_name, phone, email, address, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [info.lastInsertRowid, 'PAR-' + Date.now().toString(36).toUpperCase(), fullName, phone || null, email, address || null]
    );
    return info.lastInsertRowid;
  });

  // send verification email
  const token = createVerificationToken(userId);
  const verifyLink = `${env.FRONTEND_URL}/verify-email.html?token=${token}`;
  sendEmail({
    to: email,
    subject: 'Verify your email — school parent registration',
    html: `<p>Hello ${fullName},</p><p>Thank you for registering as a parent. Please verify your email address:</p>
      <p><a href="${verifyLink}">Verify my email</a> (valid for 24 hours).</p>
      <p>After verification, the school administration will review and approve your account before you can log in.</p>`,
  }).then((sent) => {
    // Notify admins there is a registration to approve.
    const admins = all("SELECT id FROM users WHERE role IN ('admin','super_admin') AND status = 'active'").map((r) => r.id);
    notifyMany(admins, 'account', 'New parent registration', `${fullName} registered and is awaiting approval.`, '/parents');

    res.json({
      message: 'Registration received. Please verify your email to continue.',
      devVerifyLink: (!sent.sent && env.NODE_ENV !== 'production') ? verifyLink : undefined,
    });
  }).catch(() => {
    res.json({ message: 'Registration received. Please verify your email to continue.' });
  });
});

/** POST /api/auth/verify-email — verify with the emailed token. */
router.post('/verify-email', (req, res) => {
  const token = cleanString((req.body || {}).token, 300);
  if (!token) return res.status(400).json({ error: 'Verification token is required.' });
  const hash = crypto2.createHash('sha256').update(token).digest('hex');
  const row = get('SELECT * FROM email_verifications WHERE token_hash = ? AND used = 0', [hash]);
  if (!row) return res.status(400).json({ error: 'This verification link is invalid or has already been used.' });
  if (new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This verification link has expired. Request a new one.' });
  }
  const u = get('SELECT * FROM users WHERE id = ?', [row.user_id]);
  if (!u) return res.status(400).json({ error: 'Account not found.' });
  tx(() => {
    run('UPDATE users SET email_verified = 1 WHERE id = ?', [u.id]);
    run('UPDATE email_verifications SET used = 1 WHERE id = ?', [row.id]);
  });
  log(u, 'EMAIL_VERIFIED', `${u.full_name} verified their email address`, req.ip);
  res.json({
    message: 'Email verified. Your registration is now awaiting admin approval. You will be able to log in once approved.',
    pendingApproval: u.registration_status === 'pending',
  });
});

/** POST /api/auth/resend-verification — resend the verification link. */
router.post('/resend-verification', (req, res) => {
  const email = cleanString((req.body || {}).email, 160).toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const u = get('SELECT * FROM users WHERE lower(email) = ? AND role = \'parent\'', [email]);
  if (!u || u.email_verified) return res.status(200).json({ message: 'If a pending account exists, a new verification link has been sent.' });
  const token = createVerificationToken(u.id);
  const verifyLink = `${env.FRONTEND_URL}/verify-email.html?token=${token}`;
  sendEmail({ to: u.email, subject: 'Verify your email', html: `<p>Hello ${u.full_name},</p><p>Your new verification link: <a href="${verifyLink}">verify my email</a> (valid 24h).</p>` })
    .then((sent) => res.json({ message: 'A new verification link has been sent.', devVerifyLink: (!sent.sent && env.NODE_ENV !== 'production') ? verifyLink : undefined }))
    .catch(() => res.json({ message: 'A new verification link has been sent.' }));
});

/**
 * POST /api/auth/set-password — set a NEW password when the account was
 * auto-created (must_change_password = 1). Clears the flag afterwards.
 */
router.post('/set-password', authenticate, (req, res) => {
  const newPassword = cleanString((req.body || {}).newPassword, 200);
  const pwErr = passwordError(newPassword, { strong: env.STRONG_PASSWORDS });
  if (pwErr) return res.status(400).json({ error: pwErr });
  const u = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!u) return res.status(404).json({ error: 'Account not found.' });
  run('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?',
    [bcrypt.hashSync(newPassword, 10), new Date().toISOString(), u.id]);
  log(u, 'PASSWORD_SET', `${u.full_name} set their first password`, req.ip);
  res.json({ message: 'Password set. You can now use the platform.' });
});
