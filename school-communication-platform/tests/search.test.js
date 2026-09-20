/**
 * Global search test — boots the real admin / teacher / student / parent
 * dashboards in jsdom and drives the topbar search box the way a person
 * would (type, wait for the dropdown, click a result, use "Go to section").
 *
 * Run: node tests/search.test.js   (requires the server on :4000)
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:4000';
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; console.log(`  x  ${name} ${detail}`); }
}

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login ${username}: ${JSON.stringify(data)}`);
  const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map((c) => c.split(';')[0]);
  return { ...data, cookies };
}

const readScript = (rel) => fs.readFileSync(path.join(ROOT, 'frontend', rel), 'utf8');

async function boot({ username, password, htmlRel, appRel }) {
  const creds = await login(username, password);
  const html = fs.readFileSync(path.join(ROOT, 'frontend', htmlRel), 'utf8');
  const dom = new JSDOM(html, {
    url: `${BASE}/${htmlRel.replace('/index.html', '')}/`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.FormData = globalThis.FormData;
  window.Blob = globalThis.Blob;
  window.Headers = globalThis.Headers;
  window.URL = globalThis.URL;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });

  const cookieHeader = creds.cookies.join('; ');
  const rawFetch = globalThis.fetch;
  window.fetch = (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (cookieHeader && !headers.has('cookie')) headers.set('cookie', cookieHeader);
    return rawFetch(input, { ...init, headers });
  };

  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  const origError = console.error;
  console.error = (...a) => { errors.push(a.join(' ')); };

  const scripts = ['js/config.js', 'js/icons.js', 'js/api.js', 'js/theme.js', 'js/ui.js', 'js/socket-client.js',
    'js/components/messaging.js', 'js/components/documents.js', 'js/components/announcements.js', 'js/components/academics.js', appRel];
  for (const rel of scripts) {
    try { window.eval(readScript(rel)); } catch (e) { errors.push(`eval ${rel}: ${e.message}`); }
  }
  await sleep(2500);
  console.error = origError;
  return { window, errors };
}

/** Type into the topbar search box and wait for the dropdown. */
async function typeSearch(window, text) {
  const input = window.document.querySelector('#gs-input');
  if (!input) return null;
  input.value = text;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(900);
  return window.document.querySelector('#gs-drop');
}

(async () => {
  const cases = [
    { label: 'ADMIN', username: 'admin', password: 'Admin@123', htmlRel: 'admin/index.html', appRel: 'admin/app.js', term: 'okello' },
    { label: 'TEACHER', username: 'teacher1', password: 'Teacher@123', htmlRel: 'teacher/index.html', appRel: 'teacher/app.js', term: 'okello' },
    { label: 'STUDENT', username: 'student1', password: 'Student@123', htmlRel: 'student/index.html', appRel: 'student/app.js', term: 'Mathematics' },
    { label: 'PARENT', username: 'parent1', password: 'Parent@123', htmlRel: 'parent/index.html', appRel: 'parent/app.js', term: 'okello' },
    { label: 'SUPER ADMIN', username: 'superadmin', password: 'SuperAdmin@123', htmlRel: 'super-admin/index.html', appRel: 'super-admin/app.js', term: 'okello' },
  ];

  for (const c of cases) {
    console.log(`\n== ${c.label} dashboard ==`);
    let booted;
    try {
      booted = await boot(c);
    } catch (e) {
      check('boots', false, e.message);
      continue;
    }
    const { window, errors } = booted;
    check('boots without JS errors', errors.length === 0, errors.slice(0, 2).join(' | '));

    const box = window.document.querySelector('#global-search');
    check('search box is in the topbar', !!box && !!window.document.querySelector('#gs-input'));

    // too-short queries must not fire a request
    const short = await typeSearch(window, 'a');
    check('one letter shows nothing', !short || short.hidden || /nothing|at least/i.test(short.textContent || ''), short ? short.textContent.slice(0, 60) : 'no box');

    const drop = await typeSearch(window, c.term);
    check('dropdown opens with results', !!drop && !drop.hidden, drop ? drop.textContent.slice(0, 80) : 'no dropdown');
    const groupHeads = drop ? [...drop.querySelectorAll('.gs-group-h')].map((e) => e.textContent.trim()) : [];
    const items = drop ? [...drop.querySelectorAll('.gs-item')] : [];
    check('results are grouped', groupHeads.length > 0, groupHeads.join(', '));
    check('results are listed', items.length > 0, `${items.length} items`);
    console.log(`     groups: ${groupHeads.join(' | ')}`);
    console.log(`     first:  ${items[0] ? items[0].textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : '—'}`);

    // keyboard: ArrowDown then Enter opens the highlighted result
    const input = window.document.querySelector('#gs-input');
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await sleep(60);
    const activeItem = drop.querySelector('.gs-item.active');
    check('ArrowDown highlights a result', !!activeItem);
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(400);
    const modal = window.document.querySelector('.modal-backdrop.open');
    check('Enter opens the result card', !!modal);
    if (modal) {
      const rows = modal.querySelectorAll('.gs-meta-row');
      check('detail card shows real fields', rows.length >= 3, `${rows.length} rows`);
      check('detail card has "Go to" button', !!modal.querySelector('[data-go]'));
      const goLabel = modal.querySelector('[data-go]').textContent.trim();
      modal.querySelector('[data-go]').click();
      await sleep(1500);
      check('"Go to" navigates the dashboard', window.document.querySelector('.modal-backdrop') === null || !window.document.querySelector('.modal-backdrop.open'), goLabel);
      const bodyText = (window.document.body.textContent || '').replace(/\s+/g, ' ');
      check('destination view is rendered', bodyText.length > 200 && !/Cannot read|undefined is not/.test(bodyText));
    }

    // Escape closes the dropdown
    await typeSearch(window, c.term);
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(120);
    check('Escape closes the dropdown', window.document.querySelector('#gs-drop').hidden);

    // short privacy check: staff-only results must not appear for students/parents
    const drop2 = await typeSearch(window, c.term);
    const labels = drop2 ? [...drop2.querySelectorAll('.gs-group-h')].map((e) => e.textContent.trim()) : [];
    if (c.username === 'student1' || c.username === 'parent1' || c.username === 'teacher1') {
      check('no staff/user group for this role', !labels.some((l) => /staff/i.test(l)), labels.join(', '));
    } else {
      check('staff group available to admin', labels.some((l) => /staff/i.test(l)), labels.join(', '));
    }
    window.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
