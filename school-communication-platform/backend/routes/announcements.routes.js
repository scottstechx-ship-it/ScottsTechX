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

/**
 * Publish every announcement whose scheduled time has arrived. Called on read
 * and by the cleanup timer, so a scheduled notice goes out on time even if
 * nobody opens the app, and never goes out twice.
 */
function publishDueAnnouncements() {
  const due = all(
    `SELECT * FROM announcements
     WHERE status = 'scheduled' AND scheduled_at IS NOT NULL
       AND replace(substr(scheduled_at, 1, 19), 'T', ' ') <= datetime('now')`
  );
  for (const a of due) {
    run("UPDATE announcements SET status = 'published' WHERE id = ?", [a.id]);
    deliverAnnouncement(a);
    log({ id: a.sender_id, full_name: 'Scheduled' }, 'ANNOUNCEMENT_PUBLISHED', `Scheduled announcement "${a.title}" went out`, null);
  }
  return due.length;
}

/** In-app notification (+ email when configured) for one announcement. */
function deliverAnnouncement(a) {
  const recipients = userIdsForTarget(a.target_type, a.target_value || (a.target_type === 'all' ? 'all' : ''));
  notifyMany(recipients, 'announcement', a.important ? 'IMPORTANT: ' + a.title : a.title, String(a.content || '').slice(0, 300), '/announcements');

  const emailMode = readSettings().notifications.emailOn || 'important';
  if (process.env.SMTP_HOST && recipients.length && (a.important || emailMode === 'all')) {
    const env = require('../config/env');
    const emails = all(
      `SELECT DISTINCT email FROM users WHERE id IN (${recipients.map(() => '?').join(',')}) AND email IS NOT NULL AND email != ''`,
      recipients
    ).slice(0, 100);
    for (const e of emails) {
      sendEmail({
        to: e.email,
        subject: (a.important ? 'IMPORTANT: ' : '') + a.title,
        html: `<h3>${a.title}</h3><p>${String(a.content || '').replace(/\n/g, '<br>')}</p><p><a href="${env.FRONTEND_URL}/announcements">View in the portal</a></p>`,
      }).catch(() => {});
    }
  }
  return recipients.length;
}

/** GET /api/announcements — announcements visible to me. */
router.get('/', authenticate, (req, res) => {
  publishDueAnnouncements();
  const rows = all(
    `SELECT a.*, u.full_name AS sender_name,
            (SELECT 1 FROM announcement_reads ar WHERE ar.announcement_id = a.id AND ar.user_id = ?) AS is_read
     FROM announcements a LEFT JOIN users u ON u.id = a.sender_id
     ORDER BY a.important DESC, a.created_at DESC LIMIT 300`, [req.user.id]
  );
  // a scheduled announcement is private until it goes out — only its author
  // (or an admin) can see it in the list
  const announcements = rows
    .filter((a) => announcementReachesUser(req.user, a))
    .filter((a) => a.status !== 'scheduled'
      || a.sender_id === req.user.id
      || ['super_admin', 'admin'].includes(req.user.role));
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

  // Scheduling: 'YYYY-MM-DDTHH:MM' (local) or a full ISO timestamp. A time in
  // the past publishes straight away; a future time holds the notice (and its
  // notifications) until it is due.
  const wanted = cleanString(req.body.scheduledAt, 30);
  let scheduledAt = null;
  let status = 'published';
  if (wanted) {
    const normalised = wanted.replace('T', ' ').slice(0, 19);
    const when = new Date(normalised.replace(' ', 'T'));
    if (isNaN(when.getTime())) return res.status(400).json({ error: 'That schedule time is not a valid date and time.' });
    scheduledAt = normalised;
    status = when.getTime() > Date.now() + 30000 ? 'scheduled' : 'published';
  }

  const info = run(
    'INSERT INTO announcements (title, content, target_type, target_value, sender_id, important, expire_date, status, scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [title, content, targetType, targetValue || null, req.user.id, important ? 1 : 0, expireDate, status, scheduledAt]
  );
  const created = get('SELECT * FROM announcements WHERE id = ?', [info.lastInsertRowid]);

  if (status === 'published') deliverAnnouncement(created);

  log(req.user, status === 'scheduled' ? 'ANNOUNCEMENT_SCHEDULED' : 'ANNOUNCEMENT_CREATED',
    `${important ? 'IMPORTANT ' : ''}Announcement "${title}" (${targetType})${status === 'scheduled' ? ' for ' + scheduledAt : ''}`, req.ip);
  res.status(201).json({
    message: status === 'scheduled' ? `Announcement scheduled for ${scheduledAt}.` : 'Announcement published.',
    announcement: created,
  });
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
  // rescheduling: a scheduled notice can be moved, or a new time set on a
  // published one only to move it BACK to scheduled (publishing stays explicit)
  let status = a.status || 'published';
  let scheduledAt = a.scheduled_at || null;
  if (req.body.scheduledAt !== undefined) {
    const wanted = cleanString(req.body.scheduledAt, 30);
    if (!wanted) {
      // clearing the field on a scheduled notice publishes it immediately
      if (status === 'scheduled') {
        status = 'published';
        scheduledAt = null;
        const fresh = { ...a, title, content, important, target_type: targetType, target_value: targetValue };
        run('UPDATE announcements SET title = ?, content = ?, important = ?, target_type = ?, target_value = ?, expire_date = ?, status = ?, scheduled_at = NULL WHERE id = ?',
          [title, content, important, targetType, targetValue || null, expireDate, status, id]);
        deliverAnnouncement(fresh);
        log(req.user, 'ANNOUNCEMENT_PUBLISHED', `Published scheduled announcement "${title}" early`, req.ip);
        return res.json({ message: 'Announcement published now.', announcement: get('SELECT * FROM announcements WHERE id = ?', [id]) });
      }
    } else {
      const normalised = wanted.replace('T', ' ').slice(0, 19);
      const when = new Date(normalised.replace(' ', 'T'));
      if (isNaN(when.getTime())) return res.status(400).json({ error: 'That schedule time is not a valid date and time.' });
      scheduledAt = normalised;
      status = when.getTime() > Date.now() + 30000 ? 'scheduled' : 'published';
    }
  }
  run('UPDATE announcements SET title = ?, content = ?, important = ?, target_type = ?, target_value = ?, expire_date = ?, status = ?, scheduled_at = ? WHERE id = ?',
    [title, content, important, targetType, targetValue || null, expireDate, status, scheduledAt, id]);
  // moving a scheduled notice to a time that has already passed publishes it —
  // and that means the recipients must be told, exactly as if it had gone out
  // on schedule.
  if ((a.status || 'published') === 'scheduled' && status === 'published') {
    deliverAnnouncement({ ...a, title, content, important, target_type: targetType, target_value: targetValue });
    log(req.user, 'ANNOUNCEMENT_PUBLISHED', `Published scheduled announcement "${title}"`, req.ip);
    return res.json({ message: 'Announcement published.', announcement: get('SELECT * FROM announcements WHERE id = ?', [id]) });
  }
  log(req.user, 'ANNOUNCEMENT_UPDATED', `Updated announcement "${title}"`, req.ip);
  res.json({ message: status === 'scheduled' ? `Announcement scheduled for ${scheduledAt}.` : 'Announcement updated.', announcement: get('SELECT * FROM announcements WHERE id = ?', [id]) });
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
module.exports.publishDue = publishDueAnnouncements;
