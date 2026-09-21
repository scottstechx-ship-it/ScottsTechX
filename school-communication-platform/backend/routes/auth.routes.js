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
const { rateLimit } = require('../middleware/security');
const sessions = require('../services/sessions');
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

/**
 * A hash of a password that can never match, compared against when the
 * account does not exist so that response time does not reveal whether the
 * identifier is real (timing-based user enumeration).
 */
const DUMMY_HASH = bcrypt.hashSync('no-such-password-' + crypto.randomBytes(8).toString('hex'), 10);

/** POST /api/auth/login */
router.post('/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.LOGIN_RATE_LIMIT_PER_15MIN * 3, // IP-level ceiling; per-account lockout is stricter
  label: 'sign-in attempts',
  message: 'Too many sign-in attempts from this network. Please wait a few minutes and try again.',
}), (req, res) => {
  const { username, password, remember } = req.body || {};
  const ident = cleanString(username, 100);
  const pw = cleanString(password, 200);

  if (!ident || !pw) {
    return res.status(400).json({ error: 'Enter your username, email or code and your password.' });
  }

  // Brute-force guard: too many wrong passwords locks this account+IP pair.
  const lockedFor = sessions.lockoutRemaining(ident, req.ip);
  if (lockedFor > 0) {
    return res.status(429).json({
      error: `Too many failed sign-in attempts. Try again in ${lockedFor} minute${lockedFor === 1 ? '' : 's'}.`,
    });
  }

  // Identifier can be a username, an email, OR a unique code
  // (student code, staff code, parent code) — whichever the user has.
  let u = get(
    'SELECT * FROM users WHERE username = ? OR lower(email) = lower(?)',
    [ident, ident]
  );
  if (!u) {
    const viaCode =
      get('SELECT user_id FROM students WHERE upper(student_code) = upper(?) AND user_id IS NOT NULL', [ident]) ||
      get('SELECT user_id FROM teachers WHERE upper(staff_code) = upper(?) AND user_id IS NOT NULL', [ident]) ||
      get('SELECT user_id FROM parents  WHERE upper(parent_code) = upper(?) AND user_id IS NOT NULL', [ident]);
    if (viaCode) u = get('SELECT * FROM users WHERE id = ?', [viaCode.user_id]);
  }

  // Always run a bcrypt comparison, even for unknown accounts, so the time
  // taken does not leak whether the identifier exists.
  const passwordOk = bcrypt.compareSync(pw, u && u.password_hash ? u.password_hash : DUMMY_HASH);
  if (!u || !passwordOk) {
    const { attempts, locked, minutes } = sessions.recordFailedLogin(ident, req.ip);
    log(null, 'LOGIN_FAILED', `Failed login attempt for "${ident}" (attempt ${attempts})`, req.ip);
    if (locked) {
      return res.status(429).json({
        error: `Too many failed sign-in attempts. Your account is locked for ${minutes} minutes.`,
      });
    }
    const left = Math.max(0, sessions.MAX_ATTEMPTS - attempts);
    return res.status(401).json({
      error: left <= 3
        ? `Incorrect username, email, code or password. ${left} attempt${left === 1 ? '' : 's'} left before a temporary lock.`
        : 'Incorrect username, email, code or password.',
    });
  }
  sessions.clearFailedLogins(ident, req.ip);
  if (u.status !== 'active') {
    return res.status(403).json({ error: 'Your account is not active. Contact the school administrator.' });
  }
  // Self-registered accounts (parent, student, teacher applications) must be
  // approved by the school and the email address must be confirmed.
  if (u.registration_status === 'pending') {
    return res.status(403).json({ error: 'Your registration is awaiting admin approval. You will be able to log in once it is approved.' });
  }
  if (u.registration_status === 'rejected') {
    return res.status(403).json({ error: 'Your registration was not approved. Please contact the school administration.' });
  }
  if (!u.email_verified) {
    return res.status(403).json({
      error: 'Please verify your email address first. Check your inbox for the verification link (or request a new one).',
      needsVerification: true,
    });
  }

  const now = new Date().toISOString();
  run('UPDATE users SET last_login = ? WHERE id = ?', [now, u.id]);

  // A real, revocable session: the browser keeps only an HttpOnly cookie.
  const session = sessions.issueSession(u.id, req, { remember: remember === true || remember === 'true' });
  sessions.setSessionCookies(res, session, req);
  log(u, 'LOGIN', `${u.role} ${u.full_name} logged in`, req.ip);

  // `token` is still returned for non-browser clients; dashboards use the cookie.
  res.json({
    token: signToken(u),
    csrfToken: session.csrfToken,
    user: publicUser(u),
    expiresAt: session.expiresAt,
  });
});

