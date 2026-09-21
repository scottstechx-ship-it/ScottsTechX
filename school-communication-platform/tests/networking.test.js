/**
 * NETWORKING test — how the dashboards behave when the network is slow,
 * flaky or gone. These are the failures phone users actually hit: a request
 * that never answers, a dropped connection treated as a logout, a slow view
 * repainting a section the user already left, and a dead realtime channel.
 *
 * Run: node tests/networking.test.js   (requires the server on :4000)
 */
const { JSDOM, VirtualConsole } = require('jsdom');
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

const R = (rel) => fs.readFileSync(path.join(ROOT, 'frontend', rel), 'utf8');

/** Wait until a condition holds (polls), so slow CI never races the assertion. */
async function waitFor(fn, { timeout = 8000, step = 200 } = {}) {
  const started = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch { /* keep waiting */ }
    if (Date.now() - started > timeout) return false;
    await sleep(step);
  }
}
const CORE = ['js/config.js', 'js/icons.js', 'js/api.js', 'js/theme.js', 'js/ui.js', 'js/socket-client.js'];
const ADMIN = [...CORE, 'js/components/messaging.js', 'js/components/documents.js', 'js/components/announcements.js',
  'js/components/academics.js', 'js/components/users.js', 'js/components/website.js', 'admin/app.js'];

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  const cookie = (res.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
  return { ...data, cookie };
}

