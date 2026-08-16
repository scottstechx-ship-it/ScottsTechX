/**
 * Settings service — single source of truth for school configuration.
 * (Moved out of the route file so other services — e.g. notifications —
 * can read settings without circular imports.)
 */
const { all, run } = require('../database/db');

const DEFAULT_SCHOOL = {
  name: 'My School',
  motto: '',
  logo: null,
  phone: '',
  email: '',
  address: '',
  website: '',
  academicYears: ['2026'],
  currentAcademicYear: '2026',
  streams: ['A', 'B', 'C'],
  departments: ['Science', 'Humanities', 'Languages', 'Administration'],
  sessionDurationDays: 7,
  // Default credentials for auto-created accounts (bulk imports & new staff).
  // Students/teachers are forced to change these on first login.
  defaultStudentPassword: 'Student@123',
  defaultTeacherPassword: 'Teacher@123',
};

const DEFAULT_PERMISSIONS = {
  student: { messageTeacher: true, messageAdmin: true, messageClassChat: true, sendAttachments: true },
  parent: { messageClassTeacher: true, messageSubjectTeacher: true, messageAdmin: true, sendAttachments: true },
  teacher: { messageStudents: true, messageParents: true, messageAdmin: true, messageClassChat: true, sendAttachments: true },
  admin: { messageEveryone: true, sendAttachments: true },
  studentMessagingEnabled: true,
  parentMessagingEnabled: true,
};

const DEFAULT_NOTIFICATIONS = {
  newMessage: true,
  newDocument: true,
  newAnnouncement: true,
  importantNotices: true,
  accountChanges: true,
  emailOn: 'important', // 'none' | 'important' | 'all'
};

const DEFAULT_SECURITY = {
  strongPasswords: true,
  sessionExpiryDays: 1,
  loginRateLimit: 20,
  allowParentRegistration: false,
};

function readSettings() {
  const rows = all('SELECT key, value FROM settings');
  const map = {};
  for (const r of rows) { try { map[r.key] = JSON.parse(r.value); } catch { map[r.key] = r.value; } }
  return {
    school: { ...DEFAULT_SCHOOL, ...(map.school || {}) },
    permissions: { ...DEFAULT_PERMISSIONS, ...(map.permissions || {}) },
    notifications: { ...DEFAULT_NOTIFICATIONS, ...(map.notifications || {}) },
    security: { ...DEFAULT_SECURITY, ...(map.security || {}) },
    api: map.api || { apiDocsUrl: '/docs/api.html', maxFileSizeMB: 15 },
    backup: map.backup || { autoBackup: false, lastBackupAt: null },
  };
}

function writeSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)]
  );
}

module.exports = { readSettings, writeSetting, DEFAULT_SCHOOL, DEFAULT_PERMISSIONS, DEFAULT_NOTIFICATIONS, DEFAULT_SECURITY };