/** POST /api/auth/logout — revoke the session server-side (not just client-side). */
router.post('/logout', authenticate, (req, res) => {
  if (req.authMethod === 'cookie') {
    sessions.revokeSession(sessions.cookieValue(req, sessions.COOKIE_NAME));
    sessions.clearSessionCookies(res);
  }
  log(req.user, 'LOGOUT', `${req.user.full_name} logged out`, req.ip);
  res.json({ message: 'Logged out successfully.' });
});

/** GET /api/auth/sessions — devices signed in to this account. */
router.get('/sessions', authenticate, (req, res) => {
  const currentId = req.session ? req.session.id : null;
  res.json({
    sessions: sessions.listSessions(req.user.id).map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.user_agent,
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at,
      expiresAt: s.expires_at,
      current: s.id === currentId,
    })),
  });
});

/** POST /api/auth/logout-all — sign out every other device. */
router.post('/logout-all', authenticate, (req, res) => {
  sessions.revokeAllForUser(req.user.id, sessions.cookieValue(req, sessions.COOKIE_NAME));
  log(req.user, 'LOGOUT_ALL', `${req.user.full_name} signed out of all other devices`, req.ip);
  res.json({ message: 'All other sessions have been signed out.' });
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
  // Everywhere else this account is signed in stops working immediately —
  // a changed password must invalidate sessions that may have been stolen.
  sessions.revokeAllForUser(u.id, sessions.cookieValue(req, sessions.COOKIE_NAME));
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
router.post('/forgot-password', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  label: 'password reset requests',
  message: 'Too many attempts from this network. Please wait a few minutes and try again.',
}), (req, res) => {
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
router.post('/reset-password', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  label: 'password resets',
  message: 'Too many attempts from this network. Please wait a few minutes and try again.',
}), (req, res) => {
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
  // Kick every existing session: the old password may be in someone else's hands.
  sessions.revokeAllForUser(u.id);
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
router.post('/register', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  label: 'registrations',
  message: 'Too many attempts from this network. Please wait a few minutes and try again.',
}), (req, res) => {
  const fullName = cleanString((req.body || {}).fullName, 120);
  const email = cleanString((req.body || {}).email, 160).toLowerCase();
  const phone = cleanString((req.body || {}).phone, 30);
  const address = cleanString((req.body || {}).address, 300);
  // Student codes prove guardianship: one code per child, from the school.
  let codes = (req.body || {}).studentCodes;
  if (typeof codes === 'string') codes = codes.split(/[\s,;]+/);
  codes = [...new Set((codes || []).map((c) => cleanString(c, 30).toUpperCase()).filter(Boolean))];

  if (!fullName || !email) {
    return res.status(400).json({ error: 'Full name and email are required.' });
  }
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (phone && !isPhone(phone)) return res.status(400).json({ error: 'Enter a valid phone number.' });
  if (!codes.length) {
    return res.status(400).json({ error: 'Enter at least one student code. Your child\'s code is on their admission letter or report card — or ask the school office.' });
  }
  if (codes.length > 10) return res.status(400).json({ error: 'A maximum of 10 student codes can be linked at once.' });

  // Every code must match a real student.
  const students = [];
  for (const code of codes) {
    const s = get('SELECT id, full_name, student_code FROM students WHERE upper(student_code) = ?', [code]);
    if (!s) return res.status(400).json({ error: `Student code "${code}" was not found. Check the code and try again.` });
    students.push(s);
  }

  if (get('SELECT id FROM users WHERE lower(email) = lower(?)', [email])) {
    // Do not reveal whether the account exists; behave as success.
    return res.status(200).json({ message: 'Registration received. The school administration will review it and email you your login details once approved.' });
  }

  const parentCode = 'PAR-' + Date.now().toString(36).toUpperCase() + crypto2.randomBytes(2).toString('hex').toUpperCase();
  const username = 'parent_' + Date.now().toString(36) + '_' + crypto2.randomBytes(3).toString('hex');
  // A random placeholder password — the REAL password is generated at
  // approval time and emailed; nobody can log in while pending anyway.
  const placeholder = crypto2.randomBytes(24).toString('hex');

  tx(() => {
    const info = run(
      `INSERT INTO users (full_name, email, phone, username, password_hash, role, status, registration_status, email_verified, must_change_password)
       VALUES (?, ?, ?, ?, ?, 'parent', 'active', 'pending', 0, 0)`,
      [fullName, email, phone || null, username, bcrypt.hashSync(placeholder, 10)]
    );
    const userId = info.lastInsertRowid;
    const p = run(
      `INSERT INTO parents (user_id, parent_code, full_name, phone, email, address, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [userId, parentCode, fullName, phone || null, email, address || null]
    );
    // Link the claimed children now — the admin sees exactly which students
    // this person claims to guard before approving.
    for (const s of students) {
      run('INSERT OR IGNORE INTO parent_students (parent_id, student_id) VALUES (?, ?)', [p.lastInsertRowid, s.id]);
    }
  });

  const childList = students.map((s) => `${s.full_name} (${s.student_code})`).join(', ');
  const admins = all("SELECT id FROM users WHERE role IN ('admin','super_admin') AND status = 'active'").map((r) => r.id);
  notifyMany(admins, 'account', 'New parent registration to review',
    `${fullName} (${email}) claims guardianship of: ${childList}. Approve or reject in Parents & Guardians.`, '/parents');
  log(null, 'PARENT_REGISTERED', `Parent registration: ${fullName} <${email}> for ${childList}`, req.ip);

  // Verification link: proves the address belongs to the applicant before an
  // admin spends time reviewing the claim.
  try {
    const verifyToken = createVerificationToken(get('SELECT id FROM users WHERE username = ?', [username]).id);
    const verifyLink = `${env.FRONTEND_URL}/verify-email.html?token=${verifyToken}`;
    sendEmail({
      to: email,
      subject: 'Confirm your email address',
      html: `<p>Hello ${fullName},</p><p>Confirm your address to continue your application:
        <a href="${verifyLink}">confirm my email</a> (valid for 24 hours).</p>`,
    }).catch(() => {});
  } catch { /* never block registration on email delivery */ }

  // Acknowledgement email (no credentials yet — those come after approval).
  sendEmail({
    to: email,
    subject: 'Registration received — parent account pending approval',
    html: `<p>Hello ${fullName},</p>
      <p>We received your parent registration for: <b>${childList}</b>.</p>
      <p>The school administration will verify that you are the guardian and approve your account.
      Your login details (username, parent code and password) will be sent to this email once approved.</p>`,
  }).catch(() => {});

  res.json({
    message: 'Registration received! The school will verify your details and approve your account. Your login details will be emailed to you after approval.',
  });
});

/** POST /api/auth/verify-email — verify with the emailed token. */
router.post('/verify-email', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  label: 'email verifications',
  message: 'Too many attempts from this network. Please wait a few minutes and try again.',
}), (req, res) => {
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
router.post('/resend-verification', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  label: 'verification emails',
  message: 'Too many attempts from this network. Please wait a few minutes and try again.',
}), (req, res) => {
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
  sessions.revokeAllForUser(u.id, sessions.cookieValue(req, sessions.COOKIE_NAME));
  log(u, 'PASSWORD_SET', `${u.full_name} set their first password`, req.ip);
  res.json({ message: 'Password set. You can now use the platform.' });
});

// ---------------------------------------------------------------------------
// Student & teacher self-registration (applications, not instant accounts)
// ---------------------------------------------------------------------------
/**
 * Both flows create a *pending* account:
 *   - the applicant must confirm their email address, and
 *   - an administrator must approve the application.
 *
 * Nothing is stored in the browser: the application lives in the database
 * where the school can actually review it. (The old pages wrote "accounts"
 * into localStorage — invisible to the school and lost on the next device.)
 */

function applicationEmail(fullName, role, extra) {
  return `<p>Hello ${fullName},</p>
    <p>We received your ${role} account application${extra ? ` (${extra})` : ''}.</p>
    <p>Please confirm your email address using the link we sent separately, then wait for the
    school administration to approve your application. You will be able to sign in once approved.</p>`;
}

/** POST /api/auth/register/student — apply using the code on the admission letter. */
router.post('/register/student', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  label: 'student applications',
  message: 'Too many applications from this network. Please wait a few minutes and try again.',
}), (req, res) => {
  const body = req.body || {};
  const fullName = cleanString(body.fullName, 120);
  const email = cleanString(body.email, 160).toLowerCase();
  const phone = cleanString(body.phone, 30);
  const password = cleanString(body.password, 200);
  const studentCode = cleanString(body.studentCode || body.studentNumber || body.admissionNo, 40).toUpperCase();

  if (!fullName || !email || !password || !studentCode) {
    return res.status(400).json({ error: 'Full name, email, password and student number are required.' });
  }
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (phone && !isPhone(phone)) return res.status(400).json({ error: 'Enter a valid phone number.' });
  const pwErr = passwordError(password, { strong: env.STRONG_PASSWORDS });
  if (pwErr) return res.status(400).json({ error: pwErr });

  const student = get('SELECT * FROM students WHERE upper(student_code) = ?', [studentCode]);
  if (!student) {
    return res.status(400).json({
      error: `Student number "${studentCode}" was not found. Use the number on your admission letter or report card, or ask the school office.`,
    });
  }
  if (student.user_id) {
    return res.status(400).json({
      error: 'This student number already has an account. Sign in instead, or ask the school office to reset it.',
    });
  }
  if (get('SELECT id FROM users WHERE lower(email) = lower(?)', [email])) {
    return res.status(200).json({ message: 'Application received. The school administration will review it and email you once approved.' });
  }

  const username = 'student_' + Date.now().toString(36) + '_' + crypto2.randomBytes(3).toString('hex');
  let userId;
  try {
    tx(() => {
      const info = run(
        `INSERT INTO users (full_name, email, phone, username, password_hash, role, status, registration_status, email_verified, must_change_password)
         VALUES (?, ?, ?, ?, ?, 'student', 'active', 'pending', 0, 0)`,
        [fullName, email, phone || null, username, bcrypt.hashSync(password, 10)]
      );
      userId = info.lastInsertRowid;
      run('UPDATE students SET user_id = ?, status = ? WHERE id = ?', [userId, 'pending', student.id]);
    });
  } catch (e) {
    return res.status(400).json({ error: 'That email address is already registered. Try signing in instead.' });
  }

  try {
    const token = createVerificationToken(userId);
    sendEmail({
      to: email,
      subject: 'Confirm your email address',
      html: `<p>Hello ${fullName},</p><p>Confirm your address to continue your student account application:
        <a href="${env.FRONTEND_URL}/verify-email.html?token=${token}">confirm my email</a> (valid 24 hours).</p>`,
    }).catch(() => {});
  } catch { /* email delivery must never block the application */ }

  const admins = all("SELECT id FROM users WHERE role IN ('admin','super_admin') AND status = 'active'").map((r) => r.id);
  notifyMany(admins, 'account', 'New student account application',
    `${fullName} (${email}) applied using student number ${studentCode}. Approve or reject in Users.`, '/users');
  log(null, 'STUDENT_REGISTERED', `Student application: ${fullName} <${email}> (${studentCode})`, req.ip);
  sendEmail({ to: email, subject: 'Application received', html: applicationEmail(fullName, 'student', studentCode) }).catch(() => {});

  res.json({
    message: 'Application received. Confirm your email address, then wait for the school administration to approve your account.',
  });
});

/** POST /api/auth/register/teacher — apply for a staff account. */
router.post('/register/teacher', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  label: 'teacher applications',
  message: 'Too many applications from this network. Please wait a few minutes and try again.',
}), (req, res) => {
  const body = req.body || {};
  const fullName = cleanString(body.fullName, 120);
  const email = cleanString(body.email, 160).toLowerCase();
  const phone = cleanString(body.phone, 30);
  const password = cleanString(body.password, 200);
  const subjects = cleanString(body.subjects, 300);
  const qualification = cleanString(body.qualification, 200);
  const staffCode = cleanString(body.staffCode, 40).toUpperCase();

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Full name, email and password are required.' });
  }
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (phone && !isPhone(phone)) return res.status(400).json({ error: 'Enter a valid phone number.' });
  const pwErr = passwordError(password, { strong: env.STRONG_PASSWORDS });
  if (pwErr) return res.status(400).json({ error: pwErr });

  // A school-issued staff code fast-tracks the application; without one the
  // school verifies identity manually before approving.
  let teacherRow = null;
  if (staffCode) {
    teacherRow = get('SELECT * FROM teachers WHERE upper(staff_code) = ?', [staffCode]);
    if (!teacherRow) return res.status(400).json({ error: `Staff code "${staffCode}" was not recognised.` });
    if (teacherRow.user_id) return res.status(400).json({ error: 'That staff code already has an account. Sign in instead.' });
  }
  if (get('SELECT id FROM users WHERE lower(email) = lower(?)', [email])) {
    return res.status(200).json({ message: 'Application received. The school administration will review it and email you once approved.' });
  }

  const username = 'teacher_' + Date.now().toString(36) + '_' + crypto2.randomBytes(3).toString('hex');
  const generatedCode = 'TCH-APP-' + crypto2.randomBytes(3).toString('hex').toUpperCase();
  let userId;
  try {
    tx(() => {
      const info = run(
        `INSERT INTO users (full_name, email, phone, username, password_hash, role, status, registration_status, email_verified, must_change_password)
         VALUES (?, ?, ?, ?, ?, 'teacher', 'active', 'pending', 0, 0)`,
        [fullName, email, phone || null, username, bcrypt.hashSync(password, 10)]
      );
      userId = info.lastInsertRowid;
      if (teacherRow) {
        run('UPDATE teachers SET user_id = ?, full_name = ?, phone = ?, email = ?, status = ? WHERE id = ?',
          [userId, fullName, phone || null, email, 'pending', teacherRow.id]);
      } else {
        run(
          `INSERT INTO teachers (user_id, staff_code, full_name, subjects, phone, email, qualification, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [userId, generatedCode, fullName, JSON.stringify(subjects ? subjects.split(/[,\s*]+/).filter(Boolean) : []),
            phone || null, email, qualification || null]
        );
      }
    });
  } catch (e) {
    return res.status(400).json({ error: 'That email address is already registered. Try signing in instead.' });
  }

  try {
    const token = createVerificationToken(userId);
    sendEmail({
      to: email,
      subject: 'Confirm your email address',
      html: `<p>Hello ${fullName},</p><p>Confirm your address to continue your staff account application:
        <a href="${env.FRONTEND_URL}/verify-email.html?token=${token}">confirm my email</a> (valid 24 hours).</p>`,
    }).catch(() => {});
  } catch { /* ignore */ }

  const admins = all("SELECT id FROM users WHERE role IN ('admin','super_admin') AND status = 'active'").map((r) => r.id);
  notifyMany(admins, 'account', 'New teacher account application',
    `${fullName} (${email}) applied for a staff account${staffCode ? ` with code ${staffCode}` : ''}. Approve or reject in Users.`, '/users');
  log(null, 'TEACHER_REGISTERED', `Teacher application: ${fullName} <${email}>`, req.ip);
  sendEmail({ to: email, subject: 'Application received', html: applicationEmail(fullName, 'teacher') }).catch(() => {});

  res.json({
    message: 'Application received. Confirm your email address, then wait for the school administration to approve your account.',
  });
});
