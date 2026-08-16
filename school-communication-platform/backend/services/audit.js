/**
 * Audit log service.
 * Records important system activity (logins, user changes, uploads, deletes...).
 * Super admins can browse these in the Activity Logs section.
 */
const { run } = require('../database/db');

function log(user, action, details = '', ip = '') {
  try {
    run(
      `INSERT INTO activity_logs (user_id, user_name, role, action, details, ip)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        user ? user.id : null,
        user ? user.full_name : 'System',
        user ? user.role : 'system',
        action,
        typeof details === 'string' ? details.slice(0, 2000) : JSON.stringify(details).slice(0, 2000),
        ip || '',
      ]
    );
  } catch (e) {
    // Logging must never break a request.
  }
}

module.exports = { log };
