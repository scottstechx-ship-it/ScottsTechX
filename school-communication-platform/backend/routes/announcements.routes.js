/**
 * /api/announcements — announcements with backend-enforced targeting.
 *
 * target types: all | role | class | parents_of_class | staff | students | users
 */
const express = require('express');
const router = express.Router();
const { all, get, run, tx } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { cleanString, asInt, asBool } = require('../middleware/validate');
const { log } = require('../services/audit');
const { notifyMany } = require('../services/notify');
const { announcementReachesUser } = require('../services/permissions');
const { userIdsForTarget } = require('./documents.routes');
const { sendEmail } = require('../services/mailer');
const { readSettings } = require('../services/settingsService');

/** GET /api/announcements — announcements visible to me. */
router.get('/', authenticate, (req, res) => {
  const rows = all(
    `SELECT a.*, u.full_name AS sender_name,
            (SELECT 1 FROM announcement_reads ar WHERE ar.announcement_id = a.id AND ar.user_id = ?) AS is_read
     FROM announcements a LEFT JOIN users u ON u.id = a.sender_id
     ORDER BY a.important DESC, a.created_at DESC LIMIT 300`, [req.user.id]
  );
  const announcements = rows.filter((a) => announcementReachesUser(req.user, a));
  res.json({ announcements, unread: announcements.filter((a) => !a.is_read).length });
});

/** POST /api/announcements — create (admin/super; teachers may target their own classes). */
router.post('/', authenticate, requireRole('super_admin', 'admin', 'teacher'), (req, res) => {
  const title = cleanString(req.body.title, 200);
  const content = cleanString(req.body.content, 5000);
  const targetType = cleanString(req.body.targetType, 30) || 'all';
  const targetValue = req.body.targetValue === undefined ? null : String(req.body.targetValue);
  const important = asBool(req.body.important, false);
  const expireDate = req.body.expireDate ? cleanString(req.body.expireDate, 20) : null;

  if (!title || !content) return res.status(400).json({ error: 'Title and content are required.' });

  const allowedTargets = ['all', 'role', 'class', 'parents_of_class', 'staff', 'students', 'users'];
  if (!allowedTargets.includes(targetType)) {
    return res.status(400).json({ error: 'Invalid announcement target.' });
  }

  // Teachers may only post to their own classes or their students.
  if (req.user.role === 'teacher') {
    if (targetType === 'class') {
      const { classIdsForTeacherUserId } = require('../services/permissions');
      if (!classIdsForTeacherUserId(req.user.id).includes(Number(targetValue))) {
        return res.status(403).json({ error: 'You can only announce to classes you teach.' });
      }
    } else {
      return res.status(403).json({ error: 'Teachers can only post class announcements.' });
    }
  }

  const info = run(
    'INSERT INTO announcements (title, content, target_type, target_value, sender_id, important, expire_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, content, targetType, targetValue || null, req.user.id, important ? 1 : 0, expireDate]
  );

  // Notify the intended recipients (in-app).
  const recipients = userIdsForTarget(targetType, targetValue || (targetType === 'all' ? 'all' : ''));
  notifyMany(recipients, 'announcement', important ? 'IMPORTANT: ' + title : title, content.slice(0, 300), '/announcements');

  // Email the recipients when SMTP is configured AND this is important
  // (or the school chose email for all announcements).
  const emailMode = readSettings().notifications.emailOn || 'important';
  if (process.env.SMTP_HOST && recipients.length && (important || emailMode === 'all')) {
    const env = require('../config/env');
    const emails = all(
      `SELECT DISTINCT email FROM users WHERE id IN (${recipients.map(() => '?').join(',')}) AND email IS NOT NULL AND email != ''`,
      recipients
    ).slice(0, 100);
    for (const e of emails) {
      sendEmail({
        to: e.email,
        subject: (important ? 'IMPORTANT: ' : '') + title,
        html: `<h3>${title}</h3><p>${content.replace(/\n/g, '<br>')}</p><p><a href="${env.FRONTEND_URL}/announcements">View in the portal</a></p>`,
      }).catch(() => {});
    }
  }

  log(req.user, 'ANNOUNCEMENT_CREATED', `${important ? 'IMPORTANT ' : ''}Announcement "${title}" (${targetType})`, req.ip);
  res.status(201).json({ message: 'Announcement published.', announcement: get('SELECT * FROM announcements WHERE id = ?', [info.lastInsertRowid]) });
});

/** PUT /api/announcements/:id/read — mark as read. */
router.put('/:id/read', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  const a = get('SELECT * FROM announcements WHERE id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'Announcement not found.' });
  if (!announcementReachesUser(req.user, a)) {
    return res.status(403).json({ error: 'You do not have access to this announcement.' });
  }
  run('INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)', [id, req.user.id]);
  res.json({ message: 'Announcement marked as read.' });
});

/** PUT /api/announcements/:id — edit (sender or admin/super). */
router.put('/:id', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  const a = get('SELECT * FROM announcements WHERE id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'Announcement not found.' });
  if (a.sender_id !== req.user.id && !['super_admin', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'You can only edit your own announcements.' });
  }
  const title = cleanString(req.body.title, 200) || a.title;
  const content = cleanString(req.body.content, 5000) || a.content;
  const important = req.body.important !== undefined ? (asBool(req.body.important) ? 1 : 0) : a.important;
  const expireDate = req.body.expireDate !== undefined ? (req.body.expireDate ? cleanString(req.body.expireDate, 20) : null) : a.expire_date;
  let targetType = a.target_type;
  let targetValue = a.target_value;
  const allowedTargets = ['all', 'role', 'class', 'parents_of_class', 'staff', 'students', 'users'];
  if (req.body.targetType !== undefined) {
    const tt = cleanString(req.body.targetType, 30);
    if (!allowedTargets.includes(tt)) return res.status(400).json({ error: 'Invalid announcement target.' });
    targetType = tt;
    targetValue = req.body.targetValue === undefined ? null : String(req.body.targetValue);
    if (req.user.role === 'teacher' && targetType !== 'class') {
      return res.status(403).json({ error: 'Teachers can only target their own classes.' });
    }
  }
  run('UPDATE announcements SET title = ?, content = ?, important = ?, target_type = ?, target_value = ?, expire_date = ? WHERE id = ?',
    [title, content, important, targetType, targetValue || null, expireDate, id]);
  log(req.user, 'ANNOUNCEMENT_UPDATED', `Updated announcement "${title}"`, req.ip);
  res.json({ message: 'Announcement updated.' });
});

/** DELETE /api/announcements/:id */
router.delete('/:id', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  const a = get('SELECT * FROM announcements WHERE id = ?', [id]);
  if (!a) return res.status(404).json({ error: 'Announcement not found.' });
  if (a.sender_id !== req.user.id && !['super_admin', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'You can only delete your own announcements.' });
  }
  run('DELETE FROM announcements WHERE id = ?', [id]);
  log(req.user, 'ANNOUNCEMENT_DELETED', `Deleted announcement "${a.title}"`, req.ip);
  res.json({ message: 'Announcement deleted.' });
});

module.exports = router;
