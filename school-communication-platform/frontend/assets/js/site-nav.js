/* ============================================================
 * KALINABIRI SS — UNIFIED NAVBAR (injected on every public page)
 * Renders a consistent, mobile-friendly navigation bar and drawer.
 * Highlights the current page automatically.
 * ============================================================ */
(function () {
  'use strict';

  var LINKS = [
    { href: '/',            icon: 'home',           label: 'Home' },
    { href: '/about/',      icon: 'school',         label: 'About' },
    { href: '/admissions/', icon: 'penToSquare',  label: 'Admissions' },
    { href: '/gallery/',    icon: 'images',         label: 'Gallery' },
    { href: '/news/',       icon: 'newspaper',      label: 'News' },
    { href: '/staff/',      icon: 'users',          label: 'Staff' },
    { href: '/contact/',    icon: 'envelope',       label: 'Contact' },
  ];

  // Inline SVG icons (the site no longer uses an icon font).
  var ICON = {
    home:          '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z"/></svg>',
    school:        '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M10 21v-6h4v6"/></svg>',
    penToSquare:   '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    images:        '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    newspaper:     '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M4 4h11a1 1 0 0 1 1 1v15H5a1 1 0 0 1-1-1V4z"/><path d="M16 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3"/><path d="M7 8h5"/><path d="M7 12h5"/><path d="M7 16h3"/></svg>',
    users:         '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    envelope:      '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>',
    rightToBracket:'<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/></svg>'
  };
  function icon(name) { return ICON[name] || ''; }

  function currentPath() {
    var p = location.pathname;
    if (!p.endsWith('/')) p += '/';
    return p;
  }

  function isActive(href) {
    var p = currentPath();
    if (href === '/') return p === '/' || p === '/index.html/';
    return p.indexOf(href) === 0;
  }

  function build() {
    // Remove any legacy navbars the page may still carry so the unified
    // navbar is the ONLY navigation on every page (desktop AND mobile).
    ['.navbar-3d', '.mobile-nav-menu', 'nav.navbar', '.desktop-nav', '.mobile-nav',
      '.top-nav', '.mobile-menu', '#mobileMenu', '#mobileNavMenu'].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (!el.closest('.kn-nav')) el.remove();
      });
    });
    // bare <nav> elements (e.g. the gallery page) that aren't ours
    document.querySelectorAll('nav').forEach(function (el) {
      if (!el.classList.contains('kn-nav') && !el.closest('.kn-nav')) el.remove();
    });
    // orphaned hamburger buttons left outside a removed nav
    document.querySelectorAll('.hamburger, .mobile-menu-btn, .mobile-toggle-3d').forEach(function (el) {
      if (!el.closest('.kn-nav') && !el.closest('.topbar')) el.remove();
    });

    var nav = document.createElement('nav');
    nav.className = 'kn-nav';
    nav.setAttribute('aria-label', 'Main navigation');

    var linksHtml = LINKS.map(function (l) {
      return '<li><a href="' + l.href + '"' + (isActive(l.href) ? ' class="active" aria-current="page"' : '') + '>' +
        icon(l.icon) + '<span>' + l.label + '</span></a></li>';
    }).join('');

    nav.innerHTML =
      '<a class="kn-brand" href="/" aria-label="Kalinabiri SS home">' +
        '<img src="/assets/images/logo.jpeg" alt="Kalinabiri SS logo" onerror="this.style.display=\'none\'">' +
        '<span class="kn-brand-txt"><span class="kn-brand-name">Kalinabiri SS</span><span class="kn-brand-sub">Ntinda, Kampala</span></span>' +
      '</a>' +
      '<ul class="kn-links">' + linksHtml + '</ul>' +
      '<div class="kn-actions">' +
        '<a class="kn-portal" href="/dashboard-access.html">' + icon('rightToBracket') + ' Portals</a>' +
        '<a class="kn-cta" href="/admissions/#application-form">' + icon('penToSquare') + ' Apply Now</a>' +
        '<button class="kn-burger" id="knBurger" aria-label="Open menu" aria-expanded="false" aria-controls="knDrawer">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
      '</div>';

    var drawer = document.createElement('div');
    drawer.className = 'kn-drawer';
    drawer.id = 'knDrawer';
    drawer.innerHTML = LINKS.map(function (l) {
      return '<a href="' + l.href + '"' + (isActive(l.href) ? ' class="active"' : '') + '>' +
        icon(l.icon) + l.label + '</a>';
    }).join('') +
      '<a class="kn-drawer-portal" href="/dashboard-access.html">' + icon('rightToBracket') + ' Portal Sign In</a>' +
      '<a class="kn-drawer-cta" href="/admissions/#application-form">' + icon('penToSquare') + ' Apply Now</a>';

    var scrim = document.createElement('div');
    scrim.className = 'kn-scrim';

    document.body.prepend(scrim);
    document.body.prepend(drawer);
    document.body.prepend(nav);
    document.body.classList.add('kn-has-nav');

    var burger = nav.querySelector('#knBurger');
    function toggle(open) {
      var on = open !== undefined ? open : !drawer.classList.contains('open');
      drawer.classList.toggle('open', on);
      scrim.classList.toggle('open', on);
      burger.classList.toggle('open', on);
      burger.setAttribute('aria-expanded', String(on));
      document.body.style.overflow = on ? 'hidden' : '';
    }
    burger.addEventListener('click', function () { toggle(); });
    scrim.addEventListener('click', function () { toggle(false); });
    drawer.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { toggle(false); }); });
    window.addEventListener('resize', function () { if (window.innerWidth > 920) toggle(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });

    // scrolled state for the bar itself: it solidifies a little once the page moves
    var ticking = false;
    function markScrolled() {
      ticking = false;
      nav.classList.toggle('is-scrolled', window.scrollY > 50);
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(markScrolled);
    }, { passive: true });
    markScrolled();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();


