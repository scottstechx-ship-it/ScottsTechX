/**
 * MESSAGING UI tests.
 *
 * Boots each dashboard's REAL front-end (js/components/messaging.js + the role's
 * app.js) inside jsdom against a real API server on a temporary port/database,
 * then drives the chat UI the way a person would:
 *
 *   - open the Messages view
 *   - read the conversation list (avatars must be icons, never escaped markup)
 *   - open a thread, send a message, see it land
 *   - mute / unmute and check the button state survives a re-open
 *   - archive and check the unread badge matches the visible list
 *   - edit + delete a message
 *
 * Run: node tests/messaging.test.js
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JSDOM } = require('jsdom');

const PORT = 4611;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-msg-'));
const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(PORT),
  DATABASE_PATH: path.join(tmpDir, 'msg.db'),
  UPLOAD_DIR: path.join(tmpDir, 'uploads'),
  SEED_DEMO_DATA: '1',
  JWT_SECRET: 'test-secret-messaging',
  ALLOWED_ORIGINS: '*',
  RATE_LIMIT_PER_MINUTE: '1000000',
  LOGIN_RATE_LIMIT_PER_15MIN: '100000',
};

let serverProc;

async function waitForServer(timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Server did not start in time');
}

async function api(route, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + route, { method, headers, body: payload });
  return { status: res.status, data: await res.json().catch(() => ({})), res };
}

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login ${username}: ${JSON.stringify(data)}`);
  const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map((c) => c.split(';')[0]);
  return { token: data.token, user: data.user, cookies };
}

const readScript = (rel) => fs.readFileSync(path.join(ROOT, 'frontend', rel), 'utf8');

/** Boot one dashboard in jsdom, fully wired to the live API. */
async function bootDashboard({ username, password, dir }) {
  const creds = await login(username, password);
  const htmlRel = `${dir}/index.html`;
  const appRel = `${dir}/app.js`;
  const html = fs.readFileSync(path.join(ROOT, 'frontend', htmlRel), 'utf8');
  const dom = new JSDOM(html, {
    url: `${BASE}/${dir}/`, runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  const cookieHeader = (creds.cookies || []).join('; ');
  // The browser keeps the session in cookies: the HttpOnly half is replayed on
  // every fetch below, and the readable CSRF twin has to be visible to
  // document.cookie or js/api.js cannot attach X-CSRF-Token to writes.
  for (const c of creds.cookies || []) {
    try { window.document.cookie = c; } catch { /* ignore */ }
  }
  const rawFetch = globalThis.fetch;
  window.fetch = (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (cookieHeader && !headers.has('cookie')) headers.set('cookie', cookieHeader);
    return rawFetch(input, { ...init, headers });
  };
  window.FormData = globalThis.FormData;
  window.Blob = globalThis.Blob;
  window.Headers = globalThis.Headers;
  window.URL = globalThis.URL;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });

  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  const origError = console.error;
  console.error = (...a) => errors.push(a.join(' '));

  const scripts = ['js/config.js', 'js/icons.js', 'js/api.js', 'js/theme.js', 'js/ui.js',
    'js/socket-client.js', 'js/components/messaging.js', 'js/components/documents.js',
    'js/components/announcements.js', 'js/components/academics.js', 'js/components/users.js',
    'js/components/website.js', appRel];
  for (const rel of scripts) {
    if (!fs.existsSync(path.join(ROOT, 'frontend', rel))) continue;
    try { window.eval(readScript(rel)); } catch (e) { errors.push(`eval ${rel}: ${e.message}`); }
  }
  await new Promise((r) => setTimeout(r, 1800));
  return {
    window, errors, creds,
    doc: window.document,
    restore: () => { console.error = origError; window.close(); },
  };
}

/** Click the sidebar item with data-nav=key and wait for the view to render. */
async function openView(dash, key, ms = 1200) {
  const btn = dash.doc.querySelector(`[data-nav="${key}"]`);
  assert.ok(btn, `sidebar nav item "${key}" exists`);
  btn.click();
  await new Promise((r) => setTimeout(r, ms));
}

