/**
 * Background film - the upper part of a page only.
 *
 * One clip, clipped inside the first hero or page header. It never continues
 * into the sections below, and it never sits behind the photo galleries.
 * The gallery page has no film at all. Everything under the hero is a classic
 * panel over the shared 3D field (see .stx-depth in site-nav.js).
 *
 * Skipped for data-saver and reduced-motion visitors. If the file cannot
 * play, the layer removes itself and the hero's own background stays.
 */
(function () {
  'use strict';

  var SRC = '/assets/video/kalinabiri-kalibz-intro.mp4';
  var HERO = '.hero.bg-clear, .page-header, .adm-hero, .news-hero, .page-hero, .about-hero';

  var conn = navigator.connection || {};
  if (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function isGalleryPage() {
    var path = (location.pathname || '').replace(/\/index\.html$/, '');
    if (path.length > 1 && path.charAt(path.length - 1) === '/') path = path.slice(0, -1);
    return path === '/gallery';
  }

  function collect(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector)).filter(function (el) {
      if (!el || (el.closest && el.closest('.kn-nav, .kn-drawer'))) return false;
      if (el.id === 'gallery') return false;
      if (el.classList && (el.classList.contains('gallery-section') || el.classList.contains('photo-stage'))) return false;
      if (el.closest && el.closest('#gallery, .gallery-section, .photo-stage, .stx-stage')) return false;
      return true;
    });
  }

  function pickSection() {
    if (isGalleryPage()) return null;
    var heroes = collect(HERO);
    return heroes.length ? heroes[0] : null;
  }

  function build() {
    var section = pickSection();
    if (!section || section.querySelector('.bg-film')) return;

    if (window.getComputedStyle(section).position === 'static') section.style.position = 'relative';

    var wrap = document.createElement('div');
    wrap.className = 'bg-film';
    wrap.setAttribute('aria-hidden', 'true');

    var video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.autoplay = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('preload', 'auto');
    video.setAttribute('disablepictureinpicture', '');
    video.setAttribute('tabindex', '-1');
    video.setAttribute('aria-hidden', 'true');
    video.src = SRC;

    wrap.appendChild(video);
    section.insertBefore(wrap, section.firstChild);

    var visible = false;
    function play() {
      var started = video.play();
      if (started && started.catch) started.catch(function () { /* autoplay refused */ });
    }

    video.addEventListener('loadeddata', function () { wrap.classList.add('is-ready'); });
    video.addEventListener('playing', function () { wrap.classList.add('is-ready'); });
    video.addEventListener('error', function () { wrap.remove(); });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.target !== section) return;
          visible = entry.isIntersecting;
          if (entry.isIntersecting) play();
          else video.pause();
        });
      }, { rootMargin: '15% 0px' });
      io.observe(section);
    } else {
      play();
      visible = true;
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { video.pause(); return; }
      if (visible) play();
    });
  }

  if (window.requestIdleCallback) window.requestIdleCallback(build, { timeout: 2000 });
  else window.addEventListener('load', function () { setTimeout(build, 400); });
})();
