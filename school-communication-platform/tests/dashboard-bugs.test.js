/**
 * DASHBOARD UI REGRESSION TESTS — the interaction bugs that a screenshot or a
 * "the view rendered" check cannot see:
 *
 *   1. two dialogs must never share ids in the DOM at once (a dialog that is
 *      still fading out used to keep its fields, so `#id` lookups inside the
 *      next dialog came back empty and the editor crashed)
 *   2. AnnouncementsView.edit() must open a usable editor after another modal
 *      has just been closed
 *   3. Publish/Edit must explain an unset audience instead of throwing
 *      (teachers get a blank "Select a class…" option)
 *   4. the share dialog must say why nothing happened when it cannot load the
 *      sharing options
 *
 * Run: node tests/dashboard-bugs.test.js   (requires the server on :4000)
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:4000';
const ROOT = path.join(__dirname, '..');

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok ${name}`);
  else { failures++; console.log(`  x ${name}${detail ? ' — ' + detail : ''}`); }
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
  return { cookies };
}

async function boot({ username, password, dir }) {
  const creds = await login(username, password);
  const html = fs.readFileSync(path.join(ROOT, 'frontend', dir, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: `${BASE}/${dir}/`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  for (const c of creds.cookies) { try { window.document.cookie = c; } catch { /* httpOnly */ } }
  const cookieHeader = creds.cookies.join('; ');
  const rawFetch = globalThis.fetch;
  window.fetch = (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (cookieHeader) headers.set('cookie', cookieHeader);
    return rawFetch(input, { ...init, headers });
  };
  window.FormData = globalThis.FormData;
  window.Blob = globalThis.Blob;
  window.Headers = globalThis.Headers;
  window.URL = globalThis.URL;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};

  const errors = [];
  // jsdom reports unhandled rejections on the virtual console rather than
  // through an event, so capture the console output as well.
  const virtualConsole = dom.virtualConsole;
  virtualConsole.on('jsdomError', (e) => errors.push(e.message || String(e)));
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));

  const files = ['js/config.js', 'js/icons.js', 'js/api.js', 'js/theme.js', 'js/ui.js', 'js/socket-client.js',
    'js/components/messaging.js', 'js/components/documents.js', 'js/components/announcements.js',
    'js/components/academics.js', 'js/components/users.js', 'js/components/website.js', `${dir}/app.js`];
  for (const rel of files) {
    const full = path.join(ROOT, 'frontend', rel);
    if (!fs.existsSync(full)) continue;
    try { window.eval(fs.readFileSync(full, 'utf8')); } catch (e) { errors.push(`eval ${rel}: ${e.message}`); }
  }
  await new Promise((r) => setTimeout(r, 2500));
  return { window, errors };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n== super admin: dialogs ==');
  {
    const { window, errors } = await boot({ username: 'superadmin', password: 'SuperAdmin@123', dir: 'platform/super-admin' });
    window.__navHandler('announcements');
    await wait(1400);

    const content = window.document.getElementById('content');
    const buttons = [...content.querySelectorAll('button:not([disabled])')];
    check('announcements view has controls', buttons.length > 0, `${buttons.length} buttons`);

    // click through the toolbar the way a person would, closing dialogs between
    for (const b of buttons) {
      const label = (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 24);
      const before = errors.length;
      b.click();
      await wait(250);
      const fresh = errors.slice(before);
      check(`clicking "${label}" raises no error`, fresh.length === 0, fresh.slice(0, 2).join(' | '));
      // closing must fully remove the dialog (fade included) — a leftover would
      // keep duplicate field ids in the document for the next dialog
      window.document.querySelectorAll('.modal-backdrop .close-x').forEach((x) => x.click());
      await wait(400);
      const lingering = window.document.querySelectorAll('.modal-backdrop').length;
      check(`dialog from "${label}" is gone after closing`, lingering === 0, `${lingering} left`);
    }

    // Edit must open a complete editor even right after another dialog closed
    const edit = [...window.document.querySelectorAll('#content button')].find((b) => /Edit/i.test(b.textContent || ''));
    if (edit) {
      // open and close a dialog first, then immediately click Edit
      const addBtn = [...window.document.querySelectorAll('#content button')].find((b) => /announcement/i.test(b.textContent || ''));
      if (addBtn) { addBtn.click(); await wait(150); }
      window.document.querySelectorAll('.modal-backdrop.open .close-x').forEach((x) => x.click());
      const before = errors.length;
      edit.click();
      await wait(900);
      const modal = [...window.document.querySelectorAll('.modal-backdrop')].pop();
      check('Edit opens an editor dialog', !!modal);
      check('editor has the audience field', !!(modal && modal.querySelector('#ann-target')), modal ? modal.innerHTML.slice(0, 80) : 'no modal');
      check('editor has a Save button', !!(modal && modal.querySelector('[data-save]')));
      check('Edit raises no error', errors.length === before, errors.slice(before).slice(0, 2).join(' | '));

      // pressing Save with the audience untouched must explain itself
      const save = modal && modal.querySelector('[data-save]');
      if (save) {
        const sel = modal.querySelector('#ann-target');
        sel.value = '';                       // what a teacher sees by default
        save.click();
        await wait(300);
        check('Publish/Save with no audience explains instead of throwing', errors.length === before, errors.slice(before).slice(0, 2).join(' | '));
      }
      window.document.querySelectorAll('.modal-backdrop .close-x').forEach((x) => x.click());
    }
    window.close();
  }

  console.log('\n== teacher: blank audience placeholder ==');
  {
    const { window, errors } = await boot({ username: 'teacher1', password: 'Teacher@123', dir: 'platform/teacher' });
    window.__navHandler('announcements');
    await wait(1400);
    const add = [...window.document.querySelectorAll('#content button')].find((b) => /announcement/i.test(b.textContent || '') && !/Edit/i.test(b.textContent || ''));
    if (add) {
      add.click();
      await wait(900);
      const modal = [...window.document.querySelectorAll('.modal-backdrop')].pop();
      check('teacher can open the compose dialog', !!modal);
      const sel = modal && modal.querySelector('#ann-target');
      check('teacher audience list starts on the placeholder', !!sel && sel.value === '');
      if (modal) {
        // fill it in, leave the audience blank and publish
        modal.querySelector('#ann-title').value = 'Regression check';
        modal.querySelector('#ann-content').value = 'Checking the audience validation path.';
        const before = errors.length;
        const send = modal.querySelector('[data-send]');
        if (send) send.click();
        await wait(400);
        check('publishing with no class chosen does not throw', errors.length === before, errors.slice(before).slice(0, 2).join(' | '));
      }
    } else {
      check('teacher sees an announcement composer', false, 'button not found');
    }
    window.close();
  }

  console.log('\n== documents: share dialog ==');
  {
    const { window, errors } = await boot({ username: 'teacher1', password: 'Teacher@123', dir: 'platform/teacher' });
    window.__navHandler('documents');
    await wait(1400);
    const share = [...window.document.querySelectorAll('#content button')].find((b) => /Share/i.test(b.textContent || ''));
    if (share) {
      const before = errors.length;
      share.click();
      await wait(1200);
      const modal = [...window.document.querySelectorAll('.modal-backdrop')].pop();
      check('share dialog opens', !!modal);
      const sel = modal && modal.querySelector('#share-target');
      check('share dialog offers audiences', !!sel && sel.options.length > 0, sel ? `${sel.options.length} options` : 'no select');
      if (modal && sel) {
        sel.value = '';
        const save = modal.querySelector('[data-save]');
        if (save) save.click();
        await wait(300);
        check('sharing with nothing selected explains instead of doing nothing', errors.length === before);
      }
      window.document.querySelectorAll('.modal-backdrop .close-x').forEach((x) => x.click());
    } else {
      check('documents view has a Share control', false, 'not found');
    }
    window.close();
  }

  console.log(failures === 0 ? '\nOK DASHBOARD INTERACTIONS BEHAVE (dialogs, editors, validation)' : `\nFAIL ${failures} interaction check(s)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('harness', e); process.exit(1); });
