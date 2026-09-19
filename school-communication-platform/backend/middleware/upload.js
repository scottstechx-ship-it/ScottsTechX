/**
 * File upload middleware (multer).
 * - Size limit from env (MAX_FILE_SIZE_MB)
 * - Allow-list of safe extensions/mime types
 * - Files are stored under UPLOAD_DIR with a random UUID name (extension preserved)
 * - The original name is kept in the database, never used on disk
 */
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const env = require('../config/env');

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp',
  'zip', 'txt', 'csv', 'rtf', 'odt', 'ods', 'odp', 'mp3', 'mp4', 'mov', 'mkv',
]);

function safeExtension(filename) {
  const ext = path.extname(filename || '').toLowerCase().replace('.', '');
  return ext;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
    cb(null, env.UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = safeExtension(file.originalname);
    const name = crypto.randomBytes(16).toString('hex') + (ext ? '.' + ext : '');
    cb(null, name);
  },
});

function fileFilter(req, file, cb) {
  const ext = safeExtension(file.originalname);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const err = new Error(`File type ".${ext || 'unknown'}" is not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`);
    err.status = 400;
    err.code = 'FILE_TYPE_NOT_ALLOWED';
    return cb(err);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.MAX_FILE_SIZE, files: 1 },
});

/** Wrapper that converts multer errors into friendly JSON. */
function handleUploadErrors(err, req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File is too large. Maximum size is ${Math.round(env.MAX_FILE_SIZE / 1024 / 1024)} MB.` });
  }
  if (err.code === 'FILE_TYPE_NOT_ALLOWED') {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Only one file per upload is allowed.' });
  }
  return res.status(400).json({ error: 'File could not be uploaded. Please try again.' });
}

module.exports = { upload, handleUploadErrors, ALLOWED_EXTENSIONS };
