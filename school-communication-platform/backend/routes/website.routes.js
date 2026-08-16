/**
 * /api/website — public website content:
 *   - admission applications (public POST -> admin dashboard + email)
 *   - gallery images (public GET, super-admin manage)
 *   - news posts (public GET, admin manage, optional expiry)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { all, get, run } = require('../database/db');
const env = require('../config/env');
const { authenticate, requireRole, requireStaffAdmin } = require('../middleware/auth');
const { cleanString, asInt } = require('../middleware/validate');
const { upload, handleUploadErrors } = require('../middleware/upload');
const { log } = require('../services/audit');
const { notifyMany } = require('../services/notify');
const { sendEmail } = require('../services/mailer');
const { readSettings } = require('../services/settingsService');
const { rateLimit } = require('../middleware/security');

let io = null;
function setIO(server) { io = server; }

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

function isImageFile(name) { return IMAGE_EXT.test(name || ''); }

function adminUserIds() {
  return all("SELECT id FROM users WHERE role IN ('super_admin','admin') AND status = 'active'").map((u) => u.id);
}

/* ============================================================
 * ADMISSIONS
 * ============================================================ */

// Public submission — rate limited to stop abuse.
router.post('/admissions', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, label: 'admission submissions' }), async (req, res) => {
  const fullName = cleanString(req.body.fullName, 150);
  const applyingFor = cleanString(req.body.applyingFor, 60);
  const parentName = cleanString(req.body.parentName, 150);
  const parentPhone = cleanString(req.body.parentPhone, 40);
  if (!fullName || !applyingFor || !parentName || !parentPhone) {
    return res.status(400).json({ error: 'Student name, class, parent name and parent phone are required.' });
  }
  const info = run(
    `INSERT INTO admission_applications
     (full_name, date_of_birth, gender, applying_for, program, combination, parent_name, parent_phone, parent_email, prev_school, motivation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [fullName, cleanString(req.body.dateOfBirth, 20), cleanString(req.body.gender, 12), applyingFor,
      cleanString(req.body.program, 40), cleanString(req.body.combination, 120), parentName, parentPhone,
      cleanString(req.body.parentEmail, 150), cleanString(req.body.prevSchool, 150), cleanString(req.body.motivation, 2000)]
  );
  const app_ = get('SELECT * FROM admission_applications WHERE id = ?', [info.lastInsertRowid]);

  // 1. Instant notification to every admin (stored + pushed over Socket.IO)
  const admins = adminUserIds();
  notifyMany(admins, 'system', `New admission application: ${fullName}`,
    `${applyingFor} · Parent: ${parentName} (${parentPhone})`, '/admissions');
  // Live dashboard refresh event
  if (io) for (const id of admins) io.to(`user:${id}`).emit('admission:new', { id: app_.id, fullName, applyingFor });

  // 2. Email the school + confirmation to the parent (best-effort; never blocks)
  const school = readSettings().school;
  const schoolEmail = school.email || process.env.ADMISSIONS_EMAIL || '';
  const summary = `
    <h2>New Admission Application</h2>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td><b>Student</b></td><td>${fullName}</td></tr>
      <tr><td><b>Date of birth</b></td><td>${app_.date_of_birth || '-'}</td></tr>
      <tr><td><b>Gender</b></td><td>${app_.gender || '-'}</td></tr>
      <tr><td><b>Applying for</b></td><td>${applyingFor}</td></tr>
      <tr><td><b>Program</b></td><td>${app_.program || '-'}</td></tr>
      <tr><td><b>Combination</b></td><td>${app_.combination || '-'}</td></tr>
      <tr><td><b>Parent/Guardian</b></td><td>${parentName} · ${parentPhone} · ${app_.parent_email || '-'}</td></tr>
      <tr><td><b>Previous school</b></td><td>${app_.prev_school || '-'}</td></tr>
      <tr><td><b>Motivation</b></td><td>${app_.motivation || '-'}</td></tr>
    </table>`;
  if (schoolEmail) {
    sendEmail({ to: schoolEmail, subject: `New admission application — ${fullName} (${applyingFor})`, html: summary });
  }
  if (app_.parent_email) {
    sendEmail({
      to: app_.parent_email,
      subject: `Application received — ${school.name || 'Our School'}`,
      html: `<p>Dear ${parentName},</p>
        <p>We received the application for <b>${fullName}</b> (${applyingFor}). Our admissions team will contact you within 5 working days.</p>
        <p>${school.name || ''}<br>${school.phone || ''}</p>`,
    });
  }

  res.status(201).json({ message: 'Application submitted. The admissions team has been notified.', id: app_.id });
});

// Staff: list / manage applications
router.get('/admissions', authenticate, requireStaffAdmin, (req, res) => {
  const status = cleanString(req.query.status, 20);
  const where = status ? 'WHERE status = ?' : '';
  const rows = all(`SELECT * FROM admission_applications ${where} ORDER BY created_at DESC LIMIT 500`, status ? [status] : []);
  res.json({ applications: rows });
});

router.put('/admissions/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const app_ = get('SELECT * FROM admission_applications WHERE id = ?', [id]);
  if (!app_) return res.status(404).json({ error: 'Application not found.' });
  const status = cleanString(req.body.status, 20) || app_.status;
  if (!['new', 'reviewing', 'accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const note = req.body.note !== undefined ? cleanString(req.body.note, 1000) : app_.note;
  run('UPDATE admission_applications SET status = ?, note = ?, reviewed_by = ? WHERE id = ?', [status, note, req.user.id, id]);
  log(req.user, 'ADMISSION_UPDATED', `Application #${id} (${app_.full_name}) -> ${status}`, req.ip);
  res.json({ message: 'Application updated.', application: get('SELECT * FROM admission_applications WHERE id = ?', [id]) });
});

