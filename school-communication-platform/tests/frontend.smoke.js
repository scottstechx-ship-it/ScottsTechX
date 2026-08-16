/**
 * Frontend smoke test — boots each dashboard's real JavaScript inside jsdom
 * against the live API and asserts the key views render without errors.
 *
 * Run: node tests/frontend.smoke.js   (requires the server on :4000)
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
  // polyfills jsdom lacks
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

  // execute scripts in the same order as the HTML
  const scripts = ['js/config.js', 'js/api.js', 'js/theme.js', 'js/ui.js', 'js/socket-client.js',
    'js/components/messaging.js', 'js/components/documents.js', 'js/components/announcements.js', 'js/components/academics.js', appRel];
  for (const rel of scripts) {
    try {
      window.eval(readScript(rel));
    } catch (e) {
      errors.push(`eval ${rel}: ${e.message}`);
    }
  }

  // wait for async boot
  await new Promise((r) => setTimeout(r, 2500));

  const text = () => (window.document.body.textContent || '').replace(/\s+/g, ' ').trim();
  console.error = origError;
  return { window, errors, text: text(), body: window.document.body };
}

async function switchView(w, key) {
  if (typeof w.__navHandler === 'function') {
    w.__navHandler(key);
    await new Promise((r) => setTimeout(r, 1400));
  }
  return (w.document.body.textContent || '').replace(/\s+/g, ' ').trim();
}

(async () => {
  let failures = 0;
  function check(name, cond, detail = '') {
    if (cond) console.log(`  ✔ ${name}`);
    else { failures++; console.log(`  ✘ ${name} ${detail}`); }
  }

  console.log('\n== STUDENT dashboard ==');
  {
    const { errors, text, window } = await bootDashboard({ username: 'student1', password: 'Student@123', htmlRel: 'student/index.html', appRel: 'student/app.js' });
    check('boots without JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('home shows greeting', text.includes('Hello, Sarah'));
    const asText = await switchView(window, 'assignments');
    check('assignments view renders', asText.includes('Assignment') || asText.includes('No assignments'));
    const resText = await switchView(window, 'results');
    check('results view renders', resText.includes('Exam') || resText.includes('No exams'));
    const attText = await switchView(window, 'attendance');
    check('attendance view renders', attText.includes('Attendance') || attText.includes('No attendance'));
    const ttText = await switchView(window, 'timetable');
    check('timetable view renders', ttText.includes('No timetable') || ttText.includes('Day'));
  }

  console.log('\n== PARENT dashboard ==');
  {
    const { errors, text, window } = await bootDashboard({ username: 'parent1', password: 'Parent@123', htmlRel: 'parent/index.html', appRel: 'parent/app.js' });
    check('boots without JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('home shows welcome', /WELCOME, MR\./.test(text) || /Welcome, MR\./.test(text));
    check('child selector shown', text.includes('SELECT CHILD'));
    check('children listed', text.includes('Sarah') && text.includes('David') && text.includes('Michael'));
    const messagesText = await switchView(window, 'messages');
    check('messages view renders (chat UI)', messagesText.includes('Messages'));
    const childrenText = await switchView(window, 'children');
    check('children detail with tabs renders', childrenText.includes('Attendance') || childrenText.includes('child-tabs'));
  }

  console.log('\n== TEACHER dashboard ==');
  {
    const { errors, text, window } = await bootDashboard({ username: 'teacher1', password: 'Teacher@123', htmlRel: 'teacher/index.html', appRel: 'teacher/app.js' });
    check('boots without JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('home shows greeting', /Hello, (Ms\.|Mr\.|Mary)/.test(text));
    const attText = await switchView(window, 'attendance');
    check('attendance marking view renders', attText.includes('Load roster') || attText.includes('roster'));
    const asText = await switchView(window, 'assignments');
    check('assignments view renders', asText.includes('New assignment') || asText.includes('No assignments'));
    const exText = await switchView(window, 'exams');
    check('exams view renders', exText.includes('New exam') || exText.includes('No exams'));
    const ttText = await switchView(window, 'timetable');
    check('timetable view renders', ttText.includes('Timetable') || ttText.includes('No timetable'));
  }

  console.log('\n== ADMIN dashboard ==');
  {
    const { errors, text, window } = await bootDashboard({ username: 'admin', password: 'Admin@123', htmlRel: 'admin/index.html', appRel: 'admin/app.js' });
    check('boots without JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('home shows overview', text.includes('School operations overview'));
    check('home has chart + fees', text.includes('Students per class') && text.includes('Fee snapshot'));
    const stuText = await switchView(window, 'students');
    check('student management renders', stuText.includes('Add student') && stuText.includes('Import'));
    const impText = await switchView(window, 'import');
    check('import wizard opens', impText.includes('Step 1 of 6') || impText.includes('Upload'));
    const attText = await switchView(window, 'attendance');
    check('attendance view renders', attText.includes('Load roster'));
    const feesText = await switchView(window, 'fees');
    check('fees view renders', feesText.includes('Fee structures') || feesText.includes('Record a payment'));
    const ttText = await switchView(window, 'timetable');
    check('timetable manage view renders', ttText.includes('Add lesson') || ttText.includes('No timetable'));
  }

  console.log('\n== SUPER ADMIN dashboard ==');
  {
    const { errors, text, window } = await bootDashboard({ username: 'superadmin', password: 'SuperAdmin@123', htmlRel: 'super-admin/index.html', appRel: 'super-admin/app.js' });
    check('boots without JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('home shows overview + chart', text.includes('Platform overview') && text.includes('Students per class'));
    const usersText = await switchView(window, 'users');
    check('user management renders', usersText.includes('Create user'));
    const settingsText = await switchView(window, 'settings');
    check('school settings renders', settingsText.includes('School information') && settingsText.includes('Notification preferences'));
    const logsText = await switchView(window, 'logs');
    check('activity logs render', logsText.includes('Activity Logs'));
  }

  console.log('\n== THEME system ==');
  {
    const { window, errors } = await bootDashboard({ username: 'student1', password: 'Student@123', htmlRel: 'student/index.html', appRel: 'student/app.js' });
    check('theme manager loads', typeof window.Theme === 'object' && typeof window.Theme.set === 'function', JSON.stringify(errors.slice(0, 2)));
    const before = window.document.documentElement.getAttribute('data-theme');
    window.Theme.set('dark', { sync: false });
    check('dark theme applies data-theme=dark', window.document.documentElement.getAttribute('data-theme') === 'dark');
    window.Theme.set(before === 'dark' ? 'light' : before, { sync: false });
  }

  console.log(failures === 0 ? '\n✅ ALL FRONTEND SMOKE TESTS PASSED' : `\n❌ ${failures} frontend checks failed`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('Harness error:', e); process.exit(1); });
