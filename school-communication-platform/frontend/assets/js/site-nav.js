/* ============================================================
 * KALINABIRI SS — UNIFIED NAVBAR (injected on every public page)
 * Renders a consistent, mobile-friendly navigation bar and drawer.
 * Highlights the current page automatically.
 * ============================================================ */
(function () {
  'use strict';

  var LINKS = [
    { href: '/',            icon: 'fa-home',           label: 'Home' },
    { href: '/about/',      icon: 'fa-school',         label: 'About' },
    { href: '/admissions/', icon: 'fa-pen-to-square',  label: 'Admissions' },
    { href: '/gallery/',    icon: 'fa-images',         label: 'Gallery' },
    { href: '/news/',       icon: 'fa-newspaper',      label: 'News' },
    { href: '/staff/',      icon: 'fa-users',          label: 'Staff' },
    { href: '/contact/',    icon: 'fa-envelope',       label: 'Contact' },
  ];

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
        '<i class="fas ' + l.icon + '" aria-hidden="true"></i><span>' + l.label + '</span></a></li>';
    }).join('');

    nav.innerHTML =
      '<a class="kn-brand" href="/" aria-label="Kalinabiri SS home">' +
        '<img src="/assets/images/logo.jpeg" alt="Kalinabiri SS logo" onerror="this.style.display=\'none\'">' +
        '<span class="kn-brand-txt"><span class="kn-brand-name">Kalinabiri SS</span><br><span class="kn-brand-sub">Ntinda, Kampala</span></span>' +
      '</a>' +
      '<ul class="kn-links">' + linksHtml + '</ul>' +
      '<div class="kn-actions">' +
        '<a class="kn-portal" href="/dashboard-access.html"><i class="fas fa-right-to-bracket" aria-hidden="true"></i> Portals</a>' +
        '<a class="kn-cta" href="/admissions/#application-form"><i class="fas fa-pen-to-square" aria-hidden="true"></i> Apply Now</a>' +
        '<button class="kn-burger" id="knBurger" aria-label="Open menu" aria-expanded="false" aria-controls="knDrawer">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
      '</div>';

    var drawer = document.createElement('div');
    drawer.className = 'kn-drawer';
    drawer.id = 'knDrawer';
    drawer.innerHTML = LINKS.map(function (l) {
      return '<a href="' + l.href + '"' + (isActive(l.href) ? ' class="active"' : '') + '>' +
        '<i class="fas ' + l.icon + '" aria-hidden="true"></i>' + l.label + '</a>';
    }).join('') +
      '<a class="kn-drawer-portal" href="/dashboard-access.html"><i class="fas fa-right-to-bracket" aria-hidden="true"></i> Portal Sign In</a>' +
      '<a class="kn-drawer-cta" href="/admissions/#application-form"><i class="fas fa-pen-to-square" aria-hidden="true"></i> Apply Now</a>';

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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
