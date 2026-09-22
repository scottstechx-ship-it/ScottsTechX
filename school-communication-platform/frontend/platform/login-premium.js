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

  // --- 3D TILT on the card (pointer/mouse devices only — on touch screens
  // the tilt shifts the card mid-tap and makes buttons hard to press) ------
  const card = document.querySelector('.card');
  const stage = document.querySelector('.stage');
  const isTouch = window.matchMedia && (window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches);
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (card && stage && !isTouch && !reducedMotion) {
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
  const form = document.getElementById('loginForm') || document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('login-err') || document.getElementById('formMessage');
    if (errBox) errBox.style.display = 'none';
    const btn = document.getElementById('login-btn') || document.getElementById('submitBtn');
    const labelTarget = btn && btn.querySelector ? (btn.querySelector('.btn-text') || btn) : null;
    const originalLabel = labelTarget ? labelTarget.textContent : '';
    if (btn) btn.disabled = true;
    if (btn) btn.classList && btn.classList.add('loading');
    if (labelTarget) labelTarget.textContent = 'Signing in…';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const rememberEl = document.getElementById('remember') || document.querySelector('input[name="remember"]');
    const remember = rememberEl ? rememberEl.checked : false;

    try {
      // The server sets an HttpOnly session cookie; nothing is stored in the
      // browser's localStorage (no token for scripts or extensions to steal).
      const data = await window.API.post('/api/auth/login', { username, password, remember });

      if (data.user && data.user.mustChangePassword) {
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
      location.href = '/platform/' + home + '/';
    } catch (err) {
      const message = err.message || 'Incorrect username or password.';
      if (errBox) {
        errBox.textContent = message;
        errBox.style.display = 'block';
        errBox.className = errBox.id === 'formMessage' ? 'form-message error' : errBox.className;
      }
      if (btn) btn.disabled = false;
      if (btn) btn.classList && btn.classList.remove('loading');
      if (labelTarget) labelTarget.textContent = originalLabel || 'Sign In';
    }
  });
})();