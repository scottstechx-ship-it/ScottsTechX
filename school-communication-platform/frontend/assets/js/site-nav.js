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

  var SKIP = '.stx-swipe, form, nav, footer, .kn-nav, .kn-drawer, .form-section, .form-row, .footer-grid, .stats-grid, .achievements-grid, .page-nav-bar, .track-tabs, .search-filter-bar, .accordion, .two-column-grid, .stx-sig, .hero, .hero-actions, .modal, .lightbox, .toast-container, .jump, .cta, table, .table-scroll';

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
    if (/\b(btn|card-grid|card-icon|card-link|track-tab|stat-card|achievement-stat|section-header|pn-item|term-head|term-body|term-num)\b/.test(cls)) return false;
    if (/(^|\s)(combo-card|combo|portal-card|hod-card|news-card|gallery-item|req-card|doc-item|contact-item|contact-card|contact-card-wrapper|department-card|department-card-wrapper|facility-card|leader-card|accred-card|trophy-item|memorial-card|memorial-item|glass-card|image-card|video-card|tt-card|value-card|info-card|term)(\s|$)/.test(cls)) return true;
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