router.delete('/admissions/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const app_ = get('SELECT * FROM admission_applications WHERE id = ?', [id]);
  if (!app_) return res.status(404).json({ error: 'Application not found.' });
  run('DELETE FROM admission_applications WHERE id = ?', [id]);
  log(req.user, 'ADMISSION_DELETED', `Deleted application #${id} (${app_.full_name})`, req.ip);
  res.json({ message: 'Application deleted.' });
});

/* ============================================================
 * CONTACT MESSAGES (public POST -> admin inbox + email)
 * ============================================================ */

router.post('/contact', rateLimit({ windowMs: 15 * 60 * 1000, max: 12, label: 'contact messages' }), async (req, res) => {
  const name = cleanString(req.body.name, 150);
  const message = cleanString(req.body.message, 4000);
  if (!name || !message) return res.status(400).json({ error: 'Your name and a message are required.' });
  const email = cleanString(req.body.email, 150);
  const info = run(
    'INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
    [name, email, cleanString(req.body.phone, 40), cleanString(req.body.subject, 200), message]
  );
  const admins = adminUserIds();
  notifyMany(admins, 'system', `New website message from ${name}`,
    (cleanString(req.body.subject, 200) || message).slice(0, 120), '/contact-messages');
  if (io) for (const id of admins) io.to(`user:${id}`).emit('contact:new', { id: info.lastInsertRowid, name });
  const school = readSettings().school;
  if (school.email) {
    sendEmail({
      to: school.email,
      subject: `Website contact: ${cleanString(req.body.subject, 200) || name}`,
      html: `<p><b>From:</b> ${name} ${email ? '(' + email + ')' : ''}</p><p>${message}</p>`,
    });
  }
  res.status(201).json({ message: 'Message sent. The school has been notified and will respond soon.' });
});

router.get('/contact', authenticate, requireStaffAdmin, (req, res) => {
  const rows = all('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 300');
  res.json({ messages: rows });
});

router.put('/contact/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const row = get('SELECT * FROM contact_messages WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'Message not found.' });
  const status = cleanString(req.body.status, 20);
  if (!['new', 'read', 'replied'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  run('UPDATE contact_messages SET status = ? WHERE id = ?', [status, id]);
  res.json({ message: 'Updated.' });
});

router.delete('/contact/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  if (!get('SELECT id FROM contact_messages WHERE id = ?', [id])) return res.status(404).json({ error: 'Message not found.' });
  run('DELETE FROM contact_messages WHERE id = ?', [id]);
  log(req.user, 'CONTACT_DELETED', `Deleted website message #${id}`, req.ip);
  res.json({ message: 'Message deleted.' });
});

/* ============================================================
 * GALLERY  (public read, super-admin write)
 * ============================================================ */

router.get('/gallery', (req, res) => {
  const rows = all('SELECT id, title, caption, filename, url, category, sort_order, created_at FROM site_gallery ORDER BY sort_order, id DESC');
  res.json({
    images: rows.map((r) => ({
      ...r,
      src: r.filename ? `/api/website/gallery/${r.id}/image` : r.url,
    })),
  });
});

