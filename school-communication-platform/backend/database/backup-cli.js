/**
 * Backup / restore command line.
 *
 *   node backend/database/backup-cli.js backup            take a snapshot now
 *   node backend/database/backup-cli.js list              show the snapshots
 *   node backend/database/backup-cli.js restore <file>    restore one
 *
 * A snapshot is a plain SQLite file (see services/backup.js), so it can also
 * be copied off the host and opened with any SQLite tool.
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const cmd = process.argv[2] || 'backup';

if (cmd === 'list') {
  const { listBackups } = require('../services/backup');
  const rows = listBackups();
  console.log(`Backups in ${env.BACKUP_DIR}`);
  if (!rows.length) { console.log('  (none yet)'); process.exit(0); }
  for (const r of rows) {
    console.log(`  ${r.name}  ${(r.size / 1024 / 1024).toFixed(2)} MB  ${r.created_at}`);
  }
  process.exit(0);
}

if (cmd === 'backup') {
  const { backupNow } = require('../services/backup');
  const file = backupNow('cli');
  if (!file) { console.error('Backup failed — is the data folder writable?'); process.exit(1); }
  console.log(`Snapshot saved: ${file}`);
  console.log(`Data folder:    ${env.DATA_DIR}`);
  process.exit(0);
}

if (cmd === 'restore') {
  const src = process.argv[3];
  if (!src) { console.error('Usage: backup-cli.js restore <snapshot-file>'); process.exit(1); }
  const from = path.isAbsolute(src) ? src : path.resolve(env.BACKUP_DIR, src);
  if (!fs.existsSync(from)) { console.error(`No such snapshot: ${from}`); process.exit(1); }

  const target = env.DATABASE_PATH;
  if (fs.existsSync(target)) {
    const safety = `${target}.pre-restore-${Date.now()}`;
    fs.copyFileSync(target, safety);
    console.log(`Current database kept at ${safety}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // remove the WAL sidecars: they belong to the old file
  for (const side of ['-wal', '-shm']) {
    try { fs.unlinkSync(target + side); } catch { /* not there */ }
  }
  fs.copyFileSync(from, target);
  console.log(`Restored ${path.basename(from)} -> ${target}`);
  process.exit(0);
}

console.error('Unknown command. Use: backup | list | restore <file>');
process.exit(1);
