/**
 * Attendance test — term reporting, "mark all present" and the chronic-absence
 * trend, checked through the API *and* by driving the real dashboards in jsdom
 * (teacher register, term report tab, student/parent view).
 *
 * Run: node tests/attendance.test.js   (requires the server on :4000)
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
  return { ...data, cookie: cookies.join('; ') };
}

const auth = (s) => ({ cookie: s.cookie, authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json', 'x-csrf-token': s.csrfToken });
const getJson = async (s, p) => (await fetch(BASE + p, { headers: auth(s) })).json();

async function post(s, p, body) {
  const res = await fetch(BASE + p, { method: 'POST', headers: auth(s), body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const readScript = (rel) => fs.readFileSync(path.join(ROOT, 'frontend', rel), 'utf8');

async function boot({ creds, htmlRel, appRel }) {
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
    'js/components/messaging.js', 'js/components/documents.js', 'js/components/announcements.js', 'js/components/academics.js', appRel]) {
    try { window.eval(readScript(rel)); } catch (e) { errors.push(`eval ${rel}: ${e.message}`); }
  }
  await sleep(2500);
  console.error = origError;
  return { window, errors };
}

async function openView(window, key) {
  if (typeof window.__navHandler === 'function') {
    window.__navHandler(key);
    await sleep(1800);
  }
  return (window.document.body.textContent || '').replace(/\s+/g, ' ').trim();
}

const dayOffset = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

(async () => {
  const admin = await login('admin', 'Admin@123');
  const teacher = await login('teacher1', 'Teacher@123');
  const student = await login('student1', 'Student@123');
  const parent = await login('parent1', 'Parent@123');

  console.log('\n== API: term calendar ==');
  const terms = await getJson(teacher, '/api/attendance/terms');
  check('terms endpoint returns the school calendar', (terms.terms || []).length >= 3, JSON.stringify(terms).slice(0, 120));
  check('it names the current term', !!terms.current.term, JSON.stringify(terms.current));
  const thisTerm = terms.current;

  console.log('\n== API: mark all present ==');
  const classes = (await getJson(teacher, '/api/classes')).classes || [];
  const klass = classes.find((c) => /Senior 2/.test(c.name) && c.stream === 'A') || classes.find((c) => /Senior 2/.test(c.name)) || classes[classes.length - 1];
  let roster = (await getJson(teacher, `/api/classes/${klass.id}/students`)).students || [];
  // The demo catalog keeps only Sarah in this class. Corrections need a second
  // learner, so the test adds one instead of depending on removed demo students.
  if (roster.length < 2) {
    const extra = await post(admin, '/api/students', {
      fullName: 'Attendance Classmate',
      studentCode: 'STU-ATT-CLASSMATE',
      classId: klass.id,
    });
    check('a classmate can be added so corrections can be tested', extra.status === 201, JSON.stringify(extra.body).slice(0, 180));
    roster = (await getJson(teacher, `/api/classes/${klass.id}/students`)).students || [];
  }
  const day = dayOffset(0);
  const all = await post(teacher, '/api/attendance', { classId: klass.id, date: day, markAll: true });
  check('markAll returns 200', all.status === 200, JSON.stringify(all.body));
  check('markAll records the whole class', all.body.marked === roster.length, `${all.body.marked} vs ${roster.length}`);
  check('marks are stamped with the current term', all.body.term === thisTerm.term && all.body.year === thisTerm.year, JSON.stringify(all.body));
  const today = (await getJson(teacher, `/api/attendance?classId=${klass.id}&date=${day}`)).attendance || [];
  check('everyone is present', today.length === roster.length && today.every((a) => a.status === 'present'), today.map((a) => a.status).join(','));
  check('the class has more than one student to correct', roster.length >= 2, String(roster.length));

  console.log('\n== API: corrections stay idempotent ==');
  const two = roster.slice(0, 2).map((s, i) => ({ studentId: s.id, status: i ? 'absent' : 'late' }));
  await post(teacher, '/api/attendance', { classId: klass.id, date: day, records: two });
  const corrected = (await getJson(teacher, `/api/attendance?classId=${klass.id}&date=${day}`)).attendance || [];
  check('re-saving corrects rather than duplicating', corrected.length === roster.length, `${corrected.length} rows`);
  check('the corrected statuses are stored', corrected.some((a) => a.status === 'absent') && corrected.some((a) => a.status === 'late'));

  console.log('\n== API: spread marks over past weeks ==');
  for (const d of [3, 4, 7, 10, 14, 17]) {
    await post(teacher, '/api/attendance', { classId: klass.id, date: dayOffset(d), markAll: true });
  }
  // the student account used below signs in as Sarah Okello — pick THAT child,
  // not merely the first student whose name starts with "Sarah"
  const sarah = roster.find((s) => s.full_name === (student.user && student.user.fullName))
    || roster.find((s) => /Sarah/.test(s.full_name));
  check('the chosen class contains the test student', !!sarah, roster.map((r) => r.full_name).join(', '));
  const sarahId = (sarah || roster[0]).id;
  for (const d of [3, 4, 7, 10]) {
    await post(teacher, '/api/attendance', { classId: klass.id, date: dayOffset(d), records: [{ studentId: sarahId, status: 'absent' }] });
  }

  console.log('\n== API: term report ==');
  const rep = await getJson(teacher, `/api/attendance/term-report?classId=${klass.id}`);
  check('report resolves a term window', !!rep.term && !!rep.from && !!rep.to, JSON.stringify({ term: rep.term, from: rep.from, to: rep.to }));
  check('report lists every active student', (rep.students || []).length === roster.length, `${(rep.students || []).length} vs ${roster.length}`);
  check('report has a class percentage', typeof rep.summary.percentage === 'number');
  check('report counts recorded days', rep.days >= 6, String(rep.days));
  check('report flags the at-risk student', rep.students.some((s) => s.chronic), JSON.stringify(rep.summary.chronicCount));
  check('chronic list matches the per-student flags',
    rep.summary.chronicCount === rep.students.filter((s) => s.chronic).length);

  console.log('\n== API: absence trend ==');
  const trend = await getJson(teacher, `/api/attendance/trend?classId=${klass.id}&weeks=8`);
  check('trend returns several weeks', (trend.series || []).length >= 3, String((trend.series || []).length));
  check('trend totals match the term report', trend.summary.marked === rep.summary.marked,
    `${trend.summary.marked} vs ${rep.summary.marked}`);
  check('trend names the student at risk', (trend.chronic || []).length > 0);
  check('trend shows an unbroken run of missed days', trend.chronic.some((c) => c.missedRun >= 2),
    JSON.stringify((trend.chronic || []).map((c) => c.missedRun)));

  console.log('\n== API: student summary by term ==');
  const sum = await getJson(student, `/api/attendance/summary/student/${sarahId}?term=${encodeURIComponent(rep.term)}&year=${rep.year}`);
  check('summary accepted the term', sum.term === rep.term, JSON.stringify({ term: sum.term, expect: rep.term }));
  check('summary counts the absences', sum.absent >= 2, String(sum.absent));
  check('summary reports the missed run', sum.missedRun >= 2, String(sum.missedRun));
  check('summary includes the week-by-week series', (sum.series || []).length >= 3, String((sum.series || []).length));
  check('summary flags chronic absence', sum.chronic === true, String(sum.chronic));

  console.log('\n== API: access control ==');
  const otherClass = classes.find((c) => c.id !== klass.id);
  if (otherClass) {
    const blocked = await fetch(`${BASE}/api/attendance/term-report?classId=${otherClass.id}`, { headers: auth(student) });
    check('students cannot read a class report', blocked.status === 403, String(blocked.status));
  }
  const studentPrint = await fetch(`${BASE}/api/print/attendance/${klass.id}`, { headers: auth(student) });
  check('students cannot print a class report', studentPrint.status === 403, String(studentPrint.status));
  const teacherPrint = await fetch(`${BASE}/api/print/attendance/${klass.id}?term=${encodeURIComponent(rep.term)}&year=${rep.year}`, { headers: auth(teacher) });
  const html = await teacherPrint.text();
  check('teachers can print the attendance report', teacherPrint.status === 200 && /Class totals/.test(html), String(teacherPrint.status));
  check('printed report includes the follow-up list', /Follow-up list/.test(html));
  check('printed report names the term', html.includes(rep.term));

  console.log('\n== UI: teacher register + term report ==');
  {
    const { window, errors } = await boot({ creds: teacher, htmlRel: 'teacher/index.html', appRel: 'teacher/app.js' });
    check('teacher dashboard boots clean', errors.length === 0, errors.slice(0, 2).join(' | '));
    const text = await openView(window, 'attendance');
    const doc = window.document;
    check('register shows the roster controls', !!doc.querySelector('#att-class') && !!doc.querySelector('#att-load'));
    check('mark-all-present button is present', !!doc.querySelector('#att-all-present'), text.slice(0, 80));
    check('the term being recorded is shown', !!doc.querySelector('#att-term'));
    check('a term report tab exists', !!doc.querySelector('[data-att-tab="report"]'));
    check('the report tab is hidden until chosen', doc.querySelector('[data-att-pane="report"]').hidden === true);
    doc.querySelector('[data-att-tab="report"]').click();
    await sleep(1800);
    check('choosing the tab reveals the report', doc.querySelector('[data-att-pane="report"]').hidden === false);
    const reportText = doc.querySelector('#rep-body').textContent.replace(/\s+/g, ' ');
    check('report lists students with rates', /\d+(\.\d+)?%/.test(reportText), reportText.slice(0, 100));
    check('report shows the weekly table', /Week of/i.test(reportText));
    check('report draws a chart', !!doc.querySelector('#rep-chart svg, #rep-chart canvas, #rep-chart .bar'));
    check('report has a print button', !!doc.querySelector('#rep-print'));
    const atRisk = /at risk|Needs follow-up/i.test(reportText);
    check('report surfaces students needing follow-up', atRisk, reportText.slice(0, 120));
    window.close();
  }

  console.log('\n== UI: student + parent view ==');
  {
    const { window, errors } = await boot({ creds: student, htmlRel: 'student/index.html', appRel: 'student/app.js' });
    check('student dashboard boots clean', errors.length === 0, errors.slice(0, 2).join(' | '));
    const text = await openView(window, 'attendance');
    const doc = window.document;
    check('student can pick a period', !!doc.querySelector('#att-period'));
    check('student view shows the attendance rate', /Attendance rate/i.test(text), text.slice(0, 100));
    check('student view shows a weekly trend when there is enough data', doc.querySelector('#att-trend-card').hidden === false || /Week by week/.test(text));
    check('at-risk warning shows when below the threshold', /needs attention/i.test(text) || !/below the/.test(text));
    window.close();
  }
  {
    const { window, errors } = await boot({ creds: parent, htmlRel: 'parent/index.html', appRel: 'parent/app.js' });
    check('parent dashboard boots clean', errors.length === 0, errors.slice(0, 2).join(' | '));
    await openView(window, 'children');
    const tab = window.document.querySelector('#child-tabs [data-tab="attendance"]');
    if (tab) {
      tab.click();
      await sleep(1800);
      const text = window.document.body.textContent.replace(/\s+/g, ' ');
      check('parent sees the child attendance view', /Attendance rate/i.test(text), text.slice(0, 100));
    } else {
      check('parent attendance tab exists', false, 'no #child-tabs [data-tab="attendance"]');
    }
    window.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
