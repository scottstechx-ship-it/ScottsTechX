/**
 * Background film.
 *
 * The school's own footage behind the page. It is deliberately NOT a flat
 * full-page wallpaper: the page decides how much of it shows, section by
 * section (see the treatments in site-nav.css):
 *   .bg-clear  the footage plays sharp behind the section
 *   .bg-blur   the section is a frosted panel - footage visible, blurred
 *   .bg-solid  the section covers the footage completely
 *
 * Skipped for data-saver / 2G visitors and for reduced-motion visitors; paused
 * while the tab is hidden; removed if the file cannot be played.
 */
(function () {
  var conn = navigator.connection || {};
  if (conn.saveData || /(^|-)(2g|slow-2g)$/.test(conn.effectiveType || '')) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function build() {
    if (document.querySelector('.bg-film')) return;

    var wrap = document.createElement('div');
    wrap.className = 'bg-film';
    wrap.setAttribute('aria-hidden', 'true');

    var v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.autoplay = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('preload', 'auto');
    v.setAttribute('disablepictureinpicture', '');
    v.setAttribute('tabindex', '-1');
    v.src = '/assets/video/kalinabiri-kalibz-intro.mp4';

    wrap.appendChild(v);
    document.body.insertBefore(wrap, document.body.firstChild);

    v.addEventListener('playing', function () { wrap.classList.add('is-playing'); });
    v.addEventListener('error', function () { wrap.remove(); });

    var started = v.play();
    if (started && started.catch) started.catch(function () { /* autoplay refused */ });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { v.pause(); return; }
      var again = v.play();
      if (again && again.catch) again.catch(function () {});
    });
  }

  if (window.requestIdleCallback) window.requestIdleCallback(build, { timeout: 2000 });
  else window.addEventListener('load', function () { setTimeout(build, 800); });
})();
