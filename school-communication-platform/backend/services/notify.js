/**
 * Notification service.
 * Notifications are stored in the database and also pushed over Socket.IO
 * to the recipient when they are connected.
 *
 * Delivery is gated by TWO layers, both enforced here (never on the client):
 *  1. School-wide preferences (Super Admin -> Settings -> Notification preferences)
 *  2. Per-user preferences (user_preferences.notif_prefs, configured in Profile)
 * A type is delivered only when BOTH allow it (missing user pref = follow school default).
 */
const { run, get } = require('../database/db');
const { readSettings } = require('./settingsService');

let io = null;

function setIO(socketServer) {
  io = socketServer;
}

// notification type -> settings/prefs key (null = always on)
const TYPE_KEY = {
  message: 'newMessage',
  document: 'newDocument',
  announcement: 'newAnnouncement',
  assignment: 'assignments',
  attendance: 'attendance',
  exam: 'exams',
  results: 'results',
  fee: 'fees',
  account: 'accountChanges',
  system: null,
};

function parsePrefs(json) {
  try { return json ? JSON.parse(json) : {}; } catch { return {}; }
}

function typeAllowed(type, userId) {
  const key = TYPE_KEY[type];
  if (!key) return true; // system notifications always on

  // School-wide default
  let schoolDefault = true;
  try {
    const prefs = readSettings().notifications;
    schoolDefault = prefs[key] !== false;
  } catch { /* keep true */ }

  // Per-user override (missing = follow school default)
  let userAllowed = schoolDefault;
  try {
    const row = get('SELECT notif_prefs FROM user_preferences WHERE user_id = ?', [userId]);
    if (row) {
      const up = parsePrefs(row.notif_prefs);
      if (up[key] !== undefined) userAllowed = !!up[key];
    }
  } catch { /* keep school default */ }

  return userAllowed;
}

/**
 * Create a notification for a user.
 * @param {number} userId
 * @param {string} type message|document|announcement|assignment|attendance|exam|results|fee|system|account
 */
function notify(userId, type, title, body = '', link = '') {
  if (!userId) return null;
  if (!typeAllowed(type, userId)) return null;
  try {
    const info = run(
      'INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)',
      [userId, type, String(title).slice(0, 255), String(body).slice(0, 500), String(link).slice(0, 255)]
    );
    const id = info.lastInsertRowid;
    if (io) {
      io.to(`user:${userId}`).emit('notification', {
        id,
        type,
        title,
        body,
        link,
        read: 0,
        created_at: new Date().toISOString(),
      });
    }
    return id;
  } catch (e) {
    return null;
  }
}

/** Notify many users at once. */
function notifyMany(userIds, type, title, body = '', link = '') {
  const list = [...new Set((userIds || []).filter(Boolean))];
  for (const id of list) notify(id, type, title, body, link);
  return list.length;
}

/**
 * Notify a user but only once per (type, title) — used for reminders so the
 * daily deadline/attendance jobs never spam duplicates.
 */
function notifyOnce(userId, type, title, body = '', link = '') {
  if (!userId) return null;
  const exists = get(
    'SELECT id FROM notifications WHERE user_id = ? AND type = ? AND title = ? LIMIT 1',
    [userId, type, title]
  );
  if (exists) return null;
  return notify(userId, type, title, body, link);
}

module.exports = { setIO, notify, notifyMany, notifyOnce };
