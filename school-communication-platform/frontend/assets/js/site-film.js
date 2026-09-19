/**
 * Ambient background film.
 *
 * Puts the school's own footage behind the whole public website as a slow,
 * colour-graded backdrop rather than a raw video playing at the visitor:
 *   - a fixed layer behind everything, so it never scrolls or competes
 *   - graded with a vignette, top/bottom scrims and a teal/gold wash so text
 *     stays readable and the page keeps its palette
 *   - a faint grain layer so it reads as film, not as a web element
 *   - a slow drift (CSS) that is disabled for reduced-motion visitors
 *
 * Skipped entirely for data-saver / 2G visitors (they keep the page colours),
 * paused while the tab is hidden so it does not burn battery, and removed if
 * the file cannot be played.
 */
(function () {
  var conn = navigator.connection || {};
  if (conn.saveData || /(^|-)(2g|slow-2g)$/.test(conn.effectiveType || '')) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var SRC = '/assets/video/kalinabiri-kalibz-intro.mp4';

  function build() {
    if (document.querySelector('.site-film-bg')) return;

    var wrap = document.createElement('div');
    wrap.className = 'site-film-bg';
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
    v.src = SRC;

    var grade = document.createElement('div');
    grade.className = 'site-film-grade';
    var grain = document.createElement('div');
    grain.className = 'site-film-grain';

    wrap.appendChild(v);
    wrap.appendChild(grade);
    wrap.appendChild(grain);
    document.body.insertBefore(wrap, document.body.firstChild);

    // Fade the film in only once it is genuinely playing, so the page never
    // flashes a dark rectangle while the file buffers.
    v.addEventListener('playing', function () { wrap.classList.add('is-playing'); });
    v.addEventListener('error', function () { wrap.remove(); });

    var started = v.play();
    if (started && started.catch) started.catch(function () { /* autoplay refused: page colours stay */ });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { v.pause(); return; }
      var again = v.play();
      if (again && again.catch) again.catch(function () {});
    });
  }

  if (window.requestIdleCallback) window.requestIdleCallback(build, { timeout: 2000 });
  else window.addEventListener('load', function () { setTimeout(build, 800); });
})();
