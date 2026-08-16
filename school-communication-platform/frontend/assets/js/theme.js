/* Scotts_main — Shared theme chrome injector.
 *
 * Loaded by every public page. Once DOMContentLoaded fires, it:
 *   1. Resolves the current page (for active-state highlighting)
 *   2. Injects the canonical navbar:
 *        a. If the page has <div data-theme-nav="inject"> or just
 *           <div data-theme-nav>, swap it out.
 *        b. Otherwise, if the page has <nav class="navbar">, replace
 *           its inner contents with the canonical chrome.
 *   3. Injects the canonical footer the same way.
 *   4. Patches internal links that point at /academics/, /news/, or
 *      /downloads/ (those routes were removed) — they now jump to
 *      the in-page anchors (#combinations, #contact, etc.).
 *   5. Marks body.theme-loaded so theme.css's body-level rules win
 *      against any page-specific body styles.
 *
 * Pages that already have a fully-styled navbar/footer (e.g. index.html)
 * are unaffected unless they opt in via data-theme-nav="replace".
 */
(function () {
  'use strict';

  function init() {
    // ── 1. Resolve the current page for active-state highlighting ───
    var path = (location.pathname || '/').toLowerCase();
    var page = path === '/' || path.endsWith('/index.html')
      ? 'home'
      : path.match(/\/about\//)      ? 'about'
      : path.match(/\/academics\//)  ? 'academics'
      : path.match(/\/admissions\//) ? 'admissions'
      : path.match(/\/gallery\//)    ? 'gallery'
      : path.match(/\/staff\//)      ? 'staff'
      : path.match(/\/contact\//)    ? 'contact'
      : path.match(/\/app\/student-portal\//) ? 'student-portal'
      : path.match(/\/app\/teacher-portal\//) ? 'teacher-portal'
      : path.match(/\/app\/parent-portal\//)  ? 'parent-portal'
      : path.match(/\/app\/admin-dashboard\//)? 'admin-dashboard'
      : path.match(/\/student-dashboard\//)? 'student-dashboard'
      : path.match(/\/teacher-dashboard\//)? 'teacher-dashboard'
      : path.match(/\/parent-dashboard\//) ? 'parent-dashboard'
      : path.match(/\/admin-login\//) ? 'admin-login'
      : path.match(/\/teacher-login\//) ? 'teacher-login'
      : 'other';

    // ── 2. Compute root for relative links ───────────────────────────
    // Pages served from /app/X/index.html need root-anchored absolute
    // hrefs (`/`). Pages at the site root or in /about/, /gallery/, etc.
    // get '../'.
    var isAppPage = page.indexOf('app-') === 0
                 || page.indexOf('-dashboard') > -1
                 || page.indexOf('-portal') > -1
                 || page === 'admin-login'
                 || page === 'teacher-login';
    var isHome = (path === '/' || path.endsWith('/index.html'));
    var root = (isAppPage || isHome) ? '/' : '../';

    // ── 3. Build navbar HTML ─────────────────────────────────────────
    function navHTML() {
      var link = function (href, key, label) {
        var cls = (page === key) ? ' class="active"' : '';
        return '<li><a' + cls + ' href="' + href + '">' + label + '</a></li>';
      };
      return ''
        + '<a class="nav-logo" href="' + root + '">'
        +   '<img src="' + root + 'assets/images/logo.jpeg" alt="Kalinabiri SS">'
        +   '<span>Kalinabiri SS</span>'
        + '</a>'
        + '<ul class="nav-links" id="themeNavLinks">'
        +   link(root + '#hero',         'home', 'Home')
        +   link(root + '#about',        'about', 'About')
        +   link(root + 'staff/hods.html', 'staff', 'Staff')
        +   link(root + '#combinations', 'academics', 'Academics')
        +   link(root + 'gallery/',      'gallery', 'Gallery')
        +   link(root + '#contact',      'contact', 'Contact')
        + '</ul>'
        + '<a class="nav-cta" href="' + root + 'app/student-portal/">Student Portal</a>'
        + '<a class="nav-apply" href="' + root + 'admissions/">Apply Now</a>'
        + '<button class="mobile-menu-btn" aria-label="Toggle menu" type="button">'
        +   '<span></span><span></span><span></span>'
        + '</button>';
    }

    function footerHTML() {
      return ''
        + '&copy; 2026 <a href="' + root + '">Kalinabiri Secondary School</a> '
        + '&middot; Ntinda, Kampala, Uganda '
        + '&middot; Built with care by '
        + '<a href="https://fredscottsbulls.github.io/scottechx-site/" target="_blank" rel="noopener">ScottsTechX</a>';
    }

    // ── 4. Mount navbar ─────────────────────────────────────────────
    // Three strategies, in order of preference:
    //   a. <div data-theme-nav> placeholder — swap it out
    //   b. Existing <nav> on the page (any class) — replace its
    //      contents and add .theme-navbar so theme.css picks it up
    //   c. None of the above — fall through to the end; if the page
    //      had no nav at all, we still inject one but only when
    //      the page opts in via data-theme-nav="inject-anywhere".
    //      (We don't want to surprise pages that intentionally
    //      have no top nav.)
    var navPlaceholder = document.querySelector('[data-theme-nav]');
    if (navPlaceholder) {
      var nav = document.createElement('nav');
      nav.className = 'theme-navbar';
      nav.innerHTML = navHTML();
      navPlaceholder.replaceWith(nav);
    } else {
      // Match <nav class="navbar">, <nav class="desktop-nav">,
      // <nav id="navbar">, or any <nav> with no class at all.
      // We avoid matching <nav> elements that are clearly sub-navs
      // (e.g. inside <main> with class containing "sub" or "menu").
      var candidates = Array.prototype.slice.call(
        document.querySelectorAll('nav')
      ).filter(function (n) {
        if (n.closest('main, aside, article, .sidebar')) return false;
        return true;
      });
      // Prefer the first <nav> that looks like a top nav — has a
      // class hint (navbar, desktop-nav, mobile-nav) or is the
      // earliest <nav> in the body.
      var existingNav = candidates.find(function (n) {
        var cls = (n.className || '').toLowerCase();
        return /navbar|nav|menu|desktop/.test(cls);
      }) || candidates[0];
      if (existingNav) {
        existingNav.classList.add('theme-navbar');
        existingNav.innerHTML = navHTML();
      }
    }

    // ── 5. Mount footer (same pattern) ────────────────────────────────
    var footerPlaceholder = document.querySelector('[data-theme-footer]');
    if (footerPlaceholder) {
      var f = document.createElement('footer');
      f.className = 'theme-footer';
      f.innerHTML = footerHTML();
      footerPlaceholder.replaceWith(f);
    } else {
      var existingFooter = document.querySelector(
        'footer[data-theme-footer="replace"], footer.footer, footer'
      );
      if (existingFooter) {
        existingFooter.classList.add('kalinabiri-footer');
        existingFooter.innerHTML = footerHTML();
      }
    }

    // ── 6. Patch dead-route links ───────────────────────────────────
    var patches = {
      '/academics/':             '#combinations',
      '/academics/a-level.html': 'staff/hods.html',
      '/news/':                  '#contact',
      '/downloads/':             '#contact'
    };
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href) return;
      Object.keys(patches).forEach(function (dead) {
        if (href === dead || href.endsWith(dead)) {
          a.setAttribute('href', root + patches[dead]);
          a.setAttribute('title', 'Moved in-page');
        }
      });
    });

    // ── 7. Mark body.theme-loaded (CSS wins) ─────────────────────────
    if (document.body) document.body.classList.add('theme-loaded');
  }

  // ── 8. Mobile menu toggle (delegated, persistent) ─────────────────
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.mobile-menu-btn');
    if (!btn) return;
    var links = document.getElementById('themeNavLinks');
    if (links) links.classList.toggle('mobile-open');
  });

  // ── 9. Schedule init ──────────────────────────────────────────────
  // We used to run inline at <head>-parse-time, but that meant
  // document.querySelectorAll('a[href]') returned zero results
  // because the page's <body> hadn't been parsed yet — so the
  // dead-route patches silently did nothing, and the navbar
  // injection had no placeholder to find. Deferring to
  // DOMContentLoaded fixes both.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already ready — run straight away (rare: only when this
    // script is injected after DOMContentLoaded has fired).
    init();
  }
})();