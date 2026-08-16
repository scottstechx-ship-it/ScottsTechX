/**
 * /api/settings — system configuration.
 *  - school information (name, logo, contacts, address)
 *  - academic years, classes reference data, departments, streams
 *  - messaging permission switches
 *  - notification preferences
 *  - security/API settings
 *  - backup/restore (JSON dump)
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { all, get, run } = require('../database/db');
const env = require('../config/env');
const { authenticate, requireRole } = require('../middleware/auth');
const { cleanString, asBool, asInt } = require('../middleware/validate');
const { upload, handleUploadErrors } = require('../middleware/upload');
const { log } = require('../services/audit');
const { readSettings, writeSetting } = require('../services/settingsService');

// ---------------------------------------------------------------------------
// School logo
// ---------------------------------------------------------------------------

const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const LOGO_MAX = 2 * 1024 * 1024; // 2 MB

/**
 * GET /api/settings/logo — public (a school logo is public branding; the login
 * page and email templates need it without a session). Returns 404 when unset.
 */
router.get('/logo', (req, res) => {
  const name = readSettings().school.logo;
  if (!name || !/^school-logo\.(png|jpe?g|webp|gif)$/.test(name)) {
    return res.status(404).json({ error: 'No logo uploaded yet.' });
  }
  const filePath = path.join(env.UPLOAD_DIR, name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Logo file missing on the server.' });
  const mime = name.endsWith('.png') ? 'image/png'
    : name.endsWith('.gif') ? 'image/gif'
    : name.endsWith('.webp') ? 'image/webp'
    : 'image/jpeg';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
});

/**
 * POST /api/settings/logo — upload/replace the school logo (super admin or admin).
 * Validates the actual image type, enforces a 2 MB limit, stores it as
 * school-logo.<ext> and updates the school settings. Old logo files are removed.
 */
router.post('/logo', authenticate, requireRole('super_admin', 'admin'), upload.single('file'), handleUploadErrors, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an image file to upload.' });
  if (!LOGO_TYPES.includes(req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Logo must be a PNG, JPEG, WEBP or GIF image.' });
  }
  if (req.file.size > LOGO_MAX) {
    fs.unlinkSync(req.file.path);
    return res.status(413).json({ error: 'Logo is too large. Maximum size is 2 MB.' });
  }

  const ext = req.file.mimetype === 'image/png' ? 'png'
    : req.file.mimetype === 'image/gif' ? 'gif'
    : req.file.mimetype === 'image/webp' ? 'webp'
    : 'jpg';
  const target = path.join(env.UPLOAD_DIR, `school-logo.${ext}`);

  // remove any previous logo file (whatever extension)
  const oldName = readSettings().school.logo;
  if (oldName && /^school-logo\.(png|jpe?g|webp|gif)$/.test(oldName) && oldName !== `school-logo.${ext}`) {
    try { fs.unlinkSync(path.join(env.UPLOAD_DIR, oldName)); } catch { /* ignore */ }
  }

  fs.renameSync(req.file.path, target);
  const school = { ...readSettings().school, logo: `school-logo.${ext}` };
  writeSetting('school', school);
  log(req.user, 'LOGO_UPLOADED', `${req.user.full_name} updated the school logo (school-logo.${ext})`, req.ip);
  res.json({ message: 'School logo updated.', logo: `school-logo.${ext}`, url: `/api/settings/logo` });
});

/** DELETE /api/settings/logo — remove the school logo. */
router.delete('/logo', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  const oldName = readSettings().school.logo;
  if (oldName && /^school-logo\.(png|jpe?g|webp|gif)$/.test(oldName)) {
    try { fs.unlinkSync(path.join(env.UPLOAD_DIR, oldName)); } catch { /* ignore */ }
  }
  const school = { ...readSettings().school, logo: null };
  writeSetting('school', school);
  log(req.user, 'LOGO_REMOVED', `${req.user.full_name} removed the school logo`, req.ip);
  res.json({ message: 'School logo removed.' });
});

/** GET /api/settings/public — safe subset shown in dashboards (no secrets). */
router.get('/public', authenticate, (req, res) => {
  const s = readSettings();
  res.json({
    school: s.school,
    permissions: s.permissions,
    notifications: s.notifications,
    maxFileSizeMB: s.api.maxFileSizeMB,
  });
});

/** GET /api/settings/all — full configuration (super admin; admins read-only). */
router.get('/all', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  res.json(readSettings());
});

