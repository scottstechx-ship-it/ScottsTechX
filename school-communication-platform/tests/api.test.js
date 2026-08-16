/**
 * End-to-end API tests.
 * Starts a real server on a temporary port/database and exercises:
 * login/logout, role-based access control, messaging, documents,
 * announcements, notifications, search, user management, settings, logs.
 *
 * Run: npm test
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4599;
const BASE = `http://127.0.0.1:${PORT}`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-test-'));
const env = {
  ...process.env,
  PORT: String(PORT),
  DATABASE_PATH: path.join(tmpDir, 'test.db'),
  UPLOAD_DIR: path.join(tmpDir, 'uploads'),
  SEED_DEMO_DATA: '1',
  JWT_SECRET: 'test-secret-12345',
  ALLOWED_ORIGINS: '*',
  RATE_LIMIT_PER_MINUTE: '100000',
};

let serverProc;

async function api(route, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + route, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, res };
}

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Server did not start in time');
}

before(async () => {
  serverProc = spawn(process.execPath, ['backend/server.js'], { env, cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  await waitForServer();
});

after(() => {
  try { serverProc.kill('SIGKILL'); } catch {}
});

let tokens = {};
async function login(username, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { username, password } });
  assert.strictEqual(r.status, 200, `login ${username} failed: ${JSON.stringify(r.data)}`);
  assert.ok(r.data.token, 'token returned');
  return r.data.token;
}

// ---------------------------------------------------------------- auth
test('demo accounts can log in with the correct role', async () => {
  const cases = [
    ['superadmin', 'SuperAdmin@123', 'super_admin'],
    ['admin', 'Admin@123', 'admin'],
    ['teacher1', 'Teacher@123', 'teacher'],
    ['teacher2', 'Teacher@123', 'teacher'],
    ['teacher3', 'Teacher@123', 'teacher'],
    ['student1', 'Student@123', 'student'],
    ['student2', 'Student@123', 'student'],
    ['parent1', 'Parent@123', 'parent'],
  ];
  for (const [u, p, role] of cases) {
    tokens[u] = await login(u, p);
    const me = await api('/api/auth/me', { token: tokens[u] });
    assert.strictEqual(me.data.user.role, role, `${u} role`);
    assert.strictEqual(me.status, 200);
  }
});

test('wrong password is rejected with a friendly message', async () => {
  const r = await api('/api/auth/login', { method: 'POST', body: { username: 'student1', password: 'wrong-password' } });
  assert.strictEqual(r.status, 401);
  assert.ok(r.data.error);
});

test('logout is recorded', async () => {
  const r = await api('/api/auth/logout', { method: 'POST', token: tokens.student1 });
  assert.strictEqual(r.status, 200);
});

// ---------------------------------------------------------------- RBAC
test('students cannot access admin-only APIs', async () => {
  for (const route of ['/api/users', '/api/settings/all', '/api/logs', '/api/parents', '/api/teachers']) {
    const r = await api(route, { token: tokens.student1 });
    assert.strictEqual(r.status, 403, `${route} should be 403 for student`);
  }
});

test('requests without a token are rejected', async () => {
  const r = await api('/api/messages/conversations');
  assert.strictEqual(r.status, 401);
});

// ---------------------------------------------------------------- users
test('super admin can create, edit and delete users', async () => {
  const created = await api('/api/users', {
    method: 'POST', token: tokens.superadmin,
    body: { fullName: 'Test Officer', username: 'officer1', password: 'Officer@123', role: 'admin', email: 'officer1@test.local' },
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  const id = created.data.user.id;

  const edited = await api(`/api/users/${id}`, { method: 'PUT', token: tokens.superadmin, body: { fullName: 'Test Officer II', status: 'active' } });
  assert.strictEqual(edited.status, 200);
  assert.strictEqual(edited.data.user.full_name, 'Test Officer II');

  const reset = await api(`/api/users/${id}/reset-password`, { method: 'POST', token: tokens.superadmin, body: { newPassword: 'NewPass@456' } });
  assert.strictEqual(reset.status, 200);
  const relogin = await api('/api/auth/login', { method: 'POST', body: { username: 'officer1', password: 'NewPass@456' } });
  assert.strictEqual(relogin.status, 200);

  const del = await api(`/api/users/${id}`, { method: 'DELETE', token: tokens.superadmin });
  assert.strictEqual(del.status, 200);
});

test('super admin cannot delete themselves', async () => {
  const me = (await api('/api/auth/me', { token: tokens.superadmin })).data.user;
  const r = await api(`/api/users/${me.id}`, { method: 'DELETE', token: tokens.superadmin });
  assert.strictEqual(r.status, 400);
});

// ---------------------------------------------------------------- students
test('admin can create and search students', async () => {
  const created = await api('/api/students', {
    method: 'POST', token: tokens.admin,
    body: { fullName: 'Kato Test', studentCode: 'STU-TEST-99', username: 'kato1', password: 'Kato@12345' },
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));

  const search = await api('/api/students?search=Kato', { token: tokens.admin });
  assert.ok(search.data.students.some((s) => s.student_code === 'STU-TEST-99'));

  const bad = await api('/api/students', { method: 'POST', token: tokens.student1, body: { fullName: 'x', studentCode: 'y' } });
  assert.strictEqual(bad.status, 403, 'students cannot create students');
});

// ---------------------------------------------------------------- messaging
test('parent may message their child\'s class teacher', async () => {
  // teacher1 = Ms. Mary (class teacher of S.2A where Sarah is)
  const r = await api('/api/messages/conversations', {
    method: 'POST', token: tokens.parent1,
    body: { type: 'direct', participantId: 3 }, // teacher1 user id = 3
  });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.conversation && r.data.conversation.id);
});

test('parent cannot message a student directly', async () => {
  const r = await api('/api/messages/conversations', {
    method: 'POST', token: tokens.parent1, body: { type: 'direct', participantId: 6 }, // student1 user id = 6
  });
  assert.strictEqual(r.status, 403);
});

test('student cannot message a teacher of another class', async () => {
  // student2 (S.5A) trying to reach teacher3 (Grace, S.4A) — user id 5
  const r = await api('/api/messages/conversations', {
    method: 'POST', token: tokens.student2, body: { type: 'direct', participantId: 5 },
  });
  assert.strictEqual(r.status, 403);
});

test('send a message, read receipts and unread counts work', async () => {
  const conv = await api('/api/messages/conversations', {
    method: 'POST', token: tokens.parent1, body: { type: 'direct', participantId: 3 },
  });
  const convId = conv.data.conversation.id;

  const sent = await api('/api/messages', { method: 'POST', token: tokens.parent1, body: { conversationId: convId, content: 'Hello teacher, is my child well?' } });
  assert.strictEqual(sent.status, 201);

  // teacher1 sees unread
  const unread = await api('/api/messages/unread-count', { token: tokens.teacher1 });
  assert.ok(unread.data.unread >= 1);

  // teacher reads the conversation
  const read = await api(`/api/messages/conversations/${convId}/read`, { method: 'PUT', token: tokens.teacher1 });
  assert.strictEqual(read.status, 200);

  const thread = await api(`/api/messages/conversations/${convId}`, { token: tokens.teacher1 });
  const last = thread.data.messages[thread.data.messages.length - 1];
  assert.strictEqual(last.content, 'Hello teacher, is my child well?');
  assert.strictEqual(last.is_read_by_me, 1, 'message should be read by the teacher');

  // message search
  const search = await api('/api/messages/search?q=child', { token: tokens.teacher1 });
  assert.ok(search.data.messages.some((m) => m.content.includes('child')));
});

test('non-participants cannot read a conversation', async () => {
  const conv = await api('/api/messages/conversations', {
    method: 'POST', token: tokens.parent1, body: { type: 'direct', participantId: 3 },
  });
  const convId = conv.data.conversation.id;
  const r = await api(`/api/messages/conversations/${convId}`, { token: tokens.student2 });
  assert.strictEqual(r.status, 403);
});

// ---------------------------------------------------------------- documents
test('document upload, sharing, scoped listing and download', async () => {
  const file = Buffer.from('Hello students — new notice from the office.');
  const form = new FormData();
  form.append('file', new Blob([file], { type: 'text/plain' }), 'office-notice.txt');
  form.append('description', 'Test notice');
  form.append('share', JSON.stringify([{ targetType: 'role', targetId: 'student' }]));

  const up = await api('/api/documents', { method: 'POST', token: tokens.admin, form });
  assert.strictEqual(up.status, 201, JSON.stringify(up.data));
  const docId = up.data.document.id;

  // student1 can list and download
  const list = await api('/api/documents', { token: tokens.student1 });
  assert.ok(list.data.documents.some((d) => d.id === docId));

  const dl = await api(`/api/documents/${docId}/download`, { token: tokens.student1 });
  assert.strictEqual(dl.status, 200);

  // non-granted user: use a teacher account not granted anything (teacher3, S.4A)
  const tokenT3 = await login('teacher3', 'Teacher@123');
  const denied = await api(`/api/documents/${docId}/download`, { token: tokenT3 });
  assert.strictEqual(denied.status, 403, 'teacher without access must be denied');

  // delete
  const del = await api(`/api/documents/${docId}`, { method: 'DELETE', token: tokens.admin });
  assert.strictEqual(del.status, 200);
});

test('rejecting an invalid file type', async () => {
  const form = new FormData();
  form.append('file', new Blob(['x'], { type: 'text/plain' }), 'evil.exe');
  const r = await api('/api/documents', { method: 'POST', token: tokens.admin, form });
  assert.strictEqual(r.status, 400);
});

// ---------------------------------------------------------------- announcements
test('teacher class announcement reaches that class only (students, teachers, parents)', async () => {
  // teacher2 (John) is the class teacher of Senior 5 A (class id 6). Only he may post it.
  const created = await api('/api/announcements', {
    method: 'POST', token: tokens.teacher2,
    body: { title: 'English Essay Due Friday', content: 'Submit your essay by 4pm.', targetType: 'class', targetValue: '6', important: false },
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));

  // student2 (David, S.5A) sees it
  const s2 = await api('/api/announcements', { token: tokens.student2 });
  assert.ok(s2.data.announcements.some((a) => a.title === 'English Essay Due Friday'));

  // student1 (Sarah, S.2A) does NOT see it
  const s1 = await api('/api/announcements', { token: tokens.student1 });
  assert.ok(!s1.data.announcements.some((a) => a.title === 'English Essay Due Friday'));

  // teacher2 (the sender) sees it
  const t2ann = await api('/api/announcements', { token: tokens.teacher2 });
  assert.ok(t2ann.data.announcements.some((a) => a.title === 'English Essay Due Friday'));

  // teacher1 (Mary, S.2A only) does NOT see it
  const t1ann = await api('/api/announcements', { token: tokens.teacher1 });
  assert.ok(!t1ann.data.announcements.some((a) => a.title === 'English Essay Due Friday'));

  // parent1 (David's parent) sees it
  const p1 = await api('/api/parents/announcements', { token: tokens.parent1 });
  assert.ok(p1.data.announcements.some((a) => a.title === 'English Essay Due Friday'));
});

test('teachers cannot post school-wide announcements', async () => {
  const r = await api('/api/announcements', {
    method: 'POST', token: tokens.teacher1,
    body: { title: 'x', content: 'y', targetType: 'all' },
  });
  assert.strictEqual(r.status, 403);
});

// ---------------------------------------------------------------- notifications
test('notifications are created and can be marked read', async () => {
  const before = await api('/api/notifications/unread-count', { token: tokens.student1 });
  const file = Buffer.from('notice 2');
  const form = new FormData();
  form.append('file', new Blob([file]), 'notice2.txt');
  form.append('share', JSON.stringify([{ targetType: 'role', targetId: 'student' }]));
  await api('/api/documents', { method: 'POST', token: tokens.admin, form });

  const after = await api('/api/notifications/unread-count', { token: tokens.student1 });
  assert.ok(after.data.unread >= before.data.unread + 1, 'student should receive a notification');

  const list = await api('/api/notifications', { token: tokens.student1 });
  const unreadItem = list.data.notifications.find((n) => !n.read);
  if (unreadItem) {
    const mark = await api(`/api/notifications/${unreadItem.id}/read`, { method: 'PUT', token: tokens.student1 });
    assert.strictEqual(mark.status, 200);
  }
});

// ---------------------------------------------------------------- settings & logs
test('super admin can update school settings', async () => {
  const r = await api('/api/settings/school', {
    method: 'PUT', token: tokens.superadmin,
    body: { name: 'Test College (E2E)', motto: 'Work hard' },
  });
  assert.strictEqual(r.status, 200);
  const pub = await api('/api/settings/public', { token: tokens.student1 });
  assert.strictEqual(pub.data.school.name, 'Test College (E2E)');
});

test('admins cannot change settings', async () => {
  const r = await api('/api/settings/school', { method: 'PUT', token: tokens.admin, body: { name: 'x' } });
  assert.strictEqual(r.status, 403);
});

test('audit log records logins and super admin can browse it', async () => {
  await login('teacher2', 'Teacher@123');
  const logs = await api('/api/logs?limit=50', { token: tokens.superadmin });
  assert.strictEqual(logs.status, 200);
  assert.ok(logs.data.logs.some((l) => l.action === 'LOGIN'));
  const forbidden = await api('/api/logs', { token: tokens.admin });
  assert.strictEqual(forbidden.status, 403);
});

test('backup endpoint returns JSON for super admin', async () => {
  const r = await api('/api/settings/backup', { method: 'POST', token: tokens.superadmin });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.users && r.data.messages && r.data.documents);
});

// ---------------------------------------------------------------- search & health
test('search endpoints work', async () => {
  const users = await api('/api/users?search=Okello', { token: tokens.superadmin });
  assert.ok(users.data.users.length >= 2);
  const students = await api('/api/students?search=Sarah', { token: tokens.admin });
  assert.ok(students.data.students.length >= 1);
});

test('health endpoint', async () => {
  const r = await api('/api/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.status, 'ok');
});

// ---------------------------------------------------------------- broadcast
test('admin can broadcast to a whole role (all teachers)', async () => {
  const r = await api('/api/messages/conversations', {
    method: 'POST', token: tokens.admin, body: { type: 'broadcast', role: 'teacher' },
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  const convId = r.data.conversation.id;
  assert.strictEqual(r.data.conversation.type, 'broadcast');

  // teacher1 sees it; student1 does not
  const t = await api('/api/messages/conversations', { token: tokens.teacher1 });
  assert.ok(t.data.conversations.some((c) => c.id === convId));
  const s = await api('/api/messages/conversations', { token: tokens.student1 });
  assert.ok(!s.data.conversations.some((c) => c.id === convId));

  // re-opening returns the same conversation (idempotent)
  const again = await api('/api/messages/conversations', {
    method: 'POST', token: tokens.admin, body: { type: 'broadcast', role: 'teacher' },
  });
  assert.strictEqual(again.data.conversation.id, convId);

  // send a message into the broadcast and verify a teacher receives a notification
  const sent = await api('/api/messages', { method: 'POST', token: tokens.admin, body: { conversationId: convId, content: 'Staff meeting tomorrow at 4pm.' } });
  assert.strictEqual(sent.status, 201);
  const notifs = await api('/api/notifications', { token: tokens.teacher1 });
  assert.ok(notifs.data.notifications.some((n) => n.type === 'message' && n.body.includes('Staff meeting')));
});

test('students cannot create broadcasts', async () => {
  const r = await api('/api/messages/conversations', {
    method: 'POST', token: tokens.student1, body: { type: 'broadcast', role: 'teacher' },
  });
  assert.strictEqual(r.status, 403);
});

// ---------------------------------------------------------------- forgot/reset password
test('forgot-password flow works end to end', async () => {
  // student1's seeded email is sarah@school.test
  const req = await api('/api/auth/forgot-password', { method: 'POST', body: { email: 'sarah@school.test' } });
  assert.strictEqual(req.status, 200);
  assert.ok(req.data.devLink, 'dev mode should return a reset link');

  const token = new URL(req.data.devLink).searchParams.get('token');
  assert.ok(token);

  // invalid token rejected
  const bad = await api('/api/auth/reset-password', { method: 'POST', body: { token: 'nonsense', newPassword: 'NewPass@999' } });
  assert.strictEqual(bad.status, 400);

  // valid reset
  const reset = await api('/api/auth/reset-password', { method: 'POST', body: { token, newPassword: 'NewPass@999' } });
  assert.strictEqual(reset.status, 200, JSON.stringify(reset.data));

  // old password no longer works, new one does
  const oldLogin = await api('/api/auth/login', { method: 'POST', body: { username: 'student1', password: 'Student@123' } });
  assert.strictEqual(oldLogin.status, 401);
  const newLogin = await api('/api/auth/login', { method: 'POST', body: { username: 'student1', password: 'NewPass@999' } });
  assert.strictEqual(newLogin.status, 200);
  tokens.student1 = newLogin.data.token;

  // reusing the token fails
  const reuse = await api('/api/auth/reset-password', { method: 'POST', body: { token, newPassword: 'Another@123' } });
  assert.strictEqual(reuse.status, 400);
});

test('forgot-password does not reveal whether an email exists', async () => {
  const missing = await api('/api/auth/forgot-password', { method: 'POST', body: { email: 'nobody@nowhere.test' } });
  assert.strictEqual(missing.status, 200);
  assert.strictEqual(missing.data.devLink, undefined);
  assert.ok(missing.data.message);
});

// ---------------------------------------------------------------- profile picture
test('users can upload a profile picture and it is served authenticated', async () => {
  // 1x1 transparent PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'me.png');
  const up = await api('/api/auth/profile-picture', { method: 'POST', token: tokens.admin, form });
  assert.strictEqual(up.status, 200, JSON.stringify(up.data));
  assert.ok(up.data.user.profilePicture, JSON.stringify(up.data.user));

  const me = (await api('/api/auth/me', { token: tokens.admin })).data.user;
  const avatar = await fetch(`http://127.0.0.1:${PORT}/api/users/${me.id}/avatar`, { headers: { Authorization: 'Bearer ' + tokens.admin } });
  assert.strictEqual(avatar.status, 200);

  // wrong file type rejected
  const badForm = new FormData();
  badForm.append('file', new Blob(['x'], { type: 'text/plain' }), 'notes.txt');
  const bad = await api('/api/auth/profile-picture', { method: 'POST', token: tokens.admin, form: badForm });
  assert.strictEqual(bad.status, 400);
});

// ---------------------------------------------------------------- office previews
test('office files get a graceful preview response', async () => {
  // a fake .docx upload (not a real zip) must fail extraction gracefully -> 415
  const form = new FormData();
  form.append('file', new Blob(['not a real docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'notes.docx');
  const up = await api('/api/documents', { method: 'POST', token: tokens.teacher1, form });
  assert.strictEqual(up.status, 201, JSON.stringify(up.data));
  const preview = await api(`/api/documents/${up.data.document.id}/preview`, { token: tokens.teacher1 });
  assert.strictEqual(preview.status, 415, 'garbage docx should return 415, not crash');
});

// ---------------------------------------------------------------- notification preferences
test('notification preferences gate in-app notifications', async () => {
  // disable document notifications
  await api('/api/settings/notifications', {
    method: 'PUT', token: tokens.superadmin,
    body: { newDocument: false },
  });
  const before = await api('/api/notifications/unread-count', { token: tokens.student2 });
  const file = Buffer.from('notice for prefs test');
  const form = new FormData();
  form.append('file', new Blob([file]), 'prefs-notice.txt');
  form.append('share', JSON.stringify([{ targetType: 'role', targetId: 'student' }]));
  await api('/api/documents', { method: 'POST', token: tokens.admin, form });
  const after = await api('/api/notifications/unread-count', { token: tokens.student2 });
  assert.strictEqual(after.data.unread, before.data.unread, 'no notification should be created when disabled');

  // re-enable
  await api('/api/settings/notifications', {
    method: 'PUT', token: tokens.superadmin,
    body: { newDocument: true },
  });
});

// ===========================================================================
// UPGRADE v2 — preferences, academics, fees, imports, messaging controls
// ===========================================================================

test('user preferences persist (theme + notification toggles)', async () => {
  const put = await api('/api/auth/preferences', { method: 'PUT', token: tokens.student1, body: { theme: 'dark', notifPrefs: { fees: false, exams: true } } });
  assert.strictEqual(put.status, 200);
  const get = await api('/api/auth/preferences', { token: tokens.student1 });
  assert.strictEqual(get.data.preferences.theme, 'dark');
  assert.strictEqual(get.data.preferences.notifPrefs.fees, false);
  assert.strictEqual(get.data.preferences.notifPrefs.exams, true);
  const me = await api('/api/auth/me', { token: tokens.student1 });
  assert.strictEqual(me.data.preferences.theme, 'dark');
});

test('subjects CRUD (admin) and read (teacher)', async () => {
  const created = await api('/api/subjects', { method: 'POST', token: tokens.admin, body: { name: 'History', code: 'HIS', department: 'Humanities' } });
  assert.strictEqual(created.status, 201);
  const t = await api('/api/subjects', { token: tokens.teacher1 });
  assert.ok(t.data.subjects.some((s) => s.name === 'History'));
  const id = created.data.subject.id;
  const upd = await api(`/api/subjects/${id}`, { method: 'PUT', token: tokens.admin, body: { name: 'History & Citizenship' } });
  assert.strictEqual(upd.status, 200);
  const del = await api(`/api/subjects/${id}`, { method: 'DELETE', token: tokens.admin });
  assert.strictEqual(del.status, 200);
  const forbidden = await api('/api/subjects', { method: 'POST', token: tokens.student1, body: { name: 'x' } });
  assert.strictEqual(forbidden.status, 403);
});

test('attendance: teacher marks own class, cannot mark another', async () => {
  // teacher1 (Mary) teaches S.2A (class 3)
  const ok = await api('/api/attendance', { method: 'POST', token: tokens.teacher1, body: { classId: 3, date: '2026-08-14', records: [{ studentId: 1, status: 'present' }, { studentId: 4, status: 'absent' }] } });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.data));
  assert.strictEqual(ok.data.marked, 2);
  // teacher1 does not teach S.5A (class 6)
  const denied = await api('/api/attendance', { method: 'POST', token: tokens.teacher1, body: { classId: 6, date: '2026-08-14', records: [{ studentId: 2, status: 'present' }] } });
  assert.strictEqual(denied.status, 403);
});

test('attendance: parents see only their own children; summary works', async () => {
  const summary = await api('/api/attendance/summary/student/1', { token: tokens.parent1 });
  assert.strictEqual(summary.status, 200);
  assert.ok(summary.data.total >= 1);
  // parent1 is not linked to student 5 (Brian) — no access
  const denied = await api('/api/attendance/summary/student/5', { token: tokens.parent1 });
  assert.strictEqual(denied.status, 403);
  // student sees own only
  const own = await api('/api/attendance?studentId=1', { token: tokens.student1 });
  assert.strictEqual(own.status, 200);
  const other = await api('/api/attendance?studentId=2', { token: tokens.student1 });
  assert.strictEqual(other.status, 403);
});

test('assignments: create, submit, grade, publish with notifications', async () => {
  const created = await api('/api/assignments', { method: 'POST', token: tokens.teacher1, body: { title: 'Essay on Ecology', classId: 3, subject: 'Science', dueDate: '2026-09-01' } });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  const id = created.data.assignment.id;

  // student1 (S.2A) sees it
  const seen = await api('/api/assignments', { token: tokens.student1 });
  assert.ok(seen.data.assignments.some((a) => a.id === id));

  // submit
  const sub = await api(`/api/assignments/${id}/submit`, { method: 'POST', token: tokens.student1, body: { content: 'My essay about protecting wetlands.' } });
  assert.strictEqual(sub.status, 200);

  // grade
  const detail = await api(`/api/assignments/${id}`, { token: tokens.teacher1 });
  const submissionId = detail.data.assignment.submissions[0].id;
  const graded = await api(`/api/assignments/${id}/grade/${submissionId}`, { method: 'PUT', token: tokens.teacher1, body: { grade: 88, comment: 'Excellent work!' } });
  assert.strictEqual(graded.status, 200);

  // before publish, student does not see the grade
  const before = await api(`/api/assignments/${id}`, { token: tokens.student1 });
  assert.strictEqual(before.data.assignment.my_submission.grade, null);

  // publish -> student gets grade + notification
  const pub = await api(`/api/assignments/${id}/publish`, { method: 'POST', token: tokens.teacher1 });
  assert.strictEqual(pub.status, 200);
  const after = await api(`/api/assignments/${id}`, { token: tokens.student1 });
  assert.strictEqual(after.data.assignment.my_submission.grade, 88);
  const notifs = await api('/api/notifications', { token: tokens.student1 });
  assert.ok(notifs.data.notifications.some((n) => n.type === 'results' && n.title.includes('Essay on Ecology')));

  // teacher cannot create for another class
  const denied = await api('/api/assignments', { method: 'POST', token: tokens.teacher1, body: { title: 'x', classId: 6 } });
  assert.strictEqual(denied.status, 403);
});

test('exams: draft -> marks -> completed -> published (admin only)', async () => {
  const created = await api('/api/exams', { method: 'POST', token: tokens.teacher1, body: { title: 'End Term Science', classId: 3, subject: 'Science', date: '2026-09-05' } });
  assert.strictEqual(created.status, 201);
  const id = created.data.exam.id;

  // student cannot see a draft
  const hidden = await api('/api/exams', { token: tokens.student1 });
  assert.ok(!hidden.data.exams.some((e) => e.id === id));

  // enter marks
  const marks = await api(`/api/exams/${id}/results`, { method: 'PUT', token: tokens.teacher1, body: { results: [{ studentId: 1, marks: 82 }, { studentId: 4, marks: 65 }] } });
  assert.strictEqual(marks.status, 200);
  const exam = await api(`/api/exams/${id}`, { token: tokens.teacher1 });
  assert.strictEqual(exam.data.exam.status, 'completed');

  // teacher cannot publish
  const teacherPub = await api(`/api/exams/${id}/publish`, { method: 'POST', token: tokens.teacher1 });
  assert.strictEqual(teacherPub.status, 403);

  // admin publishes
  const pub = await api(`/api/exams/${id}/publish`, { method: 'POST', token: tokens.admin });
  assert.strictEqual(pub.status, 200, JSON.stringify(pub.data));

  // student sees published result with own marks
  const studentView = await api(`/api/exams/${id}`, { token: tokens.student1 });
  assert.strictEqual(studentView.data.exam.my_result.marks, 82);

  // parent sees only own child's results
  const parentView = await api(`/api/exams/${id}`, { token: tokens.parent1 });
  assert.ok(parentView.data.exam.results.every((r) => r.student_id === 1 || r.student_id === 2 || r.student_id === 3));
});

test('timetable: conflict prevention and class scoping', async () => {
  const first = await api('/api/timetable', { method: 'POST', token: tokens.admin, body: { classId: 3, subject: 'Maths', teacherId: 1, room: 'R1', day: 'Monday', startTime: '08:00', endTime: '09:00' } });
  assert.strictEqual(first.status, 201);
  const conflict = await api('/api/timetable', { method: 'POST', token: tokens.admin, body: { classId: 3, subject: 'English', teacherId: 2, room: 'R2', day: 'Monday', startTime: '08:30', endTime: '09:30' } });
  assert.strictEqual(conflict.status, 409);
  const okNonConflict = await api('/api/timetable', { method: 'POST', token: tokens.admin, body: { classId: 3, subject: 'English', teacherId: 2, room: 'R2', day: 'Tuesday', startTime: '08:00', endTime: '09:00' } });
  assert.strictEqual(okNonConflict.status, 201);
  // teacher sees only their classes
  const t = await api('/api/timetable?classId=3', { token: tokens.teacher1 });
  assert.strictEqual(t.status, 200);
  const denied = await api('/api/timetable?classId=6', { token: tokens.teacher1 });
  assert.strictEqual(denied.status, 403);
});

test('fees: structure, assignment, payment, balances and visibility', async () => {
  const created = await api('/api/fees/structures', { method: 'POST', token: tokens.admin, body: { name: 'Tuition Term 2', amount: 500000, academicYear: '2026', assign: true } });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  assert.ok(created.data.assigned >= 6);

  // student 1 fee summary
  const s1 = await api('/api/fees/student/1', { token: tokens.parent1 });
  assert.strictEqual(s1.status, 200);
  assert.ok(s1.data.totalDue >= 500000);
  assert.strictEqual(s1.data.balance, s1.data.totalDue); // nothing paid yet

  // record payment
  const pay = await api('/api/fees/student/1/pay', { method: 'POST', token: tokens.admin, body: { amount: 200000, method: 'mobile money' } });
  assert.strictEqual(pay.status, 201);
  assert.ok(pay.data.receiptNo);

  const after = await api('/api/fees/student/1', { token: tokens.parent1 });
  assert.strictEqual(after.data.totalPaid, 200000);
  assert.strictEqual(after.data.balance, after.data.totalDue - 200000);

  // parent of another student cannot see student 1 fees? parent1 IS linked to student1.
  // use a fresh parent-less check: student2's parent? parent1 is not linked to student5 (Brian) via seed.
  // parent1 -> linked to students 1,2,3 only. check student 5:
  const other = await api('/api/fees/student/5', { token: tokens.parent1 });
  assert.strictEqual(other.status, 403);

  // students see their own fees only
  const self = await api('/api/fees/student/1', { token: tokens.student1 });
  assert.strictEqual(self.status, 200);
  const otherStu = await api('/api/fees/student/2', { token: tokens.student1 });
  assert.strictEqual(otherStu.status, 403);
});

test('bulk import: CSV upload -> validation -> transactional import', async () => {
  // valid + duplicate + missing-name + unknown class rows
  const csv = [
    'Full Name,Student ID,Class,Stream,Gender,Date of Birth,Parent Name,Parent Phone',
    'New Kid One,STU-NEW-001,Senior 2,A,Female,2010-01-01,Parent One,+256700001111',
    'New Kid Two,STU-NEW-002,Senior 3,A,Male,2009-02-02,Parent Two,+256700001112',
    ',STU-NEW-003,Senior 2,A,,2010-03-03,,', // missing name -> skipped
    'Duplicate Kid,STU-NEW-001,Senior 2,A,,2010-04-04,,', // duplicate id -> skipped
    'Ghost Class Kid,STU-NEW-004,Class 99,A,,2010-05-05,,', // unknown class -> skipped
  ].join('\n');
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'students.csv');
  const up = await api('/api/imports/upload', { method: 'POST', token: tokens.admin, form });
  assert.strictEqual(up.status, 200, JSON.stringify(up.data));
  const importId = up.data.importId;

  const mapping = { fullName: 'Full Name', studentCode: 'Student ID', className: 'Class', stream: 'Stream', gender: 'Gender', dateOfBirth: 'Date of Birth', parentName: 'Parent Name', parentPhone: 'Parent Phone' };

  const val = await api('/api/imports/validate', { method: 'POST', token: tokens.admin, body: { importId, mapping } });
  assert.strictEqual(val.status, 200);
  // 2 rows are importable (valid or warnings-only), 3 must be skipped
  assert.strictEqual(val.data.summary.valid + val.data.summary.warnings, 2, JSON.stringify(val.data.summary));
  assert.strictEqual(val.data.summary.errors, 3);

  const imp = await api('/api/imports/import', { method: 'POST', token: tokens.admin, body: { importId, mapping } });
  assert.strictEqual(imp.status, 200, JSON.stringify(imp.data));
  assert.strictEqual(imp.data.counts.imported, 2);
  assert.strictEqual(imp.data.counts.failed, 0);
  assert.strictEqual(imp.data.counts.skipped, 3);

  // actually in the database
  const search = await api('/api/students?search=New Kid', { token: tokens.admin });
  assert.ok(search.data.students.some((s) => s.student_code === 'STU-NEW-001'));

  // template + history endpoints exist
  const tpl = await api('/api/imports/template.csv', { token: tokens.admin });
  assert.strictEqual(tpl.status, 200);
  const history = await api('/api/imports', { token: tokens.admin });
  assert.ok(history.data.imports.length >= 1);

  // reject bad file type
  const badForm = new FormData();
  badForm.append('file', new Blob(['x'], { type: 'text/plain' }), 'evil.exe');
  const bad = await api('/api/imports/upload', { method: 'POST', token: tokens.admin, form: badForm });
  assert.strictEqual(bad.status, 400);
});

test('messaging: archive, mute, edit and channels', async () => {
  const conv = await api('/api/messages/conversations', { method: 'POST', token: tokens.parent1, body: { type: 'direct', participantId: 3 } });
  const convId = conv.data.conversation.id;

  // archive / restore
  const arch = await api(`/api/messages/conversations/${convId}/archive`, { method: 'PUT', token: tokens.parent1, body: { archived: true } });
  assert.strictEqual(arch.status, 200);
  const hidden = await api('/api/messages/conversations', { token: tokens.parent1 });
  assert.ok(!hidden.data.conversations.some((c) => c.id === convId));
  const incl = await api('/api/messages/conversations?includeArchived=1', { token: tokens.parent1 });
  assert.ok(incl.data.conversations.some((c) => c.id === convId));
  await api(`/api/messages/conversations/${convId}/archive`, { method: 'PUT', token: tokens.parent1, body: { archived: false } });

  // mute
  const mute = await api(`/api/messages/conversations/${convId}/mute`, { method: 'PUT', token: tokens.parent1, body: { muted: true } });
  assert.strictEqual(mute.status, 200);

  // send + edit own message
  const sent = await api('/api/messages', { method: 'POST', token: tokens.parent1, body: { conversationId: convId, content: 'original text' } });
  const msgId = sent.data.message.id;
  const edited = await api(`/api/messages/${msgId}`, { method: 'PUT', token: tokens.parent1, body: { content: 'edited text' } });
  assert.strictEqual(edited.status, 200);
  const thread = await api(`/api/messages/conversations/${convId}`, { token: tokens.parent1 });
  const last = thread.data.messages[thread.data.messages.length - 1];
  assert.strictEqual(last.content, 'edited text');
  assert.strictEqual(last.edited, 1);
  // others cannot edit your message
  const deny = await api(`/api/messages/${msgId}`, { method: 'PUT', token: tokens.teacher1, body: { content: 'hacked' } });
  assert.strictEqual(deny.status, 403);

  // muted parent should NOT get an in-app notification when teacher replies
  const before = await api('/api/notifications/unread-count', { token: tokens.parent1 });
  await api('/api/messages', { method: 'POST', token: tokens.teacher1, body: { conversationId: convId, content: 'reply after mute' } });
  const after = await api('/api/notifications/unread-count', { token: tokens.parent1 });
  assert.ok(after.data.unread <= before.data.unread, 'muted conversation must not notify');
});

test('announcement channels: create, subscribe, post permission', async () => {
  const created = await api('/api/messages/conversations', { method: 'POST', token: tokens.admin, body: { type: 'channel', title: 'School News Room' } });
  assert.strictEqual(created.status, 201);
  const chanId = created.data.conversation.id;

  // students cannot create channels
  const denied = await api('/api/messages/conversations', { method: 'POST', token: tokens.student1, body: { type: 'channel', title: 'x' } });
  assert.strictEqual(denied.status, 403);

  // subscribe
  const sub = await api(`/api/messages/channels/${chanId}/subscribe`, { method: 'POST', token: tokens.student1 });
  assert.strictEqual(sub.status, 200);
  const list = await api('/api/messages/channels', { token: tokens.student1 });
  const chan = list.data.channels.find((c) => c.id === chanId);
  assert.ok(chan && chan.subscribed === true);

  // a subscribed student cannot post to the channel
  const postDenied = await api('/api/messages', { method: 'POST', token: tokens.student1, body: { conversationId: chanId, content: 'spam' } });
  assert.strictEqual(postDenied.status, 403);

  // admin posts
  const post = await api('/api/messages', { method: 'POST', token: tokens.admin, body: { conversationId: chanId, content: 'School will close early Friday.' } });
  assert.strictEqual(post.status, 201);

  // unsubscribe
  const unsub = await api(`/api/messages/channels/${chanId}/unsubscribe`, { method: 'POST', token: tokens.student1 });
  assert.strictEqual(unsub.status, 200);
});

// ===========================================================================
// ACCOUNT MANAGEMENT UPGRADE — codes, forced passwords, admin powers,
// parent registration & approval
// ===========================================================================

test('admin can create a teacher without credentials → auto staff code + login + forced password', async () => {
  const created = await api('/api/teachers', {
    method: 'POST', token: tokens.admin,
    body: { fullName: 'Auto Staff', subjects: ['Maths'], classIds: [3] },
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  assert.ok(created.data.credentials && created.data.credentials.username, 'auto username returned');
  assert.ok(created.data.teacher.staff_code.startsWith('TCH-'), 'auto staff code');
  // login with the default password, must change password
  const login = await api('/api/auth/login', { method: 'POST', body: { username: created.data.credentials.username, password: created.data.credentials.password } });
  assert.strictEqual(login.status, 200);
  assert.strictEqual(login.data.user.mustChangePassword, true);
  // set a personal password
  const set = await api('/api/auth/set-password', { method: 'POST', token: login.data.token, body: { newPassword: 'MyStaff@789' } });
  assert.strictEqual(set.status, 200);
  const me = await api('/api/auth/me', { token: login.data.token });
  assert.strictEqual(me.data.user.mustChangePassword, false);
  // default password no longer works
  const oldLogin = await api('/api/auth/login', { method: 'POST', body: { username: created.data.credentials.username, password: created.data.credentials.password } });
  assert.strictEqual(oldLogin.status, 401);
});

test('admin can create and delete a user, but cannot touch super admins', async () => {
  const created = await api('/api/users', {
    method: 'POST', token: tokens.admin,
    body: { fullName: 'Temp User', username: 'tempuser1', password: 'Temp@123', role: 'student' },
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  // admin cannot create a super admin
  const evil = await api('/api/users', { method: 'POST', token: tokens.admin, body: { fullName: 'Evil', username: 'evilx1', password: 'Evil@123', role: 'super_admin' } });
  assert.strictEqual(evil.status, 403);
  // admin cannot delete the super admin account
  const sa = await api('/api/users?search=superadmin', { token: tokens.admin });
  const saId = sa.data.users[0].id;
  const delSA = await api(`/api/users/${saId}`, { method: 'DELETE', token: tokens.admin });
  assert.strictEqual(delSA.status, 403);
  // admin CAN delete a normal user
  const del = await api(`/api/users/${created.data.user.id}`, { method: 'DELETE', token: tokens.admin });
  assert.strictEqual(del.status, 200);
});

test('parent self-registration → verify → pending blocked → approve → login', async () => {
  const reg = await api('/api/auth/register', { method: 'POST', body: { fullName: 'Mrs. Test Parent', email: 'ptest@test.local', phone: '+256700001234', password: 'Parent@123' } });
  assert.strictEqual(reg.status, 200);
  assert.ok(reg.data.devVerifyLink, 'dev verify link');

  // cannot log in before verifying
  const beforeVerify = await api('/api/auth/login', { method: 'POST', body: { username: 'ptest@test.local', password: 'Parent@123' } });
  assert.strictEqual(beforeVerify.status, 403);

  const token = new URL(reg.data.devVerifyLink).searchParams.get('token');
  const verify = await api('/api/auth/verify-email', { method: 'POST', body: { token } });
  assert.strictEqual(verify.status, 200);

  // still blocked while pending
  const pendingLogin = await api('/api/auth/login', { method: 'POST', body: { username: 'ptest@test.local', password: 'Parent@123' } });
  assert.strictEqual(pendingLogin.status, 403);

  // admin sees it in pending
  const pending = await api('/api/parents/pending', { token: tokens.admin });
  const row = pending.data.pending.find((p) => p.email === 'ptest@test.local');
  assert.ok(row, 'parent appears in pending');

  // admin approves
  const approve = await api(`/api/parents/${row.id}/approve`, { method: 'POST', token: tokens.admin });
  assert.strictEqual(approve.status, 200, JSON.stringify(approve.data));

  // now login works
  const login = await api('/api/auth/login', { method: 'POST', body: { username: 'ptest@test.local', password: 'Parent@123' } });
  assert.strictEqual(login.status, 200);
});

test('rejected parents cannot log in', async () => {
  const reg = await api('/api/auth/register', { method: 'POST', body: { fullName: 'Mr. Reject Me', email: 'rejectme@test.local', password: 'Reject@123' } });
  const token = new URL(reg.data.devVerifyLink).searchParams.get('token');
  await api('/api/auth/verify-email', { method: 'POST', body: { token } });
  const pending = await api('/api/parents/pending', { token: tokens.admin });
  const row = pending.data.pending.find((p) => p.email === 'rejectme@test.local');
  const reject = await api(`/api/parents/${row.id}/reject`, { method: 'POST', token: tokens.admin });
  assert.strictEqual(reject.status, 200);
  const login = await api('/api/auth/login', { method: 'POST', body: { username: 'rejectme@test.local', password: 'Reject@123' } });
  assert.strictEqual(login.status, 403);
});

test('import auto-generates login codes + credentials CSV', async () => {
  const csv = 'Full Name,Student ID,Class,Stream,Gender,Date of Birth\nAuto Imp One,STU-AI-001,Senior 2,A,Female,2011-01-01\nAuto Imp Two,STU-AI-002,Senior 2,A,Male,2012-01-01\n';
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'auto.csv');
  const up = await api('/api/imports/upload', { method: 'POST', token: tokens.admin, form });
  const importId = up.data.importId;
  const mapping = { fullName: 'Full Name', studentCode: 'Student ID', className: 'Class', stream: 'Stream', gender: 'Gender', dateOfBirth: 'Date of Birth' };
  const imp = await api('/api/imports/import', { method: 'POST', token: tokens.admin, body: { importId, mapping } });
  assert.strictEqual(imp.status, 200, JSON.stringify(imp.data));
  assert.strictEqual(imp.data.counts.imported, 2);
  assert.ok(imp.data.credentials && imp.data.credentials.length === 2, 'credentials generated');
  assert.ok(imp.data.credentials[0].username, 'username = login code');

  // credentials CSV download (raw text, not JSON)
  const history = await api('/api/imports', { token: tokens.admin });
  const latest = history.data.imports.find((i) => i.status === 'imported');
  const csvRes = await fetch(`http://127.0.0.1:${PORT}/api/imports/${latest.id}/credentials.csv`, { headers: { Authorization: 'Bearer ' + tokens.admin } });
  assert.strictEqual(csvRes.status, 200);
  const csvText = await csvRes.text();
  assert.ok(csvText.includes('Username (login code)'));
  assert.ok(csvText.includes('STUAI001'));

  // imported student can log in with default password and must change it
  const login = await api('/api/auth/login', { method: 'POST', body: { username: 'STUAI001', password: 'Student@123' } });
  assert.strictEqual(login.status, 200);
  assert.strictEqual(login.data.user.mustChangePassword, true);
});

// ===========================================================================
// CHAT ATTACHMENTS + ADMIN CONTROL + UNDO
// ===========================================================================

test('chat attachments are downloadable by the people they are sent to', async () => {
  // teacher1 (Mary) uploads a doc, sends it in the S.2A class chat (student1 & classmates are participants)
  const form = new FormData();
  form.append('file', new Blob(['class notes content'], { type: 'text/plain' }), 'class-notes.txt');
  const up = await api('/api/documents', { method: 'POST', token: tokens.teacher1, form });
  const docId = up.data.document.id;

  const conv = await api('/api/messages/conversations', { method: 'POST', token: tokens.teacher1, body: { type: 'class', classId: 3 } });
  const convId = conv.data.conversation.id;
  const sent = await api('/api/messages', { method: 'POST', token: tokens.teacher1, body: { conversationId: convId, content: 'Notes attached', attachmentId: docId } });
  assert.strictEqual(sent.status, 201, JSON.stringify(sent.data));

  // student1 (participant) can now download it
  const dl = await api(`/api/documents/${docId}/download`, { token: tokens.student1 });
  assert.strictEqual(dl.status, 200, 'participant should download the chat attachment');
});

test('admins can delete any message (moderation control)', async () => {
  // student1 sends a message to admin
  const conv = await api('/api/messages/conversations', { method: 'POST', token: tokens.student1, body: { type: 'direct', participantId: 2 } });
  const convId = conv.data.conversation.id;
  const sent = await api('/api/messages', { method: 'POST', token: tokens.student1, body: { conversationId: convId, content: 'please delete me' } });
  const msgId = sent.data.message.id;
  // admin deletes the student's message
  const del = await api(`/api/messages/${msgId}`, { method: 'DELETE', token: tokens.admin });
  assert.strictEqual(del.status, 200, JSON.stringify(del.data));
});

test('admins can undo a fee payment', async () => {
  const pay = await api('/api/fees/student/1/pay', { method: 'POST', token: tokens.admin, body: { amount: 50000, method: 'cash' } });
  assert.strictEqual(pay.status, 201);
  const payId = pay.data.payment.id;
  const before = await api('/api/fees/student/1', { token: tokens.parent1 });
  const paidBefore = before.data.totalPaid;
  const undo = await api(`/api/fees/student/1/pay/${payId}`, { method: 'DELETE', token: tokens.admin });
  assert.strictEqual(undo.status, 200, JSON.stringify(undo.data));
  const after = await api('/api/fees/student/1', { token: tokens.parent1 });
  assert.strictEqual(after.data.totalPaid, paidBefore - 50000, 'balance recalculated after undo');
});

test('audit log can be exported as CSV (super admin)', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/logs/export`, { headers: { Authorization: 'Bearer ' + tokens.superadmin } });
  assert.strictEqual(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('When,User,Role,Action,Details'), 'CSV header present');
  assert.ok(text.includes('LOGIN'), 'log rows present');
});

// ===========================================================================
// ADMIN OVERSIGHT — delete/edit documents, users, everything
// ===========================================================================

test('admin can delete and edit a document uploaded by a teacher', async () => {
  // teacher1 uploads a document (not shared to admin)
  const form = new FormData();
  form.append('file', new Blob(['teacher private notes'], { type: 'text/plain' }), 'teacher-notes.txt');
  const up = await api('/api/documents', { method: 'POST', token: tokens.teacher1, form });
  const docId = up.data.document.id;

  // admin can SEE it (full oversight)
  const list = await api('/api/documents', { token: tokens.admin });
  assert.ok(list.data.documents.some((d) => d.id === docId), 'admin sees every document');

  // admin can edit/rename it
  const edit = await api(`/api/documents/${docId}`, { method: 'PUT', token: tokens.admin, body: { name: 'renamed-by-admin.txt' } });
  assert.strictEqual(edit.status, 200);

  // admin can delete it
  const del = await api(`/api/documents/${docId}`, { method: 'DELETE', token: tokens.admin });
  assert.strictEqual(del.status, 200, JSON.stringify(del.data));
});

test('admin cannot create another admin account', async () => {
  const r = await api('/api/users', { method: 'POST', token: tokens.admin, body: { fullName: 'Wannabe Admin', username: 'wannabe1', password: 'Wannabe@123', role: 'admin' } });
  assert.strictEqual(r.status, 403);
});

test('teachers can still delete/edit only their own documents', async () => {
  // admin uploads a doc
  const form = new FormData();
  form.append('file', new Blob(['admin file'], { type: 'text/plain' }), 'admin-file.txt');
  const up = await api('/api/documents', { method: 'POST', token: tokens.admin, form });
  const docId = up.data.document.id;
  // teacher1 cannot delete it
  const del = await api(`/api/documents/${docId}`, { method: 'DELETE', token: tokens.teacher1 });
  assert.strictEqual(del.status, 403);
  // teacher1 cannot edit it
  const edit = await api(`/api/documents/${docId}`, { method: 'PUT', token: tokens.teacher1, body: { name: 'hacked.txt' } });
  assert.strictEqual(edit.status, 403);
});
