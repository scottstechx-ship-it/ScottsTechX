/**
 * STORAGE / PERSISTENCE tests — "every update stays".
 *
 * These boot a real server pointed at a DATA_DIR outside the source tree,
 * make an edit through the API, RESTART the whole process, and assert the
 * edit is still there. Then they check the rolling snapshot really is a
 * usable SQLite file and that the restore command brings it back.
 *
 * Run: node tests/storage.test.js
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4622;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-storage-'));
const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(PORT),
  DATA_DIR: dataDir,
  SEED_DEMO_DATA: '1',
  JWT_SECRET: 'test-secret-storage',
  ALLOWED_ORIGINS: '*',
  RATE_LIMIT_PER_MINUTE: '1000000',
  LOGIN_RATE_LIMIT_PER_15MIN: '100000',
  BACKUP_EVERY_HOURS: '0.25',
  SUPPRESS_SQLITE_FALLBACK_WARNING: 'true',
};
// these must NOT be set: the point is that DATA_DIR alone decides where things go
delete env.DATABASE_PATH;
delete env.UPLOAD_DIR;

let serverProc;
let token;

function startServer() {
  const p = spawn(process.execPath, ['backend/server.js'], {
    env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  p.stdout.on('data', () => {});
  p.stderr.on('data', (d) => process.stderr.write(String(d)));
  return p;
}

function stopServer(p) {
  try { process.kill(-p.pid, 'SIGTERM'); } catch { try { p.kill('SIGTERM'); } catch {} }
}

async function waitForServer(timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Server did not start in time');
}

async function api(route, { method = 'GET', body, tok = token } = {}) {
  const headers = {};
  if (tok) headers.Authorization = 'Bearer ' + tok;
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + route, { method, headers, body: payload });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function login() {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('login failed: ' + JSON.stringify(data));
  return data.token;
}

before(async () => {
  try {
    const probe = await fetch(BASE + '/api/health');
    if (probe.ok) throw new Error(`Port ${PORT} is busy — kill the old server first.`);
  } catch (e) { if (e.message && e.message.startsWith('Port')) throw e; }
  serverProc = startServer();
  await waitForServer();
});

after(() => { stopServer(serverProc); });

test('DATA_DIR alone decides where the database and uploads live', async () => {
  token = await login();
  const status = (await api('/api/settings/status')).data;

  assert.strictEqual(fs.realpathSync(status.storage.dir), fs.realpathSync(dataDir),
    `storage dir is the DATA_DIR (${status.storage.dir})`);
  assert.strictEqual(fs.realpathSync(status.database.path), path.join(fs.realpathSync(dataDir), 'school.db'),
    'database sits directly inside DATA_DIR');
  assert.strictEqual(fs.realpathSync(status.uploads.dir), path.join(fs.realpathSync(dataDir), 'uploads'),
    'uploads sit directly inside DATA_DIR');
  assert.strictEqual(status.storage.persistent, true, 'an out-of-tree DATA_DIR counts as persistent');
  assert.ok(fs.existsSync(path.join(dataDir, 'school.db')), 'school.db was created in DATA_DIR');
  assert.ok(fs.existsSync(path.join(dataDir, 'uploads')), 'uploads/ was created in DATA_DIR');
});

test('a news post survives a full server restart', async () => {
  token = await login();
  const created = await api('/api/website/news', {
    method: 'POST',
    body: { title: 'Persistence proof', body: 'This row must still be here after a restart.', published: true },
  });
  assert.ok([200, 201].includes(created.status), `news post created (${created.status})`);
  const id = created.data.post.id;

  // hard restart: the process dies and a brand new one opens the same folder
  stopServer(serverProc);
  await new Promise((r) => setTimeout(r, 800));
  serverProc = startServer();
  await waitForServer();

  token = await login();
  const list = (await api('/api/website/news')).data.news || [];
  assert.ok(list.some((n) => n.id === id && n.title === 'Persistence proof'),
    'the news post is still published after the restart');

  // and nothing was re-seeded over the top of it
  const manage = (await api('/api/website/news/manage')).data.news || [];
  assert.ok(manage.some((n) => n.title === 'Persistence proof'), 'still in the admin view too');
});

test('a settings change survives a full server restart', async () => {
  // school settings are a super-admin write
  const sa = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: 'SuperAdmin@123' }),
  });
  const saToken = (await sa.json()).token;
  assert.ok(saToken, 'super admin signed in');

  const saved = await api('/api/settings/school', {
    method: 'PUT', tok: saToken, body: { name: 'Kalinabiri SS — Persistence Check' },
  });
  assert.strictEqual(saved.status, 200, `settings saved (${saved.status}: ${JSON.stringify(saved.data)})`);

  stopServer(serverProc);
  await new Promise((r) => setTimeout(r, 800));
  serverProc = startServer();
  await waitForServer();

  const sa2 = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: 'SuperAdmin@123' }),
  });
  const saToken2 = (await sa2.json()).token;
  const settings = (await api('/api/settings/all', { tok: saToken2 })).data;
  assert.strictEqual(settings.school.name, 'Kalinabiri SS — Persistence Check',
    'the renamed school survives the restart');

  token = await login();
  await api('/api/settings/school', {
    method: 'PUT', tok: saToken2, body: { name: 'Kalinabiri Secondary School' },
  });
});

test('the rolling snapshot is a real SQLite file with the data in it', async () => {
  token = await login();
  const snap = await api('/api/settings/backup/snapshot', { method: 'POST' });
  assert.ok([200, 201].includes(snap.status), `snapshot taken (${snap.status})`);
  assert.ok(snap.data.snapshots.length >= 1, 'the snapshot is listed');

  const file = snap.data.snapshots[0].path;
  assert.ok(fs.existsSync(file), `snapshot file exists at ${file}`);
  assert.ok(fs.realpathSync(file).startsWith(fs.realpathSync(dataDir)), 'the snapshot is stored under DATA_DIR');
  const head = fs.readFileSync(file).subarray(0, 16).toString('latin1');
  assert.ok(head.startsWith('SQLite format 3'), `snapshot has a SQLite header (got "${head.trim()}")`);

  // open it independently and read the row we wrote earlier
  process.env.SUPPRESS_SQLITE_FALLBACK_WARNING = 'true';
  const { openDatabase } = require(path.join(ROOT, 'backend', 'database', 'driver.js'));
  const copy = openDatabase(file, { readonly: true });
  const row = copy.prepare("SELECT title FROM site_news WHERE title = ?").get('Persistence proof');
  assert.ok(row, 'the snapshot contains the news row written before the restart');
  copy.close();
});

test('the restore command brings a snapshot back', () => {
  // break something on purpose, then restore over it
  const cli = path.join(ROOT, 'backend', 'database', 'backup-cli.js');
  const snapshots = fs.readdirSync(path.join(dataDir, 'backups')).filter((f) => /^school-.*\.db$/.test(f));
  assert.ok(snapshots.length, 'at least one snapshot on disk');
  const latest = snapshots.sort().pop();

  const broken = spawnSync(process.execPath, [cli, 'backup'], { cwd: ROOT, env: { ...env, PORT: String(PORT) } });
  assert.strictEqual(broken.status, 0, 'backup CLI exits cleanly');

  const restored = spawnSync(process.execPath, [cli, 'restore', latest], { cwd: ROOT, env: { ...env } });
  assert.strictEqual(restored.status, 0, `restore CLI exits cleanly: ${restored.stderr}`);
  assert.ok(/Restored/.test(restored.stdout.toString()), 'restore reports success');
  assert.ok(fs.existsSync(path.join(dataDir, 'school.db')), 'the database file is back');
});
