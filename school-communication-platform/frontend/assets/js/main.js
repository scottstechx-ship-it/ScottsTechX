/* ================================================================
   KALINABIRI SECONDARY SCHOOL — Main JavaScript
   Developed by ScottsTechX | Fred Scotts
   ============================================================ */

// ── CONFIG ────────────────────────────────────────────────────────
// API base URL. Relative path so the same code works:
//  - On Netlify: /api/* is rewritten to /.netlify/functions/api/* which
//    proxies to Railway with stale-cache fallback.
//  - On localhost: serve the function locally or point directly at the
//    backend with a full URL.
const API_BASE = '/api';

// ── PARTICLES ─────────────────────────────────────────────────────
function initParticles(containerId, count = 30) {
  const container = document.getElementById(containerId);
  if (!container) return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'hero-particle';
    const size = Math.random() * 4 + 1;
    p.style.cssText = `
      width:${size}px;height:${size}px;
      left:${Math.random() * 100}%;
      animation-duration:${Math.random() * 15 + 10}s;
      animation-delay:${Math.random() * 10}s;
      opacity:${Math.random() * 0.5 + 0.2};
    `;
    container.appendChild(p);
  }
}

// ── NAVBAR ────────────────────────────────────────────────────────
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  });

  const toggle = document.getElementById('mobileToggle');
  const navLinks = document.getElementById('navLinks');
  if (toggle && navLinks) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      navLinks.classList.toggle('active');
    });
  }

  // Dark/light mode
  const modeToggle = document.getElementById('modeToggle');
  if (modeToggle) {
    modeToggle.addEventListener('click', () => {
      document.body.classList.toggle('light-mode');
      const isLight = document.body.classList.contains('light-mode');
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
      modeToggle.textContent = isLight ? '🌙' : '☀️';
    });
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      document.body.classList.add('light-mode');
      modeToggle.textContent = '🌙';
    }
  }
}

// ── SCROLL REVEAL ─────────────────────────────────────────────────
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  reveals.forEach(el => observer.observe(el));
}

// ── COUNTER ANIMATION ─────────────────────────────────────────────
function initCounters() {
  const counters = document.querySelectorAll('.counter-number, .hero-stat-number, .stat-card-content h3, .counter');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const attrTarget = parseInt(el.getAttribute('data-target'), 10);
        const text = el.textContent;
        const target = !isNaN(attrTarget) && attrTarget > 0
          ? attrTarget
          : (parseInt(text.replace(/[^0-9]/g, ''), 10) || 0);
        const suffix = (text.match(/[^\d.,]/g) || []).join('');
        if (target === 0) return;
        let current = 0;
        const increment = target / 60;
        const timer = setInterval(() => {
          current += increment;
          if (current >= target) { current = target; clearInterval(timer); }
          el.textContent = Math.floor(current).toLocaleString() + suffix;
        }, 25);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  counters.forEach(c => observer.observe(c));
}

// ── ACCORDION ─────────────────────────────────────────────────────
function initAccordions() {
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const wasOpen = item.classList.contains('open');
      // Close all
      document.querySelectorAll('.accordion-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });
}

// ── TABS ──────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('[data-tabs]').forEach(tabGroup => {
    const buttons = tabGroup.querySelectorAll('[data-tab]');
    const panels = document.querySelectorAll('[data-tab-panel]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        panels.forEach(p => {
          p.style.display = p.dataset.tabPanel === target ? 'block' : 'none';
        });
      });
    });
  });
}

// ── TOAST NOTIFICATIONS ────────────────────────────────────────────
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ── API HELPERS ────────────────────────────────────────────────────
async function apiCall(endpoint, options = {}) {
  const token = sessionStorage.getItem('kalibz_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  } catch (e) {
    showToast(e.message, 'error');
    throw e;
  }
}

// ── AUTH HELPERS ────────────────────────────────────────────────────
function getUser() {
  try {
    const userData = sessionStorage.getItem('kalibz_user');
    return userData ? JSON.parse(userData) : null;
  } catch { return null; }
}

