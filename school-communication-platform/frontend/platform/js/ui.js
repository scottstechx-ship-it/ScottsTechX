/**
 * Shared UI helpers: layout (sidebar + topbar + bell + user menu), toasts,
 * modals, formatting, notification polling and the mobile bottom nav.
 */
(function () {
  const API = window.API;
  const BASE = API.base;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  /** Parse HTML into a DocumentFragment (keeps ALL top-level nodes). */
  function frag(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content;
  }

  function initials(name) {
    return (name || '?').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }

  /** Authenticated avatar URL for a user, or null when none is set. */
  function avatarUrl(user) {
    if (user && user.profilePicture) {
      return `${API.base}/api/users/${user.id}/avatar?ts=${Date.now()}`;
    }
    return null;
  }

  /** Public URL of the school logo (404 when not uploaded yet). */
  function logoUrl() {
    return `${API.base}/api/settings/logo`;
  }

  /**
   * Fill a logo container with the school logo image, falling back to the
   * 🎓 mark when no logo is set or the file cannot load.
   */
  function applySchoolLogo(container) {
    if (!container) return;
    const img = new Image();
    img.onload = () => {
      container.innerHTML = '';
      container.classList.add('has-logo');
      container.appendChild(img);
    };
    img.onerror = () => {
      container.textContent = '🎓';
    };
    img.src = logoUrl() + '?t=' + Date.now();
    img.alt = 'School logo';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
  }

  /** Avatar element: <img> when the user has a photo, initials otherwise. */
  function avatar(user, size = 34, cls = 'avatar') {
    const url = avatarUrl(user);
    const style = size ? `style="width:${size}px;height:${size}px"` : '';
    if (url) {
      return `<div class="${cls}" ${style} style="overflow:hidden;${size ? `width:${size}px;height:${size}px;` : ''}"><img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`;
    }
    return `<div class="${cls}" ${style}>${esc(initials(user ? user.fullName : '?'))}</div>`;
  }

  function timeAgo(iso) {
    if (!iso) return '';
    const d = new Date(iso.replace(' ', 'T') + (iso.includes('T') ? '' : 'Z'));
    const secs = Math.floor((Date.now() - d.getTime()) / 1000);
    if (isNaN(secs) || secs < 0) return '';
    if (secs < 60) return 'just now';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
    if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
    if (secs < 604800) return Math.floor(secs / 86400) + 'd ago';
    return d.toLocaleDateString();
  }

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso.replace(' ', 'T') + (iso.includes('T') ? '' : 'Z'));
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso.replace(' ', 'T') + (iso.includes('T') ? '' : 'Z'));
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  /** Debounce a function (used for search inputs). */
  function debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /** Simple currency formatting (UGX). */
  function money(n) {
    const v = Number(n || 0);
    return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  /** Lightweight SVG bar chart — no external chart library needed. */
  function barChart(container, data, { color = 'var(--primary)', height = 140, format = (v) => v } = {}) {
    container.innerHTML = '';
    if (!data || !data.length) {
      container.innerHTML = '<div class="doc-meta">No data yet.</div>';
      return;
    }
    const max = Math.max(...data.map((d) => d.value), 1);
    const pad = 4;
    const labelH = 22;
    const chartH = height - labelH;
    const totalW = container.clientWidth || 480;
    const bw = Math.max(8, Math.min(46, (totalW - pad * data.length) / data.length));
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${Math.max(totalW, data.length * (bw + pad))} ${height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Bar chart');
    data.forEach((d, i) => {
      const h = Math.max(2, (d.value / max) * chartH);
      const x = i * (bw + pad) + pad / 2;
      const y = chartH - h;
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(bw));
      rect.setAttribute('height', String(h));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', color);
      rect.setAttribute('data-value', String(d.value));
      rect.setAttribute('data-label', esc(d.label || ''));
      const title = document.createElementNS(svgNS, 'title');
      title.textContent = `${d.label}: ${format(d.value)}`;
      rect.appendChild(title);
      svg.appendChild(rect);
      const tx = document.createElementNS(svgNS, 'text');
      tx.setAttribute('x', String(x + bw / 2));
      tx.setAttribute('y', String(height - 6));
      tx.setAttribute('text-anchor', 'middle');
      tx.setAttribute('font-size', '9');
      tx.setAttribute('fill', 'var(--muted)');
      tx.textContent = String(d.label).length > 8 ? String(d.label).slice(0, 7) + '…' : String(d.label);
      svg.appendChild(tx);
    });
    container.appendChild(svg);
  }

  // ---------------- toasts ----------------
  function toast(msg, type = 'info') {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const icons = { success: '✅', error: '⚠️', warning: '⚠️', info: 'ℹ️' };
    const t = el(`<div class="toast ${type}"><span>${icons[type] || ''}</span><span>${esc(msg)}</span></div>`);
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, 3800);
  }

  // ---------------- modal ----------------
  function openModal({ title, body, foot, wide = false, onClose }) {
    const backdrop = el(`<div class="modal-backdrop">
      <div class="modal ${wide ? 'wide' : ''}">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="close-x" data-close>✕</button></div>
        <div class="modal-body"></div>
        ${foot ? '<div class="modal-foot"></div>' : ''}
      </div></div>`);
    backdrop.querySelector('.modal-body').appendChild(typeof body === 'string' ? frag(body) : body);
    if (foot) backdrop.querySelector('.modal-foot').appendChild(typeof foot === 'string' ? frag(foot) : foot);
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('open'));
    function close() {
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), 180);
      if (onClose) onClose();
    }
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-close]')) close();
    });
    return { backdrop, close };
  }

  function confirmDialog(message, { title = 'Are you sure?', danger = true, confirmText = 'Confirm' } = {}) {
    return new Promise((resolve) => {
      const m = openModal({
        title,
        body: `<p>${esc(message)}</p>`,
        foot: `<button class="btn secondary" data-no>Cancel</button>
               <button class="btn ${danger ? 'danger' : ''}" data-yes>${esc(confirmText)}</button>`,
        onClose: () => resolve(false),
      });
      m.backdrop.querySelector('[data-no]').onclick = () => m.close();
      m.backdrop.querySelector('[data-yes]').onclick = () => { m.close(); resolve(true); };
    });
  }

  // ---------------- notification polling ----------------
  let unreadCallbacks = [];
  function onUnreadChange(cb) { unreadCallbacks.push(cb); }
  function notifyUnread() { unreadCallbacks.forEach((cb) => cb && cb()); }

  async function refreshUnreadCounts() {
    try {
      const [msgs, notif] = await Promise.all([
        API.get('/api/messages/unread-count'),
        API.get('/api/notifications/unread-count'),
      ]);
      window.__unread = { messages: msgs.unread || 0, notifications: notif.unread || 0 };
      notifyUnread();
    } catch { /* ignore */ }
  }

  async function loadNotifications() {
    try {
      const data = await API.get('/api/notifications?limit=25');
      return data.notifications || [];
    } catch { return []; }
  }

  // ---------------- layout ----------------
  const ROLE_PATHS = { super_admin: 'super-admin', admin: 'admin', teacher: 'teacher', student: 'student', parent: 'parent' };

  /**
   * Build the app shell.
   * nav: [{key, label, icon, section}]
   * bottomNav: [{key, label, icon}]
   */
  async function initLayout({ nav, bottomNav = null, title, onNav }) {
    const user = API.getUser();
    const rolePath = ROLE_PATHS[user.role] || 'student';

    // sidebar
    const sidebar = el(`<aside class="sidebar">
      <div class="brand">
        <div class="logo" id="brand-logo">🎓</div>
        <div>
          <div class="name" id="school-name">School</div>
          <div class="role-tag">${esc(user.role.replace('_', ' '))} portal</div>
        </div>
      </div>
      <nav id="side-nav"></nav>
      <div class="sidebar-foot">Demo build · v1.0</div>
    </aside>`);
    const navWrap = sidebar.querySelector('#side-nav');
    let lastSection = null;
    for (const item of nav) {
      if (item.section !== lastSection) {
        lastSection = item.section;
        navWrap.appendChild(el(`<div class="nav-section">${esc(item.section)}</div>`));
      }
      navWrap.appendChild(el(
        `<button class="nav-item" data-nav="${esc(item.key)}"><span class="ic">${item.icon}</span><span>${esc(item.label)}</span><span class="badge" data-nav-badge="${esc(item.key)}" style="display:none"></span></button>`
      ));
    }

    // topbar
    const topbar = el(`<div class="topbar">
      <button class="hamburger" id="hamburger">☰</button>
      <div class="page-title" id="page-title">${esc(title || 'Dashboard')}</div>
      <div class="spacer"></div>
      <div class="dropdown" id="notif-drop">
        <button class="icon-btn" id="notif-btn">🔔<span class="count-dot" id="notif-dot" style="display:none">0</span></button>
        <div class="dropdown-menu" id="notif-menu"></div>
      </div>
      <div class="dropdown" id="user-drop">
        <button class="user-chip" id="user-chip">
          <div class="avatar">${esc(initials(user.fullName))}</div>
          <div class="meta">
            <div class="u-name">${esc(user.fullName)}</div>
            <div class="u-role">${esc(user.role.replace('_', ' '))}</div>
          </div>
        </button>
        <div class="user-menu" id="user-menu">
          <div class="um-head"><strong>${esc(user.fullName)}</strong><br><small>${esc(user.email || '')}</small></div>
          <button class="um-item" data-um="profile">👤 My profile</button>
          <button class="um-item" data-um="photo">📷 Change photo</button>
          <button class="um-item" data-um="theme">🌓 Theme: <span id="um-theme-label">System</span></button>
          <button class="um-item" data-um="password">🔑 Change password</button>
          <button class="um-item" data-um="notifications">🔔 Notifications</button>
          <button class="um-item danger" data-um="logout">🚪 Log out</button>
        </div>
      </div>
    </div>`);

    const layout = el(`<div class="layout"></div>`);
    const main = el(`<main class="main"></main>`);
    const content = el(`<div class="content" id="content"></div>`);
    main.appendChild(topbar);
    main.appendChild(content);
    layout.appendChild(sidebar);
    layout.appendChild(main);
    document.body.appendChild(layout);

    // bottom nav
    if (bottomNav && window.innerWidth <= 768) {
      const bn = el('<div class="bottom-nav" id="bottom-nav"></div>');
      for (const item of bottomNav) {
        bn.appendChild(el(`<button class="bn-item" data-bn="${esc(item.key)}"><span class="ic">${item.icon}</span><span>${esc(item.label)}</span><span class="bn-badge" data-bn-badge="${esc(item.key)}" style="display:none"></span></button>`));
      }
      document.body.appendChild(bn);
      bn.querySelectorAll('.bn-item').forEach((b) => b.addEventListener('click', () => {
        onNav(b.dataset.bn);
        content.scrollTop = 0;
      }));
    }

    // events
    sidebar.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => {
      onNav(b.dataset.nav);
      sidebar.classList.remove('open');
    }));
    topbar.querySelector('#hamburger').onclick = () => sidebar.classList.toggle('open');

    // render avatar image if the user has a photo
    const chipAvatar = topbar.querySelector('#user-chip .avatar');
    const avUrl = avatarUrl(user);
    if (avUrl) {
      chipAvatar.innerHTML = `<img src="${avUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    }

    topbar.querySelector('#user-chip').onclick = (e) => {
      e.stopPropagation();
      topbar.querySelector('#user-menu').classList.toggle('open');
      topbar.querySelector('#notif-drop').classList.remove('open');
    };
    topbar.querySelector('#notif-btn').onclick = (e) => {
      e.stopPropagation();
      topbar.querySelector('#notif-drop').classList.toggle('open');
      topbar.querySelector('#user-menu').classList.remove('open');
      if (topbar.querySelector('#notif-drop').classList.contains('open')) renderNotifications();
    };
    document.addEventListener('click', () => {
      topbar.querySelector('#user-menu').classList.remove('open');
      topbar.querySelector('#notif-drop').classList.remove('open');
    });

    topbar.querySelector('#user-menu').querySelector('[data-um="logout"]').onclick = async () => {
      try { await API.post('/api/auth/logout'); } catch {}
      API.logout();
    };
    topbar.querySelector('#user-menu').querySelector('[data-um="password"]').onclick = () => openChangePassword();
    topbar.querySelector('#user-menu').querySelector('[data-um="photo"]').onclick = () => openAvatarUpload();

    // theme switcher: cycles System -> Light -> Dark
    const themeLabel = topbar.querySelector('#um-theme-label');
    const refreshThemeLabel = () => { if (themeLabel) themeLabel.textContent = (window.Theme.current() || 'system').replace(/^\w/, (c) => c.toUpperCase()); };
    refreshThemeLabel();
    document.addEventListener('theme:changed', refreshThemeLabel);
    topbar.querySelector('#user-menu').querySelector('[data-um="theme"]').onclick = () => {
      const order = ['system', 'light', 'dark'];
      const next = order[(order.indexOf(window.Theme.current()) + 1) % order.length];
      window.Theme.set(next);
      refreshThemeLabel();
      UI.toast(`Theme: ${next}`, 'info');
    };
    topbar.querySelector('#user-menu').querySelector('[data-um="profile"]').onclick = () => onNav('profile');
    topbar.querySelector('#user-menu').querySelector('[data-um="notifications"]').onclick = () => onNav('notifications');

    // school name + logo
    try {
      const s = await API.get('/api/settings/public');
      if (s.school && s.school.name) {
        sidebar.querySelector('#school-name').textContent = s.school.name;
        document.title = s.school.name + ' — ' + (user.role.replace('_', ' '));
      }
    } catch { /* keep default */ }
    applySchoolLogo(sidebar.querySelector('#brand-logo'));

    // notification polling loop
    refreshUnreadCounts();
    setInterval(refreshUnreadCounts, 30000);

    return {
      content,
      setTitle: (t) => { topbar.querySelector('#page-title').textContent = t; },
      setActive: (key) => {
        sidebar.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.nav === key));
        document.querySelectorAll('.bn-item').forEach((b) => b.classList.toggle('active', b.dataset.bn === key));
      },
      setBadge: (key, count) => {
        const b = sidebar.querySelector(`[data-nav-badge="${key}"]`);
        const bb = document.querySelector(`[data-bn-badge="${key}"]`);
        const show = count > 0;
        for (const node of [b, bb]) {
          if (!node) continue;
          node.style.display = show ? 'inline-flex' : 'none';
          node.textContent = count > 99 ? '99+' : count;
        }
      },
      sidebar,
    };
  }

  async function renderNotifications() {
    const menu = document.querySelector('#notif-menu');
    if (!menu) return;
    const items = await loadNotifications();
    const icons = { message: '💬', document: '📄', announcement: '📢', system: '🔔', account: '🔐' };
    if (!items.length) {
      menu.innerHTML = `<div class="empty-state" style="padding:30px"><div class="big">🔕</div>No notifications yet</div>`;
      return;
    }
    menu.innerHTML = `<div style="padding:12px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <strong>Notifications</strong>
        <button class="btn ghost sm" id="mark-all">Mark all read</button></div>`;
    for (const n of items) {
      menu.appendChild(el(`<div class="notif-item ${n.read ? '' : 'unread'}" data-nid="${n.id}" data-link="${esc(n.link || '')}">
        <span class="n-ic">${icons[n.type] || '🔔'}</span>
        <div><div class="n-title">${esc(n.title)}</div>
        ${n.body ? `<div class="n-body">${esc(n.body)}</div>` : ''}
        <div class="n-time">${timeAgo(n.created_at)}</div></div></div>`));
    }
    menu.querySelectorAll('.notif-item').forEach((item) => item.addEventListener('click', async () => {
      const id = item.dataset.nid;
      const link = item.dataset.link;
      try { await API.put(`/api/notifications/${id}/read`); } catch {}
      item.classList.remove('unread');
      refreshUnreadCounts();
      if (link) navigateToLink(link);
    }));
    menu.querySelector('#mark-all').onclick = async () => {
      try { await API.put('/api/notifications/read-all'); } catch {}
      menu.querySelectorAll('.notif-item').forEach((i) => i.classList.remove('unread'));
      refreshUnreadCounts();
    };
  }

  function navigateToLink(link) {
    // links are internal routes like "/messages" or "/documents"
    const handler = window.__navHandler;
    if (handler && typeof handler === 'function') handler(link.replace(/^\//, ''));
  }

  // ---------------- profile picture ----------------
  function openAvatarUpload() {
    const input = el('<input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/bmp" hidden>');
    document.body.appendChild(input);
    input.click();
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) return toast('Image is too large. Maximum is 2 MB.', 'error');
      const form = new FormData();
      form.append('file', file);
      try {
        const r = await API.upload('/api/auth/profile-picture', form);
        const updated = r.user || null;
        if (updated) API.setUser(updated);
        toast('Profile picture updated.', 'success');
        location.reload();
      } catch (e) { toast(e.message, 'error'); }
    };
  }

  // ---------------- preferences panel (theme + notifications) ----------------
  const NOTIF_KEYS = [
    ['newMessage', 'New messages'],
    ['newDocument', 'New documents'],
    ['newAnnouncement', 'Announcements'],
    ['assignments', 'Assignments & deadlines'],
    ['attendance', 'Attendance alerts'],
    ['exams', 'Exam announcements'],
    ['results', 'Results & grades'],
    ['fees', 'Fee updates'],
    ['importantNotices', 'Important notices'],
    ['accountChanges', 'Account changes'],
  ];

  /**
   * Render the personal settings panel (theme + notification toggles) into a
   * container and wire it up. Used by every dashboard's Profile view.
   */
  async function profileSettingsPanel(container) {
    let prefs = { theme: 'system', notifPrefs: {} };
    try { prefs = (await API.get('/api/auth/preferences')).preferences; } catch {}

    container.innerHTML = `
      <div class="card">
        <h3>🌓 Appearance</h3>
        <p class="doc-meta">Choose how the platform looks. Your choice is saved and follows you on every device.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="chip" data-theme-opt="system">System</button>
          <button class="chip" data-theme-opt="light">☀️ Light</button>
          <button class="chip" data-theme-opt="dark">🌙 Dark</button>
        </div>
      </div>
      <div class="card">
        <h3>🔔 Notification preferences</h3>
        <p class="doc-meta">Choose which notifications you receive. The school can also set defaults.</p>
        <div id="notif-prefs-list"></div>
        <button class="btn" id="prefs-save" style="margin-top:12px">💾 Save preferences</button>
      </div>`;

    const themeOpts = container.querySelectorAll('[data-theme-opt]');
    const refresh = () => themeOpts.forEach((b) => b.classList.toggle('active', b.dataset.themeOpt === window.Theme.current()));
    refresh();
    themeOpts.forEach((b) => b.addEventListener('click', () => { window.Theme.set(b.dataset.themeOpt); refresh(); }));

    const list = container.querySelector('#notif-prefs-list');
    for (const [key, label] of NOTIF_KEYS) {
      list.appendChild(el(`<div class="list-row"><span class="k">${esc(label)}</span>
        <input type="checkbox" data-np="${key}" ${prefs.notifPrefs[key] !== false ? 'checked' : ''} style="width:auto;margin:0"></div>`));
    }
    container.querySelector('#prefs-save').onclick = async () => {
      const notifPrefs = {};
      list.querySelectorAll('[data-np]').forEach((i) => { notifPrefs[i.dataset.np] = i.checked; });
      try {
        await API.put('/api/auth/preferences', { theme: window.Theme.current(), notifPrefs });
        toast('Preferences saved.', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };
  }

  // ---------------- change password / profile ----------------
  function openChangePassword() {
    openModal({
      title: 'Change password',
      body: `<label class="field">Current password<input type="password" id="pw-current" autocomplete="current-password"></label>
             <label class="field">New password<input type="password" id="pw-new" autocomplete="new-password"></label>
             <label class="field">Confirm new password<input type="password" id="pw-confirm" autocomplete="new-password"></label>`,
      foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Update password</button>`,
    }).then((m) => {
      m.backdrop.querySelector('[data-cancel]').onclick = () => m.close();
      m.backdrop.querySelector('[data-save]').onclick = async () => {
        const cur = m.backdrop.querySelector('#pw-current').value;
        const nw = m.backdrop.querySelector('#pw-new').value;
        const cf = m.backdrop.querySelector('#pw-confirm').value;
        if (nw !== cf) return toast('New passwords do not match.', 'error');
        try {
          await API.put('/api/auth/change-password', { currentPassword: cur, newPassword: nw });
          toast('Password updated successfully.', 'success');
          m.close();
        } catch (e) { toast(e.message, 'error'); }
      };
    });
  }

  // expose
  window.UI = {
    esc, el, initials, avatar, avatarUrl, logoUrl, applySchoolLogo,
    timeAgo, fmtTime, fmtDate, fmtSize,
    debounce, money, barChart,
    toast, openModal, confirmDialog,
    initLayout, refreshUnreadCounts, loadNotifications,
    onUnreadChange, openChangePassword, openAvatarUpload, profileSettingsPanel,
  };
})();
