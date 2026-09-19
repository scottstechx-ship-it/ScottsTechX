/**
 * /api/subjects — subject reference list (managed by admins; read by staff).
 */
const express = require('express');
const router = express.Router();
const { all, get, run } = require('../database/db');
const { authenticate, requireStaffAdmin } = require('../middleware/auth');
const { cleanString, asInt } = require('../middleware/validate');
const { log } = require('../services/audit');

/** GET /api/subjects */
router.get('/', authenticate, (req, res) => {
  const subjects = all('SELECT * FROM subjects ORDER BY name');
  res.json({ subjects });
});

/** POST /api/subjects */
router.post('/', authenticate, requireStaffAdmin, (req, res) => {
  const name = cleanString(req.body.name, 120);
  const code = cleanString(req.body.code, 20);
  const department = cleanString(req.body.department, 120);
  if (!name) return res.status(400).json({ error: 'Subject name is required.' });
  if (get('SELECT id FROM subjects WHERE lower(name) = lower(?)', [name])) {
    return res.status(409).json({ error: 'That subject already exists.' });
  }
  const info = run('INSERT INTO subjects (name, code, department) VALUES (?, ?, ?)', [name, code || null, department || null]);
  log(req.user, 'SUBJECT_CREATED', `Created subject "${name}"`, req.ip);
  res.status(201).json({ message: 'Subject created.', subject: get('SELECT * FROM subjects WHERE id = ?', [info.lastInsertRowid]) });
});

/** PUT /api/subjects/:id */
router.put('/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const s = get('SELECT * FROM subjects WHERE id = ?', [id]);
  if (!s) return res.status(404).json({ error: 'Subject not found.' });
  const name = cleanString(req.body.name, 120) || s.name;
  const code = cleanString(req.body.code, 20) || s.code;
  const department = cleanString(req.body.department, 120) || s.department;
  if (get('SELECT id FROM subjects WHERE lower(name) = lower(?) AND id != ?', [name, id])) {
    return res.status(409).json({ error: 'That subject already exists.' });
  }
  run('UPDATE subjects SET name = ?, code = ?, department = ? WHERE id = ?', [name, code, department, id]);
  log(req.user, 'SUBJECT_UPDATED', `Updated subject "${name}"`, req.ip);
  res.json({ message: 'Subject updated.' });
});

/** DELETE /api/subjects/:id */
router.delete('/:id', authenticate, requireStaffAdmin, (req, res) => {
  const id = asInt(req.params.id);
  const s = get('SELECT * FROM subjects WHERE id = ?', [id]);
  if (!s) return res.status(404).json({ error: 'Subject not found.' });
  run('DELETE FROM subjects WHERE id = ?', [id]);
  log(req.user, 'SUBJECT_DELETED', `Deleted subject "${s.name}"`, req.ip);
  res.json({ message: 'Subject deleted.' });
});

module.exports = router;
