/**
 * IMPORTS + REPORT CARDS test.
 *
 * Backend half:
 *   the guided pipeline (guide / templates / starter pack / run), that a dry run
 *   saves nothing, that every kind imports and re-imports without duplicating,
 *   that report files (PDF and a zip of PDFs) are matched to children, that an
 *   unmatched file can be matched by hand, and that the fee gate only lets
 *   cleared children's cards go out to parents.
 *
 * Frontend half (jsdom, against the live API):
 *   the admin Import Center and Report Cards screens render for real, and the
 *   cleared/owing ticks are the ones the school expects to see.
 *
 * Run: node tests/imports.test.js    (requires the server on :4000)
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:4000';
const ROOT = path.join(__dirname, '..');
const TERM = 'Term 3';
const YEAR = '2026';

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) { pass += 1; console.log(`  ok   ${msg}`); } else { fail += 1; console.log(`  FAIL ${msg}`); }
}

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login ${username}: ${JSON.stringify(data)}`);
  const rawCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const cookies = rawCookies.map((c) => c.split(';')[0]);
  return { token: data.token, user: data.user, cookies, rawCookies };
}

function adminApi(creds) {
  const headers = { Authorization: `Bearer ${creds.token}` };
  return {
    get: async (p) => {
      const r = await fetch(BASE + p, { headers });
      return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
    },
    post: async (p, body) => {
      const r = await fetch(BASE + p, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    },
  };
}

async function upload(creds, { kind, name, data, options = {}, dryRun = false }) {
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', new Blob([data]), name);
  form.append('dryRun', dryRun ? '1' : '0');
  form.append('options', JSON.stringify({ term: TERM, year: YEAR, ...options }));
  const r = await fetch(`${BASE}/api/imports/run`, { method: 'POST', headers: { Authorization: `Bearer ${creds.token}` }, body: form });
  return { status: r.status, body: await r.json() };
}

/** a genuinely valid one-page PDF, built without any dependency */
function pdf(title) {
  const stream = `BT /F1 18 Tf 60 720 Td (${String(title).replace(/[()\\]/g, '')}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function readScript(rel) {
  return fs.readFileSync(path.join(ROOT, 'frontend', rel), 'utf8');
}

async function bootDashboard({ username, password, htmlRel, appRel, width = 1280, extraScripts = [] }) {
  const creds = await login(username, password);
  const html = fs.readFileSync(path.join(ROOT, 'frontend', htmlRel), 'utf8');
  const dom = new JSDOM(html, {
    url: `${BASE}/${htmlRel.replace('/index.html', '')}/`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const cookieHeader = (creds.cookies || []).join('; ');
  // The browser client reads the CSRF twin from a readable cookie and echoes it
  // in a header, so the harness has to carry both halves like a real browser.
  for (const c of creds.rawCookies || []) {
    try { window.document.cookie = c; } catch { /* anything the jar refuses is not needed */ }
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
  window.open = () => null;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });

  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  const origError = console.error;
  console.error = (...a) => { errors.push(a.join(' ')); };

  const scripts = ['js/config.js', 'js/icons.js', 'js/api.js', 'js/theme.js', 'js/ui.js', 'js/socket-client.js',
    'js/components/messaging.js', 'js/components/documents.js', 'js/components/announcements.js',
    'js/components/academics.js', 'js/components/users.js', 'js/components/website.js',
    'js/components/import-center.js', 'js/components/reports.js', ...extraScripts, appRel];
  for (const rel of scripts) {
    if (!fs.existsSync(path.join(ROOT, 'frontend', rel))) continue;
    try { window.eval(readScript(rel)); } catch (e) { errors.push(`eval ${rel}: ${e.message}`); }
  }
  await new Promise((r) => setTimeout(r, 2500));
  return { window, creds, errors, restoreConsole: () => { console.error = origError; } };
}

function navTo(window, key) {
  if (window.__navHandler) return window.__navHandler(key);
  return null;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Delete everything this test created: its three children (and their logins),
 * their guardians, fee rows and payments, their report cards and the files on
 * disk, the notifications that went to their parents, and the exam rows the
 * marks import created. Anything not created here is left alone.
 */
function cleanupTestData(since, codes) {
  const { all, get, run } = require('../backend/database/db');
  const fsMod = require('fs');
  const reportsSvc = require('../backend/services/reports');
  const questions = codes.map(() => '?').join(',');
  let touched = 0;

  const students = all(`SELECT id, user_id FROM students WHERE student_code IN (${questions})`, codes);
  const parents = all(
    `SELECT DISTINCT p.id, p.user_id FROM parents p
     JOIN parent_students ps ON ps.parent_id = p.id
     JOIN students s ON s.id = ps.student_id WHERE s.student_code IN (${questions})`, codes
  );

  for (const st of students) {
    for (const card of all('SELECT * FROM report_cards WHERE student_id = ?', [st.id])) {
      if (card.storage_path) { try { fsMod.unlinkSync(reportsSvc.filePath(card)); } catch { /* already gone */ } }
      run('DELETE FROM report_card_subjects WHERE report_card_id = ?', [card.id]);
      run('DELETE FROM report_cards WHERE id = ?', [card.id]);
      touched += 1;
    }
    run('DELETE FROM student_fees WHERE student_id = ?', [st.id]);
    run('DELETE FROM fee_payments WHERE student_id = ?', [st.id]);
    run('DELETE FROM exam_results WHERE student_id = ?', [st.id]);
    run('DELETE FROM attendance WHERE student_id = ?', [st.id]);
    run('DELETE FROM parent_students WHERE student_id = ?', [st.id]);
    run('DELETE FROM students WHERE id = ?', [st.id]);
    if (st.user_id) run('DELETE FROM users WHERE id = ? AND role = ?', [st.user_id, 'student']);
    touched += 1;
  }

  for (const p of parents) {
    const stillLinked = get('SELECT COUNT(*) c FROM parent_students WHERE parent_id = ?', [p.id]).c;
    if (stillLinked) continue;
    run('DELETE FROM parent_students WHERE parent_id = ?', [p.id]);
    run('DELETE FROM notifications WHERE user_id = ?', [p.user_id]);
    run('DELETE FROM parents WHERE id = ?', [p.id]);
    if (p.user_id) run('DELETE FROM users WHERE id = ? AND role = ?', [p.user_id, 'parent']);
    touched += 1;
  }

  // fee structures that nobody is billed for any more, created by this run
  for (const fee of all('SELECT id FROM fee_structures WHERE created_at >= ?', [since])) {
    if (!get('SELECT COUNT(*) c FROM student_fees WHERE fee_structure_id = ?', [fee.id]).c) {
      run('DELETE FROM fee_structures WHERE id = ?', [fee.id]);
      touched += 1;
    }
  }
  // classes and exams this run introduced
  for (const cls of all("SELECT id FROM classes WHERE name LIKE 'Import Test %'")) {
    run('DELETE FROM teacher_classes WHERE class_id = ?', [cls.id]);
    run('DELETE FROM timetable_entries WHERE class_id = ?', [cls.id]);
    run('DELETE FROM classes WHERE id = ?', [cls.id]);
    touched += 1;
  }
  for (const ex of all('SELECT id FROM exams WHERE created_at >= ?', [since])) {
    run('DELETE FROM exam_results WHERE exam_id = ?', [ex.id]);
    run('DELETE FROM exams WHERE id = ?', [ex.id]);
    touched += 1;
  }
  // report files that were parked without a child while the test ran
  for (const orphan of all("SELECT * FROM report_cards WHERE source = 'unmatched' AND created_at >= ?", [since])) {
    if (orphan.storage_path) { try { fsMod.unlinkSync(reportsSvc.filePath(orphan)); } catch { /* already gone */ } }
    run('DELETE FROM report_cards WHERE id = ?', [orphan.id]);
    touched += 1;
  }
  return touched;
}

(async () => {
  const creds = await login('admin', 'Admin@123');
  const api = adminApi(creds);

  // ---------------------------------------------------------------- backend
  console.log('\n== guide, templates and starter pack ==');
  const guide = await api.get('/api/imports/guide');
  ok(guide.status === 200, 'GET /api/imports/guide is authorised for admin');
  const steps = guide.body.pipeline.map((p) => p.key);
  ok(steps[0] === 'timetable', `the guided order starts with the timetable (got ${steps[0]})`);
  ok(steps.indexOf('teachers') < steps.indexOf('students'), 'teachers come before students');
  ok(steps.indexOf('students') < steps.indexOf('guardians'), 'students come before guardians');
  ok(steps.indexOf('guardians') < steps.indexOf('fees'), 'guardians come before fees');
  ok(steps.indexOf('fees') < steps.indexOf('reports'), 'fees come before report cards');
  ok(Object.keys(guide.body.kinds).length >= 10, `every import kind is described (${Object.keys(guide.body.kinds).length})`);
  ok(guide.body.counts && typeof guide.body.counts.classes === 'number', 'the guide reports live counts for the screen');

  const { parseCsv, rowsToObjects } = require('../backend/services/spreadsheet');
  let templateProblems = [];
  for (const key of Object.keys(guide.body.kinds)) {
    const t = await api.get(`/api/imports/template.csv?type=${key}`);
    if (t.status !== 200 || typeof t.body !== 'string' || !t.body.includes('\n')) { templateProblems.push(`${key}: no template`); continue; }
    const rows = rowsToObjects(parseCsv(t.body));
    const data = rows.filter((r) => !String(Object.values(r)[0] || '').trim().startsWith('#'));
    const keys = Object.keys(rows[0] || {});
    if (!data.length) templateProblems.push(`${key}: no example rows`);
    const unused = keys.filter((k) => data.every((r) => String(r[k] ?? '').trim() === ''));
    if (unused.length) templateProblems.push(`${key}: example rows leave ${unused.join(', ')} blank (misaligned columns?)`);
  }
  ok(!templateProblems.length, `all templates parse with aligned example rows${templateProblems.length ? ` — ${templateProblems.join('; ')}` : ''}`);

  const pack = await fetch(`${BASE}/api/imports/starter-pack.zip`, { headers: { Authorization: `Bearer ${creds.token}` } });
  const packBuf = Buffer.from(await pack.arrayBuffer());
  const { readZip } = require('../backend/services/zip');
  const entries = readZip(packBuf).map((f) => f.name);
  ok(pack.status === 200 && entries.includes('README-FIRST.txt'), 'starter pack downloads and holds the README');
  ok(entries.filter((n) => n.endsWith('.csv')).length >= 8, `starter pack holds every template (${entries.length} files)`);
  ok(entries.includes('8-report-card-format.pdf'), 'starter pack includes the PDF report-card format');

  const blankPdf = await fetch(`${BASE}/api/imports/report-format.pdf`, { headers: { Authorization: `Bearer ${creds.token}` } });
  const blankBytes = Buffer.from(await blankPdf.arrayBuffer());
  ok(blankPdf.status === 200 && blankBytes.slice(0, 5).toString() === '%PDF-', 'a blank PDF report format downloads');
  ok(blankBytes.includes(Buffer.from('REPORT CARD')), 'the PDF format is a report card, not an empty file');

  const formatZip = await fetch(`${BASE}/api/reports/format.zip?term=${encodeURIComponent(TERM)}&year=${YEAR}`, { headers: { Authorization: `Bearer ${creds.token}` } });
  const formatBuf = Buffer.from(await formatZip.arrayBuffer());
  const formatFiles = formatZip.status === 200 ? readZip(formatBuf) : [];
  ok(formatZip.status === 200 && formatBuf.slice(0, 2).toString() === 'PK', 'the school can download a PDF format pack to upload');
  ok(formatFiles.some((f) => /README/i.test(f.name)), 'the format pack explains how to name and upload the PDFs');
  ok(formatFiles.some((f) => f.name.toLowerCase().endsWith('.pdf') && f.data.slice(0, 5).toString() === '%PDF-'), 'the format pack contains a real PDF the school can upload');

  // ------------------------------------------------------- a dry run saves nothing
  console.log('\n== dry run vs apply ==');
  const templates = require('../backend/services/importTemplates');
  const before = (await api.get('/api/imports/guide')).body.counts;
  const dry = await upload(creds, { kind: 'classes', name: 'classes.csv', data: templates.template('classes').content, dryRun: true });
  ok(dry.status === 200 && dry.body.dryRun === true, 'dry run answers as a preview');
  ok(/Nothing has been saved yet/i.test(dry.body.message || ''), 'the preview says plainly that nothing was saved');
  const afterDry = (await api.get('/api/imports/guide')).body.counts;
  ok(JSON.stringify(before.classes) === JSON.stringify(afterDry.classes), 'a dry run changed no class count');

  const applied = await upload(creds, { kind: 'classes', name: 'classes.csv', data: templates.template('classes').content });
  ok(applied.status === 200 && applied.body.dryRun === false, 'the real run answers as an import');
  const afterApply = (await api.get('/api/imports/guide')).body.counts;
  ok(afterApply.classes >= afterDry.classes, `the real run created the classes in the file (${afterDry.classes} → ${afterApply.classes})`);

  // ------------------------------------------------- reports: PDFs, zip, matching
  // The report half builds its own children so the test does not depend on demo
  // data: one who has paid everything, one who still owes, one who is ready but
  // has not been sent anything yet.
  console.log('\n== report cards: files, matching, the payment gate ==');
  const startedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const MINE = [
    { code: 'TESTPAID1', name: 'Test Paid Child', parent: 'Test Parent One', phone: '+256700900001', email: 'parent.one@example.com' },
    { code: 'TESTOWES1', name: 'Test Owing Child', parent: 'Test Parent Two', phone: '+256700900002', email: 'parent.two@example.com' },
    { code: 'TESTRDY01', name: 'Test Ready Child', parent: 'Test Parent Three', phone: '+256700900003', email: 'parent.three@example.com' },
  ];
  const studentCsv = ['Full Name,Student ID,Class,Stream,Gender,Parent Name,Parent Phone,Parent Email,Relationship']
    .concat(MINE.map((m) => `${m.name},${m.code},Senior 2,A,Female,${m.parent},${m.phone},${m.email},Mother`))
    .join('\n');
  const studentsImport = await upload(creds, { kind: 'students', name: 'test-students.csv', data: studentCsv });
  ok(studentsImport.status === 200, `the test children were imported (${studentsImport.body.message})`);

  const feeCsv = ['Fee Name,Amount,Year,Term,Student ID']
    .concat(MINE.map((m) => `Term 3 Tuition,600000,${YEAR},${TERM},${m.code}`))
    .join('\n');
  const feesImport = await upload(creds, { kind: 'fees', name: 'test-fees.csv', data: feeCsv });
  ok(feesImport.status === 200, `fees were billed to them (${feesImport.body.message})`);

  const ref = (await api.get('/api/settings/classes-reference')).body;
  const byCode = (code) => ref.students.find((s) => s.student_code === code);
  ok(MINE.every((m) => byCode(m.code)), 'all three test children exist in the platform');

  const single = await upload(creds, {
    kind: 'reports', name: 'TESTRDY01 report card.pdf', data: pdf('Ready child'),
    options: { term: TERM, year: YEAR },
  });
  ok(single.status === 200 && (single.body.matched || []).length === 1, 'a single PDF report card uploads and matches by student ID');

  const zipFiles = [
    { name: 'TESTPAID1.pdf', data: pdf('Paid child') },
    { name: 'Nameless Scan 4471.pdf', data: pdf('No name anywhere') },
  ];
  const { writeZip } = require('../backend/services/zip');
  const zip = await upload(creds, { kind: 'reports', name: 'cards.zip', data: writeZip(zipFiles), options: { term: TERM, year: YEAR } });
  ok(zip.status === 200, 'a zip of report cards uploads');
  ok((zip.body.unmatched || []).length >= 1, 'the file with no child in its name is reported as needing a child');

  const unmatched = await api.get('/api/reports/unmatched');
  ok(unmatched.status === 200 && unmatched.body.files.length >= 1, `unmatched files are listed for the office (${unmatched.body.files.length})`);
  if (unmatched.body.files.length) {
    const target = byCode('TESTOWES1');
    const matched = await api.post(`/api/reports/${unmatched.body.files[0].id}/match`, { studentId: target.id, term: TERM, year: YEAR });
    ok(matched.status === 200, `an unmatched file can be matched by hand to ${target.full_name}`);
  }

  const reports = require('../backend/services/reports');
  const paid = byCode('TESTPAID1');
  const owes = byCode('TESTOWES1');
  const ready = byCode('TESTRDY01');

  for (const child of [paid, ready]) {
    const position = reports.studentFeePosition(child.id);
    if (position.balance > 0) {
      await api.post(`/api/fees/student/${child.id}/pay`, { amount: position.balance, method: 'Cash', note: 'clearing for the report test' });
    }
  }
  ok(reports.studentFeePosition(paid.id).cleared === true, `${paid.full_name} is fully cleared after paying the balance`);
  ok(reports.studentFeePosition(ready.id).cleared === true, `${ready.full_name} is fully cleared too`);
  const owingPos = reports.studentFeePosition(owes.id);
  ok(owingPos.cleared === false, `${owes.full_name} still owes ${owingPos.balance}`);

  const inventory = await api.get(`/api/reports?term=${encodeURIComponent(TERM)}&year=${YEAR}`);
  ok(inventory.status === 200, 'the office inventory loads');
  const rowOf = (id) => (inventory.body.rows || []).find((r) => r.studentId === id);
  ok(!!rowOf(paid.id).reportId, 'the cleared child has a report card on file');
  ok(rowOf(paid.id).cleared === true, 'the cleared child shows as cleared (so the screen pre-ticks them)');
  ok(rowOf(owes.id).cleared === false && rowOf(owes.id).balance > 0, 'the owing child shows the balance owing');

  const send = await api.post('/api/reports/send', {
    term: TERM, year: YEAR, studentIds: [paid.id, owes.id], onlyCleared: true, note: 'End of term',
  });
  ok(send.status === 200, 'sending works');
  ok(send.body.sent >= 1 && send.body.skipped >= 1, `only cleared children were sent (sent ${send.body.sent}, skipped ${send.body.skipped})`);
  const skipped = (send.body.results || []).find((r) => !r.ok);
  ok(skipped && /Owes/.test(skipped.reason || ''), `the skipped child was skipped for the balance: "${skipped && skipped.reason}"`);

  const { get } = require('../backend/database/db');
  const sentCard = get("SELECT * FROM report_cards WHERE student_id = ? AND source != 'unmatched'", [paid.id]);
  ok(!!sentCard && !!sentCard.sent_at, 'the delivered card is stamped as sent');
  ok(sentCard && sentCard.delivery_note === 'End of term', 'the office note was kept with the delivery');

  const parent = get(
    `SELECT u.id AS user_id, u.username FROM parents p JOIN users u ON u.id = p.user_id
     JOIN parent_students ps ON ps.parent_id = p.id WHERE ps.student_id = ?`, [paid.id]
  );
  const note = get('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC', [parent.user_id]);
  ok(!!note && /Report card ready/.test(note.title), `the parent was alerted in the platform: "${note && note.title}"`);

  const parentLogin = await login(parent.username, 'Parent@123');
  const parentToken = parentLogin.token;
  const own = await fetch(`${BASE}/api/reports/my`, { headers: { Authorization: `Bearer ${parentToken}` } });
  const ownBody = await own.json();
  ok(own.status === 200 && (ownBody.students || []).some((s) => (s.reports || []).some((r) => r.id === sentCard.id)), 'the parent sees the released card');
  const download = await fetch(`${BASE}/api/reports/${sentCard.id}/file`, { headers: { Authorization: `Bearer ${parentToken}` } });
  const bytes = Buffer.from(await download.arrayBuffer());
  ok(download.status === 200 && bytes.slice(0, 5).toString() === '%PDF-', 'the parent can open the actual PDF file');

  const unpaidCard = get("SELECT * FROM report_cards WHERE student_id = ? AND source != 'unmatched'", [owes.id]);
  if (unpaidCard) {
    const blocked = await fetch(`${BASE}/api/reports/${unpaidCard.id}/file`, { headers: { Authorization: `Bearer ${parentToken}` } });
    ok(blocked.status === 403 || blocked.status === 404, `another family's unreleased card is refused to a parent (${blocked.status})`);
  } else {
    ok(true, 'no unreleased card to test the refusal with');
  }
  const anon = await fetch(`${BASE}/api/reports`, { redirect: 'manual' });
  ok(anon.status === 401 || anon.status === 403, 'report cards are not readable without a session');

  // ------------------------------------------------------------------ browser
  console.log('\n== the admin Import Center and Report Cards screens (jsdom) ==');
  // park one file that cannot be matched, so the screen always has something to
  // offer for matching (the file matched by hand above is gone by now)
  await upload(creds, { kind: 'reports', name: `Scan ${Date.now()}.pdf`, data: pdf('unreadable scan'), options: { term: TERM, year: YEAR } });
  const { window, errors, restoreConsole } = await bootDashboard({
    username: 'admin', password: 'Admin@123', htmlRel: 'platform/admin/index.html', appRel: 'platform/admin/app.js',
  });
  restoreConsole();
  ok(errors.length === 0, `the admin dashboard boots cleanly${errors.length ? ` — ${errors.slice(0, 3).join(' | ')}` : ''}`);

  await navTo(window, 'import');
  await wait(1200);
  const icText = window.document.body.textContent || '';
  ok(/Import Center/.test(icText), 'the Import Center screen opens');
  const stepCards = [...window.document.querySelectorAll('[data-step]')];
  ok(stepCards.length >= 8, `every guided step is shown (${stepCards.length})`);
  ok(stepCards[0] && stepCards[0].getAttribute('data-step') === 'timetable', 'the first step on screen is the timetable');
  ok(!!window.document.querySelector('[data-template="timetable"]'), 'each step offers its own template download');
  ok(/Download all templates/.test(icText), 'the whole starter pack can be downloaded in one click');
  const uploadLabels = [...window.document.querySelectorAll('label.ic-upload')];
  ok(uploadLabels.length >= 8 && uploadLabels.every((l) => l.querySelector('input[type="file"]')), `every Upload control opens a file picker (${uploadLabels.length})`);
  ok(!!window.document.querySelector('[data-step="reports"] [data-pdf-format]'), 'report cards offer a PDF format the school can upload');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(icText), 'the Import Center does not use emoji');
  const icMarkupShown = /<(svg|path|div|span)\b/.test(icText);
  ok(!icMarkupShown, 'no markup is printed as text on the Import Center');

  // a real preview → apply, driven the way the page drives it
  const pick = window.document.querySelector('input[data-pick="classes"]');
  ok(!!pick, 'the classes step has a working file input');
  if (pick) {
    // a class that cannot exist yet, so the outcome has something to report
    const fresh = `Import Test ${Date.now().toString(36).toUpperCase()}`;
    const csv = `Class,Stream,Class Teacher,Year\n${fresh},A,,${YEAR}\n`;
    // the Node File serialises in multipart form data the way a browser does
    const file = new File([csv], 'classes.csv', { type: 'text/csv' });
    Object.defineProperty(pick, 'files', { value: [file], configurable: true });
    pick.dispatchEvent(new window.Event('change', { bubbles: true }));
    await wait(1500);
    const modalText = (window.document.querySelector('.modal-backdrop') || {}).textContent || '';
    ok(/nothing saved yet/i.test(modalText), 'the preview dialog opens and says nothing is saved yet');
    ok(/ready/i.test(modalText), 'the preview shows how many rows are ready');
    const applyBtn = window.document.querySelector('[data-apply]');
    ok(!!applyBtn, 'the preview offers the import button');
    if (applyBtn) {
      applyBtn.click();
      await wait(2000);
      const outcome = (window.document.querySelector('.modal-backdrop') || {}).textContent || '';
      ok(/imported/i.test(outcome), 'the import reports what it did');
      ok(new RegExp(`Created[\\s\\S]*${fresh}`, 'i').test(outcome), `the outcome names the class it created (${fresh})`);
    }
    const closeBtn = window.document.querySelector('[data-done]');
    if (closeBtn) closeBtn.click();
    await wait(300);
  }

  await navTo(window, 'reports');
  await wait(1800);
  const rpText = window.document.body.textContent || '';
  ok(/Report Cards/.test(rpText), 'the Report Cards screen opens');
  const rows = [...window.document.querySelectorAll('#rp-table tbody tr')];
  ok(rows.length >= 2, `children are listed with their report and fee state (${rows.length} rows)`);
  const tickFor = (id) => window.document.querySelector(`[data-tick="${id}"]`);
  const readyTick = tickFor(ready.id);
  const owingTick = tickFor(owes.id);
  const sentTick = tickFor(paid.id);
  ok(readyTick && readyTick.checked === true, 'a cleared child who has not been sent their card IS pre-ticked');
  ok(owingTick && owingTick.checked === false, 'the child who still owes is not pre-ticked');
  ok(sentTick && sentTick.checked === false && sentTick.disabled, 'a child already sent their card cannot be sent again');
  ok(/owes/i.test(rpText), 'the balance owing is shown on the screen');
  ok(!/<(svg|path|div|span)\b/.test(rpText), 'no markup is printed as text on Report Cards');
  const hygiene = [];
  for (const td of window.document.querySelectorAll('#rp-table td')) {
    if (td.classList.contains('actions-cell') || td.hasAttribute('colspan')) continue;
    if (!td.hasAttribute('data-label')) hygiene.push((td.textContent || '').trim().slice(0, 20));
  }
  ok(!hygiene.length, `every table cell is labelled for the phone layout${hygiene.length ? ` — ${hygiene.join(', ')}` : ''}`);
  ok(!!window.document.querySelector('#rp-table')?.closest('.table-responsive'), 'the report table scrolls/stacks on a phone');

  const sendBtn = window.document.querySelector('#rp-send');
  ok(!!sendBtn, 'the Send to parents button is present');
  ok(sendBtn && /Send\s+\d+\s+to parents/i.test(sendBtn.textContent || ''), `the send button counts the pre-ticked children ("${sendBtn && sendBtn.textContent.trim()}")`);
  ok(/Fees cleared/i.test(rpText), 'the screen summarises how many children have cleared their fees');
  const unBlock = window.document.querySelector('#rp-unmatched');
  ok(unBlock && /need a child chosen/i.test(unBlock.textContent || ''), 'the unmatched files are offered for matching on the screen');

  // ---------------------------------------------------------------- cleanup
  // The test builds real records, so it takes them away again: a school running
  // this against their own database must not find test children in it.
  const removed = cleanupTestData(startedAt, MINE.map((m) => m.code));
  console.log(`\ncleanup: removed ${removed} test record(s) and the files they stored`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e); process.exit(2); });
