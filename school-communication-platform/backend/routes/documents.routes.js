/**
 * /api/documents — document sharing system.
 * - authenticated uploads & downloads only (no public file URLs)
 * - role-based access enforced in the backend for list/download
 * - folders, rename, delete, sharing, search
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

/** Tiny extension -> mime lookup (no external dependency needed). */
function lookupMime(filename) {
  const map = {
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    zip: 'application/zip', txt: 'text/plain', csv: 'text/csv', rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation',
    mp3: 'audio/mpeg', mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
  };
  const ext = (filename || '').split('.').pop().toLowerCase();
  return map[ext] || 'application/octet-stream';
}
const { all, get, run, tx } = require('../database/db');
const env = require('../config/env');
const { authenticate } = require('../middleware/auth');
const { upload, handleUploadErrors } = require('../middleware/upload');
const { cleanString, asInt } = require('../middleware/validate');
const { log } = require('../services/audit');
const { notify, notifyMany } = require('../services/notify');
const { sendEmail } = require('../services/mailer');
const {
  canAccessDocument,
  canUpload,
  canDeleteDocument,
  classConversationUserIds,
  studentIdsForClass,
  parentUserIdsForClass,
  classIdsForTeacherUserId,
  classIdForStudentUserId,
  classIdsForParentUserId,
  teachersForClass,
} = require('../services/permissions');

/** Resolve the list of user ids for a share target. */
function userIdsForTarget(targetType, targetId) {
  if (targetType === 'all') {
    return all("SELECT id FROM users WHERE status='active'").map((r) => r.id);
  }
  if (targetType === 'role') {
    return all('SELECT id FROM users WHERE role = ? AND status = \'active\'', [String(targetId)]).map((r) => r.id);
  }
  if (targetType === 'class') {
    const cid = Number(targetId);
    const ids = new Set();
    for (const uid of require('../services/permissions').studentUserIdsForClass(cid)) ids.add(uid);
    for (const t of teachersForClass(cid)) if (t.userId) ids.add(t.userId);
    for (const uid of parentUserIdsForClass(cid)) ids.add(uid);
    const admins = all("SELECT id FROM users WHERE role='admin' AND status='active'").map((r) => r.id);
    for (const a of admins) ids.add(a);
    return [...ids];
  }
  if (targetType === 'user') {
    return [Number(targetId)].filter(Boolean);
  }
  return [];
}

/** GET /api/documents — documents the current user may access. */
router.get('/', authenticate, (req, res) => {
  const q = cleanString(req.query.search, 100);
  const folderId = req.query.folderId !== undefined && req.query.folderId !== '' ? asInt(req.query.folderId) : null;
  const uploadedBy = asInt(req.query.uploadedBy);
  const limit = Math.min(asInt(req.query.limit, 100) || 100, 300);

  // Collect all documents the user can see.
  let rows;
  if (req.user.role === 'super_admin' || req.user.role === 'admin') {
    rows = all('SELECT * FROM documents ORDER BY created_at DESC LIMIT ?', [1000]);
  } else {
    rows = all(
      `SELECT DISTINCT d.* FROM documents d
       LEFT JOIN document_access da ON da.document_id = d.id
       WHERE d.uploaded_by = ?
          OR da.target_type = 'all'
          OR (da.target_type = 'role' AND da.target_id = ?)
          OR (da.target_type = 'user' AND da.target_id = ?)
          OR da.target_type = 'class'
       ORDER BY d.created_at DESC LIMIT ?`,
      [req.user.id, req.user.role, String(req.user.id), 2000]
    );
  }

  const visible = [];
  for (const doc of rows) {
    if (canAccessDocument(req.user, doc)) {
      doc.uploader_name = (get('SELECT full_name FROM users WHERE id = ?', [doc.uploaded_by]) || {}).full_name || 'Unknown';
      visible.push(doc);
    }
  }

  // Filters — folderId 0 means "root only"; when omitted, return all documents.
  let docs = visible;
  if (q) {
    const like = q.toLowerCase();
    docs = docs.filter((d) => d.name.toLowerCase().includes(like) || (d.description || '').toLowerCase().includes(like));
  }
  if (folderId !== null && folderId === 0) docs = docs.filter((d) => !d.folder_id);
  else if (folderId) docs = docs.filter((d) => d.folder_id === folderId);
  if (uploadedBy) docs = docs.filter((d) => d.uploaded_by === uploadedBy);

  docs = docs.slice(0, limit).map((d) => ({
    ...d,
    access: all('SELECT target_type, target_id FROM document_access WHERE document_id = ?', [d.id]),
  }));

  res.json({ documents: docs, total: docs.length });
});

