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
const { all, get, run, ensureIntakeTables } = require('../database/db');
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

const OFFICE_PHONE = '0792 861 645';

function intakeBurst(label) {
  return rateLimit({
    windowMs: 60 * 1000,
    // A classroom of parents on the school Wi-Fi can submit together. The cap
    // still trips a scripted flood inside the intake tests' short loops.
    max: label.startsWith('admission') ? 35 : 50,
    label: label + ' burst',
    message: `Please wait a moment before sending again, or call the school office on ${OFFICE_PHONE}.`,
  });
}

function intakeSustained(label) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    label,
    message: `This connection has sent many forms. Please wait a few minutes and try again, or call the school office on ${OFFICE_PHONE}.`,
  });
}

function quiet(fn) {
  try { return fn(); }
  catch (e) {
    console.error('[website] intake follow-up failed:', e && e.message ? e.message : e);
    return null;
  }
}

function clientToken(raw) {
  const token = cleanString(raw, 80);
  if (!token || !/^[A-Za-z0-9._:-]+$/.test(token)) return null;
  return token;
}

function isBusyError(err) {
  const code = String(err && (err.code || err.errcode) || '');
  const msg = String(err && err.message || '');
  return code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' || /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(msg);
}

function isUniqueError(err) {
  const code = String(err && err.code || '');
  const msg = String(err && err.message || '');
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(msg);
}

function waitBriefly(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) { /* a locked database usually clears within a few ms */ }
}

function insertIntake(sql, params) {
  ensureIntakeTables();
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return run(sql, params);
    } catch (err) {
      last = err;
      if (!isBusyError(err) || attempt === 3) throw err;
      waitBriefly(40 * (attempt + 1));
    }
  }
  throw last;
}

function wantsHtml(req) {
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('application/json')) return false;
  return ct.includes('application/x-www-form-urlencoded') && String(req.headers.accept || '').includes('text/html');
}

function finishIntake(req, res, { status, payload, redirect }) {
  if (wantsHtml(req)) return res.redirect(303, redirect);
  return res.status(status).json(payload);
}

function contactName(body) {
  const direct = cleanString(body.name, 150);
  if (direct) return direct;
  return cleanString(`${cleanString(body.first, 80)} ${cleanString(body.last, 80)}`.trim(), 150);
}


const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|mkv)$/i;

function isImageFile(name) { return IMAGE_EXT.test(name || ''); }
function isVideoFile(name) { return VIDEO_EXT.test(name || ''); }
function mediaMime(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  }[ext] || 'application/octet-stream';
}

function adminUserIds() {
  return all("SELECT id FROM users WHERE role IN ('super_admin','admin') AND status = 'active'").map((u) => u.id);
}

/* ============================================================
 * ADMISSIONS
 * ============================================================ */

