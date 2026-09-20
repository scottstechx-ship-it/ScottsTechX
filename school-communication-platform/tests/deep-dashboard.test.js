/**
 * DEEP dashboard test — boots each dashboard's real JS in jsdom against the
 * live API, then opens EVERY view in EVERY dashboard and asserts:
 *   - no JS errors were thrown while rendering
 *   - the content area actually rendered something (not blank / not stuck)
 *
 * Run: node tests/deep-dashboard.test.js   (requires the server on :4000)
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
  // cookie sessions: keep the session cookie the server just issued
  const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : [])
    .map((c) => c.split(';')[0]);
  return { token: data.token, user: data.user, cookies };
}

function readScript(rel) {
  return fs.readFileSync(path.join(ROOT, 'frontend', rel), 'utf8');
}

async function bootDashboard({ username, password, htmlRel, appRel, width = 1280 }) {
  const creds = await login(username, password);
  const html = fs.readFileSync(path.join(ROOT, 'frontend', htmlRel), 'utf8');
  const dom = new JSDOM(html, {
    url: `${BASE}/${htmlRel.replace('/index.html', '')}/`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const cookieHeader = (creds.cookies || []).join('; ');
  if (creds.cookies && creds.cookies.length) {
    for (const c of creds.cookies) {
      try { window.document.cookie = c; } catch { /* httpOnly bits ignored */ }
    }
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
  window.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: width <= 480 ? 844 : 900, configurable: true });

  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  const origError = console.error;
  console.error = (...a) => { errors.push(a.join(' ')); };


  const scripts = ['js/config.js', 'js/icons.js', 'js/api.js', 'js/theme.js', 'js/ui.js', 'js/socket-client.js',
    'js/components/messaging.js', 'js/components/documents.js', 'js/components/announcements.js',
    'js/components/academics.js', 'js/components/users.js', 'js/components/website.js', appRel];
  for (const rel of scripts) {
    if (!fs.existsSync(path.join(ROOT, 'frontend', rel))) continue;
    try {
      window.eval(readScript(rel));
    } catch (e) {
      errors.push(`eval ${rel}: ${e.message}`);
    }
  }
  await new Promise((r) => setTimeout(r, 2200));
  return { window, errors, restoreConsole: () => { console.error = origError; } };
}

/**
 * MOBILE / DESKTOP HYGIENE — the defect classes that make a dashboard look
 * broken even though every view "renders": a table that is not inside a
 * scrolling or stacking wrapper, a stacked row with no label, duplicate ids,
 * icon-only buttons nobody can name, images with no alt text.
 *
 * The rules are asserted on the RENDERED DOM of every view at 390px and at
 * 1280px, so a regression in any single view is caught here.
 */
function hygieneProblems(window) {
  const doc = window.document;
  const problems = [];

  // 1. every table must be inside a wrapper that stacks (phones) / scrolls
  for (const table of doc.querySelectorAll('table.table')) {
    if (!table.closest('.table-responsive, .table-wrap')) {
      problems.push(`<table> outside .table-responsive (first header: ${(table.querySelector('th') || {}).textContent || '?'})`);
    }
  }

  // 2. in the stacked layout every cell is labelled (else values appear bare)
  for (const td of doc.querySelectorAll('.table-responsive td')) {
    if (td.hasAttribute('colspan')) continue;
    if (td.classList.contains('actions-cell')) continue;
    if (!td.hasAttribute('data-label')) {
      problems.push(`<td> has no data-label: "${(td.textContent || '').trim().slice(0, 40)}"`);
    }
  }

  // 3. duplicate ids break labels/anchors and make handlers hit the wrong node
  const ids = [...doc.querySelectorAll('[id]')].map((el) => el.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) problems.push(`duplicate id(s): ${dupes.slice(0, 5).join(', ')}`);

  // 4. phone-first tap targets on the controls that are actually used
  const tapSelectors = '.btn, button, .nav-item, .bn-item, .icon-btn';
  const small = [...doc.querySelectorAll(tapSelectors)].filter((el) => {
    const inline = el.getAttribute('style') || '';
    const m = inline.match(/height:\s*(\d+)px/);
    return m && Number(m[1]) < 34;
  });
  if (small.length) problems.push(`${small.length} tap target(s) pinned below 34px`);

  // 5. icon-only buttons must still have a name for screen readers
  for (const el of doc.querySelectorAll('button, a.btn')) {
    const text = (el.textContent || '').trim();
    const named = el.getAttribute('aria-label') || el.getAttribute('title');
    if (!text && !named) problems.push('icon-only button with no aria-label/title');
  }

  // 6. markup must never be PRINTED as text — an icon (or any other markup)
  //    assigned with textContent / escaped through esc() shows the user
  //    literal "<svg …>" instead of the drawing it was meant to be.
  const visible = doc.body.textContent || '';
  const shownTag = visible.match(/<(svg|path|rect|circle|div|span|button|br)\b/);
  if (shownTag) {
    const at = visible.indexOf(shownTag[0]);
    problems.push(`markup is rendered as text: "...${visible.slice(Math.max(0, at - 30), at + 40).replace(/\s+/g, ' ').trim()}"`);
  }

  // 7. images on the dashboards are content, so they need alt text
  for (const img of doc.querySelectorAll('img')) {
    if (!img.hasAttribute('alt')) problems.push(`<img src="${(img.getAttribute('src') || '').slice(0, 40)}"> has no alt`);
  }

  return problems;
}