// Serve an uploaded gallery image publicly (images only; UUID filenames).
router.get('/gallery/:id/image', (req, res) => {
  const row = get('SELECT filename FROM site_gallery WHERE id = ?', [asInt(req.params.id)]);
  if (!row || !row.filename || !isImageFile(row.filename)) return res.status(404).json({ error: 'Image not found.' });
  const filePath = path.join(env.UPLOAD_DIR, row.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Image file missing.' });
  const ext = path.extname(row.filename).toLowerCase();
  res.setHeader('Content-Type', ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
});

router.post('/gallery', authenticate, requireRole('super_admin'), upload.single('file'), handleUploadErrors, (req, res) => {
  const title = cleanString(req.body.title, 150);
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const url = cleanString(req.body.url, 500);
  let filename = null;
  if (req.file) {
    if (!isImageFile(req.file.filename)) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'Only image files (png, jpg, webp, gif) are allowed in the gallery.' });
    }
    filename = req.file.filename;
  }
  if (!filename && !url) return res.status(400).json({ error: 'Upload an image file or provide an image URL.' });
  const info = run(
    'INSERT INTO site_gallery (title, caption, filename, url, category, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, cleanString(req.body.caption, 300), filename, filename ? null : url,
      cleanString(req.body.category, 40) || 'general', asInt(req.body.sortOrder) || 0, req.user.id]
  );
  log(req.user, 'GALLERY_ADDED', `Added gallery image "${title}"`, req.ip);
  res.status(201).json({ message: 'Image added to the gallery.', image: get('SELECT * FROM site_gallery WHERE id = ?', [info.lastInsertRowid]) });
});

router.put('/gallery/:id', authenticate, requireRole('super_admin'), upload.single('file'), handleUploadErrors, (req, res) => {
  const id = asInt(req.params.id);
  const row = get('SELECT * FROM site_gallery WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'Gallery image not found.' });
  let filename = row.filename;
  let url = row.url;
  if (req.file) {
    if (!isImageFile(req.file.filename)) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'Only image files are allowed.' });
    }
    if (filename) { try { fs.unlinkSync(path.join(env.UPLOAD_DIR, filename)); } catch {} }
    filename = req.file.filename;
    url = null;
  } else if (req.body.url !== undefined && cleanString(req.body.url, 500)) {
    if (filename) { try { fs.unlinkSync(path.join(env.UPLOAD_DIR, filename)); } catch {} }
    filename = null;
    url = cleanString(req.body.url, 500);
  }
  run('UPDATE site_gallery SET title = ?, caption = ?, filename = ?, url = ?, category = ?, sort_order = ? WHERE id = ?', [
    cleanString(req.body.title, 150) || row.title,
    req.body.caption !== undefined ? cleanString(req.body.caption, 300) : row.caption,
    filename, url,
    cleanString(req.body.category, 40) || row.category,
    req.body.sortOrder !== undefined ? (asInt(req.body.sortOrder) || 0) : row.sort_order,
    id,
  ]);
  log(req.user, 'GALLERY_UPDATED', `Updated gallery image #${id}`, req.ip);
  res.json({ message: 'Gallery image updated.', image: get('SELECT * FROM site_gallery WHERE id = ?', [id]) });
});

