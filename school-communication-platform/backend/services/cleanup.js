/**
 * Cleanup service — auto-delete expired documents & announcements.
 * Run via cron or as a scheduled interval.
 */
const { all, get, run, tx } = require('../database/db');
const { log } = require('./audit');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');

/** Delete expired documents (expire_date <= now). */
function deleteExpiredDocuments() {
  const now = new Date().toISOString();
  try {
    const expired = all('SELECT * FROM documents WHERE expire_date IS NOT NULL AND expire_date <= ?', [now]);
    if (!expired.length) return { documents: 0, files: 0 };

    let filesDeleted = 0;
    for (const doc of expired) {
      tx(() => {
        run('DELETE FROM document_access WHERE document_id = ?', [doc.id]);
        run('UPDATE messages SET attachment_id = NULL WHERE attachment_id = ?', [doc.id]);
        run('DELETE FROM documents WHERE id = ?', [doc.id]);
      });
      const filePath = path.join(env.UPLOAD_DIR, path.basename(doc.storage_path));
      try { fs.unlinkSync(filePath); filesDeleted++; } catch { /* file may already be gone */ }
      log({ id: 0, role: 'system' }, 'DOCUMENT_AUTO_DELETED', `Auto-deleted expired document "${doc.name}"`, 'system');
    }
    return { documents: expired.length, files: filesDeleted };
  } catch (e) {
    // Column may not exist in test DB
    return { documents: 0, files: 0, error: e.message };
  }
}

/** Delete expired announcements (expire_date <= now). */
function deleteExpiredAnnouncements() {
  const now = new Date().toISOString();
  try {
    const expired = all('SELECT * FROM announcements WHERE expire_date IS NOT NULL AND expire_date <= ?', [now]);
    if (!expired.length) return { announcements: 0 };

    for (const ann of expired) {
      run('DELETE FROM announcement_reads WHERE announcement_id = ?', [ann.id]);
      run('DELETE FROM announcements WHERE id = ?', [ann.id]);
      log({ id: 0, role: 'system' }, 'ANNOUNCEMENT_AUTO_DELETED', `Auto-deleted expired announcement "${ann.title}"`, 'system');
    }
    return { announcements: expired.length };
  } catch (e) {
    // Column may not exist in test DB
    return { announcements: 0, error: e.message };
  }
}

/** Run all cleanup tasks. Returns summary. */
function runCleanup() {
  const docs = deleteExpiredDocuments();
  const anns = deleteExpiredAnnouncements();
  const summary = { ...docs, ...anns, timestamp: new Date().toISOString() };
  if (summary.documents || summary.announcements) {
    console.log('[Cleanup]', JSON.stringify(summary));
  }
  return summary;
}

/** Start periodic cleanup (default: every hour). */
function startCleanupInterval(intervalMs = 60 * 60 * 1000) {
  console.log(`[Cleanup] Starting auto-cleanup every ${intervalMs / 1000}s`);
  runCleanup(); // run once on start
  return setInterval(runCleanup, intervalMs);
}

module.exports = { deleteExpiredDocuments, deleteExpiredAnnouncements, runCleanup, startCleanupInterval };