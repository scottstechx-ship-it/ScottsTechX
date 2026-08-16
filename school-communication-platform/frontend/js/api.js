/**
 * API client — thin Fetch wrapper with auth, JSON/FormData support,
 * friendly error messages and automatic session expiry handling.
 */
(function () {
  const BASE = window.APP_CONFIG.API_BASE_URL;

  const TOKEN_KEY = 'scp_token';
  const USER_KEY = 'scp_user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }
  function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } }
  function setUser(u) { u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); }

  function logout() {
    setToken(null);
    setUser(null);
    location.href = BASE + '/login.html';
  }

  async function request(path, { method = 'GET', body, form, auth = true, raw = false } = {}) {
    const headers = {};
    let payload = body;
    if (auth) {
      const t = getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    }
    if (form) {
      payload = form; // FormData — do not set Content-Type
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(BASE + path, { method, headers, body: payload });
    } catch (e) {
      console.error('[API] fetch failed:', e);
      throw new Error('Cannot reach the server. Check your connection and try again.');
    }

    if (res.status === 401) {
      // session expired / invalid
      if (auth && !path.includes('/auth/login')) {
        logout();
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Your session has expired. Please log in again.');
    }
    if (res.status === 403) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'You do not have permission to perform this action.');
    }
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Too many requests. Please try again shortly.');
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

  const API = {
    get: (p) => request(p),
    post: (p, body) => request(p, { method: 'POST', body }),
    put: (p, body) => request(p, { method: 'PUT', body }),
    del: (p, body) => request(p, { method: 'DELETE', body }),
    upload: (p, form) => request(p, { method: 'POST', form }),
    uploadPut: (p, form) => request(p, { method: 'PUT', form }),
    raw: (p) => request(p, { raw: true }),
    request,
    getToken,
    setToken,
    getUser,
    setUser,
    logout,
    base: BASE,
  };

  window.API = API;
})();
