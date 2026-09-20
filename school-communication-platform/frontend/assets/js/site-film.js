/**
 * Background film — one layer per section, clipped by that section.
 *
 * The footage sits INSIDE the sections that are meant to show it: every layer
 * is absolutely positioned inside its own section and clipped by its own box
 * (see .bg-film in site-nav.css), so the video can never spill out of the top
 * of its container or run down over the content below it. The old version was
 * a single viewport-fixed layer for the whole document, which is exactly what
 * read as "the video has escaped its section".
 *
 * Sections that show the footage sharply:
 *   .bg-clear            the home page's film sections
 *   .page-header, .adm-hero, .news-hero, .page-hero, .about-hero
 *                        the inner pages' header media
 * Sections that show it blurred (frosted panels):
 *   .bg-blur, .section:not(.section-gray), .about-section:not(.alt-bg),
 *   .adm-section, .news-wrap, .gallery-section, .news-grid
 *
 * A page picks up to three layers (one on phones). Only the layer on screen
 * plays; the others stay as still frames. Skipped for data-saver and
 * reduced-motion visitors; a layer removes itself if the file cannot play,
 * leaving that section's own background in place.
 */
(function () {
  'use strict';

  var SRC = '/assets/video/kalinabiri-kalibz-intro.mp4';

  var SHARP = '.bg-clear, .page-header, .adm-hero, .news-hero, .page-hero, .about-hero';
  var SOFT = '.bg-blur, .section:not(.section-gray), .about-section:not(.alt-bg), ' +
             '.adm-section, .news-wrap, .gallery-section, .news-grid';

  var conn = navigator.connection || {};
  if (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var small = window.matchMedia && window.matchMedia('(max-width: 700px)').matches;
  var MAX_LAYERS = small ? 1 : 4;   // phones keep one layer: fastest, and enough

  function collect(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector)).filter(function (el) {
      return !el.closest('.kn-nav, .kn-drawer');
    });
  }

  function inDocumentOrder(list) {
    return list.sort(function (a, b) {
      var pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  function pickSections() {
    var picked = inDocumentOrder(collect(SHARP));
    if (picked.length >= MAX_LAYERS) return picked.slice(0, MAX_LAYERS);

    collect(SOFT).forEach(function (el) {
      if (picked.indexOf(el) === -1) picked.push(el);
    });
    return inDocumentOrder(picked).slice(0, MAX_LAYERS);
  }

  function build() {
    var layers = [];

    pickSections().forEach(function (section, index) {
      if (section.querySelector('.bg-film')) return;
      if (window.getComputedStyle(section).position === 'static') section.style.position = 'relative';

      var wrap = document.createElement('div');
      wrap.className = 'bg-film';
      wrap.setAttribute('aria-hidden', 'true');
      // frosted sections get the footage blurred; an explicit .bg-clear wins
      if (!section.matches(SHARP) && section.matches(SOFT)) wrap.className += ' is-soft';

      var video = document.createElement('video');
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.autoplay = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('preload', index === 0 ? 'auto' : 'metadata');
      video.setAttribute('disablepictureinpicture', '');
      video.setAttribute('tabindex', '-1');
      video.setAttribute('aria-hidden', 'true');
      video.src = SRC;

      wrap.appendChild(video);
      section.insertBefore(wrap, section.firstChild);

      var layer = { wrap: wrap, video: video, section: section, visible: false };
      layers.push(layer);

      video.addEventListener('loadeddata', function () { wrap.classList.add('is-ready'); });
      video.addEventListener('playing', function () { wrap.classList.add('is-ready'); });
      video.addEventListener('error', function () { wrap.remove(); });
    });

    if (!layers.length) return;

    function play(layer) {
      var started = layer.video.play();
      if (started && started.catch) started.catch(function () { /* autoplay refused */ });
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          layers.forEach(function (layer) {
            if (layer.section !== entry.target) return;
            layer.visible = entry.isIntersecting;
            if (entry.isIntersecting) play(layer);
            else layer.video.pause();
          });
        });
      }, { rootMargin: '15% 0px' });
      layers.forEach(function (layer) { io.observe(layer.section); });
    } else {
      // no observer: play the first layer, leave the rest as still frames
      play(layers[0]);
    }

    document.addEventListener('visibilitychange', function () {
      layers.forEach(function (layer) {
        if (document.hidden) { layer.video.pause(); return; }
        if (layer.visible) play(layer);
      });
    });
  }

  if (window.requestIdleCallback) window.requestIdleCallback(build, { timeout: 2000 });
  else window.addEventListener('load', function () { setTimeout(build, 400); });
})();
