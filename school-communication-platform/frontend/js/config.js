/**
 * Frontend configuration.
 * The API base URL is resolved at runtime and can be overridden without
 * touching the rest of the code:
 *
 *   1. window.__API_BASE_URL__ set BEFORE this script loads (in the HTML)
 *   2. a SAME-ORIGIN query string, e.g.  /platform/admin/?api=   (rarely useful)
 *   3. localStorage key "api_base_url" (set deliberately by an administrator)
 *   4. default: the same origin the page was served from
 *
 * For true production separation (frontend and API on different hosts) set the
 * API URL in the HTML script tag — that is a deploy-time decision the site
 * owner makes, not something a URL can talk a signed-in user into.
 *
 * SECURITY: a `?api=https://somewhere-else` link used to be honoured on its
 * own. Anybody could then send a staff member a link that silently repointed
 * the whole dashboard at a server they control and painted attacker-written
 * "notices" inside the school's trusted UI. Cross-origin overrides are now only
 * accepted from the page itself (window.__API_BASE_URL__) or from a value an
 * administrator saved in Settings; anything else is ignored, and a same-origin
 * override is still allowed because it cannot leave the origin.
 */
(function () {
  const page = location.origin || 'http://localhost:4000';

  /** http(s) only — never javascript:, data:, file: … */
  function safeUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value), page);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url;
    } catch {
      return null;
    }
  }

  const configured = safeUrl(window.__API_BASE_URL__);
  const fromQuery = safeUrl(new URLSearchParams(location.search).get('api'));
  let fromStorage = null;
  try { fromStorage = safeUrl(localStorage.getItem('api_base_url')); } catch { /* private mode */ }

  // A cross-origin base must be the one baked into the page; a query string may
  // only point at the origin we are already on.
  const queryAllowed = fromQuery && fromQuery.origin === page;
  const chosen = configured || (queryAllowed ? fromQuery : null) || fromStorage || null;
  if (fromQuery && !queryAllowed && !configured) {
    console.warn('[config] Ignored cross-origin ?api= override for security:', fromQuery.origin);
  }

  window.APP_CONFIG = {
    API_BASE_URL: (chosen ? chosen.origin + chosen.pathname : page).replace(/\/+$/, ''),
    // polling fallback interval (ms) used when Socket.IO is unavailable
    POLL_INTERVAL_MS: 15000,
  };
})();