/** POST /api/documents — upload (multipart). Fields: file, description, folderId, share (JSON string), expireDate. */
router.post('/', authenticate, upload.single('file'), handleUploadErrors, (req, res) => {
  if (!canUpload(req.user)) {
    return res.status(403).json({ error: 'Your account is not allowed to upload documents.' });
  }
  if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });

  const originalName = cleanString(req.file.originalname, 255);
  const description = cleanString(req.body.description, 1000);
  const folderId = req.body.folderId ? asInt(req.body.folderId) : null;
  const expireDate = req.body.expireDate ? cleanString(req.body.expireDate, 20) : null;
  let share = [];
  try {
    share = req.body.share ? JSON.parse(req.body.share) : [];
  } catch { share = []; }
  if (!Array.isArray(share)) share = [];

  if (folderId && !get('SELECT id FROM folders WHERE id = ? AND owner_id = ?', [folderId, req.user.id])) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Selected folder does not exist.' });
  }

  const docId = tx(() => {
    const info = run(
      `INSERT INTO documents (name, original_name, mime_type, size, storage_path, uploaded_by, folder_id, description, expire_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [originalName, originalName, req.file.mimetype || lookupMime(originalName),
       req.file.size, path.basename(req.file.path), req.user.id, folderId || null, description || null, expireDate]
    );
    // Default: owner-only + any explicit shares.
    run('INSERT OR IGNORE INTO document_access (document_id, target_type, target_id) VALUES (?, ?, ?)', [info.lastInsertRowid, 'user', String(req.user.id)]);
    for (const s of share) {
      const t = cleanString(s.targetType, 10);
      const id = String(s.targetId);
      if (['user', 'role', 'class', 'all'].includes(t) && id) {
        run('INSERT OR IGNORE INTO document_access (document_id, target_type, target_id) VALUES (?, ?, ?)', [info.lastInsertRowid, t, id]);
      }
    }
    return info.lastInsertRowid;
  });

  // Notify recipients of the new document.
  const recipients = new Set();
  for (const s of share) {
    if (!['user', 'role', 'class', 'all'].includes(s.targetType)) continue;
    for (const uid of userIdsForTarget(s.targetType, s.targetId)) {
      if (uid !== req.user.id) recipients.add(uid);
    }
  }
  notifyMany([...recipients], 'document', 'New document', `"${originalName}" was shared with you`, '/documents');

  log(req.user, 'DOCUMENT_UPLOADED', `Uploaded "${originalName}" (${req.file.size} bytes)`, req.ip);
  const doc = get('SELECT * FROM documents WHERE id = ?', [docId]);
  res.status(201).json({ message: 'Document uploaded successfully.', document: doc });
});

/** GET /api/documents/:id — metadata (access checked). */
router.get('/:id', authenticate, (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id = ?', [asInt(req.params.id)]);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  if (!canAccessDocument(req.user, doc)) {
    return res.status(403).json({ error: 'You do not have permission to access this document.' });
  }
  doc.uploader_name = (get('SELECT full_name FROM users WHERE id = ?', [doc.uploaded_by]) || {}).full_name || 'Unknown';
  doc.access = all('SELECT target_type, target_id FROM document_access WHERE document_id = ?', [doc.id]);
  res.json({ document: doc });
});

/**
 * GET /api/documents/:id/download — authenticated download.
 * The file is streamed from disk; the URL itself is meaningless without a token.
 */
router.get('/:id/download', authenticate, (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id = ?', [asInt(req.params.id)]);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  if (!canAccessDocument(req.user, doc)) {
    return res.status(403).json({ error: 'You do not have permission to download this document.' });
  }
  const filePath = path.join(env.UPLOAD_DIR, path.basename(doc.storage_path));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'The file is missing on the server.' });
  log(req.user, 'DOCUMENT_DOWNLOADED', `Downloaded "${doc.name}"`, req.ip);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`);
  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

/** Office documents (OOXML/ODF) can be text-extracted for preview. */
const OFFICE_MIMES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'application/vnd.oasis.opendocument.text',   // odt
  'application/vnd.oasis.opendocument.spreadsheet', // ods
  'application/vnd.oasis.opendocument.presentation', // odp
];

/** GET /api/documents/:id/preview — inline preview (authenticated).
 *  Images/PDF/text stream inline; office files are text-extracted with
 *  officeparser and returned as JSON { type:'office', text }. */
router.get('/:id/preview', authenticate, (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id = ?', [asInt(req.params.id)]);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  if (!canAccessDocument(req.user, doc)) {
    return res.status(403).json({ error: 'You do not have permission to view this document.' });
  }
  const filePath = path.join(env.UPLOAD_DIR, path.basename(doc.storage_path));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'The file is missing on the server.' });

  const inlineTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'application/pdf', 'text/plain', 'text/csv'];

  if (inlineTypes.includes(doc.mime_type)) {
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', 'inline');
    return fs.createReadStream(filePath).pipe(res);
  }

  if (OFFICE_MIMES.includes(doc.mime_type)) {
    if (doc.size > 12 * 1024 * 1024) {
      return res.status(415).json({ error: 'This file is too large to preview. Download it instead.' });
    }
    let officeParser;
    try { officeParser = require('officeparser'); } catch { return res.status(415).json({ error: 'Preview engine unavailable. Download the file instead.' }); }
    return officeParser.parseOffice(filePath)
      .then((ast) => {
        const text = typeof ast.toText === 'function' ? ast.toText() : String(ast || '');
        if (!text || !text.trim()) {
          return res.status(415).json({ error: 'No previewable text could be extracted. Download the file instead.' });
        }
        res.json({ type: 'office', text: text.slice(0, 60000), mime: doc.mime_type });
      })
      .catch(() => res.status(415).json({ error: 'This file could not be previewed. Download it instead.' }));
  }

  // Legacy binary formats (.doc/.xls/.ppt) and anything else.
  return res.status(415).json({ error: 'This file type cannot be previewed. Download it instead.' });
});

