/* ============================================================
 * KALINABIRI SS — LIGHTWEIGHT SITE ANIMATIONS
 * Scroll-reveal + stat counters + card lift. Pure CSS transitions
 * driven by IntersectionObserver: no layout thrash, no libraries,
 * fully disabled for prefers-reduced-motion. ~1.5 KB gzipped.
 * ============================================================ */
(function () {
  'use strict';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // inject the animation stylesheet once
  var css = [
    '.ka-reveal{opacity:0;transform:translateY(22px);transition:opacity .55s cubic-bezier(.2,.7,.3,1),transform .55s cubic-bezier(.2,.7,.3,1)}',
    '.ka-reveal.ka-in{opacity:1;transform:none}',
    '.ka-reveal[data-ka="left"]{transform:translateX(-26px)}',
    '.ka-reveal[data-ka="right"]{transform:translateX(26px)}',
    '.ka-reveal[data-ka="zoom"]{transform:scale(.94)}',
    '.ka-reveal.ka-in[data-ka]{transform:none}',
    '.ka-lift{transition:transform .25s ease,box-shadow .25s ease}',
    '.ka-lift:hover{transform:translateY(-5px)}',
    '@media (prefers-reduced-motion: reduce){.ka-reveal{opacity:1!important;transform:none!important;transition:none!important}}',
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function init() {
    // Auto-target common section building blocks (idempotent, cheap selectors)
    var targets = document.querySelectorAll(
      'section > .section-header, .stat-card, .gallery-item, .image-card, .news-card, ' +
      '.portal-card, .contact-item, .card-3d, .value-card, .program-card, .staff-card, ' +
      '.form-section, .memorial-item, .hod-card, .info-card, .testimonial-card'
    );
    var toObserve = [];
    targets.forEach(function (el, i) {
      if (el.classList.contains('ka-reveal') || el.closest('.kn-nav, .kn-drawer')) return;
      el.classList.add('ka-reveal');
      // small stagger within groups for a cascade feel
      el.style.transitionDelay = Math.min((i % 6) * 60, 300) + 'ms';
      toObserve.push(el);
    });
    // give cards a gentle lift on hover (pointer devices only)
    if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
      document.querySelectorAll('.gallery-item, .news-card, .portal-card, .image-card').forEach(function (el) {
        el.classList.add('ka-lift');
      });
    }

    if (reduced || !('IntersectionObserver' in window)) {
      toObserve.forEach(function (el) { el.classList.add('ka-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('ka-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    toObserve.forEach(function (el) {
      // elements already in view on load appear immediately (no blank page)
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9) el.classList.add('ka-in');
      else io.observe(el);
    });

    // animated number counters for [data-count] or .stat-num like "1,200+"
    var nums = document.querySelectorAll('.stat-number, .stat-num, [data-count]');
    if (!reduced && nums.length && 'IntersectionObserver' in window) {
      var nio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          nio.unobserve(en.target);
          var el = en.target;
          var raw = el.getAttribute('data-count') || el.textContent || '';
          var m = String(raw).match(/([\d,]+)/);
          if (!m) return;
          var target = parseInt(m[1].replace(/,/g, ''), 10);
          if (!target || target > 1e6) return;
          var suffix = String(raw).replace(/^[\d,]+/, '');
          var t0 = null;
          function step(ts) {
            if (!t0) t0 = ts;
            var p = Math.min((ts - t0) / 1200, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(target * eased).toLocaleString() + suffix;
            if (p < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        });
      }, { threshold: 0.4 });
      nums.forEach(function (el) { nio.observe(el); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