function navKeys(appRel) {
  const src = readScript(appRel);
  const keys = [];
  const re = /key:\s*'([a-z-]+)'/g;
  let m;
  while ((m = re.exec(src))) if (!keys.includes(m[1])) keys.push(m[1]);
  return keys;
}

// Both dashboard trees are tested: the legacy /<role>/ pages AND the
// /platform/<role>/ pages, which is where every login redirects.
const ROLE_ACCOUNTS = [
  { name: 'SUPER ADMIN', username: 'superadmin', password: 'SuperAdmin@123', dir: 'super-admin' },
  { name: 'ADMIN', username: 'admin', password: 'Admin@123', dir: 'admin' },
  { name: 'TEACHER', username: 'teacher1', password: 'Teacher@123', dir: 'teacher' },
  { name: 'STUDENT', username: 'student1', password: 'Student@123', dir: 'student' },
  { name: 'PARENT', username: 'parent1', password: 'Parent@123', dir: 'parent' },
];
const ROLES = [
  ...ROLE_ACCOUNTS,
  ...ROLE_ACCOUNTS.map((r) => ({ ...r, name: `${r.name} (/platform)`, dir: `platform/${r.dir}` })),
];

(async () => {
  let failures = 0;
  let views = 0;

  for (const role of ROLES) {
    const htmlRel = `${role.dir}/index.html`;
    const appRel = `${role.dir}/app.js`;
    console.log(`\n== ${role.name} dashboard (${role.dir}/) ==`);
    const { window, errors, restoreConsole } = await bootDashboard({
      username: role.username, password: role.password, htmlRel, appRel,
    });

    if (errors.length) {
      failures++;
      console.log(`  x boot errors: ${errors.slice(0, 3).join(' | ')}`);
    } else {
      console.log('  ok boots cleanly');
    }

    const keys = navKeys(appRel);
    for (const key of keys) {
      views++;
      const before = errors.length;
      try {
        if (typeof window.__navHandler === 'function') {
          window.__navHandler(key);
          await new Promise((r) => setTimeout(r, 1300));
        } else {
          throw new Error('no __navHandler exposed');
        }
        const content = window.document.getElementById('content') || window.document.querySelector('.content') || window.document.body;
        const text = (content.textContent || '').replace(/\s+/g, ' ').trim();
        const newErrors = errors.slice(before);
        // filter benign noise (e.g. socket.io not being real in jsdom)
        const realErrors = newErrors.filter((e) => !/socket\.io|WebSocket|xhr poll/i.test(e));
        if (realErrors.length) {
          failures++;
          console.log(`  x view '${key}' errored: ${realErrors.slice(0, 2).join(' | ')}`);
        } else if (text.length < 3) {
          failures++;
          console.log(`  x view '${key}' rendered EMPTY`);
        } else {
          console.log(`  ok view '${key}' renders (${text.length} chars)`);
        }
      } catch (e) {
        failures++;
        console.log(`  x view '${key}' threw: ${e.message}`);
      }
    }
    restoreConsole();
    window.close();
  }

  // ---------------------------------------------------------------------
  // PHONE + DESKTOP HYGIENE PASS — every view of every dashboard, rendered
  // at 390px and at 1280px, checked for the defects that read as "broken".
  // ---------------------------------------------------------------------
  console.log('\n== MOBILE / DESKTOP LAYOUT HYGIENE (390px + 1280px) ==');
  let hygieneFailures = 0;
  let checkedViews = 0;

  for (const account of ROLE_ACCOUNTS) {
    for (const width of [390, 1280]) {
      const dir = `platform/${account.dir}`;
      const { window, restoreConsole } = await bootDashboard({
        username: account.username, password: account.password,
        htmlRel: `${dir}/index.html`, appRel: `${dir}/app.js`, width,
      });
      const keys = ['home', ...navKeys(`${dir}/app.js`)];
      for (const key of [...new Set(keys)]) {
        checkedViews++;
        try {
          if (typeof window.__navHandler === 'function') window.__navHandler(key);
          await new Promise((r) => setTimeout(r, 700));
        } catch { /* a view that throws is already reported by the pass above */ }
        const problems = hygieneProblems(window);
        if (problems.length) {
          hygieneFailures++;
          console.log(`  x ${account.name} @${width}px view '${key}'`);
          for (const p of problems.slice(0, 3)) console.log(`      ${p}`);
          if (problems.length > 3) console.log(`      ... +${problems.length - 3} more`);
        }
      }
      restoreConsole();
      window.close();
    }
  }
  console.log(`${checkedViews} view renders checked.`);
  if (!hygieneFailures) {
    console.log('OK NO LAYOUT DEFECTS (tables wrapped + labelled, no dup ids, named controls, alt text)');
  } else {
    console.log(`FAIL ${hygieneFailures} view render(s) have layout defects`);
  }

  console.log(`\n${views} views tested across ${ROLES.length} dashboards.`);
  console.log(failures === 0 ? 'OK EVERY VIEW IN EVERY DASHBOARD WORKS' : `FAIL ${failures} failures`);
  process.exit(failures === 0 && hygieneFailures === 0 ? 0 : 1);
})().catch((e) => { console.error('Harness error:', e); process.exit(1); });
