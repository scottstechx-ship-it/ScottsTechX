/**
 * UI DELETE FLOW TEST — simulates the exact clicks a user makes:
 * open dashboard -> click delete button -> confirm dialog appears ->
 * click Confirm -> verify the item is really deleted via the API.
 * This guards against the confirmDialog resolve-order bug.
 * Run: node tests/ui-delete.test.js   (requires server on :4000)
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:4000';
const ROOT = path.join(__dirname, '..');

async function login(u, p) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  return r.json();
}
async function api(tok, p, opts = {}) {
  const headers = { Authorization: 'Bearer ' + tok };
  if (opts.body && typeof opts.body === 'string') headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + p, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

let fails = 0;
const ok = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${l}${c ? '' : ' — ' + e}`); };

function makeWindow(creds, pagePath) {
  const html = fs.readFileSync(path.join(ROOT, 'frontend', pagePath), 'utf8');
  const dom = new JSDOM(html, { url: `${BASE}/${pagePath.replace('/index.html', '')}/`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = globalThis.fetch;
  window.FormData = globalThis.FormData;
  window.Blob = globalThis.Blob;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true }); // PHONE width
  window.localStorage.setItem('scp_token', creds.token);
  window.localStorage.setItem('scp_user', JSON.stringify(creds.user));
  const scripts = ['js/config.js', 'js/api.js', 'js/theme.js', 'js/ui.js', 'js/socket-client.js',
    'js/components/messaging.js', 'js/components/documents.js', 'js/components/announcements.js',
    'js/components/academics.js', 'js/components/users.js', 'js/components/website.js'];
  for (const rel of scripts) window.eval(fs.readFileSync(path.join(ROOT, 'frontend', rel), 'utf8'));
  return window;
}

(async () => {
  // 1) UNIT: confirmDialog must resolve true on Confirm, false on Cancel/close — at phone width
  {
    const admin = await login('admin', 'Admin@123');
    const w = makeWindow(admin, 'admin/index.html');

    // confirm path
    let p = w.UI.confirmDialog('Delete this thing?', { confirmText: 'Delete' });
    await new Promise((r) => setTimeout(r, 250));
    let yes = w.document.querySelector('.modal-backdrop [data-yes]');
    ok('confirm dialog renders with Confirm button', !!yes);
    yes.click();
    ok('clicking Confirm resolves TRUE', (await p) === true);

    // cancel path
    p = w.UI.confirmDialog('Delete this thing?', {});
    await new Promise((r) => setTimeout(r, 250));
    w.document.querySelector('.modal-backdrop [data-no]').click();
    ok('clicking Cancel resolves FALSE', (await p) === false);

    // backdrop-close path
    p = w.UI.confirmDialog('Delete this thing?', {});
    await new Promise((r) => setTimeout(r, 250));
    const bd = w.document.querySelector('.modal-backdrop');
    bd.dispatchEvent(new w.Event('click', { bubbles: true }));
    ok('closing via backdrop resolves FALSE', (await p) === false);
    w.close();
  }

  // 2) FULL UI FLOW: super admin deletes an announcement through the real component
  {
    const sa = await login('superadmin', 'SuperAdmin@123');
    // create a target announcement via API
    const made = await api(sa.token, '/api/announcements', { method: 'POST', body: JSON.stringify({ title: 'UI-Delete-Me', content: 'x', audience: 'all' }) });
    const annId = made.data.announcement.id;

    const w = makeWindow(sa, 'super-admin/index.html');
    // render the announcements component into a container
    const box = w.document.createElement('div');
    w.document.body.appendChild(box);
    const view = new w.AnnouncementsView({ container: box, canPost: true });
    await view.render();
    await new Promise((r) => setTimeout(r, 1200));

    // find OUR announcement's delete button
    const target = [...box.querySelectorAll('[data-del]')].find((b) => (b.closest('.ann-item, .card') || {}).textContent?.includes('UI-Delete-Me'))
      || box.querySelector('[data-del]');
    ok('delete button rendered in UI', !!target);
    if (target) {
      target.click();
      await new Promise((r) => setTimeout(r, 300));
      const yes = w.document.querySelector('.modal-backdrop [data-yes]');
      ok('confirm dialog opened on delete click', !!yes);
      if (yes) {
        yes.click();
        await new Promise((r) => setTimeout(r, 1200));
        const check = await api(sa.token, '/api/announcements');
        ok('announcement REALLY deleted after UI confirm', !JSON.stringify(check.data).includes('UI-Delete-Me'));
      }
    }
    // cleanup if flow failed
    await api(sa.token, `/api/announcements/${annId}`, { method: 'DELETE' }).catch(() => {});
    w.close();
  }

  // 3) FULL UI FLOW: admin deletes a website news post through the NewsManager
  {
    const admin = await login('admin', 'Admin@123');
    const nfd = new FormData();
    nfd.append('title', 'UI-News-Delete');
    nfd.append('body', 'temp');
    const made = await fetch(BASE + '/api/website/news', { method: 'POST', headers: { Authorization: 'Bearer ' + admin.token }, body: nfd });
    const post = (await made.json()).post;

    const w = makeWindow(admin, 'admin/index.html');
    const box = w.document.createElement('div');
    w.document.body.appendChild(box);
    await w.Website.NewsManager.render(box);
    await new Promise((r) => setTimeout(r, 1200));

    const card = [...box.querySelectorAll('.card')].find((c) => c.textContent.includes('UI-News-Delete'));
    const del = card && card.querySelector('[data-del]');
    ok('news delete button rendered', !!del);
    if (del) {
      del.click();
      await new Promise((r) => setTimeout(r, 300));
      const yes = w.document.querySelector('.modal-backdrop [data-yes]');
      ok('news confirm dialog opened', !!yes);
      if (yes) {
        yes.click();
        await new Promise((r) => setTimeout(r, 1200));
        const check = await api(admin.token, '/api/website/news/manage');
        ok('news post REALLY deleted after UI confirm', !JSON.stringify(check.data).includes('UI-News-Delete'));
      }
    }
    await api(admin.token, `/api/website/news/${post.id}`, { method: 'DELETE' }).catch(() => {});
    w.close();
  }

  console.log(fails === 0 ? '\n✅ UI DELETE FLOW WORKS (confirm dialog fixed)' : `\n❌ ${fails} failures`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('Harness error:', e); process.exit(1); });