/** PUT /api/documents/:id — rename / description / folder / expire_date. */
router.put('/:id', authenticate, (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id = ?', [asInt(req.params.id)]);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  if (doc.uploaded_by !== req.user.id && !['super_admin', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'You can only edit your own documents.' });
  }
  const name = cleanString(req.body.name, 255);
  const description = req.body.description !== undefined ? cleanString(req.body.description, 1000) : doc.description;
  const folderId = req.body.folderId !== undefined && req.body.folderId !== '' && req.body.folderId !== null
    ? asInt(req.body.folderId) : doc.folder_id;
  const expireDate = req.body.expireDate !== undefined ? (req.body.expireDate ? cleanString(req.body.expireDate, 20) : null) : doc.expire_date;

  if (name) {
    run('UPDATE documents SET name = ?, description = ?, folder_id = ?, expire_date = ?, updated_at = ? WHERE id = ?',
      [name, description || null, folderId || null, expireDate, new Date().toISOString(), doc.id]);
    log(req.user, 'DOCUMENT_UPDATED', `Renamed "${doc.name}" -> "${name}"`, req.ip);
  }
  const updated = get('SELECT * FROM documents WHERE id = ?', [doc.id]);
  res.json({ message: 'Document updated.', document: updated });
});

/** DELETE /api/documents/:id */
router.delete('/:id', authenticate, (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id = ?', [asInt(req.params.id)]);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  if (!canDeleteDocument(req.user, doc)) {
    return res.status(403).json({ error: 'You do not have permission to delete this document.' });
  }
  tx(() => {
    run('DELETE FROM document_access WHERE document_id = ?', [doc.id]);
    run('UPDATE messages SET attachment_id = NULL WHERE attachment_id = ?', [doc.id]);
    run('DELETE FROM documents WHERE id = ?', [doc.id]);
  });
  const filePath = path.join(env.UPLOAD_DIR, path.basename(doc.storage_path));
  try { fs.unlinkSync(filePath); } catch { /* file may already be gone */ }
  log(req.user, 'DOCUMENT_DELETED', `Deleted "${doc.name}"`, req.ip);
  res.json({ message: 'Document deleted.' });
});

