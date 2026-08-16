/* ============================================================
 * KALINABIRI SS — MOBILE PERFORMANCE GUARD
 * On phones / slow connections / data-saver:
 *  - stop the hidden background video rotator (each video is MBs)
 *  - keep only the first (visible) background video, paused fallback poster
 *  - kill heavy Three.js particle canvases
 * Result: dramatically less data + battery use on mobile.
 * ============================================================ */
(function () {
  'use strict';
  var conn = navigator.connection || {};
  var small = window.innerWidth < 768;
  var slow = conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');
  if (!small && !slow) return;

  function run() {
    // 1. background/video rotators: keep nothing loading in the background
    document.querySelectorAll('video:not([data-keep])').forEach(function (v, i) {
      var visible = v.offsetParent !== null && !v.closest('[style*="display:none"]');
      var isBackground = v.autoplay || v.muted;
      if (!visible || (isBackground && i > 0)) {
        try {
          v.pause();
          v.removeAttribute('autoplay');
          v.preload = 'none';
          // drop sources so the browser never downloads them
          v.querySelectorAll('source').forEach(function (s) { s.removeAttribute('src'); });
          v.removeAttribute('src');
          v.load();
        } catch (e) {}
      } else if (isBackground) {
        // the one visible bg video: don't stream on cellular either
        if (slow) { try { v.pause(); v.preload = 'none'; } catch (e) {} }
      }
    });

    // 2. Three.js particle canvases: purely decorative — remove on phones
    document.querySelectorAll('canvas').forEach(function (c) {
      var st = getComputedStyle(c);
      if (st.position === 'fixed' && st.pointerEvents === 'none') c.remove();
      if (c.id === 'three-canvas') c.remove();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 100); });
  else setTimeout(run, 100);
  // rerun after late scripts create canvases
  setTimeout(run, 1500);
})();
