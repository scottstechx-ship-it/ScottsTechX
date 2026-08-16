/**
 * WEBSITE CONTENT tests — admissions, gallery, news.
 * Run: node tests/website-content.test.js  (requires the server on :4000)
 */
const fs = require('fs');
const { io } = require('socket.io-client');
const BASE = 'http://localhost:4000';

async function login(u, p) {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  return r.json();
}
async function api(tok, path, opts = {}) {
  const headers = tok ? { 'Authorization': 'Bearer ' + tok } : {};
  if (opts.body && typeof opts.body === 'string') headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
function tinyPng() {
  if (fs.existsSync('/tmp/test.png')) return fs.readFileSync('/tmp/test.png');
  // self-contained 1x1 transparent PNG
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
}
let fails = 0;
const ok = (label, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? '✔' : '✘'} ${label}${cond ? '' : ' — ' + extra}`); };

(async () => {
  const sa = await login('superadmin', 'SuperAdmin@123');
  const admin = await login('admin', 'Admin@123');
  const student = await login('student1', 'Student@123');

  // ===== ADMISSIONS FLOW =====
  console.log('-- ADMISSIONS --');
  const sock = io(BASE, { auth: { token: admin.token }, transports: ['websocket'] });
  const liveEvent = new Promise((res) => { sock.on('admission:new', (d) => res(d)); setTimeout(() => res(null), 6000); });
  await new Promise((res) => sock.on('connect', res));

  const sub = await api(null, '/api/website/admissions', { method: 'POST', body: JSON.stringify({
    fullName: 'Nakato Test Applicant', dateOfBirth: '2010-05-14', gender: 'Female',
    applyingFor: 'S.1 (Senior One)', program: 'Day Student',
    parentName: 'Mrs. Test Parent', parentPhone: '+256700111222', parentEmail: 'testparent@example.com',
    prevSchool: 'Ntinda Primary', motivation: 'I want quality education.' }) });
  ok('public form submits application', sub.status === 201, JSON.stringify(sub.data).slice(0, 150));

  const live = await liveEvent;
  ok('admin receives LIVE admission:new event', !!live && live.fullName === 'Nakato Test Applicant');

  const notifs = await api(admin.token, '/api/notifications');
  ok('admin has stored notification', JSON.stringify(notifs.data).includes('Nakato Test Applicant'));

  const inbox = await api(admin.token, '/api/website/admissions');
  const app_ = (inbox.data.applications || []).find((a) => a.full_name === 'Nakato Test Applicant');
  ok('application listed in dashboard inbox', !!app_);

  let upd = await api(admin.token, `/api/website/admissions/${app_.id}`, { method: 'PUT', body: JSON.stringify({ status: 'reviewing', note: 'Called parent' }) });
  ok('admin sets status + note', upd.status === 200 && upd.data.application.status === 'reviewing');
  upd = await api(admin.token, `/api/website/admissions/${app_.id}`, { method: 'PUT', body: JSON.stringify({ status: 'accepted' }) });
  ok('admin accepts application', upd.status === 200);

  const noAuth = await api(null, '/api/website/admissions');
  ok('public CANNOT list applications', noAuth.status === 401);
  const stuTry = await api(student.token, '/api/website/admissions');
  ok('student CANNOT list applications', stuTry.status === 403);

  let limited = false;
  for (let i = 0; i < 11; i++) {
    const r = await api(null, '/api/website/admissions', { method: 'POST', body: JSON.stringify({
      fullName: 'Spam ' + i, applyingFor: 'S.1', parentName: 'X', parentPhone: '0700' }) });
    if (r.status === 429) { limited = true; break; }
  }
  ok('spam protection (rate limit) kicks in', limited);

  // ===== GALLERY FLOW =====
  console.log('-- GALLERY --');
  const fd = new FormData();
  fd.append('file', new Blob([tinyPng()], { type: 'image/png' }), 'test.png');
  fd.append('title', 'Test Campus Photo');
  fd.append('caption', 'Our beautiful campus');
  fd.append('category', 'Campus');
  const up = await api(sa.token, '/api/website/gallery', { method: 'POST', body: fd });
  ok('super admin uploads gallery image', up.status === 201, JSON.stringify(up.data).slice(0, 150));
  const imgId = up.data.image && up.data.image.id;

  let pub = await api(null, '/api/website/gallery');
  ok('public gallery lists the image', JSON.stringify(pub.data).includes('Test Campus Photo'));
  const imgRes = await fetch(`${BASE}/api/website/gallery/${imgId}/image`);
  ok('uploaded image serves publicly', imgRes.status === 200 && (imgRes.headers.get('content-type') || '').includes('image'));

  const efd = new FormData();
  efd.append('title', 'Renamed Campus Photo');
  const ed = await api(sa.token, `/api/website/gallery/${imgId}`, { method: 'PUT', body: efd });
  ok('super admin edits image title', ed.status === 200 && ed.data.image.title === 'Renamed Campus Photo');

  const admTry = await api(admin.token, '/api/website/gallery', { method: 'POST', body: JSON.stringify({ title: 'x', url: 'http://x' }) });
  ok('regular admin CANNOT manage gallery', admTry.status === 403, 'status ' + admTry.status);

  const del = await api(sa.token, `/api/website/gallery/${imgId}`, { method: 'DELETE' });
  ok('super admin deletes image', del.status === 200);
  pub = await api(null, '/api/website/gallery');
  ok('image gone from public site', !JSON.stringify(pub.data).includes('Renamed Campus Photo'));

  // ===== NEWS FLOW =====
  console.log('-- NEWS --');
  const nfd = new FormData();
  nfd.append('title', 'School Reopens Monday');
  nfd.append('body', 'All students should report by 8am with full uniform.');
  const np = await api(admin.token, '/api/website/news', { method: 'POST', body: nfd });
  ok('admin publishes news post', np.status === 201, JSON.stringify(np.data).slice(0, 150));
  const newsId = np.data.post && np.data.post.id;

  let pubNews = await api(null, '/api/website/news');
  ok('public news page shows the post', JSON.stringify(pubNews.data).includes('School Reopens Monday'));

  const upd2 = await api(admin.token, `/api/website/news/${newsId}`, { method: 'PUT', body: JSON.stringify({ expiresAt: '2020-01-01 00:00:00' }) });
  ok('admin sets expiry date', upd2.status === 200);
  pubNews = await api(null, '/api/website/news');
  ok('EXPIRED post hidden from public automatically', !JSON.stringify(pubNews.data).includes('School Reopens Monday'));
  const manage = await api(admin.token, '/api/website/news/manage');
  const managed = (manage.data.news || []).find((n) => n.id === newsId);
  ok('expired post still visible in manage view (flagged)', !!managed && managed.expired === true);

  await api(admin.token, `/api/website/news/${newsId}`, { method: 'PUT', body: JSON.stringify({ expiresAt: '2030-01-01 00:00:00' }) });
  pubNews = await api(null, '/api/website/news');
  ok('future-dated post is public again', JSON.stringify(pubNews.data).includes('School Reopens Monday'));

  await api(admin.token, `/api/website/news/${newsId}`, { method: 'PUT', body: JSON.stringify({ published: false }) });
  pubNews = await api(null, '/api/website/news');
  ok('unpublished post hidden from public', !JSON.stringify(pubNews.data).includes('School Reopens Monday'));

  const stuNews = await api(student.token, '/api/website/news', { method: 'POST', body: JSON.stringify({ title: 'hack', body: 'x' }) });
  ok('student CANNOT post news', stuNews.status === 403);

  const delNews = await api(admin.token, `/api/website/news/${newsId}`, { method: 'DELETE' });
  ok('admin deletes news post', delNews.status === 200);

  sock.close();
  console.log(fails === 0 ? '\n✅ ALL WEBSITE-CONTENT FLOWS WORK' : `\n❌ ${fails} failures`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS FAIL:', e); process.exit(1); });
