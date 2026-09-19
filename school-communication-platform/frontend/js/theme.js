/**
 * Theme manager — light / dark / system.
 * - preference persists in localStorage (immediate) and syncs to the server
 *   (PUT /api/auth/preferences) so it follows the user on every device
 * - 'system' follows the OS via matchMedia
 * - an inline snippet in each page <head> applies the saved theme before the
 *   CSS paints, so there is no flash of the wrong theme
 */
(function () {
  const KEY = 'scp_theme';
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function resolve(t) {
    if (t === 'system' || !t) return media && media.matches ? 'dark' : 'light';
    return t === 'dark' ? 'dark' : 'light';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', resolve(theme));
  }

  function current() {
    return localStorage.getItem(KEY) || 'system';
  }

  function set(theme, { sync = true } = {}) {
    localStorage.setItem(KEY, theme);
    apply(theme);
    if (sync && window.API) {
      window.API.put('/api/auth/preferences', { theme }).catch(() => {});
    }
    // notify any open listeners (e.g. profile page selector)
    document.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme } }));
  }

  if (media) {
    media.addEventListener('change', () => {
      if (current() === 'system') apply('system');
    });
  }

  apply(current());

  window.Theme = { current, set, apply, resolve };
})();
