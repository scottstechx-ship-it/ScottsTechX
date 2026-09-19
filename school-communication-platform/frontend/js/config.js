/**
 * Frontend configuration.
 * The API base URL is resolved at runtime and can be overridden without
 * touching the rest of the code:
 *
 *   1. window.__API_BASE_URL__ set BEFORE this script loads (in the HTML)
 *   2. the query string:  ?api=https://api.myschool.com
 *   3. localStorage key "api_base_url"
 *   4. default: the same origin the page was served from
 *
 * For production separation, put the API URL in the HTML script tag or the
 * query string — no code changes needed.
 */
(function () {
  const fromQuery = new URLSearchParams(location.search).get('api');
  const fromStorage = localStorage.getItem('api_base_url');
  const base = window.__API_BASE_URL__ || fromQuery || fromStorage || (location.origin || 'http://localhost:4000');

  window.APP_CONFIG = {
    API_BASE_URL: String(base).replace(/\/+$/, ''),
    // polling fallback interval (ms) used when Socket.IO is unavailable
    POLL_INTERVAL_MS: 15000,
  };
})();