/** PUT /api/settings/school */
router.put('/school', authenticate, requireRole('super_admin'), (req, res) => {
  const current = readSettings().school;
  const body = req.body || {};
  const school = {
    ...current,
    name: cleanString(body.name, 200) || current.name,
    motto: cleanString(body.motto, 300),
    phone: cleanString(body.phone, 40),
    email: cleanString(body.email, 160),
    address: cleanString(body.address, 400),
    website: cleanString(body.website, 200),
    logo: cleanString(body.logo, 500),
    currentAcademicYear: cleanString(body.currentAcademicYear, 20) || current.currentAcademicYear,
  };
  if (Array.isArray(body.academicYears)) {
    school.academicYears = body.academicYears.map((y) => cleanString(y, 20)).filter(Boolean);
  }
  if (Array.isArray(body.streams)) school.streams = body.streams.map((s) => cleanString(s, 10)).filter(Boolean);
  if (Array.isArray(body.departments)) school.departments = body.departments.map((d) => cleanString(d, 80)).filter(Boolean);
  writeSetting('school', school);
  log(req.user, 'SETTINGS_SCHOOL', 'Updated school information', req.ip);
  res.json({ message: 'School settings saved.', school });
});

/** PUT /api/settings/permissions */
router.put('/permissions', authenticate, requireRole('super_admin'), (req, res) => {
  const current = readSettings().permissions;
  const next = { ...current, ...(req.body || {}) };
  writeSetting('permissions', next);
  log(req.user, 'SETTINGS_PERMISSIONS', 'Updated messaging permission settings', req.ip);
  res.json({ message: 'Permissions saved.', permissions: next });
});

/** PUT /api/settings/notifications */
router.put('/notifications', authenticate, requireRole('super_admin'), (req, res) => {
  const current = readSettings().notifications;
  const next = { ...current, ...(req.body || {}) };
  writeSetting('notifications', next);
  log(req.user, 'SETTINGS_NOTIFICATIONS', 'Updated notification settings', req.ip);
  res.json({ message: 'Notification settings saved.', notifications: next });
});

/** PUT /api/settings/security */
router.put('/security', authenticate, requireRole('super_admin'), (req, res) => {
  const current = readSettings().security;
  const body = req.body || {};
  const next = {
    ...current,
    strongPasswords: body.strongPasswords !== undefined ? asBool(body.strongPasswords, true) : current.strongPasswords,
    sessionExpiryDays: body.sessionExpiryDays !== undefined ? Math.max(1, asInt(body.sessionExpiryDays, 1)) : current.sessionExpiryDays,
    loginRateLimit: body.loginRateLimit !== undefined ? Math.max(5, asInt(body.loginRateLimit, 20)) : current.loginRateLimit,
  };
  writeSetting('security', next);
  log(req.user, 'SETTINGS_SECURITY', 'Updated security settings', req.ip);
  res.json({ message: 'Security settings saved.' });
});

/** GET /api/settings/classes-reference — classes + teachers for dropdowns (staff). */
router.get('/classes-reference', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const classes = all('SELECT id, name, stream, academic_year FROM classes ORDER BY name, stream');
  const teachers = all('SELECT id, full_name FROM teachers WHERE status = \'active\' ORDER BY full_name');
  const students = all('SELECT id, full_name, student_code FROM students WHERE status = \'active\' ORDER BY full_name LIMIT 1000');
  const parents = all('SELECT id, full_name, parent_code FROM parents WHERE status = \'active\' ORDER BY full_name LIMIT 1000');
  res.json({ classes, teachers, students, parents });
});

/** POST /api/settings/backup — create a JSON backup of core data. */
router.post('/backup', authenticate, requireRole('super_admin'), (req, res) => {
  const tables = ['users', 'students', 'teachers', 'parents', 'parent_students', 'classes', 'teacher_classes',
    'conversations', 'conversation_participants', 'messages', 'message_reads',
    'folders', 'documents', 'document_access', 'announcements', 'announcement_reads', 'notifications', 'settings',
    'password_resets'];
  const dump = {};
  for (const t of tables) dump[t] = all(`SELECT * FROM ${t}`);
  dump._meta = { createdAt: new Date().toISOString(), app: 'school-communication-platform' };
  writeSetting('backup', { autoBackup: false, lastBackupAt: new Date().toISOString() });
  log(req.user, 'BACKUP_CREATED', 'Created a database backup', req.ip);
  res.setHeader('Content-Disposition', 'attachment; filename=school-backup.json');
  res.json(dump);
});

/** GET /api/settings/status — API health/status info. */
router.get('/status', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  const dbSize = require('fs').existsSync(require('../config/env').DATABASE_PATH)
    ? require('fs').statSync(require('../config/env').DATABASE_PATH).size : 0;
  res.json({
    serverTime: new Date().toISOString(),
    node: process.version,
    database: { engine: 'SQLite', fileSizeBytes: dbSize },
    uploads: { dir: require('../config/env').UPLOAD_DIR, maxFileSizeMB: require('../config/env').MAX_FILE_SIZE / 1024 / 1024 },
    cors: { allowedOrigins: require('../config/env').ALLOWED_ORIGINS },
    smtp: { configured: !!process.env.SMTP_HOST, from: process.env.SMTP_FROM || null },
  });
});

module.exports = router;