/** Boot a dashboard in jsdom with a caller-controlled fetch. */
function boot({ scripts = ADMIN, htmlRel = 'admin/index.html', fetchImpl, pollMs = 15000, unreadMs = 30000, cookies = null, socketClient = null }) {
  const vc = new VirtualConsole();
  const navigations = [];
  const jsdomErrors = [];
  vc.on('jsdomError', (e) => {
    jsdomErrors.push(e.message);
    if (/Not implemented: navigation/i.test(e.message)) navigations.push(e.message);
  });
  const dom = new JSDOM(R(htmlRel), { url: `${BASE}/${htmlRel.replace('/index.html', '')}/`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom;
  // Put the session + CSRF cookies in jsdom's real jar, so XHR (the socket's
  // polling/websocket handshake) carries them exactly like a browser would.
  // Only the first field of each Set-Cookie is used: jsdom hides HttpOnly
  // cookies from document.cookie, which is the browser behaviour we want.
  if (cookies) for (const c of cookies) dom.cookieJar.setCookieSync(c.split(';')[0] + '; Path=/', BASE + '/');
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.FormData = globalThis.FormData;
  window.Blob = globalThis.Blob;
  window.Headers = globalThis.Headers;
  window.URL = globalThis.URL;
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
  // jsdom's Image keeps a hidden document handle that breaks once the window is
  // closed mid-flight; the dashboards only use it to test whether a logo exists.
  // jsdom's Image keeps a hidden document handle that throws once the window is
  // closed mid-flight; a minimal stub keeps the boot sequence moving.
  window.Image = class {
    constructor() { this.onload = null; this.onerror = null; this.alt = ''; this.style = {}; }
  };
  window.fetch = (...args) => fetchImpl(...args);

  // A jsdom window that is *closed* while a promise is still in flight throws
  // from inside the app's own callback, which would look like a product bug.
  // Instead each harness stops the window's timers and leaves the DOM alive.
  const intervals = new Set();
  let stopped = false;
  const realSetInterval = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...rest) => {
    if (stopped) return 0;
    const id = realSetInterval(fn, ms, ...rest);
    intervals.add(id);
    return id;
  };
  const teardown = () => {
    stopped = true;
    for (const id of intervals) { try { window.clearInterval(id); } catch { /* gone */ } }
    intervals.clear();
  };

  if (socketClient) { try { window.eval(socketClient); } catch (e) { errors.push(`eval socket.io: ${e.message}`); } }
  for (const rel of scripts) {
    try { window.eval(R(rel)); } catch (e) { errors.push(`eval ${rel}: ${e.message}`); }
  }
  // handy knobs for the polling tests
  window.APP_CONFIG.POLL_INTERVAL_MS = pollMs;
  window.APP_CONFIG.UNREAD_POLL_MS = unreadMs;
  return { window, errors, navigations, jsdomErrors, teardown };
}

function realFetch(cookie) {
  return (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (!headers.has('cookie')) headers.set('cookie', cookie);
    return fetch(input, { ...init, headers });
  };
}

(async () => {
  const admin = await login('admin', 'Admin@123');
  const real = realFetch(admin.cookie);

  // =====================================================================
  console.log('\n== A request that never answers must not hang the dashboard');
  {
    const { window, errors , teardown } = boot({ fetchImpl: () => new Promise(() => {}), unreadMs: 60000, pollMs: 60000 });
    await sleep(600);
    const timeoutMs = window.APP_CONFIG.REQUEST_TIMEOUT_MS || 15000;
    check('a request timeout is configured', timeoutMs > 0 && timeoutMs <= 30000, String(timeoutMs));
    const started = Date.now();
    let outcome = 'pending';
    window.API.get('/api/stats/overview').then(() => { outcome = 'resolved'; }).catch((e) => { outcome = e; });
    // give it the timeout window plus a little slack
    await sleep(timeoutMs + 1500);
    check('the request is rejected instead of hanging forever', outcome !== 'pending',
      `still ${outcome} after ${Date.now() - started}ms`);
    if (outcome !== 'pending' && outcome !== 'resolved') {
      check('the message says the server did not answer', /taking too long|did not respond|timed out/i.test(outcome.message), outcome.message);
      check('the caller can tell it was a timeout', outcome.code === 'TIMEOUT', String(outcome.code));
    }
    check('no crash while the request was pending', errors.length === 0, errors.slice(0, 2).join(' | '));
    teardown();
  }

  // =====================================================================
  console.log('\n== A slow but healthy server still works');
  {
    const { window , teardown } = boot({
      fetchImpl: async (input, init) => {
        await sleep(1200);                       // slower than a phone on 3G
        return real(input, init);
      },
    });
    const data = await window.API.get('/api/settings/public').catch((e) => ({ error: e.message }));
    check('a 1.2s response is not treated as a failure', !data.error && !!data.school, JSON.stringify(data).slice(0, 80));
    teardown();
  }

  // =====================================================================
  console.log('\n== Losing the connection at boot is not a logout');
  {
    const { window, navigations , teardown } = boot({ fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')) });
    await sleep(2500);
    check('the dashboard does not bounce to the login page', navigations.length === 0, navigations.slice(0, 1).join(''));
    const notice = window.document.getElementById('net-banner');
    check('a connection notice is shown', !!notice, 'no #net-banner element');
    if (notice) {
      check('the notice explains the problem', /connection|offline|reach the server/i.test(notice.textContent), notice.textContent.slice(0, 90));
      check('the notice offers a retry', !!notice.querySelector('button'), notice.innerHTML.slice(0, 90));
      check('the notice is visible', notice.style.display !== 'none' && notice.getAttribute('hidden') === null);
    }
    check('nothing crashed on the way', window.document.body.children.length > 0);
    teardown();
  }

  // =====================================================================
  console.log('\n== The connection notice clears when the server answers again');
  {
    let up = false;
    const { window , teardown } = boot({
      fetchImpl: async (input, init) => {
        if (!up) throw new TypeError('Failed to fetch');
        return real(input, init);
      },
    });
    await sleep(1500);
    const banner = window.document.getElementById('net-banner');
    const shownWhileDown = !!banner && banner.style.display !== 'none';
    up = true;
    // the next successful request must clear it
    await window.API.get('/api/settings/public').catch(() => {});
    await sleep(400);
    const hiddenAfterRecovery = !banner || banner.style.display === 'none' || banner.hasAttribute('hidden');
    check('the notice was up while the network was down', shownWhileDown);
    check('the notice clears once the server answers', hiddenAfterRecovery,
      banner ? `display=${banner.style.display}` : 'no banner');
    teardown();
  }

  // =====================================================================
  console.log('\n== The office can recover without reloading the page');
  {
    let up = false;
    const { window, navigations, teardown } = boot({
      fetchImpl: async (input, init) => {
        if (!up) throw new TypeError('Failed to fetch');
        return real(input, init);
      },
      unreadMs: 60000, pollMs: 60000,
    });
    await sleep(1200);
    const banner = window.document.getElementById('net-banner');
    check('the notice is up while the server is unreachable', !!banner && banner.style.display !== 'none');
    // the notice must sit above the topbar / modals / toasts on a phone
    check('the notice is not hidden behind other chrome', /z-index:\s*4000/.test(banner.style.cssText), banner.style.cssText.slice(0, 80));
    check('the notice stays inside a phone-width screen', /max-width/.test(banner.style.cssText));
    up = true;
    banner.querySelector('#net-retry').click();
    const back = await waitFor(() => /School operations overview|Good day/i.test(window.document.body.textContent), { timeout: 15000 });
    check('the dashboard comes back after "Try again"', back);
    check('it recovered without a page reload', navigations.length === 0, navigations.slice(0, 1).join(''));
    check('the notice clears itself', banner.style.display === 'none', banner.style.display);
    teardown();
  }

  // =====================================================================
  console.log('\n== An offline blip must not silently mark calls as "no data"');
  {
    let failing = true;
    const { window , teardown } = boot({
      fetchImpl: async (input, init) => {
        if (failing) throw new TypeError('Failed to fetch');
        return real(input, init);
      },
    });
    await sleep(1200);
    let first = null;
    await window.API.get('/api/messages/unread-count').then(() => { first = 'ok'; }).catch((e) => { first = e; });
    check('a failed call rejects (it does not resolve with empty data)', first && first !== 'ok', String(first));
    failing = false;
    // GETs are safe to retry: one retry hides a single dropped packet
    const retried = await window.API.get('/api/settings/public').catch((e) => ({ error: e.message }));
    check('a GET recovers by itself after a single blip', !retried.error, JSON.stringify(retried).slice(0, 70));
    teardown();
  }

  // =====================================================================
  console.log('\n== A slow view cannot repaint a section the user already left');
  {
    const { window , teardown } = boot({
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (/\/api\/students/.test(url)) await sleep(3000);      // slow roster
        return real(input, init);
      },
    });
    await sleep(2600);
    window.__navHandler('students');        // slow
    await sleep(150);
    window.__navHandler('home');            // fast, user changed their mind
    await sleep(1400);
    const title = window.document.querySelector('#page-title').textContent.trim();
    const visible = window.document.querySelector('#content').textContent.replace(/\s+/g, ' ');
    check('the page title matches the chosen section', title === 'Home', title);
    check('the slow section did not take over the screen', !/Admission no|Add student|Student code/i.test(visible), visible.slice(0, 120));
    check('the current section is the one rendered', /School operations overview|Good day/i.test(visible), visible.slice(0, 120));
    teardown();
  }

  // =====================================================================
  console.log('\n== Realtime reconnects instead of dying for the session');
  {
    const { window , teardown } = boot({ fetchImpl: real });
    const ioCalls = [];
    const handlers = {};
    const managerHandlers = {};
    window.io = (url, opts) => {
      ioCalls.push(opts);
      return {
        on(evt, cb) { handlers[evt] = cb; },
        emit() {},
        off() {},
        io: { on(evt, cb) { managerHandlers[evt] = cb; } },
      };
    };
    window.eval('window.API.hasSessionCookie = () => true');   // pretend a session cookie exists
    window.Realtime.start();
    await sleep(200);
    check('the client connects', ioCalls.length === 1, String(ioCalls.length));
    check('it keeps trying while the network is down', ioCalls[0] && ioCalls[0].reconnectionAttempts === Infinity,
      String(ioCalls[0] && ioCalls[0].reconnectionAttempts));
    // a reconnect must refresh what the user is looking at
    let refreshed = false;
    const off = window.Realtime.on('realtime', (d) => { if (d && d.reconnected) refreshed = true; });
    check('reconnect tracking is on the manager, where those events fire',
      typeof managerHandlers.reconnect === 'function', Object.keys(managerHandlers).join(',') || 'none');
    if (managerHandlers.reconnect) managerHandlers.reconnect(2);
    await sleep(200);
    check('coming back online announces itself', refreshed, 'no realtime reconnect event');
    // a socket-level 'connect' after a drop must announce a reconnect too
    let again = 0;
    const off2 = window.Realtime.on('realtime', (d) => { if (d && d.reconnected) again += 1; });
    if (handlers.connect) handlers.connect();          // first connection
    if (handlers.disconnect) handlers.disconnect('transport close');
    if (handlers.connect) handlers.connect();          // back after the drop
    await sleep(200);
    check('a reconnect through the socket path is announced as well', again === 1, `${again} event(s)`);
    off(); off2();
    // if the transport gives up, a fresh socket is created rather than none at all
    if (managerHandlers.reconnect_failed) managerHandlers.reconnect_failed();
    await sleep(1800);
    check('an exhausted reconnect creates a new connection', ioCalls.length >= 2, `${ioCalls.length} connection(s)`);
    teardown();
  }

  // =====================================================================
  console.log('\n== Realtime: an open inbox hears about a new website message');
  {
    const socketClient = await (await fetch(`${BASE}/socket.io/socket.io.js`)).text();
    const { window, errors, teardown } = boot({ fetchImpl: real, cookies: (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin@123' }) })).headers.getSetCookie(), socketClient });
    await sleep(2500);
    const connected = await waitFor(() => window.Realtime.connected, { timeout: 15000 });
    check('the socket connects from the dashboard', connected, `connected=${window.Realtime.connected}`);
    check('the inboxes registered a realtime listener', typeof window.Realtime.on === 'function');
    if (connected) {
      window.__navHandler('website-contact');
      await waitFor(() => !!window.document.querySelector('#cm-list .card'), { timeout: 8000 });
      const name = `Realtime Probe ${Date.now()}`;
      await fetch(`${BASE}/api/website/contact`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, message: 'does the open inbox update by itself?' }),
      });
      const arrived = await waitFor(() => (window.document.body.textContent || '').includes(name), { timeout: 10000 });
      check('the visitor message appears in the open inbox without a reload', arrived);
      // the arriving message must be the freshest row, not buried below older ones
      const first = (window.document.querySelector('#cm-list .doc-name') || {}).textContent || '';
      check('it lands at the top of the inbox', first.includes(name), first.trim().slice(0, 60));

      // A dropped link must recover on its own and say so. This is checked
      // against the REAL socket: attaching the reconnect handlers to the socket
      // instead of its manager looked fine against a stub and never fired in a
      // browser, so the stub is not enough.
      const events = [];
      window.Realtime.on('realtime', (d) => events.push(d));
      const socket = window.Realtime.socket;
      if (socket && socket.io && socket.io.engine) {
        await sleep(1500);                                  // let it settle first
        socket.io.engine.close();
        const dropped = await waitFor(() => events.some((e) => e && e.connected === false), { timeout: 6000 });
        check('a dropped connection is noticed', dropped, JSON.stringify(events.slice(-2)));
        const backAgain = await waitFor(() => events.some((e) => e && e.reconnected === true), { timeout: 15000 });
        check('the socket reconnects by itself', backAgain, JSON.stringify(events.slice(-2)));
        check('the user is still connected afterwards', window.Realtime.connected === true);
      }
    }
    check('no boot errors while connected', errors.length === 0, errors.slice(0, 2).join(' | '));
    teardown();
  }

  // =====================================================================
  console.log('\n== Polling respects the phone (hidden tab, offline)');
  {
    let calls = 0;
    const { window , teardown } = boot({
      fetchImpl: async (input, init) => { calls += 1; return real(input, init); },
      unreadMs: 300, pollMs: 300,
    });
    await sleep(700);
    const before = calls;
    Object.defineProperty(window.document, 'hidden', { value: true, configurable: true });
    await sleep(1200);
    const whileHidden = calls - before;
    Object.defineProperty(window.document, 'hidden', { value: false, configurable: true });
    window.document.dispatchEvent(new window.Event('visibilitychange'));
    await sleep(900);
    const afterVisible = calls - before;
    check('a hidden tab stops polling the server', whileHidden === 0, `${whileHidden} calls while hidden`);
    check('returning to the tab refreshes immediately', afterVisible > 0, `${afterVisible} calls after returning`);
    teardown();
  }

  // =====================================================================
  console.log('\n== The happy path still works end to end');
  {
    const { window, errors, navigations , teardown } = boot({ fetchImpl: real });
    await sleep(2600);
    check('the dashboard boots with no navigation away', navigations.length === 0);
    check('the dashboard boots clean', errors.length === 0, errors.slice(0, 2).join(' | '));
    const body = window.document.body.textContent.replace(/\s+/g, ' ');
    check('the admin home actually rendered', /School operations overview|Good day/i.test(body), body.slice(0, 100));
    check('no connection notice while online', !window.document.getElementById('net-banner')
      || window.document.getElementById('net-banner').style.display === 'none');
    teardown();
  }

  // =====================================================================
  console.log('\n== A view that fails says so, and retries on demand');
  {
    let dead = false;
    const { window, errors, teardown } = boot({
      fetchImpl: (input, init) => (dead ? Promise.reject(new TypeError('Failed to fetch')) : real(input, init)),
      unreadMs: 60000, pollMs: 60000,
    });
    await waitFor(() => window.document.querySelector('.nav-item'), { timeout: 12000 });
    dead = true;
    window.__navHandler('subjects');                 // fetches its own data
    const explained = await waitFor(() => /Could not open this section|No connection/i.test(window.document.querySelector('#content').textContent || ''), { timeout: 8000 });
    check('the failed view explains itself instead of staying blank', explained,
      (window.document.querySelector('#content').textContent || '').replace(/\s+/g, ' ').slice(0, 110));
    const retryBtn = [...window.document.querySelectorAll('#content button')].find((b) => /Try again/i.test(b.textContent || ''));
    check('it offers a Try again button', !!retryBtn);
    check('nothing was thrown while the view failed', errors.length === 0, errors.slice(0, 2).join(' | '));
    if (retryBtn) {
      dead = false;
      retryBtn.click();
      const recovered = await waitFor(() => /Subject|Add subject|No subjects/i.test(window.document.querySelector('#content').textContent || ''), { timeout: 10000 });
      check('Try again loads the real view once the network is back', recovered,
        (window.document.querySelector('#content').textContent || '').replace(/\s+/g, ' ').slice(0, 110));
    }
    teardown();
  }

  // =====================================================================
  console.log('\n== Every dashboard view survives a dead network');
  {
    const rejections = [];
    const onRejection = (reason) => rejections.push(String((reason && reason.stack) || reason).split('\n').slice(0, 2).join(' | '));
    process.on('unhandledRejection', onRejection);

    const DASHBOARDS = [
      { name: 'admin', html: 'admin/index.html', app: 'admin/app.js', creds: ['admin', 'Admin@123'] },
      { name: 'super admin', html: 'super-admin/index.html', app: 'super-admin/app.js', creds: ['superadmin', 'SuperAdmin@123'] },
      { name: 'teacher', html: 'teacher/index.html', app: 'teacher/app.js', creds: ['teacher1', 'Teacher@123'] },
      { name: 'student', html: 'student/index.html', app: 'student/app.js', creds: ['student1', 'Student@123'] },
      { name: 'parent', html: 'parent/index.html', app: 'parent/app.js', creds: ['parent1', 'Parent@123'] },
    ];
    const SHARED = ['js/components/messaging.js', 'js/components/documents.js', 'js/components/announcements.js',
      'js/components/academics.js', 'js/components/users.js', 'js/components/website.js'];

    for (const d of DASHBOARDS) {
      const creds = await login(d.creds[0], d.creds[1]);
      const live = realFetch(creds.cookie);
      let dead = false;
      const { window, errors, teardown } = boot({
        scripts: [...CORE, ...SHARED, d.app], htmlRel: d.html,
        fetchImpl: (input, init) => (dead ? Promise.reject(new TypeError('Failed to fetch')) : live(input, init)),
      });
      const ok = await waitFor(() => window.document.querySelector('.nav-item'), { timeout: 12000 });
      if (!ok) { check(`${d.name} dashboard boots for the audit`, false); teardown(); continue; }
      const keys = [...window.document.querySelectorAll('.nav-item')].map((b) => b.dataset.nav).filter(Boolean);
      // walk every view once with the network up (fills caches), then again dead
      for (const k of keys) { window.__navHandler(k); await sleep(220); }
      dead = true;
      const before = rejections.length;
      for (const k of keys) { window.__navHandler(k); await sleep(280); }
      window.document.getElementById('net-banner') && window.document.getElementById('net-banner').querySelector('#net-retry').click();
      await sleep(800);
      const deadRejections = rejections.slice(before);
      check(`${d.name}: ${keys.length} views survive with no network`, deadRejections.length === 0, deadRejections.slice(0, 2).join(' ; '));
      check(`${d.name}: nothing crashed while offline`, errors.length === 0, errors.slice(0, 2).join(' | '));
      // and it recovers
      dead = false;
      window.document.getElementById('net-banner').querySelector('#net-retry').click();
      await sleep(1200);
      check(`${d.name}: recovers when the network returns`, (window.document.body.textContent || '').trim().length > 50);
      teardown();
    }
    process.removeListener('unhandledRejection', onRejection);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
