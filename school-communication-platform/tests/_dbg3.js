const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = (r) => fs.readFileSync(path.join(ROOT, 'frontend', r), 'utf8');
(async () => {
  const res = await fetch('http://localhost:4000/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin@123' }) });
  const creds = await res.json();
  const dom = new JSDOM(rd('admin/index.html'), { url: 'http://localhost:4000/admin/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = globalThis.fetch; w.FormData = globalThis.FormData; w.Blob = globalThis.Blob; w.Headers = globalThis.Headers; w.URL = globalThis.URL; w.scrollTo = () => {};
  Object.defineProperty(w, 'innerWidth', { value: 1280, configurable: true });
  w.localStorage.setItem('scp_token', creds.token);
  w.localStorage.setItem('scp_user', JSON.stringify(creds.user));
  const errors = [];
  w.addEventListener('error', (e) => errors.push(e.message));
  for (const rel of ['js/config.js','js/api.js','js/theme.js','js/ui.js','js/socket-client.js','js/components/messaging.js','js/components/documents.js','js/components/announcements.js','js/components/academics.js','js/components/users.js','admin/app.js']) {
    try { w.eval(rd(rel)); } catch (e) { errors.push(rel + ': ' + e.message); }
  }
  await new Promise((r) => setTimeout(r, 2500));
  w.__navHandler('users');
  await new Promise((r) => setTimeout(r, 1500));
  const text = (w.document.body.textContent || '').replace(/\s+/g, ' ').trim();
  console.log('boot errors:', errors.slice(0, 2));
  console.log('Users view renders:', text.includes('Create user') && text.includes('Users & Staff'));
  console.log('Has delete buttons (no placeholders):', w.document.body.textContent.includes('🗑'));
})().catch(e => { console.error(e); process.exit(1); });
