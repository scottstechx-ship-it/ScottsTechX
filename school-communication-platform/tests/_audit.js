/**
 * AGGRESSIVE UI AUDIT — boots each dashboard at BOTH desktop and phone width,
 * opens every view, then clicks every interactive control it can find and
 * reports JS errors, dead controls and empty renders.
 *
 * Run: node tests/_audit.js [role] [width]
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const REJECTIONS = [];
const dead = [];
let clicks = 0;
process.on('unhandledRejection', (e) => {
  REJECTIONS.push((e && e.stack ? e.stack.split('\n').slice(0, 3).join(' <- ') : String(e)));
});

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
  const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map((c) => c.split(';')[0]);
  return { token: data.token, user: data.user, cookies };
}
const readScript = (rel) => fs.readFileSync(path.join(ROOT, 'frontend', rel), 'utf8');

async function boot({ username, password, dir, width }) {
  const creds = await login(username, password);
  const html = readScript(`${dir}/index.html`);
  const dom = new JSDOM(html, { url: `${BASE}/${dir}/`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const cookieHeader = (creds.cookies || []).join('; ');
  if (creds.cookies && creds.cookies.length) {
    for (const c of creds.cookies) { try { window.document.cookie = c; } catch { /* httpOnly */ } }
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
  window.confirm = () => true;
  window.alert = () => {};
  window.location.reload = () => {};
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: width < 700 ? 780 : 900, configurable: true });

  const errors = [];
  const warns = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  window.addEventListener('unhandledrejection', (e) => errors.push('unhandled: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason))));
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...a) => { errors.push(a.map(String).join(' ')); };
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };

  const scripts = ['js/config.js', 'js/icons.js', 'js/api.js', 'js/theme.js', 'js/ui.js', 'js/socket-client.js',
    'js/components/messaging.js', 'js/components/documents.js', 'js/components/announcements.js',
    'js/components/academics.js', 'js/components/users.js', 'js/components/website.js', `${dir}/app.js`];
  for (const rel of scripts) {
    if (!fs.existsSync(path.join(ROOT, 'frontend', rel))) continue;
    try { window.eval(readScript(rel)); } catch (e) { errors.push(`eval ${rel}: ${e.message}`); }
  }
  await new Promise((r) => setTimeout(r, 2500));
  return { window, errors, warns, restore: () => { console.error = origError; console.warn = origWarn; } };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLEAN = /socket\.io|WebSocket|xhr poll|Not implemented: navigation|Could not parse CSS|Error: Not implemented/i;

function navKeys(src) {
  const keys = [];
  const re = /key:\s*'([a-z0-9-]+)'/g;
  let m;
  while ((m = re.exec(src))) if (!keys.includes(m[1])) keys.push(m[1]);
  return keys;
}

const ROLES = [
  { name: 'SUPER ADMIN', username: 'superadmin', password: 'SuperAdmin@123', dir: 'platform/super-admin' },
  { name: 'ADMIN', username: 'admin', password: 'Admin@123', dir: 'platform/admin' },
  { name: 'TEACHER', username: 'teacher1', password: 'Teacher@123', dir: 'platform/teacher' },
  { name: 'STUDENT', username: 'student1', password: 'Student@123', dir: 'platform/student' },
  { name: 'PARENT', username: 'parent1', password: 'Parent@123', dir: 'platform/parent' },
];