function isLoggedIn() {
  return !!sessionStorage.getItem('kalibz_token');
}

function logout() {
  sessionStorage.removeItem('kalibz_token');
  sessionStorage.removeItem('kalibz_user');
  sessionStorage.removeItem('kalibz_role');
  window.location.href = '../admin-login/index.html';
}

// ── LOGIN ──────────────────────────────────────────────────────────
async function handleLogin(e, role = 'student') {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const origText = btn.textContent;
  btn.disabled = true; btn.textContent = 'Signing in...';

  const username = form.querySelector('[name="username"]')?.value;
  const password = form.querySelector('[name="password"]')?.value;

  try {
    const data = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    sessionStorage.setItem('kalibz_token', data.token);
    sessionStorage.setItem('kalibz_user', JSON.stringify(data.user));
    sessionStorage.setItem('kalibz_role', role);

    showToast('Login successful!', 'success');
    setTimeout(() => {
      if (role === 'admin') window.location.href = '../admin-dashboard/index.html';
      else if (role === 'teacher') window.location.href = '../teacher-dashboard/index.html';
      else window.location.href = '../student-dashboard/index.html';
    }, 800);
  } catch {
    btn.disabled = false; btn.textContent = origText;
  }
}

// ── GALLERY FILTER ─────────────────────────────────────────────────
function initGalleryFilter() {
  document.querySelectorAll('.gallery-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.category;
      document.querySelectorAll('.gallery-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.gallery-item').forEach(item => {
        item.style.display = !category || item.dataset.category === category ? 'block' : 'none';
      });
    });
  });
}

// ── NEWS FILTER ────────────────────────────────────────────────────
function initNewsFilter() {
  document.querySelectorAll('.news-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.category;
      document.querySelectorAll('.news-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.news-card').forEach(card => {
        card.style.display = !category || card.dataset.category === category ? 'flex' : 'none';
      });
    });
  });
}

// ── MARQUEE ────────────────────────────────────────────────────────
function initMarquee() {
  const marqueeContent = document.querySelector('.marquee-inner');
  if (marqueeContent) {
    const items = marqueeContent.innerHTML;
    marqueeContent.innerHTML = items + items;
  }
}

// ── PROGRESS BARS ─────────────────────────────────────────────────
function initProgressBars() {
  const bars = document.querySelectorAll('.progress-fill');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const bar = entry.target;
        const width = bar.dataset.width || '0%';
        bar.style.width = width;
        observer.unobserve(bar);
      }
    });
  }, { threshold: 0.2 });
  bars.forEach(bar => observer.observe(bar));
}

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initScrollReveal();
  initCounters();
  initAccordions();
  initTabs();
  initGalleryFilter();
  initNewsFilter();
  initMarquee();
  initProgressBars();
  initParticles('heroParticles', 30);
  initParticles('particles', 15);

  // Form handlers
  document.querySelectorAll('form').forEach(form => {
    const isLogin = form.closest('.login-card') || form.id === 'loginForm';
    if (isLogin) {
      form.addEventListener('submit', e => handleLogin(e, getRoleFromForm(form)));
    } else {
      form.addEventListener('submit', e => {
        e.preventDefault();
        showToast('Thank you! We will get back to you within 24 hours.', 'success');
        form.reset();
      });
    }
  });
});

function getRoleFromForm(form) {
  const card = form.closest('.login-card');
  if (!card) return 'student';
  const title = card.querySelector('h1')?.textContent?.toLowerCase() || '';
  if (title.includes('admin')) return 'admin';
  if (title.includes('teacher')) return 'teacher';
  return 'student';
}

// ── DARK / LIGHT TOGGLE (exposed globally) ────────────────────────
window.showToast = showToast;
window.apiCall = apiCall;
window.getUser = getUser;
window.isLoggedIn = isLoggedIn;
window.logout = logout;
