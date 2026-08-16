/**
 * DEEP dashboard test — boots each dashboard's real JS in jsdom against the
 * live API, then opens EVERY view in EVERY dashboard and asserts:
 *   - no JS errors were thrown while rendering
 *   - the content area actually rendered something (not blank / not stuck)
 *
 * Run: node tests/deep-dashboard.test.js   (requires the server on :4000)
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:4000';
const ROOT = path.join(__dirname, '..');

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login ${username}: ${JSON.stringify(data)}`);
  return { token: data.token, user: data.user };
}

function readScript(rel) {
  return fs.readFileSync(path.join(ROOT, 'frontend', rel), 'utf8');
}

async function bootDashboard({ username, password, htmlRel, appRel }) {
  const creds = await login(username, password);
  const html = fs.readFileSync(path.join(ROOT, 'frontend', htmlRel), 'utf8');
  const dom = new JSDOM(html, {
    url: `${BASE}/${htmlRel.replace('/index.html', '')}/`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.fetch = globalThis.fetch;
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
  console.error = (...a) => { errors.push(a.join(' ')); };

  window.localStorage.setItem('scp_token', creds.token);
  window.localStorage.setItem('scp_user', JSON.stringify(creds.user));

  const scripts = ['js/config.js', 'js/api.js', 'js/theme.js', 'js/ui.js', 'js/socket-client.js',
    'js/components/messaging.js', 'js/components/documents.js', 'js/components/announcements.js',
    'js/components/academics.js', 'js/components/users.js', 'js/components/website.js', appRel];
  for (const rel of scripts) {
    if (!fs.existsSync(path.join(ROOT, 'frontend', rel))) continue;
    try {
      window.eval(readScript(rel));
    } catch (e) {
      errors.push(`eval ${rel}: ${e.message}`);
    }
  }
  await new Promise((r) => setTimeout(r, 2200));
  return { window, errors, restoreConsole: () => { console.error = origError; } };
}

function navKeys(appRel) {
  const src = readScript(appRel);
  const keys = [];
  const re = /key:\s*'([a-z-]+)'/g;
  let m;
  while ((m = re.exec(src))) if (!keys.includes(m[1])) keys.push(m[1]);
  return keys;
}

const ROLES = [
  { name: 'SUPER ADMIN', username: 'superadmin', password: 'SuperAdmin@123', dir: 'super-admin' },
  { name: 'ADMIN', username: 'admin', password: 'Admin@123', dir: 'admin' },
  { name: 'TEACHER', username: 'teacher1', password: 'Teacher@123', dir: 'teacher' },
  { name: 'STUDENT', username: 'student1', password: 'Student@123', dir: 'student' },
  { name: 'PARENT', username: 'parent1', password: 'Parent@123', dir: 'parent' },
];

(async () => {
  let failures = 0;
  let views = 0;

  for (const role of ROLES) {
    const htmlRel = `${role.dir}/index.html`;
    const appRel = `${role.dir}/app.js`;
    console.log(`\n== ${role.name} dashboard (${role.dir}/) ==`);
    const { window, errors, restoreConsole } = await bootDashboard({
      username: role.username, password: role.password, htmlRel, appRel,
    });

    if (errors.length) {
      failures++;
      console.log(`  ✘ boot errors: ${errors.slice(0, 3).join(' | ')}`);
    } else {
      console.log('  ✔ boots cleanly');
    }

    const keys = navKeys(appRel);
    for (const key of keys) {
      views++;
      const before = errors.length;
      try {
        if (typeof window.__navHandler === 'function') {
          window.__navHandler(key);
          await new Promise((r) => setTimeout(r, 1300));
        } else {
          throw new Error('no __navHandler exposed');
        }
        const content = window.document.getElementById('content') || window.document.querySelector('.content') || window.document.body;
        const text = (content.textContent || '').replace(/\s+/g, ' ').trim();
        const newErrors = errors.slice(before);
        // filter benign noise (e.g. socket.io not being real in jsdom)
        const realErrors = newErrors.filter((e) => !/socket\.io|WebSocket|xhr poll/i.test(e));
        if (realErrors.length) {
          failures++;
          console.log(`  ✘ view '${key}' errored: ${realErrors.slice(0, 2).join(' | ')}`);
        } else if (text.length < 3) {
          failures++;
          console.log(`  ✘ view '${key}' rendered EMPTY`);
        } else {
          console.log(`  ✔ view '${key}' renders (${text.length} chars)`);
        }
      } catch (e) {
        failures++;
        console.log(`  ✘ view '${key}' threw: ${e.message}`);
      }
    }
    restoreConsole();
    window.close();
  }

  console.log(`\n${views} views tested across ${ROLES.length} dashboards.`);
  console.log(failures === 0 ? '✅ EVERY VIEW IN EVERY DASHBOARD WORKS' : `❌ ${failures} failures`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('Harness error:', e); process.exit(1); });