/** POST /api/documents/:id/share — add recipients. body: { targetType, targetId } */
router.post('/:id/share', authenticate, (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id = ?', [asInt(req.params.id)]);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  if (doc.uploaded_by !== req.user.id && !['super_admin', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'You can only share your own documents.' });
  }
  const targetType = cleanString(req.body.targetType, 10);
  const targetId = String(req.body.targetId === undefined ? '' : req.body.targetId);
  if (!['user', 'role', 'class', 'all'].includes(targetType) || !targetId) {
    return res.status(400).json({ error: 'Valid targetType and targetId are required.' });
  }
  run('INSERT OR IGNORE INTO document_access (document_id, target_type, target_id) VALUES (?, ?, ?)', [doc.id, targetType, targetId]);
  const recipients = userIdsForTarget(targetType, targetId).filter((id) => id !== req.user.id);
  notifyMany(recipients, 'document', 'New document shared', `"${doc.name}" was shared with you`, '/documents');

  // Email when SMTP is configured (capped so a big share doesn't flood the queue).
  if (process.env.SMTP_HOST && recipients.length) {
    const emails = all(
      `SELECT DISTINCT email FROM users WHERE id IN (${recipients.map(() => '?').join(',')}) AND email IS NOT NULL AND email != ''`,
      recipients
    ).slice(0, 50);
    for (const e of emails) {
      sendEmail({
        to: e.email,
        subject: `New document shared: ${doc.name}`,
        html: `<p>A document was shared with you: <strong>${doc.name}</strong></p><p><a href="${env.FRONTEND_URL}/documents">Open your documents</a></p>`,
      }).catch(() => {});
    }
  }

  log(req.user, 'DOCUMENT_SHARED', `Shared "${doc.name}" with ${targetType}:${targetId}`, req.ip);
  res.json({ message: 'Document shared.', recipients: recipients.length });
});

/** DELETE /api/documents/:id/access — remove one grant. body: { targetType, targetId } */
router.delete('/:id/access', authenticate, (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id = ?', [asInt(req.params.id)]);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  if (doc.uploaded_by !== req.user.id && !['super_admin', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'You can only manage your own documents.' });
  }
  const targetType = cleanString(req.body.targetType, 10);
  const targetId = String(req.body.targetId === undefined ? '' : req.body.targetId);
  if (targetType === 'user' && String(doc.uploaded_by) === targetId) {
    return res.status(400).json({ error: 'The uploader always has access to their document.' });
  }
  run('DELETE FROM document_access WHERE document_id = ? AND target_type = ? AND target_id = ?', [doc.id, targetType, targetId]);
  res.json({ message: 'Access removed.' });
});

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

/** GET /api/documents/folders — list my folders. */
router.get('/folders/list', authenticate, (req, res) => {
  const folders = all('SELECT * FROM folders WHERE owner_id = ? ORDER BY name', [req.user.id]);
  res.json({ folders });
});

/** POST /api/documents/folders — create folder. body: { name, parentId? } */
router.post('/folders', authenticate, (req, res) => {
  const name = cleanString(req.body.name, 120);
  const parentId = asInt(req.body.parentId);
  if (!name) return res.status(400).json({ error: 'Folder name is required.' });
  if (parentId && !get('SELECT id FROM folders WHERE id = ? AND owner_id = ?', [parentId, req.user.id])) {
    return res.status(400).json({ error: 'Parent folder not found.' });
  }
  const info = run('INSERT INTO folders (name, owner_id, parent_id) VALUES (?, ?, ?)', [name, req.user.id, parentId || null]);
  res.status(201).json({ message: 'Folder created.', folder: get('SELECT * FROM folders WHERE id = ?', [info.lastInsertRowid]) });
});

/** PUT /api/documents/folders/:id — rename folder. */
router.put('/folders/:id', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  const f = get('SELECT * FROM folders WHERE id = ? AND (owner_id = ? OR ? IN ("admin","super_admin"))', [id, req.user.id, req.user.role]);
  if (!f) return res.status(404).json({ error: 'Folder not found.' });
  const name = cleanString(req.body.name, 120);
  if (!name) return res.status(400).json({ error: 'Folder name is required.' });
  run('UPDATE folders SET name = ? WHERE id = ?', [name, id]);
  res.json({ message: 'Folder renamed.' });
});

/** DELETE /api/documents/folders/:id — remove folder (documents move to root). */
router.delete('/folders/:id', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  const f = get('SELECT * FROM folders WHERE id = ? AND (owner_id = ? OR ? IN ("admin","super_admin"))', [id, req.user.id, req.user.role]);
  if (!f) return res.status(404).json({ error: 'Folder not found.' });
  run('UPDATE documents SET folder_id = NULL WHERE folder_id = ?', [id]);
  run('DELETE FROM folders WHERE id = ?', [id]);
  res.json({ message: 'Folder deleted.' });
});

module.exports = router;
module.exports.userIdsForTarget = userIdsForTarget;
