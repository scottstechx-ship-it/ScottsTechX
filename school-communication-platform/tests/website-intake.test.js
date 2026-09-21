/**
 * WEBSITE INTAKE test — the public site's contact form and admission
 * application must actually reach the admin dashboards (list, badge,
 * notification, click-through), not just return 200 to the visitor.
 *
 * Run: node tests/website-intake.test.js   (requires the server on :4000)
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:4000';
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait until the dashboard has actually painted what we are asserting on. */
async function waitFor(fn, { timeout = 8000, step = 250 } = {}) {
  const started = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch { /* keep waiting */ }
    if (Date.now() - started > timeout) return false;
    await sleep(step);
  }
}

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
  return { ...data, cookie: cookies.join('; ') };
}

const auth = (s) => ({ cookie: s.cookie, authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json', 'x-csrf-token': s.csrfToken });
const readScript = (rel) => fs.readFileSync(path.join(ROOT, 'frontend', rel), 'utf8');

/**
 * Post the way the public page does — no cookies, no token. A unique
 * X-Forwarded-For per run keeps this test's posts in their own per-visitor rate
 * bucket (the same way a real visitor arrives through the platform proxy), so
 * re-running the test is not throttled by its own previous flood.
 */
async function publicPost(pathname, body, forwardedFor) {
  const res = await fetch(BASE + pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const visitorIp = () => `203.0.113.${1 + Math.floor(Math.random() * 250)}-${Date.now() % 9973}`;

async function bootDashboard({ creds, htmlRel, appRel }) {
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
  const rawFetch = globalThis.fetch;
  window.fetch = (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (!headers.has('cookie')) headers.set('cookie', creds.cookie);
    return rawFetch(input, { ...init, headers });
  };
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  const origError = console.error;
  console.error = (...a) => { errors.push(a.join(' ')); };
  for (const rel of ['js/config.js', 'js/icons.js', 'js/api.js', 'js/theme.js', 'js/ui.js', 'js/socket-client.js',
    'js/components/messaging.js', 'js/components/documents.js', 'js/components/announcements.js', 'js/components/academics.js',
    'js/components/users.js', 'js/components/website.js', appRel]) {
    try { window.eval(readScript(rel)); } catch (e) { errors.push(`eval ${rel}: ${e.message}`); }
  }
  await sleep(2500);
  console.error = origError;
  return { window, errors };
}

(async () => {
  const admin = await login('admin', 'Admin@123');
  const superadmin = await login('superadmin', 'SuperAdmin@123');

  // unique text so this run's rows can be found among older ones
  const stamp = Date.now();
  const ip = visitorIp();
  const contactName = `Intake Test ${stamp}`;
  const studentName = `Intake Pupil ${stamp}`;

  console.log('\n== Public form: contact message');
  const c = await publicPost('/api/website/contact', {
    name: contactName, email: 'intake@example.com', phone: '0700000000',
    subject: 'Intake subject', message: 'Does this reach the office?',
  }, ip);
  check('contact POST succeeds for a visitor', c.status === 201, JSON.stringify(c.data));
  check('it returns the stored id', typeof c.data.id === 'number', JSON.stringify(c.data));

  console.log('\n== Public form: admission application');
  const a = await publicPost('/api/website/admissions', {
    fullName: studentName, applyingFor: 'Senior 1', parentName: 'Intake Parent',
    parentPhone: '0700000001', parentEmail: 'intake.parent@example.com', motivation: 'Intake test',
  }, ip);
  check('admissions POST succeeds for a visitor', a.status === 201, JSON.stringify(a.data));
  check('it returns the application id', typeof a.data.id === 'number');

  console.log('\n== Admin inbox receives them');
  for (const [who, creds] of [['admin', admin], ['super admin', superadmin]]) {
    const msgs = await (await fetch(`${BASE}/api/website/contact`, { headers: auth(creds) })).json();
    check(`${who} sees the contact message`, (msgs.messages || []).some((m) => m.name === contactName), `${(msgs.messages || []).length} rows`);
    const apps = await (await fetch(`${BASE}/api/website/admissions`, { headers: auth(creds) })).json();
    check(`${who} sees the application`, (apps.applications || []).some((x) => x.full_name === studentName), `${(apps.applications || []).length} rows`);
  }

  const newMsg = (await (await fetch(`${BASE}/api/website/contact`, { headers: auth(admin) })).json()).messages
    .find((m) => m.name === contactName);
  check('the message starts as "new"', newMsg && newMsg.status === 'new', newMsg && newMsg.status);

  console.log('\n== Bell notification + click-through');
  const notifs = (await (await fetch(`${BASE}/api/notifications?limit=20`, { headers: auth(admin) })).json()).notifications || [];
  const nMsg = notifs.find((n) => /website message/i.test(n.title) && String(n.body || '').includes(contactName.slice(-6)) || String(n.title).includes(contactName));
  check('a notification names the sender', !!notifs.find((n) => String(n.title).includes(contactName)), JSON.stringify(notifs.slice(0, 3).map((n) => n.title)));
  const nApp = notifs.find((n) => String(n.title).includes(studentName));
  check('a notification names the applicant', !!nApp, '');
  // the link must target a section the admin dashboard actually has
  const adminSections = readScript('admin/app.js').match(/key: '[a-z0-9-]+'/g).map((m) => m.replace(/key: '|'/g, ''));
  for (const [label, n] of [['message', nMsg], ['application', nApp]]) {
    if (!n) { check(`the ${label} notification link opens a real section`, false, 'no notification'); continue; }
    const key = String(n.link || '').replace(/^\//, '');
    check(`the ${label} notification link is a real admin section (${n.link})`, adminSections.includes(key), `key "${key}" not in [${adminSections.join(', ')}]`);
  }

  console.log('\n== Admin dashboard really renders them');
  {
    const { window, errors } = await bootDashboard({ creds: admin, htmlRel: 'admin/index.html', appRel: 'admin/app.js' });
    check('admin dashboard boots clean', errors.length === 0, errors.slice(0, 2).join(' | '));

    // the landing screen must advertise the website inboxes
    const siteCard = window.document.querySelector('#home-site');
    check('home has a Website enquiries card', !!siteCard);
    if (siteCard) {
      const cardText = siteCard.textContent.replace(/\s+/g, ' ');
      check('it counts contact-form messages', /messages from the contact form/i.test(cardText), cardText);
      check('it counts admission applications', /admission applications/i.test(cardText), cardText);
      const btns = [...siteCard.querySelectorAll('button')];
      check('it offers one-click jumps into both inboxes', btns.length === 2, String(btns.length));
      btns[1].click();
      await sleep(1800);
      check('the jump opens the admissions inbox', (window.document.body.textContent || '').includes('Admission Applications'));
      window.__navHandler('home');
      await sleep(1200);
    }
    for (const key of ['admissions', 'website-contact']) {
      const badge = window.document.querySelector(`[data-nav-badge="${key}"]`);
      // the badge caps its label at "99+", so only require a visible non-zero count
      const shown = badge ? String(badge.textContent).trim() : '';
      check(`the ${key} sidebar badge shows the new count`,
        !!badge && badge.style.display !== 'none' && (shown === '99+' || Number(shown) > 0),
        badge ? `${shown}/${badge.style.display}` : 'no badge element');
    }

    window.__navHandler('website-contact');
    const sawMessage = await waitFor(() => (window.document.body.textContent || '').includes(contactName));
    const text = (window.document.body.textContent || '').replace(/\s+/g, ' ');
    check('Website Messages view lists the new message', sawMessage, text.slice(-120));
    const firstName = (window.document.querySelector('#cm-list .doc-name') || {}).textContent || '';
    check('the newest message is listed first', firstName.includes(contactName), `first card: ${firstName.trim()}`);
    check('it shows the sender email', text.includes('intake@example.com'));
    check('no error toast on the messages view', !/could not|failed|error/i.test(window.document.querySelector('#content').textContent || ''));

    window.__navHandler('admissions');
    await waitFor(() => (window.document.body.textContent || '').includes(studentName));
    const appText = (window.document.body.textContent || '').replace(/\s+/g, ' ');
    check('Admissions view lists the application', appText.includes(studentName), appText.slice(-140));
    check('it shows the parent contact', appText.includes('Intake Parent'));
    check('no error toast on the admissions view', !/could not|failed|error/i.test(window.document.querySelector('#content').textContent || ''));

    // a notification link must never be a dead click, even on the wrong role
    for (const key of ['fees', 'attendance', 'parents', 'results', 'contact-messages']) {
      window.__navHandler('home');
      await sleep(400);
      window.UI.navigateToLink(`/${key}`);
      await sleep(600);
      const title = (window.document.querySelector('#page-title') || {}).textContent || '';
      check(`a "/${key}" notification lands somewhere real`, title.trim().length > 0, `landed on "${title}"`);
    }
    window.close();
  }

  console.log('\n== Rate limit is explained, not a bare error');
  let got429 = null;
  let allowed = 0;
  const floodIp = visitorIp();
  for (let i = 0; i < 60 && !got429; i++) {
    const r = await publicPost('/api/website/contact', { name: 'Flood', message: 'flood' }, floodIp);
    if (r.status === 429) got429 = r;
    else if (r.status === 201) allowed++;
  }
  check('flooding eventually returns 429', !!got429, 'never limited');
  if (got429) {
    check('the 429 message tells the visitor what to do', /wait|call the school/i.test(got429.data.error || ''), got429.data.error);
  }
  // parents on the same school/carrier address must not lock each other out
  check('one shared address can still send 15+ genuine messages', allowed >= 15, `${allowed} allowed`);
  check('the server did not fall over', (await fetch(`${BASE}/api/health`)).status === 200);

  console.log('\n== Marking as read / replied still works');
  const upd = await fetch(`${BASE}/api/website/contact/${newMsg.id}`, {
    method: 'PUT', headers: auth(admin), body: JSON.stringify({ status: 'read' }),
  });
  check('admin can mark the message read', upd.status === 200, String(upd.status));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