router.delete('/gallery/:id', authenticate, requireRole('super_admin'), (req, res) => {
  const id = asInt(req.params.id);
  const row = get('SELECT * FROM site_gallery WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'Gallery image not found.' });
  if (row.filename) { try { fs.unlinkSync(path.join(env.UPLOAD_DIR, row.filename)); } catch {} }
  run('DELETE FROM site_gallery WHERE id = ?', [id]);
  log(req.user, 'GALLERY_DELETED', `Deleted gallery image "${row.title}"`, req.ip);
  res.json({ message: 'Gallery image deleted.' });
});

/* ============================================================
 * NEWS  (public read of live posts, staff-admin write, expiry)
 * ============================================================ */

router.get('/news', (req, res) => {
  const rows = all(
    `SELECT id, title, body, image_file, image_url, expires_at, created_at, updated_at FROM site_news
     WHERE published = 1 AND (expires_at IS NULL OR expires_at >= datetime('now'))
     ORDER BY created_at DESC LIMIT 100`
  );
  res.json({
    news: rows.map((r) => ({ ...r, image: r.image_file ? `/api/website/news/${r.id}/image` : r.image_url })),
  });
});

// Staff view includes drafts & expired posts
router.get('/news/manage', authenticate, requireStaffAdmin, (req, res) => {
  const rows = all('SELECT * FROM site_news ORDER BY created_at DESC LIMIT 300');
  res.json({
    news: rows.map((r) => ({
      ...r,
      image: r.image_file ? `/api/website/news/${r.id}/image` : r.image_url,
      expired: !!(r.expires_at && r.expires_at < new Date().toISOString().replace('T', ' ').slice(0, 19)),
    })),
  });
});

router.get('/news/:id/image', (req, res) => {
  const row = get('SELECT image_file FROM site_news WHERE id = ?', [asInt(req.params.id)]);
  if (!row || !row.image_file || !isImageFile(row.image_file)) return res.status(404).json({ error: 'Image not found.' });
  const filePath = path.join(env.UPLOAD_DIR, row.image_file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Image file missing.' });
  const ext = path.extname(row.image_file).toLowerCase();
  res.setHeader('Content-Type', ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
});

router.post('/news', authenticate, requireStaffAdmin, upload.single('file'), handleUploadErrors, (req, res) => {
  const title = cleanString(req.body.title, 200);
  const body = cleanString(req.body.body, 8000);
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required.' });
  let imageFile = null;
  if (req.file) {
    if (!isImageFile(req.file.filename)) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'News image must be an image file.' });
    }
    imageFile = req.file.filename;
  }
  const expiresAt = cleanString(req.body.expiresAt, 25) || null;
  const info = run(
    'INSERT INTO site_news (title, body, image_file, image_url, published, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, body, imageFile, imageFile ? null : (cleanString(req.body.imageUrl, 500) || null),
      req.body.published === false || req.body.published === 'false' ? 0 : 1, expiresAt, req.user.id]
  );
  log(req.user, 'NEWS_CREATED', `Published news "${title}"${expiresAt ? ` (expires ${expiresAt})` : ''}`, req.ip);
  res.status(201).json({ message: 'News post saved.', post: get('SELECT * FROM site_news WHERE id = ?', [info.lastInsertRowid]) });
});

router.put('/news/:id', authenticate, requireStaffAdmin, upload.single('file'), handleUploadErrors, (req, res) => {
  const id = asInt(req.params.id);
  const row = get('SELECT * FROM site_news WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'News post not found.' });
  let imageFile = row.image_file;
  let imageUrl = row.image_url;
  if (req.file) {
    if (!isImageFile(req.file.filename)) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'News image must be an image file.' });
    }
    if (imageFile) { try { fs.unlinkSync(path.join(env.UPLOAD_DIR, imageFile)); } catch {} }
    imageFile = req.file.filename;
    imageUrl = null;
  } else if (req.body.imageUrl !== undefined) {
    imageUrl = cleanString(req.body.imageUrl, 500) || null;
    if (imageUrl && imageFile) { try { fs.unlinkSync(path.join(env.UPLOAD_DIR, imageFile)); } catch {} imageFile = null; }
  }
  run(
    `UPDATE site_news SET title = ?, body = ?, image_file = ?, image_url = ?, published = ?, expires_at = ?, updated_at = datetime('now') WHERE id = ?`,
    [cleanString(req.body.title, 200) || row.title,
      cleanString(req.body.body, 8000) || row.body,
      imageFile, imageUrl,
      req.body.published !== undefined ? (req.body.published === false || req.body.published === 'false' ? 0 : 1) : row.published,
      req.body.expiresAt !== undefined ? (cleanString(req.body.expiresAt, 25) || null) : row.expires_at,
      id]
  );
  log(req.user, 'NEWS_UPDATED', `Updated news post #${id}`, req.ip);
  res.json({ message: 'News post updated.', post: get('SELECT * FROM site_news WHERE id = ?', [id]) });
});

router.delete('/news/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const row = get('SELECT * FROM site_news WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'News post not found.' });
  if (row.image_file) { try { fs.unlinkSync(path.join(env.UPLOAD_DIR, row.image_file)); } catch {} }
  run('DELETE FROM site_news WHERE id = ?', [id]);
  log(req.user, 'NEWS_DELETED', `Deleted news post "${row.title}"`, req.ip);
  res.json({ message: 'News post deleted.' });
});

module.exports = router;
module.exports.setIO = setIO;