const tick = (ms = 400) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  // A leftover server from a previous run would silently answer on this port
  // and the test would exercise the OLD code — so make sure the port is free
  // and that our own server really is the one that owns it.
  try {
    const probe = await fetch(BASE + '/api/health');
    if (probe.ok) throw new Error(`Port ${PORT} is already serving an API. Kill it before running: pkill -f "backend/server.js"`);
  } catch (e) {
    if (e.message && e.message.startsWith('Port')) throw e;
  }
  serverProc = spawn(process.execPath, ['backend/server.js'], {
    env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  serverProc.stdout.on('data', () => {});
  serverProc.stderr.on('data', (d) => { if (/EADDRINUSE|Error/.test(String(d))) process.stderr.write(String(d)); });
  await waitForServer();
});

after(() => {
  // kill the whole group so nothing keeps the port bound for the next run
  try { process.kill(-serverProc.pid, 'SIGKILL'); } catch {
    try { serverProc.kill('SIGKILL'); } catch {}
  }
});

let adminToken;
let classConvId;
let directToStudentId;
let studentId;

test('API: conversation payload exposes the viewer\'s muted/archived state', async () => {
  const a = await login('admin', 'Admin@123');
  adminToken = a.token;
  studentId = (await login('student1', 'Student@123')).user.id;

  // make sure there is a class conversation to exercise group avatars with
  const classes = (await api('/api/classes', { token: adminToken })).data.classes;
  assert.ok(classes.length, 'seeded classes exist');
  let made = await api('/api/messages/conversations', {
    method: 'POST', token: adminToken, body: { type: 'class', classId: classes[0].id },
  });
  assert.ok([200, 201].includes(made.status), `class conversation created (${made.status})`);
  classConvId = made.data.conversation.id;

  made = await api('/api/messages/conversations', {
    method: 'POST', token: adminToken, body: { type: 'direct', participantId: studentId },
  });
  assert.ok([200, 201].includes(made.status), `admin-student direct conversation (${made.status})`);
  directToStudentId = made.data.conversation.id;

  const list = (await api('/api/messages/conversations', { token: adminToken })).data.conversations;
  const mine = list.find((c) => c.id === classConvId);
  assert.ok(mine, 'the class conversation is in my list');

  await api(`/api/messages/conversations/${classConvId}/mute`, { method: 'PUT', token: adminToken, body: { muted: true } });
  const thread = (await api(`/api/messages/conversations/${classConvId}`, { token: adminToken })).data;
  assert.strictEqual(thread.conversation.muted, 1, 'GET /conversations/:id reports muted=1 after muting');

  await api(`/api/messages/conversations/${classConvId}/mute`, { method: 'PUT', token: adminToken, body: { muted: false } });
  const thread2 = (await api(`/api/messages/conversations/${classConvId}`, { token: adminToken })).data;
  assert.strictEqual(thread2.conversation.muted, 0, 'GET /conversations/:id reports muted=0 after unmuting');
  assert.ok(Array.isArray(thread2.conversation.participants), 'thread payload lists participants');
});

test('API: unread count ignores archived conversations', async () => {
  // Give admin a guaranteed unread message: teacher1 writes into their thread.
  const adminId = (await login('admin', 'Admin@123')).user.id;
  const teacher = await login('teacher1', 'Teacher@123');
  const opened = await api('/api/messages/conversations', {
    method: 'POST', token: teacher.token, body: { type: 'direct', participantId: adminId },
  });
  assert.ok([200, 201].includes(opened.status), `teacher1-admin conversation (${opened.status})`);
  const toAdmin = opened.data.conversation;
  const sent = await api('/api/messages', {
    method: 'POST', token: teacher.token,
    body: { conversationId: toAdmin.id, content: 'Unread badge probe' },
  });
  assert.ok([200, 201].includes(sent.status), `message sent (${sent.status})`);

  const list = (await api('/api/messages/conversations', { token: adminToken })).data.conversations;
  const unreadOne = list.find((c) => (c.unread_count || 0) > 0);
  assert.ok(unreadOne, 'admin has at least one conversation with unread messages');

  await api(`/api/messages/conversations/${unreadOne.id}/archive`, { method: 'PUT', token: adminToken, body: { archived: true } });
  const visible = (await api('/api/messages/conversations', { token: adminToken })).data.conversations;
  const sum = visible.reduce((s, c) => s + (c.unread_count || 0), 0);
  const badge = (await api('/api/messages/unread-count', { token: adminToken })).data.unread;
  assert.strictEqual(badge, sum, `badge (${badge}) matches the visible conversation list (${sum})`);

  await api(`/api/messages/conversations/${unreadOne.id}/archive`, { method: 'PUT', token: adminToken, body: { archived: false } });
});