// Public submission — rate limited to stop abuse, not a shared school address.
// Visitors often arrive through one address (the office Wi-Fi, or a mobile
// carrier's NAT). A short burst cap still stops a scripted flood. A saved row
// is the success: email, notifications and the live refresh must never turn a
// stored application into a 500.
router.post('/admissions', intakeBurst('admission submissions'), intakeSustained('admission submissions'), (req, res) => {
  const body = req.body || {};
  const fullName = cleanString(body.fullName, 150);
  const applyingFor = cleanString(body.applyingFor, 80);
  const parentName = cleanString(body.parentName, 150);
  const parentPhone = cleanString(body.parentPhone, 40);
  if (!fullName || !applyingFor || !parentName || !parentPhone) {
    log(null, 'ADMISSION_REJECTED', `Incomplete admission application from ${req.ip} (name: "${fullName || '-'}")`, req.ip);
    return finishIntake(req, res, {
      status: 400,
      payload: { error: 'Student name, class, parent name and parent phone are required.' },
      redirect: '/admissions/?error=missing#application-form',
    });
  }
  const token = clientToken(body.clientToken);
  try {
    ensureIntakeTables();
    const prior = token ? get('SELECT id FROM admission_applications WHERE client_token = ?', [token]) : null;
    if (prior) {
      return finishIntake(req, res, {
        status: 201,
        payload: { message: 'Application submitted. The admissions team has been notified.', id: prior.id, emailed: false },
        redirect: '/admissions/?sent=1#application-form',
      });
    }
    let info;
    try {
      info = insertIntake(
        `INSERT INTO admission_applications
         (full_name, date_of_birth, gender, applying_for, program, combination, parent_name, parent_phone, parent_email, prev_school, motivation, client_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [fullName, cleanString(body.dateOfBirth, 20), cleanString(body.gender, 20), applyingFor,
          cleanString(body.program, 40), cleanString(body.combination, 160), parentName, parentPhone,
          cleanString(body.parentEmail, 150), cleanString(body.prevSchool, 150), cleanString(body.motivation, 2000),
          token]
      );
    } catch (err) {
      if (token && isUniqueError(err)) {
        const row = get('SELECT id FROM admission_applications WHERE client_token = ?', [token]);
        if (row) {
          return finishIntake(req, res, {
            status: 201,
            payload: { message: 'Application submitted. The admissions team has been notified.', id: row.id, emailed: false },
            redirect: '/admissions/?sent=1#application-form',
          });
        }
      }
      throw err;
    }
    const id = info.lastInsertRowid;
    const app_ = quiet(() => get('SELECT * FROM admission_applications WHERE id = ?', [id])) || {
      id,
      date_of_birth: cleanString(body.dateOfBirth, 20),
      gender: cleanString(body.gender, 20),
      program: cleanString(body.program, 40),
      combination: cleanString(body.combination, 160),
      parent_email: cleanString(body.parentEmail, 150),
      prev_school: cleanString(body.prevSchool, 150),
      motivation: cleanString(body.motivation, 2000),
    };

    let admins = [];
    quiet(() => { admins = adminUserIds(); });
    quiet(() => notifyMany(admins, 'system', `New admission application: ${fullName}`,
      `${applyingFor} · Parent: ${parentName} (${parentPhone})`, '/admissions'));
    if (!admins.length) {
      console.warn('[website] admission application stored, but no active admin account exists to notify:', fullName);
    }
    quiet(() => {
      if (io) for (const uid of admins) io.to(`user:${uid}`).emit('admission:new', { id, fullName, applyingFor });
    });

    let emailed = false;
    quiet(() => {
      const school = readSettings().school;
      const schoolEmail = school.email || process.env.ADMISSIONS_EMAIL || process.env.SCHOOL_EMAIL || '';
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
      emailed = !!(schoolEmail || app_.parent_email);
    });

    log(null, 'ADMISSION_RECEIVED', `Website application #${id}: ${fullName} (${applyingFor})`, req.ip);
    return finishIntake(req, res, {
      status: 201,
      payload: {
        message: 'Application submitted. The admissions team has been notified.',
        id,
        emailed,
      },
      redirect: '/admissions/?sent=1#application-form',
    });
  } catch (err) {
    console.error('[website] admission save failed:', err && err.message ? err.message : err);
    return finishIntake(req, res, {
      status: 500,
      payload: { error: 'We could not save the application just now. Please try again in a moment.' },
      redirect: '/admissions/?error=save#application-form',
    });
  }
});

// Staff: list / manage applications
router.get('/admissions', authenticate, requireStaffAdmin, (req, res) => {
  const status = cleanString(req.query.status, 20);
  const where = status ? 'WHERE status = ?' : '';
  const rows = all(`SELECT * FROM admission_applications ${where} ORDER BY created_at DESC, id DESC LIMIT 500`, status ? [status] : []);
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

router.post('/contact', intakeBurst('contact messages'), intakeSustained('contact messages'), (req, res) => {
  const body = req.body || {};
  const name = contactName(body);
  const message = cleanString(body.message, 4000);
  if (!name || !message) {
    log(null, 'CONTACT_REJECTED', `Incomplete website message from ${req.ip}`, req.ip);
    return finishIntake(req, res, {
      status: 400,
      payload: { error: 'Your name and a message are required.' },
      redirect: '/contact/?error=missing#contactForm',
    });
  }
  const email = cleanString(body.email, 150);
  const phone = cleanString(body.phone, 40);
  const subject = cleanString(body.subject, 200);
  const token = clientToken(body.clientToken);
  try {
    ensureIntakeTables();
    const prior = token ? get('SELECT id FROM contact_messages WHERE client_token = ?', [token]) : null;
    if (prior) {
      return finishIntake(req, res, {
        status: 201,
        payload: { message: 'Message sent. The school has been notified and will respond soon.', id: prior.id },
        redirect: '/contact/?sent=1#contactForm',
      });
    }
    let info;
    try {
      info = insertIntake(
        'INSERT INTO contact_messages (name, email, phone, subject, message, client_token) VALUES (?, ?, ?, ?, ?, ?)',
        [name, email, phone, subject, message, token]
      );
    } catch (err) {
      if (token && isUniqueError(err)) {
        const row = get('SELECT id FROM contact_messages WHERE client_token = ?', [token]);
        if (row) {
          return finishIntake(req, res, {
            status: 201,
            payload: { message: 'Message sent. The school has been notified and will respond soon.', id: row.id },
            redirect: '/contact/?sent=1#contactForm',
          });
        }
      }
      throw err;
    }
    const id = info.lastInsertRowid;
    let admins = [];
    quiet(() => { admins = adminUserIds(); });
    // The link must be a dashboard section key, not a page path: the bell
    // navigates by section, and a path like "/contact-messages" silently did
    // nothing when clicked (the inbox section is "website-contact").
    quiet(() => notifyMany(admins, 'message', `New website message from ${name}`,
      (subject || message).slice(0, 120), '/website-contact'));
    quiet(() => {
      if (io) for (const uid of admins) io.to(`user:${uid}`).emit('contact:new', { id, name });
    });
    quiet(() => {
      const school = readSettings().school;
      const officeEmail = school.email || process.env.CONTACT_EMAIL || process.env.SCHOOL_EMAIL || '';
      if (officeEmail) {
        sendEmail({
          to: officeEmail,
          subject: `Website contact: ${subject || name}`,
          html: `<p><b>From:</b> ${name} ${email ? '(' + email + ')' : ''}${phone ? ' · ' + phone : ''}</p><p>${message}</p>`,
        });
      }
    });
    log(null, 'CONTACT_RECEIVED', `Website message #${id} from ${name}`, req.ip);
    return finishIntake(req, res, {
      status: 201,
      payload: { message: 'Message sent. The school has been notified and will respond soon.', id },
      redirect: '/contact/?sent=1#contactForm',
    });
  } catch (err) {
    console.error('[website] contact save failed:', err && err.message ? err.message : err);
    return finishIntake(req, res, {
      status: 500,
      payload: { error: 'We could not save your message just now. Please try again in a moment.' },
      redirect: '/contact/?error=save#contactForm',
    });
  }
});

router.get('/contact', authenticate, requireStaffAdmin, (req, res) => {
  const rows = all('SELECT * FROM contact_messages ORDER BY created_at DESC, id DESC LIMIT 300');
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
  const rows = all('SELECT id, title, caption, filename, url, media_type, category, sort_order, created_at FROM site_gallery ORDER BY sort_order, id DESC');
  const items = rows.map((r) => ({
    ...r,
    media_type: r.media_type || (r.filename && isVideoFile(r.filename) ? 'video' : 'image'),
    src: r.filename ? `/api/website/gallery/${r.id}/image` : r.url,
  }));
  res.json({
    images: items.filter((i) => i.media_type !== 'video'),
    videos: items.filter((i) => i.media_type === 'video'),
    items,
  });
});

// Serve an uploaded gallery file publicly (image or video; UUID filenames).
router.get('/gallery/:id/image', (req, res) => {
  const row = get('SELECT filename FROM site_gallery WHERE id = ?', [asInt(req.params.id)]);
  if (!row || !row.filename || (!isImageFile(row.filename) && !isVideoFile(row.filename))) {
    return res.status(404).json({ error: 'Media not found.' });
  }
  const filePath = path.join(env.UPLOAD_DIR, row.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Media file missing.' });
  res.setHeader('Content-Type', mediaMime(row.filename));
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Accept-Ranges', 'bytes');
  // range support so videos can seek
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  if (range && isVideoFile(row.filename)) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }
  }
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(filePath).pipe(res);
});

router.post('/gallery', authenticate, requireRole('super_admin'), upload.single('file'), handleUploadErrors, (req, res) => {
  const title = cleanString(req.body.title, 150);
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const url = cleanString(req.body.url, 500);
  let filename = null;
  let mediaType = 'image';
  if (req.file) {
    if (isVideoFile(req.file.filename)) mediaType = 'video';
    else if (isImageFile(req.file.filename)) mediaType = 'image';
    else {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'Only images (png, jpg, webp, gif) or videos (mp4, webm, mov, mkv) are allowed in the gallery.' });
    }
    filename = req.file.filename;
  } else if (url) {
    mediaType = isVideoFile(url) ? 'video' : 'image';
  }
  if (!filename && !url) return res.status(400).json({ error: 'Upload a file or provide a media URL.' });
  const info = run(
    'INSERT INTO site_gallery (title, caption, filename, url, media_type, category, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [title, cleanString(req.body.caption, 300), filename, filename ? null : url, mediaType,
      cleanString(req.body.category, 40) || 'general', asInt(req.body.sortOrder) || 0, req.user.id]
  );
  log(req.user, 'GALLERY_ADDED', `Added gallery ${mediaType} "${title}"`, req.ip);
  res.status(201).json({ message: `${mediaType === 'video' ? 'Video' : 'Image'} added to the gallery.`, image: get('SELECT * FROM site_gallery WHERE id = ?', [info.lastInsertRowid]) });
});

router.put('/gallery/:id', authenticate, requireRole('super_admin'), upload.single('file'), handleUploadErrors, (req, res) => {
  const id = asInt(req.params.id);
  const row = get('SELECT * FROM site_gallery WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'Gallery image not found.' });
  let filename = row.filename;
  let url = row.url;
  if (req.file) {
    if (!isImageFile(req.file.filename) && !isVideoFile(req.file.filename)) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'Only image or video files are allowed.' });
    }
    if (filename) { try { fs.unlinkSync(path.join(env.UPLOAD_DIR, filename)); } catch {} }
    filename = req.file.filename;
    url = null;
    run('UPDATE site_gallery SET media_type = ? WHERE id = ?', [isVideoFile(filename) ? 'video' : 'image', id]);
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
     ORDER BY created_at DESC, id DESC LIMIT 100`
  );
  res.json({
    news: rows.map((r) => ({ ...r, image: r.image_file ? `/api/website/news/${r.id}/image` : r.image_url })),
  });
});

// Staff view includes drafts & expired posts
router.get('/news/manage', authenticate, requireStaffAdmin, (req, res) => {
  const rows = all('SELECT * FROM site_news ORDER BY created_at DESC, id DESC LIMIT 300');
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
