/* ============================================================
 * KALINABIRI SS — ROLE LOGIN SHARED JS
 * - 3D parallax tilt on the card (mouse-driven)
 * - Subtle parallax on hero icons
 * - Login form submission via the unified API
 * ============================================================ */

(function () {
  'use strict';

  const ROLE_HOME = {
    super_admin: 'super-admin',
    admin: 'admin',
    teacher: 'teacher',
    student: 'student',
    parent: 'parent',
  };

  const ROLE_LABELS = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    teacher: 'Teacher',
    student: 'Student',
    parent: 'Parent/Guardian',
  };

  // --- 3D TILT on the card -------------------------------------------------
  const card = document.querySelector('.card');
  const stage = document.querySelector('.stage');

  if (card && stage) {
    // Mouse-driven tilt: rotates the card slightly based on cursor position.
    stage.addEventListener('mousemove', (e) => {
      const rect = stage.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;   // -0.5..0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform =
        `rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(0)`;
      // Also nudge the hero icon
      const icon = document.querySelector('.hero-icon');
      if (icon) icon.style.transform =
        `translate3d(${x * 18}px, ${y * 18}px, 0) rotateY(${x * 18}deg) rotateX(${-y * 18}deg)`;
    });
    stage.addEventListener('mouseleave', () => {
      card.style.transform = '';
      const icon = document.querySelector('.hero-icon');
      if (icon) icon.style.transform = '';
    });
  }

  // --- Demo account autofill ----------------------------------------------
  document.querySelectorAll('[data-demo]').forEach((b) => {
    b.addEventListener('click', () => {
      const [u, p] = b.dataset.demo.split('|');
      const uIn = document.getElementById('username');
      const pIn = document.getElementById('password');
      if (uIn) uIn.value = u;
      if (pIn) pIn.value = p;
      uIn.focus();
    });
  });

  // --- Login form submit --------------------------------------------------
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('login-err');
    errBox.style.display = 'none';
    const btn = document.getElementById('login-btn');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    // Resolve API base. Config.js is loaded as a separate file and exposes
    // window.APP_CONFIG.API_BASE_URL; the api.js wrapper uses API.base.
    const apiBase = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || (window.location.origin);

    try {
      const res = await fetch(apiBase.replace(/\/$/, '') + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Incorrect username or password.');
      }

      // Persist token/user for the dashboards to pick up.
      // The dashboards read scp_token / scp_user; the legacy keys are kept
      // for older pages (shared/communication-center.js etc.).
      localStorage.setItem('scp_token', data.token);
      localStorage.setItem('scp_user', JSON.stringify(data.user));
      localStorage.setItem('kalinabiri_token', data.token);
      localStorage.setItem('kalinabiri_user', JSON.stringify(data.user));

      if (data.user.mustChangePassword) {
        location.href = '/platform/set-password.html';
        return;
      }

      const requestedRole = new URLSearchParams(location.search).get('role');
      if (requestedRole && requestedRole !== data.user.role) {
        throw new Error(
          'This account is ' +
            (ROLE_LABELS[data.user.role] || data.user.role) +
            ', not ' +
            (ROLE_LABELS[requestedRole] || requestedRole) +
            '. Use the correct portal.'
        );
      }

      const home = ROLE_HOME[data.user.role] || 'student';
      location.href = '/' + home + '/';
    } catch (err) {
      errBox.textContent = err.message || 'Incorrect username or password.';
      errBox.style.display = 'block';
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });
})();