/**
 * /api/logs — audit log browsing (super admin) and own activity (any user).
 */
const express = require('express');
const router = express.Router();
const { all, get } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { cleanString, asInt } = require('../middleware/validate');

/** GET /api/logs — all logs (super admin). Filters: search, action, userId, from, to. */
router.get('/', authenticate, requireRole('super_admin'), (req, res) => {
  const q = cleanString(req.query.search, 100);
  const action = cleanString(req.query.action, 60);
  const userId = asInt(req.query.userId);
  const limit = Math.min(asInt(req.query.limit, 100) || 100, 500);
  const offset = Math.max(asInt(req.query.offset, 0) || 0, 0);

  const where = [];
  const params = [];
  if (q) { where.push('(user_name LIKE ? OR details LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (action) { where.push('action = ?'); params.push(action); }
  if (userId) { where.push('user_id = ?'); params.push(userId); }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) AS c FROM activity_logs ${whereSql}`, params).c;
  const logs = all(`SELECT * FROM activity_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ logs, total, limit, offset });
});

/** GET /api/logs/me — the current user's own activity. */
router.get('/me', authenticate, (req, res) => {
  const limit = Math.min(asInt(req.query.limit, 50) || 50, 200);
  const logs = all('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?', [req.user.id, limit]);
  res.json({ logs });
});

/** GET /api/logs/actions — distinct action types (for filters). */
router.get('/actions', authenticate, requireRole('super_admin'), (req, res) => {
  const rows = all('SELECT DISTINCT action FROM activity_logs ORDER BY action');
  res.json({ actions: rows.map((r) => r.action) });
});

module.exports = router;

/** GET /api/logs/export — download the audit log as CSV (super admin). */
router.get('/export', authenticate, requireRole('super_admin'), (req, res) => {
  const q = cleanString(req.query.search, 100);
  const action = cleanString(req.query.action, 60);
  const where = [];
  const params = [];
  if (q) { where.push('(user_name LIKE ? OR details LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (action) { where.push('action = ?'); params.push(action); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const logs = all(`SELECT * FROM activity_logs ${whereSql} ORDER BY id DESC LIMIT 5000`, params);
  let csv = 'When,User,Role,Action,Details\n';
  for (const l of logs) {
    csv += `"${l.created_at}","${String(l.user_name || '').replace(/"/g, '""')}","${l.role || ''}","${String(l.action).replace(/"/g, '""')}","${String(l.details || '').replace(/"/g, '""')}"\n`;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
  res.send(csv);
});