(async () => {
  const onlyRole = process.argv[2];
  const onlyWidth = process.argv[3] ? Number(process.argv[3]) : null;
  // "super-admin", "super admin" and "super" all select the same dashboard;
  // a role filter that matches nothing is an ERROR, not a silent pass.
  const norm = (s) => String(s).toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const wanted = onlyRole ? norm(onlyRole) : '';
  const matched = wanted ? ROLES.filter((r) => norm(r.name).includes(wanted)) : ROLES;
  if (wanted && matched.length === 0) {
    console.error(`No dashboard matches "${onlyRole}". Available: ${ROLES.map((r) => r.name).join(', ')}`);
    process.exit(2);
  }
  let problems = 0;
  for (const role of matched) {
    for (const width of (onlyWidth ? [onlyWidth] : [1280, 390])) {
      console.log(`\n===== ${role.name} @ ${width}px =====`);
      const { window, errors, warns, restore } = await boot({ ...role, width });
      const real = errors.filter((e) => !CLEAN.test(e));
      if (real.length) { problems += real.length; console.log('  BOOT ERRORS:'); real.slice(0, 6).forEach((e) => console.log('    !', e)); }

      const keys = navKeys(readScript(`${role.dir}/app.js`));
      for (const key of keys) {
        const before = errors.length;
        try { window.__navHandler(key); } catch (e) { console.log(`  x nav ${key} threw ${e.message}`); problems++; continue; }
        await sleep(1100);
        const content = window.document.getElementById('content');
        const text = content ? (content.textContent || '').replace(/\s+/g, ' ').trim() : '';
        const next = errors.slice(before).filter((e) => !CLEAN.test(e));
        if (next.length) { problems += next.length; console.log(`  x view ${key}: ${next.slice(0, 3).join(' | ')}`); }
        if (text.length < 5) { problems++; console.log(`  x view ${key} EMPTY`); }

        // click every button in the rendered view (skip the nav chrome)
        const btns = [...content.querySelectorAll('button:not([disabled]), [role="button"]')];
        for (const b of btns) {
          if (b.dataset.auditClicked) continue;
          b.dataset.auditClicked = '1';
          clicks++;
          const bbefore = errors.length;
          // what "something happened" looks like: DOM change, a dialog, a toast
          let fetches = 0;
          const of = window.fetch;
          window.fetch = (...a) => { fetches++; return of(...a); };
          const snapshot = () => window.document.body.innerHTML.length + '|' +
            window.document.querySelectorAll('.modal-backdrop.open').length + '|' +
            window.document.querySelectorAll('.toast').length;
          const before = snapshot();
          try { b.click(); } catch (e) { console.log(`  x click in ${key} (${(b.textContent || '').trim().slice(0, 24)}) threw ${e.message}`); problems++; }
          await sleep(220);
          window.fetch = of;
          const label = (b.getAttribute('aria-label') || b.textContent || b.dataset.nav || b.id || b.className || '?').trim().slice(0, 30);
          if (snapshot() === before && fetches === 0 && !b.dataset.nav) {
            dead.push(`${key}: "${label}" changed nothing (no render, no dialog, no request)`);
          }
          // close any modal that opened so the next click is reachable
          window.document.querySelectorAll('.modal-backdrop.open .close-x').forEach((x) => x.click());
          const bb = errors.slice(bbefore).filter((e) => !CLEAN.test(e));
          if (bb.length) { problems += bb.length; console.log(`  x click in ${key} (${label}): ${bb.slice(0, 2).join(' | ')}`); }
        }
        await sleep(150);
      }
      const remaining = errors.filter((e) => !CLEAN.test(e));
      if (remaining.length) { console.log('  LATE ERRORS:'); remaining.slice(0, 8).forEach((e) => console.log('    !', e)); }
      restore();
      window.close();
    }
  }
  if (dead.length) {
    console.log(`\nSUSPICIOUS BUTTONS (${dead.length}) — clicked, nothing changed:`);
    for (const d of [...new Set(dead)].slice(0, 40)) console.log('    ?', d);
  }
  if (REJECTIONS.length) {
    console.log(`\nUNHANDLED PROMISE REJECTIONS (${REJECTIONS.length}):`);
    for (const r of [...new Set(REJECTIONS)].slice(0, 10)) console.log('    !', r);
  }
  console.log(`\n${clicks} control(s) clicked.`);
  console.log(`TOTAL PROBLEMS: ${problems}`);
  process.exit(0);
})().catch((e) => { console.error('harness', e); process.exit(1); });