for (const role of [
  { name: 'admin', username: 'admin', password: 'Admin@123', dir: 'platform/admin' },
  { name: 'teacher', username: 'teacher1', password: 'Teacher@123', dir: 'platform/teacher' },
  { name: 'student', username: 'student1', password: 'Student@123', dir: 'platform/student' },
  { name: 'parent', username: 'parent1', password: 'Parent@123', dir: 'platform/parent' },
]) {
  test(`${role.name} messages view renders a clean conversation list`, async () => {
    const dash = await bootDashboard(role);
    try {
      assert.deepStrictEqual(dash.errors, [], 'no JS errors while booting');
      await openView(dash, 'messages');
      const list = dash.doc.querySelector('#conv-list');
      assert.ok(list, 'conversation list container rendered');
      // Escaped markup leaking into the DOM is the bug we are guarding against:
      // an SVG icon must never arrive as literal text.
      assert.ok(!/&lt;svg|&lt;path|&lt;\//.test(list.innerHTML),
        'conversation list contains no escaped markup');
      for (const av of list.querySelectorAll('.conv-item .avatar')) {
        assert.ok(!av.textContent.includes('<'), `avatar text is not markup: "${av.textContent}"`);
      }
    } finally { dash.restore(); }
  });
}

test('admin: open a thread, send a message, mute, archive, edit, delete', async () => {
  const dash = await bootDashboard({ username: 'admin', password: 'Admin@123', dir: 'platform/admin' });
  try {
    await openView(dash, 'messages');
    const list = dash.doc.querySelector('#conv-list');

    // open the class conversation (group avatars use an SVG icon)
    const item = list.querySelector(`.conv-item[data-cid="${classConvId}"]`);
    assert.ok(item, 'the class conversation is listed in the UI');
    const avatar = item.querySelector('.avatar');
    assert.ok(avatar.querySelector('svg'), 'group avatar renders a real <svg>, not escaped text');
    assert.ok(!avatar.textContent.includes('<'), 'group avatar has no literal markup text');

    item.click();
    await tick(900);
    const thread = dash.doc.querySelector('#msg-thread');
    assert.ok(thread.querySelector('#thread-msgs'), 'thread opened');
    assert.ok(thread.querySelector('#msg-input'), 'composer rendered');

    // ---- send -------------------------------------------------------------
    const input = thread.querySelector('#msg-input');
    input.value = 'Hello from the messaging test';
    thread.querySelector('#send-btn').click();
    await tick(1200);
    assert.ok(thread.textContent.includes('Hello from the messaging test'), 'sent message is visible');
    const posted = (await api(`/api/messages/conversations/${classConvId}`, { token: adminToken })).data.messages;
    assert.ok(posted.some((m) => m.content === 'Hello from the messaging test'), 'message persisted on the server');

    // ---- mute: icon must stay an icon, and survive a re-open --------------
    const muteBtn = thread.querySelector('#mute-btn');
    assert.ok(muteBtn, 'mute button rendered for a non-channel conversation');
    assert.ok(muteBtn.querySelector('svg'), 'mute button starts as an icon');
    muteBtn.click();
    await tick(900);
    assert.ok(!muteBtn.textContent.includes('<'), 'mute button never shows raw markup after muting');
    assert.ok(muteBtn.querySelector('svg'), 'mute button is still an icon after muting');
    assert.strictEqual(muteBtn.dataset.muted, '1', 'mute button reports muted state');

    // re-open the same conversation: state must come from the server
    dash.doc.querySelector('#back-btn').click();
    await tick(300);
    list.querySelector(`.conv-item[data-cid="${classConvId}"]`).click();
    await tick(1000);
    const reopened = dash.doc.querySelector('#msg-thread #mute-btn');
    assert.strictEqual(reopened.dataset.muted, '1', 'muted state persists when the thread is reopened');

    // ---- edit -------------------------------------------------------------
    const editBtn = dash.doc.querySelector('#thread-msgs .msg-del[data-edit]');
    assert.ok(editBtn, 'edit control rendered on my own message');
    editBtn.click();
    await tick(400);
    const editBox = dash.doc.querySelector('#edit-msg');
    assert.ok(editBox, 'edit modal opened');
    editBox.value = 'Hello from the messaging test (edited)';
    dash.doc.querySelector('[data-save]').click();
    await tick(1200);
    assert.ok(dash.doc.querySelector('#msg-thread').textContent.includes('(edited)'),
      'edited flag shown in the thread');
    const afterEdit = (await api(`/api/messages/conversations/${classConvId}`, { token: adminToken })).data.messages;
    assert.ok(afterEdit.some((m) => m.content === 'Hello from the messaging test (edited)'),
      'edited content persisted on the server');

    // ---- archive: badge must match what is visible ------------------------
    const archiveBtn = dash.doc.querySelector('#archive-btn');
    assert.ok(archiveBtn, 'archive button rendered');
    archiveBtn.click();
    await tick(400);
    const yes = dash.doc.querySelector('.modal-backdrop [data-yes]');
    assert.ok(yes, 'archive confirmation shown');
    yes.click();
    await tick(1200);

    // archive everything else too: with an empty list the badge must read zero
    let remaining = (await api('/api/messages/conversations', { token: adminToken })).data.conversations;
    for (const c of remaining) {
      await api(`/api/messages/conversations/${c.id}/archive`, { method: 'PUT', token: adminToken, body: { archived: true } });
    }
    remaining = (await api('/api/messages/conversations', { token: adminToken })).data.conversations;
    assert.strictEqual(remaining.length, 0, 'every conversation archived');
    const badge = (await api('/api/messages/unread-count', { token: adminToken })).data.unread;
    assert.strictEqual(badge, 0, `badge clears when the list is empty (got ${badge})`);

    // ---- delete -----------------------------------------------------------
    await api(`/api/messages/conversations/${classConvId}/archive`, { method: 'PUT', token: adminToken, body: { archived: false } });
    await openView(dash, 'messages');
    dash.doc.querySelector('#conv-list').querySelector(`.conv-item[data-cid="${classConvId}"]`).click();
    await tick(1000);
    const delBtn = dash.doc.querySelector('#thread-msgs .msg-del[data-del]');
    assert.ok(delBtn, 'delete control rendered');
    delBtn.click();
    await tick(400);
    dash.doc.querySelector('.modal-backdrop [data-yes]').click();
    await tick(1200);
    const afterDel = (await api(`/api/messages/conversations/${classConvId}`, { token: adminToken })).data.messages;
    assert.ok(!afterDel.some((m) => m.content.startsWith('Hello from the messaging test')),
      'deleted message is gone from the server');

    assert.deepStrictEqual(dash.errors, [], 'no JS errors during the whole chat flow');
  } finally { dash.restore(); }
});

test('student: search finds a message sent to them', async () => {
  await api('/api/messages', {
    method: 'POST', token: adminToken,
    body: { conversationId: directToStudentId, content: 'Zebra crossing rehearsal on Friday' },
  });

  const dash = await bootDashboard({ username: 'student1', password: 'Student@123', dir: 'platform/student' });
  try {
    await openView(dash, 'messages');
    const search = dash.doc.querySelector('#msg-search');
    assert.ok(search, 'message search box rendered');
    search.value = 'Zebra';
    search.dispatchEvent(new dash.window.Event('input'));
    await tick(1400);
    const list = dash.doc.querySelector('#conv-list');
    assert.ok(list.textContent.includes('result'), `search reported results: "${list.textContent.slice(0, 80)}"`);
    assert.ok(list.textContent.includes('Zebra crossing rehearsal'), 'search result shows the message text');
  } finally { dash.restore(); }
});