/* Phone card rows: groups of cards become one sideways swipe instead of a
   tall stack. Forms, navigation and the footer are left alone. Desktop is
   untouched — the wrappers are removed as soon as the screen is wide. */
(function () {
  'use strict';

  var SKIP = '.stx-swipe, form, nav, footer, .kn-nav, .kn-drawer, .form-section, .form-row, .footer-grid, .stats-grid, .achievements-grid, .page-nav-bar, .track-tabs, .search-filter-bar, .accordion, .two-column-grid, .stx-sig, .hero, .hero-actions, .modal, .lightbox, .toast-container, .jump, .cta, table, .table-scroll, #gallery, #homeGalleryGrid, #managedGallery, .gallery-grid, .image-gallery, .stx-stage, .photo-stage, .stx-view, .stx-zoom';

  function isPhone() {
    var w = window.innerWidth || 0;
    if (w <= 0) return false;
    try {
      if (window.matchMedia) return window.matchMedia('(max-width: 760px)').matches;
    } catch (e) {}
    return w <= 760;
  }

  function className(el) {
    return (el && typeof el.className === 'string') ? el.className : '';
  }

  function isCard(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag !== 'DIV' && tag !== 'ARTICLE' && tag !== 'A' && tag !== 'LI' && tag !== 'FIGURE') return false;
    if (el.closest && el.closest(SKIP)) return false;
    var cls = className(el);
    if (/\b(btn|card-grid|card-icon|card-link|track-tab|stat-card|achievement-stat|section-header|pn-item|term-head|term-body|term-num|gallery-item|image-card|stx-slide|stx-thumb)\b/.test(cls)) return false;
    if (/(^|\s)(combo-card|combo|portal-card|hod-card|news-card|req-card|doc-item|contact-item|contact-card|contact-card-wrapper|department-card|department-card-wrapper|facility-card|leader-card|accred-card|trophy-item|memorial-card|memorial-item|glass-card|video-card|tt-card|value-card|info-card|term)(\s|$)/.test(cls)) return true;
    if (/(^|\s)card(\s|$)/.test(cls)) return true;
    if (tag === 'A') return false;
    var st = el.getAttribute('style') || '';
    if (/display\s*:\s*(grid|flex|inline-flex)/i.test(st)) return false;
    return /border-radius\s*:/i.test(st) && /padding\s*:/i.test(st);
  }

  function unwrapAll() {
    var wraps = document.querySelectorAll('.stx-swipe');
    for (var i = wraps.length - 1; i >= 0; i--) {
      var wrap = wraps[i];
      var parent = wrap.parentNode;
      if (!parent) continue;
      while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap);
      parent.removeChild(wrap);
    }
  }

  function wrapRuns(box) {
    if (!box || box.nodeType !== 1 || !box.children || box.children.length < 2) return;
    if (box.classList && box.classList.contains('stx-swipe')) return;
    if (box.closest && box.closest(SKIP)) return;
    if (box.matches && box.matches(SKIP)) return;
    var inline = box.getAttribute('style') || '';
    if (/display\s*:\s*inline-flex/i.test(inline)) return;

    var list = [];
    for (var i = 0; i < box.children.length; i++) list.push(box.children[i]);
    var run = [];
    function flush() {
      if (run.length >= 2) {
        var wrap = document.createElement('div');
        wrap.className = 'stx-swipe';
        wrap.setAttribute('tabindex', '0');
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', 'Swipe sideways to see more');
        run[0].parentNode.insertBefore(wrap, run[0]);
        for (var j = 0; j < run.length; j++) wrap.appendChild(run[j]);
      }
      run = [];
    }
    for (var k = 0; k < list.length; k++) {
      if (isCard(list[k])) run.push(list[k]);
      else flush();
    }
    flush();
  }

  var busy = false;
  var queued = false;
  function apply() {
    if (busy) { queued = true; return; }
    if (!document.body) return;
    busy = true;
    try {
      if (!isPhone()) {
        unwrapAll();
        return;
      }
      var nodes = document.querySelectorAll('div, section, ul');
      for (var i = nodes.length - 1; i >= 0; i--) wrapRuns(nodes[i]);
    } finally {
      busy = false;
      if (queued) { queued = false; apply(); }
    }
  }

  function start() {
    apply();
    if (!window.MutationObserver || !document.body) return;
    var timer = null;
    var obs = new MutationObserver(function () {
      if (timer) return;
      timer = setTimeout(function () { timer = null; apply(); }, 80);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(apply, 120);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();


/* Classic 3D field behind every page. The film stays in the hero only. */
(function () {
  'use strict';

  function boot() {
    if (!document.body || document.querySelector('.stx-depth')) return;

    var reduce = false;
    var save = false;
    try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    try { save = !!(navigator.connection && navigator.connection.saveData); } catch (e2) {}

    var canvas = document.createElement('canvas');
    canvas.className = 'stx-depth';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var dots = [];
    var raf = 0;
    var running = false;
    var w = 1;
    var h = 1;
    var dpr = 1;
    var small = false;

    function phone() {
      return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
    }

    function resize() {
      small = phone();
      dpr = Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.5);
      w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
      h = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      var n = small ? 36 : 72;
      dots = [];
      for (var i = 0; i < n; i++) {
        dots.push({
          x: Math.random(),
          y: Math.random(),
          z: 0.08 + Math.random() * 0.92,
          vx: (Math.random() - 0.5) * 0.00028,
          vy: -0.00012 - Math.random() * 0.00022
        });
      }
    }

    function project(p) {
      var depth = 0.18 + p.z * 0.82;
      return {
        x: (p.x - 0.5) / depth * w * 0.9 + w * 0.5,
        y: (p.y - 0.42) / depth * h * 0.9 + h * 0.48,
        r: (1 - depth) * (small ? 2.1 : 2.6) + 0.55,
        a: 0.16 + (1 - depth) * 0.62
      };
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      var glow = ctx.createRadialGradient(w * 0.5, h * 0.2, 20, w * 0.5, h * 0.45, Math.max(w, h) * 0.72);
      glow.addColorStop(0, 'rgba(14,165,233,0.07)');
      glow.addColorStop(1, 'rgba(6,12,22,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      var placed = [];
      for (var i = 0; i < dots.length; i++) {
        var p = dots[i];
        if (!reduce && !save) {
          p.y += p.vy;
          p.x += p.vx;
          p.z -= 0.0011;
          if (p.z < 0.05 || p.y < -0.15 || p.x < -0.2 || p.x > 1.2) {
            p.z = 1;
            p.x = Math.random();
            p.y = 0.15 + Math.random() * 0.9;
          }
        }
        placed.push(project(p));
      }

      var links = 0;
      var maxLinks = small ? 10 : 18;
      ctx.lineWidth = 1;
      for (var a = 0; a < placed.length && links < maxLinks; a++) {
        for (var b = a + 1; b < placed.length && links < maxLinks; b++) {
          var dx = placed[a].x - placed[b].x;
          var dy = placed[a].y - placed[b].y;
          if (dx * dx + dy * dy > (small ? 70 * 70 : 110 * 110)) continue;
          ctx.strokeStyle = 'rgba(125,211,252,0.16)';
          ctx.beginPath();
          ctx.moveTo(placed[a].x, placed[a].y);
          ctx.lineTo(placed[b].x, placed[b].y);
          ctx.stroke();
          links++;
        }
      }

      for (var k = 0; k < placed.length; k++) {
        var q = placed[k];
        ctx.beginPath();
        ctx.fillStyle = 'rgba(224,242,254,' + q.a.toFixed(3) + ')';
        ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame() {
      if (!running) return;
      draw();
      raf = window.requestAnimationFrame(frame);
    }

    resize();
    seed();
    draw();
    if (!reduce && !save) {
      running = true;
      raf = window.requestAnimationFrame(frame);
    }

    window.addEventListener('resize', function () {
      var was = small;
      resize();
      if (was !== small) seed();
      if (reduce || save) draw();
    });
    document.addEventListener('visibilitychange', function () {
      if (reduce || save) return;
      if (document.hidden) {
        running = false;
        if (raf) window.cancelAnimationFrame(raf);
        raf = 0;
      } else if (!running) {
        running = true;
        raf = window.requestAnimationFrame(frame);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();


/* Photo stage: one featured picture in perspective, not a grid animation.
   Used by the home "Moments" band and the gallery page. */
(function () {
  'use strict';

  var LOOKS = ['look-cinema', 'look-float', 'look-glass'];
  var ROOTS = '#homeGalleryGrid, #managedGallery';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function plain(el) {
    return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  function stepDown(img) {
    var s = img.getAttribute('src') || '';
    if (s.indexOf('maxresdefault') !== -1) {
      img.setAttribute('src', s.replace('maxresdefault', 'hq720'));
      return;
    }
    if (s.indexOf('hq720') !== -1) {
      img.setAttribute('src', s.replace('hq720', 'hqdefault'));
      return;
    }
    var slide = img.closest ? img.closest('.stx-slide') : null;
    if (slide) slide.setAttribute('hidden', '');
    else img.style.display = 'none';
  }

  function collect(root) {
    var nodes = root.querySelectorAll('.gallery-item, .image-card');
    var items = [];
    for (var i = 0; i < nodes.length; i++) {
      var img = nodes[i].querySelector('img');
      var src = img ? (img.getAttribute('src') || '') : '';
      if (!src) continue;
      var heading = nodes[i].querySelector('h3, h4');
      var note = nodes[i].querySelector('p, span');
      items.push({
        src: src,
        alt: img.getAttribute('alt') || plain(heading),
        title: plain(heading),
        cap: plain(note)
      });
    }
    return items;
  }

  function chevron(dir) {
    var d = dir < 0 ? 'M15 18 9 12l6-6' : 'M9 18l6-6-6-6';
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  function mount(root) {
    if (!root || root.getAttribute('data-stx-stage') === '1') return;
    if (root.closest && root.closest('.stx-zoom')) return;
    var items = collect(root);
    if (!items.length) return;

    root.setAttribute('data-stx-stage', '1');
    root.classList.add('stx-stage');
    var section = root.closest ? root.closest('section') : null;
    if (section) section.classList.add('photo-stage');

    var slides = '';
    var thumbs = '';
    var dots = '';
    for (var i = 0; i < items.length; i++) {
      var look = LOOKS[i % LOOKS.length];
      var label = items[i].title || items[i].alt || 'Photo';
      slides += '<button type="button" class="stx-slide ' + look + '" data-i="' + i + '" aria-label="' + esc(label) + '">' +
        '<img src="' + esc(items[i].src) + '" alt="' + esc(items[i].alt || label) + '" loading="lazy">' +
        '<span class="stx-cap"><strong>' + esc(items[i].title || label) + '</strong>' +
        (items[i].cap ? '<em>' + esc(items[i].cap) + '</em>' : '') +
        '</span></button>';
      thumbs += '<button type="button" class="stx-thumb" data-i="' + i + '" aria-label="Show ' + esc(label) + '">' +
        '<img src="' + esc(items[i].src) + '" alt="" loading="lazy"></button>';
      dots += '<button type="button" class="stx-dot" data-i="' + i + '" aria-label="Photo ' + (i + 1) + '"></button>';
    }

    root.innerHTML =
      '<div class="stx-view" tabindex="0" role="region" aria-roledescription="carousel" aria-label="School photos">' +
        slides +
      '</div>' +
      '<div class="stx-bar">' +
        '<button type="button" class="stx-prev" aria-label="Previous photo">' + chevron(-1) + '</button>' +
        '<div class="stx-dots">' + dots + '</div>' +
        '<span class="stx-count" aria-live="polite"></span>' +
        '<button type="button" class="stx-next" aria-label="Next photo">' + chevron(1) + '</button>' +
      '</div>' +
      '<div class="stx-rail">' + thumbs + '</div>';

    wire(root, items);
  }

  function wire(root, items) {
    var view = root.querySelector('.stx-view');
    var slides = root.querySelectorAll('.stx-slide');
    var dots = root.querySelectorAll('.stx-dot');
    var thumbs = root.querySelectorAll('.stx-thumb');
    var rail = root.querySelector('.stx-rail');
    var count = root.querySelector('.stx-count');
    var index = 0;
    var timer = null;
    var startX = 0;
    var startY = 0;
    var moved = false;
    var tracking = false;

    function show(n) {
      if (!items.length) return;
      index = (n + items.length) % items.length;
      var guard = 0;
      while (slides[index] && slides[index].hasAttribute('hidden') && guard < items.length) {
        index = (index + 1) % items.length;
        guard++;
      }
      for (var i = 0; i < slides.length; i++) {
        var d = i - index;
        if (d > items.length / 2) d -= items.length;
        if (d < -items.length / 2) d += items.length;
        slides[i].classList.remove('is-on', 'is-prev', 'is-next', 'is-far');
        if (slides[i].hasAttribute('hidden')) {
          slides[i].classList.add('is-far');
          continue;
        }
        if (d === 0) slides[i].classList.add('is-on');
        else if (d === -1) slides[i].classList.add('is-prev');
        else if (d === 1) slides[i].classList.add('is-next');
        else slides[i].classList.add('is-far');
        slides[i].setAttribute('aria-hidden', d === 0 ? 'false' : 'true');
        if (dots[i]) dots[i].classList.toggle('is-on', i === index);
        if (thumbs[i]) thumbs[i].classList.toggle('is-on', i === index);
      }
      if (count) count.textContent = (index + 1) + ' / ' + items.length;
      if (view) {
        var name = items[index].title || items[index].alt || 'Photo';
        view.setAttribute('aria-label', name + ', ' + (index + 1) + ' of ' + items.length);
      }
      var thumb = thumbs[index];
      if (rail && thumb) {
        var left = thumb.offsetLeft - (rail.clientWidth - thumb.offsetWidth) / 2;
        if (rail.scrollTo) rail.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' });
        else rail.scrollLeft = Math.max(0, left);
      }
    }

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    function play() {
      stop();
      if (reduce || items.length < 2) return;
      timer = setInterval(function () { show(index + 1); }, 4800);
    }

    function openZoom(item) {
      var open = document.querySelector('.stx-zoom');
      if (open) open.remove();
      stop();
      var ov = document.createElement('div');
      ov.className = 'stx-zoom';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-label', item.title || 'Photo');
      var img = document.createElement('img');
      img.alt = item.alt || item.title || '';
      img.src = item.src;
      img.addEventListener('error', function () { stepDown(img); });
      var cap = document.createElement('p');
      cap.textContent = item.title || '';
      ov.appendChild(img);
      ov.appendChild(cap);
      function close() {
        ov.remove();
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = '';
        play();
      }
      function onKey(e) {
        if (e.key === 'Escape') close();
      }
      ov.addEventListener('click', close);
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
      document.body.appendChild(ov);
    }

    root.querySelectorAll('.stx-slide img, .stx-thumb img').forEach(function (img) {
      img.addEventListener('error', function () { stepDown(img); });
    });

    for (var s = 0; s < slides.length; s++) {
      (function (n) {
        slides[n].addEventListener('click', function () {
          if (moved) return;
          if (n === index) openZoom(items[n]);
          else { show(n); play(); }
        });
      })(s);
    }
    function jump(el) {
      var n = parseInt(el.getAttribute('data-i'), 10);
      if (isNaN(n)) return;
      show(n);
      play();
    }
    for (var d = 0; d < dots.length; d++) dots[d].addEventListener('click', function () { jump(this); });
    for (var t = 0; t < thumbs.length; t++) thumbs[t].addEventListener('click', function () { jump(this); });

    var prev = root.querySelector('.stx-prev');
    var next = root.querySelector('.stx-next');
    if (prev) prev.addEventListener('click', function () { show(index - 1); play(); });
    if (next) next.addEventListener('click', function () { show(index + 1); play(); });

    if (view) {
      view.addEventListener('pointerdown', function (e) {
        tracking = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        stop();
      });
      view.addEventListener('pointerup', function (e) {
        if (!tracking) return;
        tracking = false;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) {
          moved = true;
          show(index + (dx < 0 ? 1 : -1));
          setTimeout(function () { moved = false; }, 40);
        }
        play();
      });
      view.addEventListener('pointercancel', function () { tracking = false; play(); });
      view.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); play(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); play(); }
      });
    }

    if (items.length < 2) {
      var bar = root.querySelector('.stx-bar');
      if (bar) bar.style.display = 'none';
      if (rail) rail.style.display = 'none';
    }

    show(0);
    play();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else if (!document.querySelector('.stx-zoom')) play();
    });
  }

  function scan() {
    if (!document.body) return;
    var roots = document.querySelectorAll(ROOTS);
    for (var i = 0; i < roots.length; i++) mount(roots[i]);
  }

  function start() {
    scan();
    if (!window.MutationObserver || !document.body) return;
    var timer = null;
    var obs = new MutationObserver(function () {
      if (timer) return;
      timer = setTimeout(function () { timer = null; scan(); }, 60);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
