/**
 * Environment configuration loader.
 * All secrets and environment-specific values come from environment variables
 * (loaded from a .env file at the project root via dotenv in server.js).
 * Never hardcode secrets in source code.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

const root = path.resolve(__dirname, '..', '..');

/* ============================================================
 * WHERE THE DATA LIVES
 *
 * Everything the school edits — users, messages, news, gallery, documents,
 * fees, settings — is stored in exactly two places:
 *
 *     <DATA_DIR>/school.db     the SQLite database (all rows)
 *     <DATA_DIR>/uploads       every uploaded file (documents, photos, logos)
 *
 * Resolution order, so an existing installation is never orphaned:
 *
 *   1. DATABASE_PATH / UPLOAD_DIR set explicitly   -> use them, verbatim
 *   2. DATA_DIR set explicitly                     -> <DATA_DIR>/{school.db,uploads}
 *   3. a writable persistent mount at /var/data    -> use the mount, and move
 *      an older in-repo database + uploads into it on first boot (one-time)
 *   4. otherwise                                   -> backend/data (in-repo),
 *      which is where the app has always kept its files
 *
 * Rule 3 is what makes "every update stays" true on a host with a real disk:
 * the moment a volume is mounted the app finds it, and anything written while
 * the data still lived inside the source tree is carried across instead of
 * being left behind.
 * ============================================================ */

const PERSISTENT_MOUNTS = ['/var/data', '/data', '/mnt/data'];

function isWritableDir(dir) {
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
    fs.accessSync(dir, fs.constants.W_OK | fs.constants.R_OK);
    return true;
  } catch { return false; }
}

function findPersistentMount() {
  for (const dir of PERSISTENT_MOUNTS) if (isWritableDir(dir)) return dir;
  return null;
}

/** Copy a file if the destination is missing (never overwrite live data). */
function copyIfMissing(from, to) {
  if (!fs.existsSync(from) || fs.existsSync(to)) return false;
  fs.copyFileSync(from, to);
  return true;
}

/**
 * One-time carry-across from the old in-repo location into a persistent
 * mount. Marked with a receipt file so it can never run twice.
 */
function carryAcrossTo(mountDir, legacyDbDir, legacyUploadDir) {
  const receipt = path.join(mountDir, '.migrated-from-repo');
  if (fs.existsSync(receipt)) return false;
  let moved = false;
  try {
    for (const f of ['school.db', 'school.db-wal', 'school.db-shm']) {
      moved = copyIfMissing(path.join(legacyDbDir, f), path.join(mountDir, f)) || moved;
    }
    const targetUploads = path.join(mountDir, 'uploads');
    if (fs.existsSync(legacyUploadDir) && fs.statSync(legacyUploadDir).isDirectory()) {
      fs.mkdirSync(targetUploads, { recursive: true });
      for (const entry of fs.readdirSync(legacyUploadDir)) {
        if (entry === '.gitkeep') continue;
        const src = path.join(legacyUploadDir, entry);
        if (fs.statSync(src).isFile()) {
          moved = copyIfMissing(src, path.join(targetUploads, entry)) || moved;
        }
      }
    }
    fs.writeFileSync(receipt, new Date().toISOString() + '\n');
  } catch {
    // Never block startup over a migration: the app falls back to the mount
    // with a fresh database rather than refusing to boot.
    return false;
  }
  return moved;
}

const LEGACY_DB_DIR = path.join(root, 'backend', 'data');
const LEGACY_UPLOAD_DIR = path.join(root, 'backend', 'uploads');

let dataDir;
let dataDirSource;
let legacyUploads = null;
if (process.env.DATA_DIR) {
  dataDir = path.resolve(root, process.env.DATA_DIR);
  dataDirSource = 'DATA_DIR';
} else {
  const mount = findPersistentMount();
  if (mount) {
    const carried = carryAcrossTo(mount, LEGACY_DB_DIR, LEGACY_UPLOAD_DIR);
    dataDir = mount;
    dataDirSource = carried ? 'persistent mount (migrated from the repository)' : 'persistent mount';
  } else {
    dataDir = LEGACY_DB_DIR;
    dataDirSource = 'in-repository (set DATA_DIR or mount a disk to persist)';
    // An existing install already has its files in backend/uploads — keep
    // reading them from there instead of pointing at an empty new folder.
    if (fs.existsSync(LEGACY_UPLOAD_DIR) && fs.statSync(LEGACY_UPLOAD_DIR).isDirectory()) {
      legacyUploads = LEGACY_UPLOAD_DIR;
    }
  }
}

const env = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  API_BASE_URL: (process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, ''),
  FRONTEND_URL: (process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, ''),

  // Storage — one root for the database, the uploads and the backups
  DATA_DIR: dataDir,
  DATA_DIR_SOURCE: dataDirSource,
  BACKUP_DIR: path.resolve(dataDir, process.env.BACKUP_DIR || 'backups'),
  BACKUP_KEEP: parseInt(process.env.BACKUP_KEEP || '14', 10) || 14,
  BACKUP_EVERY_HOURS: parseFloat(process.env.BACKUP_EVERY_HOURS || '6') || 6,

  // Database
  DATABASE_PATH: process.env.DATABASE_PATH
    ? path.resolve(root, process.env.DATABASE_PATH)
    : path.join(dataDir, 'school.db'),

  // Uploads
  UPLOAD_DIR: process.env.UPLOAD_DIR
    ? path.resolve(root, process.env.UPLOAD_DIR)
    : (legacyUploads || path.join(dataDir, 'uploads')),
  MAX_FILE_SIZE: (parseInt(process.env.MAX_FILE_SIZE_MB || '15', 10) || 15) * 1024 * 1024,

  // Auth
  JWT_SECRET: process.env.JWT_SECRET || 'insecure-dev-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '12h',
  STRONG_PASSWORDS: bool(process.env.STRONG_PASSWORDS, true),

  // CORS
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Rate limiting
  RATE_LIMIT_PER_MINUTE: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '600', 10),
  LOGIN_RATE_LIMIT_PER_15MIN: parseInt(process.env.LOGIN_RATE_LIMIT_PER_15MIN || '20', 10),

  // Demo data
  SEED_DEMO_DATA: bool(process.env.SEED_DEMO_DATA, true),

  root,
};

if (env.JWT_SECRET === 'insecure-dev-secret-change-me' && env.NODE_ENV === 'production') {
  // Fail fast in production rather than silently running insecure.
  throw new Error('JWT_SECRET must be set to a strong random value in production.');
}

module.exports = env;
