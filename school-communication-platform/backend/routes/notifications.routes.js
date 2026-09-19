/**
 * /api/notifications — in-app notifications (stored in the database).
 */
const express = require('express');
const router = express.Router();
const { all, get, run } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { asInt } = require('../middleware/validate');

/** GET /api/notifications */
router.get('/', authenticate, (req, res) => {
  const limit = Math.min(asInt(req.query.limit, 60) || 60, 200);
  const items = all(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
    [req.user.id, limit]
  );
  const unread = get('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0', [req.user.id]).c;
  res.json({ notifications: items, unread });
});

/** GET /api/notifications/unread-count */
router.get('/unread-count', authenticate, (req, res) => {
  const unread = get('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0', [req.user.id]).c;
  res.json({ unread });
});

/** PUT /api/notifications/:id/read */
router.put('/:id/read', authenticate, (req, res) => {
  run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [asInt(req.params.id), req.user.id]);
  res.json({ message: 'Notification marked as read.' });
});

/** PUT /api/notifications/read-all */
router.put('/read-all', authenticate, (req, res) => {
  run('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ message: 'All notifications marked as read.' });
});

/** DELETE /api/notifications/:id */
router.delete('/:id', authenticate, (req, res) => {
  run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [asInt(req.params.id), req.user.id]);
  res.json({ message: 'Notification removed.' });
});

module.exports = router;
