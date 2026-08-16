const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = (rel) => fs.readFileSync(path.join(ROOT, 'frontend', rel), 'utf8');
(async () => {
  const res = await fetch('http://localhost:4000/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin@123' }) });
  const creds = await res.json();
  const html = fs.readFileSync(path.join(ROOT, 'frontend/admin/index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost:4000/admin/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = globalThis.fetch; w.FormData = globalThis.FormData; w.Blob = globalThis.Blob; w.Headers = globalThis.Headers; w.URL = globalThis.URL; w.scrollTo = () => {};
  Object.defineProperty(w, 'innerWidth', { value: 1280, configurable: true });
  w.localStorage.setItem('scp_token', creds.token);
  w.localStorage.setItem('scp_user', JSON.stringify(creds.user));
  const errors = [];
  w.addEventListener('error', (e) => errors.push(e.message));
  const scripts = ['js/config.js','js/api.js','js/theme.js','js/ui.js','js/socket-client.js','js/components/messaging.js','js/components/documents.js','js/components/announcements.js','js/components/academics.js','admin/app.js'];
  for (const rel of scripts) { try { w.eval(rd(rel)); } catch (e) { errors.push(rel + ': ' + e.message); } }
  await new Promise((r) => setTimeout(r, 2500));
  console.log('boot errors:', errors.slice(0, 3));
  try {
    w.__navHandler('import');
    await new Promise((r) => setTimeout(r, 800));
    const modal = w.document.querySelector('.modal-backdrop');
    console.log('modal present:', !!modal);
    console.log('wiz-body present:', !!(modal && modal.querySelector('#wiz-body')));
    console.log('modal head html:', modal ? modal.innerHTML.slice(0, 260).replace(/\s+/g, ' ') : 'NONE');
  } catch (e) { console.log('nav error:', e.message); }
  console.log('errors now:', errors.slice(0, 6));
})();
