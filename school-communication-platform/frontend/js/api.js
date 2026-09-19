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

  async function request(path, { method = 'GET', body, form, auth = true, raw = false, skipAuthRedirect = false } = {}) {
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

    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers,
        body: payload,
        credentials: 'include', // send the session cookie, same-origin or CORS
      });
    } catch (e) {
      console.error('[API] fetch failed:', e);
      throw new Error('Cannot reach the server. Check your connection and try again.');
    }

    if (res.status === 401) {
      if (auth && !skipAuthRedirect && !path.includes('/auth/login')) redirectToLogin();
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Your session has expired. Please log in again.');
    }
    if (res.status === 403) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'You do not have permission to perform this action.');
    }
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Too many requests. Please slow down and try again shortly.');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Something went wrong. Please try again.');
    }
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

  /**
   * Boot helper for dashboards: load the session and bounce to the right
   * login page when it is missing or belongs to another role.
   */
  async function requireUser(expectedRole) {
    const user = await loadUser();
    if (!user) {
      redirectToLogin();
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
    get: (p) => request(p),
    post: (p, body) => request(p, { method: 'POST', body }),
    put: (p, body) => request(p, { method: 'PUT', body }),
    del: (p, body) => request(p, { method: 'DELETE', body }),
    upload: (p, form) => request(p, { method: 'POST', form }),
    uploadPut: (p, form) => request(p, { method: 'PUT', form }),
    raw: (p) => request(p, { raw: true }),
    request,
    loadUser,
    requireUser,
    logout,
    hasSessionCookie,
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
