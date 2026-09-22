/**
 * API client — thin Fetch wrapper with cookie-based sessions, CSRF handling,
 * friendly error messages and automatic session expiry handling.
 *
 * Security model: the browser never stores credentials any more. The session
 * lives in an HttpOnly cookie (unreachable from JavaScript) and every
 * state-changing request carries the matching CSRF token. Nothing sensitive —
 * no token, no account data — is written to localStorage, so an XSS bug can no
 * longer hand an attacker a reusable session. The signed-in user is fetched
 * from /api/auth/me and cached in memory for the lifetime of the page.
 */
(function () {
  const BASE = window.APP_CONFIG.API_BASE_URL;
  const SESSION_COOKIE = 'scp_session';
  const CSRF_COOKIE = 'scp_session_csrf';

  // On mobile data a request can hang forever: the phone keeps a half-open
  // connection and the dashboard sits on a spinner with no way out. Every
  // request therefore has a deadline. Reads wait less than uploads, because a
  // file on a slow link legitimately takes minutes while a JSON read never does.
  const REQUEST_TIMEOUT_MS = Number(window.APP_CONFIG.REQUEST_TIMEOUT_MS) || 20000;
  const UPLOAD_TIMEOUT_MS = Number(window.APP_CONFIG.UPLOAD_TIMEOUT_MS) || 180000;
  window.APP_CONFIG.REQUEST_TIMEOUT_MS = REQUEST_TIMEOUT_MS;
  window.APP_CONFIG.UPLOAD_TIMEOUT_MS = UPLOAD_TIMEOUT_MS;
  const RETRY_DELAY_MS = 700;

  /** An Error that also says what kind of failure it was (e.code). */
  function netError(code, message) {
    const e = new Error(message);
    e.code = code;
    return e;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Connection state for the whole platform. When a request fails because the
   * phone lost signal — not because the server said no — the user must be told
   * ("you are offline, work is not being saved") instead of being quietly
   * logged out or left staring at a dead spinner. The notice is appended to
   * <body> by this file so it works on the login screens too, before any
   * dashboard layout exists.
   */
  const NetStatus = (() => {
    let banner = null;
    let down = false;
    const retryHandlers = [];
    // Only the signed-in dashboards get the notice. The public site and the
    // login screens keep their own error UI (`err` box) untouched.
    const SHOW_ON = /^\/(admin|admin-dashboard|super-admin|teacher|student|parent)(\/|$)/;
    function allowedHere() { return SHOW_ON.test(location.pathname); }
    function ensure() {
      if (!allowedHere()) return null;
      if (banner && banner.isConnected) return banner;
      if (!document.body) return null;
      banner = document.createElement('div');
      banner.id = 'net-banner';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      banner.style.cssText = 'display:none;position:fixed;left:50%;transform:translateX(-50%);top:10px;z-index:4000;'
        + 'max-width:calc(100% - 20px);display:none;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;'
        + 'background:#7f1d1d;color:#fff;font:600 13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
        + 'box-shadow:0 12px 30px rgba(0,0,0,.28)';
      const text = document.createElement('span');
      text.id = 'net-banner-text';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-sm';
      retry.id = 'net-retry';
      retry.textContent = 'Try again';
      retry.style.cssText = 'background:#fff;color:#7f1d1d;border:0;border-radius:8px;padding:5px 10px;font:inherit;cursor:pointer';
      retry.addEventListener('click', () => {
        retry.disabled = true;
        retry.textContent = 'Checking…';
        NetStatus.checkNow();
        retryHandlers.forEach((fn) => { try { fn(); } catch { /* keep going */ } });
        setTimeout(() => { retry.disabled = false; retry.textContent = 'Try again'; }, 1500);
      });
      banner.appendChild(text);
      banner.appendChild(retry);
      document.body.appendChild(banner);
      return banner;
    }
    return {
      get isDown() { return down; },
      offline(message) {
        down = true;
        const b = ensure();
        if (!b) return;
        const msg = message || (navigator.onLine === false
          ? 'You are offline. Anything you change now will not be saved.'
          : 'Cannot reach the school server. Check your connection — we will keep trying.');
        b.querySelector('#net-banner-text').textContent = msg;
        b.style.display = 'flex';
      },
      online() {
        down = false;
        if (banner && banner.isConnected) banner.style.display = 'none';
      },
      onRetry(fn) { if (typeof fn === 'function') retryHandlers.push(fn); },
      /** called by the retry button / regaining signal: nothing to do by itself */
      checkNow() {
        if (navigator.onLine === false) {
          NetStatus.offline('Still offline. Reconnect to Wi-Fi or mobile data.');
          return;
        }
        NetStatus.online();
      },
    };
  })();
  window.NetStatus = NetStatus;
  window.addEventListener('online', () => { NetStatus.checkNow(); });
  window.addEventListener('offline', () => { NetStatus.offline(); });

  const ROLE_LOGIN = {
    super_admin: '/platform/login-super-admin.html',
    admin: '/platform/login-admin.html',
    teacher: '/platform/login-teacher.html',
    student: '/platform/login-student.html',
    parent: '/platform/login-parent.html',
  };

  let currentUser = null;
  let userPromise = null;

  function readCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  /** Best-effort check: is a session cookie present (it is HttpOnly)? */
  function hasSessionCookie() {
    // HttpOnly cookies cannot be read; presence is inferred from document.cookie
    // containing the CSRF twin that is issued with every session.
    return !!readCookie(CSRF_COOKIE);
  }

  function redirectToLogin() {
    if (location.pathname.includes('/login-') || location.pathname.endsWith('/login.html')) return;
    const role = currentUser && currentUser.role;
    location.href = ROLE_LOGIN[role] || '/dashboard-access.html';
  }

  /** What the last request did — lets callers tell "server said no" from "no network". */
  let lastFailure = null;

  async function request(path, opts = {}) {
    const { method = 'GET', body, form, auth = true, raw = false, skipAuthRedirect = false, attempt = 0, timeoutMs } = opts;
    const headers = {};
    let payload = body;

    if (form) {
      payload = form; // FormData — do not set Content-Type
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    // Double-submit CSRF token (the cookie is readable by design).
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers['X-CSRF-Token'] = csrf;

    // Per-call override for long but legitimate work (a bulk import of a big
    // spreadsheet), so the deadline never cuts off a request that is working.
    const deadline = Number(timeoutMs) || (form || raw ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timedOut = false;
    let timer = null;

    let fetchPromise;
    try {
      fetchPromise = fetch(BASE + path, {
        method,
        headers,
        body: payload,
        credentials: 'include', // send the session cookie, same-origin or CORS
        signal: controller ? controller.signal : undefined,
      });
    } catch (e) {
      // fetch itself can be missing or blocked (old browser, extension, strict
      // CSP). Report it as the connection problem it is, never as a raw crash.
      lastFailure = { code: 'NETWORK', message: 'Cannot reach the server.' };
      NetStatus.offline();
      throw netError('NETWORK', 'Cannot reach the server. Check your connection and try again.');
    }
    // If the deadline wins the race the fetch promise may still reject later;
    // swallow it so an aborted request never surfaces as an unhandled rejection.
    fetchPromise.catch(() => {});

    let res;
    try {
      res = await Promise.race([
        fetchPromise,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            if (controller) controller.abort();
            reject(netError('TIMEOUT', 'The server is taking too long to answer. Please try again.'));
          }, deadline);
        }),
      ]);
    } catch (e) {
      clearTimeout(timer);
      const isOffline = navigator.onLine === false;
      const message = (e && e.code === 'TIMEOUT')
        ? e.message
        : (isOffline
          ? 'You appear to be offline. Check your connection and try again.'
          : 'Cannot reach the server. Check your connection and try again.');
      const code = (e && e.code === 'TIMEOUT') ? 'TIMEOUT' : 'NETWORK';
      // A single dropped packet on mobile data should not surface as a failure
      // — but only ever for reads (a POST must not be sent twice).
      if (code === 'NETWORK' && method === 'GET' && attempt < 1) {
        await sleep(RETRY_DELAY_MS);
        return request(path, { ...opts, attempt: attempt + 1 });
      }
      lastFailure = { code, message };
      NetStatus.offline(isOffline ? 'You appear to be offline. Your changes are not being saved.' : undefined);
      console.error('[API] request failed:', path, e && e.message);
      throw netError(code, message);
    } finally {
      clearTimeout(timer);
      if (timedOut || res) clearTimeout(timer);
    }
    NetStatus.online();

    if (res.status === 401) {
      lastFailure = { code: 'UNAUTHORIZED', message: 'Session expired' };
      const data = await res.json().catch(() => ({}));
      // A badge refresh must not dump someone who is still signed in. Only
      // leave the dashboard when /api/auth/me agrees the session is gone.
      if (auth && !skipAuthRedirect && !path.includes('/auth/login')) {
        const checkingMe = path.includes('/auth/me');
        const dead = checkingMe ? true : await sessionReallyExpired();
        if (dead) redirectToLogin();
      }
      throw netError('UNAUTHORIZED', data.error || 'Your session has expired. Please log in again.');
    }
    if (res.status === 403) {
      lastFailure = { code: 'FORBIDDEN' };
      const data = await res.json().catch(() => ({}));
      throw netError('FORBIDDEN', data.error || 'You do not have permission to perform this action.');
    }
    if (res.status === 429) {
      lastFailure = { code: 'RATE_LIMIT' };
      const data = await res.json().catch(() => ({}));
      throw netError('RATE_LIMIT', data.error || 'Too many requests. Please slow down and try again shortly.');
    }
    if (!res.ok) {
      // 502/503/504 are what a restart or a cold deployment looks like: worth
      // one quiet retry for a read, never for a write.
      if (res.status >= 502 && res.status <= 504 && method === 'GET' && attempt < 1) {
        await sleep(RETRY_DELAY_MS);
        return request(path, { ...opts, attempt: attempt + 1 });
      }
      lastFailure = { code: res.status >= 500 ? 'SERVER' : 'HTTP', status: res.status };
      const data = await res.json().catch(() => ({}));
      throw netError(lastFailure.code, data.error || 'Something went wrong. Please try again.');
    }
    lastFailure = null;
    if (raw) return res;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return { ok: true };
  }

  /**
   * Fetch the signed-in user from the server (cached per page load).
   * Returns null when nobody is signed in instead of redirecting.
   */
  function loadUser({ force = false } = {}) {
    if (currentUser && !force) return Promise.resolve(currentUser);
    if (userPromise && !force) return userPromise;
    userPromise = request('/api/auth/me', { skipAuthRedirect: true })
      .then((data) => {
        currentUser = data.user || null;
        return currentUser;
      })
      .catch(() => {
        currentUser = null;
        return null;
      })
      .finally(() => { userPromise = null; });
    return userPromise;
  }

  /** Was the last /api/auth/me failure the server saying "not signed in"? */
  function sessionRejected() {
    return !!(lastFailure && lastFailure.code === 'UNAUTHORIZED');
  }

  /**
   * A single 401 can be a cold server or a badge request racing a cookie
   * refresh. Ask who we are before treating it as a logout. A network failure
   * is not a logout.
   */
  let sessionCheck = null;
  function sessionReallyExpired() {
    if (sessionCheck) return sessionCheck;
    sessionCheck = request('/api/auth/me', { skipAuthRedirect: true })
      .then(() => {
        lastFailure = null;
        return false;
      })
      .catch((e) => !!(e && e.code === 'UNAUTHORIZED'))
      .finally(() => { sessionCheck = null; });
    return sessionCheck;
  }

  /**
   * Wait for the session to become known. Used when the server could not be
   * reached at all: that is a network problem, not a logout, so the user keeps
   * their place (and sees the connection notice) while we keep asking.
   */
  async function waitForSession() {
    let waited = 0;
    while (!sessionRejected()) {
      await sleep(waited < 20000 ? 2500 : 6000);
      waited += 2500;
      const user = await loadUser({ force: true });
      if (user) return user;
      if (sessionRejected()) return null;
      if (navigator.onLine === false) NetStatus.offline();
    }
    return null;
  }

  /**
   * Boot helper for dashboards: load the session and bounce to the right
   * login page when it is missing or belongs to another role. A network
   * failure is NOT a reason to bounce anybody: the session cookie is still
   * valid, so the dashboard waits for the server instead of dumping the user
   * on a login form (and losing whatever they were doing).
   */
  async function requireUser(expectedRole) {
    let user = await loadUser();
    if (!user && !sessionRejected()) user = await waitForSession();
    if (!user) {
      if (sessionRejected()) redirectToLogin();
      return null;
    }
    if (expectedRole && user.role !== expectedRole) {
      location.href = ROLE_LOGIN[user.role] || '/dashboard-access.html';
      return null;
    }
    return user;
  }

  /** Sign out: the server invalidates the session, then we leave the page. */
  async function logout() {
    const role = currentUser && currentUser.role;
    try {
      await request('/api/auth/logout', { method: 'POST', skipAuthRedirect: true });
    } catch { /* the session is gone either way */ }
    currentUser = null;
    location.href = ROLE_LOGIN[role] || '/dashboard-access.html';
  }

  const API = {
    get: (p, opts) => request(p, opts),
    post: (p, body, opts) => request(p, { method: 'POST', body, ...opts }),
    put: (p, body, opts) => request(p, { method: 'PUT', body, ...opts }),
    del: (p, body, opts) => request(p, { method: 'DELETE', body, ...opts }),
    upload: (p, form, opts) => request(p, { method: 'POST', form, ...opts }),
    uploadPut: (p, form, opts) => request(p, { method: 'PUT', form, ...opts }),
    raw: (p, opts) => request(p, { raw: true, ...opts }),
    request,
    loadUser,
    requireUser,
    logout,
    hasSessionCookie,
    /** What the last request did: null, or { code, message? } — never throws. */
    lastFailure: () => lastFailure,
    /** Re-attempt the boot if the session fetch failed for network reasons. */
    retrySession: () => loadUser({ force: true }),
    netStatus: () => NetStatus,
    /**
     * Synchronously returns the cached user. Call `requireUser()` first when
     * the page needs it; this stays for rendering code deep inside components.
     */
    getUser: () => currentUser,
    setUser: (u) => { currentUser = u || null; },
    base: BASE,
  };

  window.API = API;
})();
