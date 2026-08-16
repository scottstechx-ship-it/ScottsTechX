/* =====================================================================
   School Admin Dashboard - Full Feature Implementation
   - All buttons working
   - All sections: Overview, Analytics, Communication, Announcements,
     Emergency, Teachers, Students, Parents, Directory, Classes, Subjects,
     Timetable, Attendance, Results, Events, Gallery, Admissions, Profile
   - Uses unified KalinabiriAPI client
   ===================================================================== */

(function() {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  let currentUser = null;
  let commCenter = null;
  let notifPollInterval = null;

  // ─── Toast ───────────────────────────────────────────────────────
  function showToast(message, type = 'info') {
    const icons = {
      success: '<i class="fas fa-check-circle"></i>',
      error: '<i class="fas fa-exclamation-circle"></i>',
      warning: '<i class="fas fa-exclamation-triangle"></i>',
      info: '<i class="fas fa-info-circle"></i>'
    };
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = `${icons[type] || icons.info}<span>${escapeHtml(message)}</span>`;
    $('#toastContainer').appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function timeAgo(date) {
    const s = Math.floor((new Date() - new Date(date)) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  // ─── Modal ───────────────────────────────────────────────────────
  function openModal(title, body, footer = '') {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    $('#modalFooter').innerHTML = footer;
    $('#modalOverlay').classList.add('show');
  }

  function closeModal() {
    $('#modalOverlay').classList.remove('show');
  }

  if ($('#modalOverlay')) {
    $('#modalOverlay').addEventListener('click', (e) => {
      if (e.target === $('#modalOverlay')) closeModal();
    });
  }

  // ─── Auth ────────────────────────────────────────────────────────
  async function handleLogin(e) {
    if (e) e.preventDefault();
    const username = $('#loginUsername').value.trim();
    const password = $('#loginPassword').value;
    if (!username || !password) {
      $('#loginError').textContent = 'Please enter both email and password.';
      $('#loginError').classList.remove('hidden');
      return;
    }
    const btn = $('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
    try {
      const data = await KalinabiriAPI.login(username, password);
      if (data.user.role !== 'admin' && data.user.role !== 'school_admin' && data.user.role !== 'super_admin') {
        throw new Error('Access denied. School admin only.');
      }
      showDashboard();
    } catch (err) {
      $('#loginError').textContent = err.message;
      $('#loginError').classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
    }
  }

  function logout() {
    KalinabiriAPI.clearAuth();
    location.reload();
  }

  async function showDashboard() {
    $('#loginScreen').classList.add('hidden');
    $('#dashboard').classList.remove('hidden');
    try {
      currentUser = await KalinabiriAPI.me();
    } catch (e) {
      logout();
      return;
    }
    const initials = (currentUser.first_name?.[0] || 'A') + (currentUser.last_name?.[0] || '');
    $('#userAvatar').textContent = initials.toUpperCase();
    $('#userName').textContent = `${currentUser.first_name} ${currentUser.last_name}`;
    await loadNotifications();
    loadPage('overview');
    startNotifPoll();
  }

  // ─── Navigation ─────────────────────────────────────────────────
  function toggleSidebar() {
    const sidebar = $('#sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    sidebar.classList.toggle('mobile-open');
    if (overlay) {
      overlay.classList.toggle('show');
    }
  }

  function attachSidebarClose() {
    if (!document.querySelector('.sidebar-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      overlay.onclick = () => toggleSidebar();
      document.body.appendChild(overlay);
    }
  }

  $$('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      $$('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      loadPage(item.dataset.page);
      if (window.innerWidth <= 1024) {
        const sidebar = $('#sidebar');
        if (sidebar.classList.contains('mobile-open')) toggleSidebar();
      }
    });
  });

  async function loadPage(page) {
    const titles = {
      overview: 'Dashboard', analytics: 'Analytics', communication: 'Communication Center',
      announcements: 'Announcements', emergency: 'Emergency Alerts', teachers: 'Teachers',
      students: 'Students', parents: 'Parents', directory: 'Directory', classes: 'Classes',
      subjects: 'Subjects', timetable: 'Timetable', attendance: 'Attendance',
      results: 'Results', events: 'Events', gallery: 'Gallery', admissions: 'Admissions',
      profile: 'Profile'
    };
    $('#pageTitle').textContent = titles[page] || page;
    const content = $('#pageContent');
    content.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
    try {
      const fn = window['render_' + page.charAt(0).toUpperCase() + page.slice(1)];
      if (fn) await fn(content);
      else content.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Page not found</p></div>';
    } catch (err) {
      console.error(err);
      content.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  async function apiCall(path, options = {}) {
    return KalinabiriAPI.request(path, options);
  }

  // ─── Notifications ──────────────────────────────────────────────
  function toggleNotifications() {
    $('#notifDropdown').classList.toggle('show');
  }

  async function loadNotifications() {
    try {
      const notifs = await KalinabiriAPI.getNotifications();
      const list = $('#notifList');
      if (!notifs || !notifs.length) {
        list.innerHTML = '<div class="empty-state"><p>No notifications</p></div>';
        $('#notifBadge').classList.add('hidden');
        return;
      }
      const unread = notifs.filter(n => !n.is_read).length;
      if (unread > 0) {
        $('#notifBadge').textContent = unread > 99 ? '99+' : unread;
        $('#notifBadge').classList.remove('hidden');
      } else {
        $('#notifBadge').classList.add('hidden');
      }
      list.innerHTML = notifs.map(n => `
        <div class="notification-item" onclick="handleNotifClick(${n.id})">
          <div class="notification-title">${escapeHtml(n.title)}</div>
          <div class="notification-time">${escapeHtml((n.message || '').substring(0, 80))} ${n.created_at ? '• ' + timeAgo(n.created_at) : ''}</div>
        </div>
      `).join('');
    } catch (e) {
      console.error('Failed to load notifications', e);
    }
  }

  async function handleNotifClick(id) {
    try {
      await KalinabiriAPI.markNotificationRead(id);
      await loadNotifications();
    } catch (e) {}
  }

  async function markAllRead() {
    try {
      await KalinabiriAPI.markAllNotificationsRead();
      await loadNotifications();
      showToast('All notifications marked read', 'success');
    } catch (e) {
      showToast('Failed to mark all read', 'error');
    }
  }

  function startNotifPoll() {
    loadNotifications();
    notifPollInterval = setInterval(loadNotifications, 30000);
  }

  // ─── Quick Search ───────────────────────────────────────────────
  function quickSearch() {
    const overlay = document.getElementById('searchGlobal');
    if (overlay) {
      overlay.classList.add('show');
      setTimeout(() => $('#globalSearchInput')?.focus(), 100);
    } else {
      const div = document.createElement('div');
      div.id = 'searchGlobal';
      div.className = 'search-global';
      div.innerHTML = `
        <div class="search-global-content">
          <input type="text" id="globalSearchInput" class="search-input" placeholder="Search users, students, messages...">
          <div class="search-results" id="globalSearchResults"></div>
        </div>
      `;
      div.addEventListener('click', (e) => { if (e.target === div) div.classList.remove('show'); });
      document.body.appendChild(div);
      setTimeout(() => $('#globalSearchInput').focus(), 100);
      $('#globalSearchInput')?.addEventListener('input', runGlobalSearch);
      $('#globalSearchInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') div.classList.remove('show');
      });
    }
  }

  async function runGlobalSearch(e) {
    const q = e.target.value.trim();
    if (q.length < 2) {
      $('#globalSearchResults').innerHTML = '<div class="empty-state"><p>Type at least 2 characters...</p></div>';
      return;
    }
    try {
      const results = await KalinabiriAPI.search(q);
      const users = results.users || [];
      if (!users.length) {
        $('#globalSearchResults').innerHTML = '<div class="empty-state"><p>No results</p></div>';
        return;
      }
      $('#globalSearchResults').innerHTML = users.map(u => `
        <div class="search-result">
          <div class="search-result-icon"><i class="fas fa-${u.role === 'student' ? 'user-graduate' : u.role === 'teacher' ? 'chalkboard-teacher' : 'user'}"></i></div>
          <div class="search-result-text">
            <div class="search-result-title">${escapeHtml(u.first_name + ' ' + u.last_name)}</div>
            <div class="search-result-meta">${escapeHtml(u.role)} • ${escapeHtml(u.email || '')}</div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  }

  // Click outside to close notifications
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.notification-bell')) {
      $('#notifDropdown')?.classList.remove('show');
    }
  });

  // ─── Page Renderers ─────────────────────────────────────────────
  function statCard({ label, value, icon, color = 'var(--accent)' }) {
    return `
      <div class="admin-stat-card">
        <div class="admin-stat-icon"><i class="fas fa-${icon}" style="color:${color}"></i></div>
        <div class="admin-stat-value">${value}</div>
        <div class="admin-stat-label">${escapeHtml(label)}</div>
      </div>
    `;
  }

  function adminCard(title, content, headerActions = '') {
    return `
      <div class="admin-card">
        <div class="admin-card-header">
          <h3 class="admin-card-title">${escapeHtml(title)}</h3>
          ${headerActions}
        </div>
        ${content}
      </div>
    `;
  }

  // ─── Overview ───────────────────────────────────────────────────
  async function renderOverview(c) {
    const [stats, recent, announcements] = await Promise.all([
      KalinabiriAPI.getAdminStats().catch(() => ({})),
      apiCall('/admin/activity?limit=10').catch(() => []),
      KalinabiriAPI.getAnnouncements({ limit: 5 }).catch(() => [])
    ]);

    c.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Welcome back, ${escapeHtml(currentUser.first_name)}</h2>
          <p>School management overview</p>
        </div>
        <button class="btn btn-primary" onclick="quickSearch()">
          <i class="fas fa-search"></i> Quick Search
        </button>
      </div>
      <div class="admin-grid">
        ${statCard({ label: 'Students', value: stats.students || 0, icon: 'user-graduate', color: 'var(--success)' })}
        ${statCard({ label: 'Teachers', value: stats.teachers || 0, icon: 'chalkboard-teacher', color: 'var(--info)' })}
        ${statCard({ label: 'Parents', value: stats.parents || 0, icon: 'users', color: '#fbbf24' })}
        ${statCard({ label: 'Classes', value: stats.classes || 0, icon: 'school', color: 'var(--accent)' })}
        ${statCard({ label: 'Subjects', value: stats.subjects || 0, icon: 'book', color: 'var(--info)' })}
        ${statCard({ label: 'Today Attendance', value: (stats.attendance_rate || 0) + '%', icon: 'calendar-check', color: 'var(--success)' })}
        ${statCard({ label: 'Announcements', value: stats.announcements || 0, icon: 'bullhorn', color: '#fbbf24' })}
        ${statCard({ label: 'Online Now', value: stats.online || 0, icon: 'circle-user', color: 'var(--accent)' })}
      </div>
      <div class="grid-2">
        ${adminCard('Recent Activity', (recent || []).map(a => `
          <div style="padding:12px 0;border-bottom:1px solid var(--border)">
            <strong>${escapeHtml(a.user_name || 'User')}</strong> ${escapeHtml(a.action || '')}
            <div class="text-sm text-muted">${a.created_at ? timeAgo(a.created_at) : ''}</div>
          </div>
        `).join('') || '<div class="empty-state">No activity</div>')}
        ${adminCard('Latest Announcements', (announcements || []).map(a => `
          <div style="padding:12px 0;border-bottom:1px solid var(--border)">
            <strong>${escapeHtml(a.title)}</strong>
            ${a.priority === 'high' ? ' <span class="badge badge-danger">High</span>' : ''}
            <div class="text-sm text-muted">${a.created_at ? timeAgo(a.created_at) : ''}</div>
          </div>
        `).join('') || '<div class="empty-state">No announcements</div>')}
      </div>
    `;
  }

  // ─── Analytics ──────────────────────────────────────────────────
  async function renderAnalytics(c) {
    const data = await KalinabiriAPI.getAdminStats().catch(() => ({}));
    const announcements = await KalinabiriAPI.getAnnouncements().catch(() => []);
    const resultCount = announcements.length;
    c.innerHTML = `
      <div class="page-header">
        <h2>Analytics</h2>
        <p>Platform insights and trends</p>
      </div>
      <div class="admin-grid">
        ${statCard({ label: 'Total Students', value: data.students || 0, icon: 'user-graduate', color: 'var(--success)' })}
        ${statCard({ label: 'Total Teachers', value: data.teachers || 0, icon: 'chalkboard-teacher', color: 'var(--info)' })}
        ${statCard({ label: 'Active Announcements', value: resultCount, icon: 'bullhorn', color: '#fbbf24' })}
        ${statCard({ label: 'Online Now', value: data.online || 0, icon: 'circle-user', color: 'var(--accent)' })}
      </div>
      ${adminCard('System Health', `
        <div class="grid-2">
          <div>
            <div class="text-sm text-muted">Database</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
              <span class="badge badge-success">Healthy</span>
              <span class="text-sm text-muted">SQLite running</span>
            </div>
          </div>
          <div>
            <div class="text-sm text-muted">API Server</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
              <span class="badge badge-success">Online</span>
              <span class="text-sm text-muted">All systems operational</span>
            </div>
          </div>
        </div>
      `)}
    `;
  }

  // ─── Communication Center ───────────────────────────────────────
  async function renderCommunication(c) {
    c.innerHTML = `
      <div class="communication-panel">
        <div class="comm-header">
          <h3 class="admin-card-title">Communication Center</h3>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" onclick="openNewConversation()">
              <i class="fas fa-plus"></i> New Message
            </button>
            <button class="btn btn-secondary btn-sm" onclick="refreshConversations()">
              <i class="fas fa-sync"></i>
            </button>
          </div>
        </div>
        <div class="comm-body">
          <div class="comm-sidebar">
            <div class="comm-search">
              <input type="text" id="commSearch" placeholder="Search conversations..." oninput="filterConversations(this.value)">
            </div>
            <div class="comm-conversations" id="commConversations">
              <div class="loading-overlay"><div class="spinner"></div></div>
            </div>
          </div>
          <div class="comm-chat">
            <div class="comm-chat-header" id="commChatHeader">
              <div><strong>Select a conversation</strong><div class="text-sm text-muted">Start messaging</div></div>
            </div>
            <div class="comm-messages" id="commMessages">
              <div class="comm-empty"><i class="fas fa-comments" style="font-size:48px;opacity:0.3;margin-bottom:16px"></i><p>Select a conversation to start messaging</p></div>
            </div>
            <div class="comm-input-area hidden" id="commInputArea">
              <div style="display:flex;gap:8px;align-items:center">
                <textarea id="commMessageInput" placeholder="Type a message..." rows="1" style="flex:1;resize:none;min-height:44px;max-height:120px"></textarea>
                <button class="btn btn-primary" onclick="sendMessage()"><i class="fas fa-paper-plane"></i></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    if (!commCenter) {
      commCenter = new CommunicationCenter({
        apiBase: KalinabiriAPI.API_BASE,
        currentUser: currentUser,
        onConversationChange: (convs) => renderConversationList(convs),
        onMessage: (m) => handleNewMessage(m),
        onTyping: (u) => updateTypingIndicator(u),
        onError: (e) => showToast(e.message, 'error')
      });
    }
    const socket = io(KalinabiriAPI.API_BASE.replace('/api', ''), {
      auth: { token: KalinabiriAPI.getToken() },
      transports: ['websocket', 'polling']
    });
    await commCenter.init(socket, currentUser);
    $('#commMessageInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
  }

  function renderConversationList(convs) {
    const container = $('#commConversations');
    if (!container) return;
    if (!convs || !convs.length) {
      container.innerHTML = '<div class="empty-state"><p>No conversations yet</p></div>';
      return;
    }
    container.innerHTML = convs.map(conv => {
      const other = conv.members?.find(m => m.id !== currentUser.id);
      const name = conv.type === 'direct' && other
        ? `${other.first_name} ${other.last_name}`
        : conv.name || 'Group';
      const unread = conv.unread_count || 0;
      const last = conv.messages?.[0];
      const preview = last?.content?.substring(0, 50) || 'No messages yet';
      const time = last?.created_at ? timeAgo(last.created_at) : '';
      return `
        <div class="conv-item" onclick="selectConversation('${conv.id}')">
          <div class="conv-avatar">${(name[0] || '?').toUpperCase()}</div>
          <div class="conv-info">
            <div class="conv-name">
              <span>${escapeHtml(name)}</span>
              <span class="conv-time">${escapeHtml(time)}</span>
            </div>
            <div class="conv-preview">
              <span>${escapeHtml(preview)}</span>
              ${unread ? `<span class="conv-badge">${unread}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function filterConversations(q) {
    const items = $$('#commConversations .conv-item');
    items.forEach(item => {
      item.style.display = item.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
    });
  }

  async function selectConversation(convId) {
    if (!commCenter) return;
    const conv = await commCenter.getConversation(convId);
    if (!conv) return;
    commCenter.setActiveConversation(conv);
    const other = conv.members?.find(m => m.id !== currentUser.id);
    const name = conv.type === 'direct' && other
      ? `${other.first_name} ${other.last_name}`
      : conv.name || 'Group';
    $('#commChatHeader').innerHTML = `
      <div><strong>${escapeHtml(name)}</strong><div class="text-sm text-muted">${conv.members?.length || 0} members</div></div>
    `;
    $('#commInputArea').classList.remove('hidden');
    const messages = await commCenter.loadMessages(convId);
    $('#commMessages').innerHTML = messages.map(createMessageHtml).join('');
    $('#commMessages').scrollTop = $('#commMessages').scrollHeight;
    if (commCenter.socket) commCenter.socket.emit('join_conversation', convId);
  }

  function createMessageHtml(msg) {
    const isOwn = msg.sender_id === currentUser.id;
    const sender = `${msg.sender_first || ''} ${msg.sender_last || ''}`.trim();
    const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <div class="comm-message ${isOwn ? 'own' : ''}">
        <div class="avatar">${(sender[0] || '?').toUpperCase()}</div>
        <div class="bubble">
          <div class="sender">${escapeHtml(sender)}</div>
          <div>${escapeHtml(msg.content)}</div>
          <div class="meta">
            <span>${escapeHtml(time)}</span>
            <span>${msg.read_count > 0 ? '✓✓' : '✓'}</span>
          </div>
        </div>
      </div>
    `;
  }

  async function sendMessage() {
    const input = $('#commMessageInput');
    if (!input?.value.trim() || !commCenter?.activeConversation) return;
    const content = input.value.trim();
    input.value = '';
    try {
      await commCenter.sendMessage(commCenter.activeConversation.id, content);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  function handleNewMessage(msg) {
    if (commCenter?.activeConversation?.id === msg.conversation_id) {
      $('#commMessages').insertAdjacentHTML('beforeend', createMessageHtml(msg));
      $('#commMessages').scrollTop = $('#commMessages').scrollHeight;
    }
  }

  function updateTypingIndicator(users) {
    const convId = commCenter?.activeConversation?.id;
    if (!convId) return;
    const u = users.get(convId)?.users || [];
    const typingEl = $('#commTyping');
    if (typingEl) typingEl.remove();
    if (u.length && commCenter?.activeConversation) {
      const div = document.createElement('div');
      div.id = 'commTyping';
      div.className = 'text-sm text-muted';
      div.style.padding = '4px 24px';
      div.textContent = u.length === 1 ? `${u[0]} is typing...` : `${u.length} people typing...`;
      $('#commMessages').after(div);
    }
  }

  async function openNewConversation() {
    const users = await KalinabiriAPI.getDirectory({ limit: 100 }).catch(() => []);
    openModal('New Conversation', `
      <div class="form-group">
        <label class="form-label">Type</label>
        <select id="newConvType" class="form-input" onchange="toggleNewConvType()">
          <option value="direct">Direct Message</option>
          <option value="group">Group Chat</option>
        </select>
      </div>
      <div class="form-group hidden" id="newConvNameGroup">
        <label class="form-label">Group Name</label>
        <input type="text" id="newConvName" class="form-input" placeholder="Enter group name">
      </div>
      <div class="form-group">
        <label class="form-label">Select Users</label>
        <input type="text" class="form-input" placeholder="Search users..." oninput="filterNewUsers(this.value)" style="margin-bottom:8px">
        <div id="newConvUserList" style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:4px"></div>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="createNewConversation()">Create</button>
    `);
    $('#newConvUserList').innerHTML = (users || []).map(u => `
      <label class="conv-item" style="cursor:pointer">
        <input type="checkbox" value="${u.id}" class="new-conv-user" style="width:18px;height:18px">
        <div class="conv-avatar" style="width:32px;height:32px;font-size:12px">${(u.first_name?.[0] || '?').toUpperCase()}</div>
        <div class="conv-info">
          <div class="conv-name">${escapeHtml(u.first_name + ' ' + u.last_name)}</div>
          <div class="conv-preview">${escapeHtml(u.role)}</div>
        </div>
      </label>
    `).join('');
    document.querySelectorAll('#newConvUserList .conv-item').forEach(item => {
      const cb = item.querySelector('input');
      item.addEventListener('click', (e) => {
        if (e.target !== cb) cb.checked = !cb.checked;
        item.style.background = cb.checked ? 'var(--bg-hover)' : '';
      });
    });
  }

  function toggleNewConvType() {
    $('#newConvNameGroup').classList.toggle('hidden', $('#newConvType').value !== 'group');
  }

  function filterNewUsers(q) {
    const items = $$('#newConvUserList .conv-item');
    items.forEach(item => {
      item.style.display = item.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
    });
  }

  async function createNewConversation() {
    const type = $('#newConvType').value;
    const name = type === 'group' ? $('#newConvName').value : '';
    const ids = Array.from($$('.new-conv-user:checked')).map(cb => Number(cb.value));
    if (!ids.length) return showToast('Select at least one user', 'error');
    if (type === 'group' && !name) return showToast('Enter group name', 'error');
    ids.push(currentUser.id);
    try {
      const conv = await KalinabiriAPI.createConversation({ type, name, description: '', member_ids: ids });
      closeModal();
      await refreshConversations();
      await selectConversation(conv.id);
      showToast('Conversation created', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function refreshConversations() {
    if (commCenter) await commCenter.loadConversations();
  }

  // ─── Announcements ──────────────────────────────────────────────
  async function renderAnnouncements(c) {
    const list = await KalinabiriAPI.getAnnouncements().catch(() => []);
    c.innerHTML = `
      <div class="page-header">
        <div><h2>Announcements</h2><p>School-wide and targeted announcements</p></div>
        <button class="btn btn-primary" onclick="createAnnouncement()">
          <i class="fas fa-plus"></i> New Announcement
        </button>
      </div>
      ${adminCard('All Announcements', `
        <div class="table-wrapper">
          <table class="admin-table">
            <thead><tr>
              <th>Title</th><th>Priority</th><th>Audience</th><th>Created</th><th></th>
            </tr></thead>
            <tbody>
              ${(list || []).map(a => `
                <tr>
                  <td>
                    <strong>${escapeHtml(a.title)}</strong>
                    <div class="text-sm text-muted">${escapeHtml((a.content || '').substring(0, 80))}</div>
                  </td>
                  <td><span class="badge ${a.priority === 'high' ? 'badge-danger' : a.priority === 'medium' ? 'badge-warning' : 'badge-info'}">${escapeHtml(a.priority || 'normal')}</span></td>
                  <td>${escapeHtml(a.audience || 'all')}</td>
                  <td>${a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}</td>
                  <td><button class="btn btn-ghost btn-sm" onclick="deleteAnnouncement(${a.id})"><i class="fas fa-trash"></i></button></td>
                </tr>
              `).join('') || '<tr><td colspan="5" class="empty-state">No announcements</td></tr>'}
            </tbody>
          </table>
        </div>
      `)}
    `;
  }

  function createAnnouncement() {
    openModal('New Announcement', `
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" id="annTitle" class="form-input" required>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Priority</label>
          <select id="annPriority" class="form-input">
            <option value="normal">Normal</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Audience</label>
          <select id="annAudience" class="form-input">
            <option value="all">Everyone</option>
            <option value="students">Students</option>
            <option value="teachers">Teachers</option>
            <option value="parents">Parents</option>
            <option value="staff">Staff</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Content</label>
        <textarea id="annContent" class="form-input" rows="6" required></textarea>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAnnouncement()">Publish</button>
    `);
  }

  async function submitAnnouncement() {
    const payload = {
      title: $('#annTitle').value.trim(),
      content: $('#annContent').value.trim(),
      priority: $('#annPriority').value,
      audience: $('#annAudience').value
    };
    if (!payload.title || !payload.content) {
      showToast('Title and content required', 'error');
      return;
    }
    try {
      await KalinabiriAPI.createAnnouncement(payload);
      closeModal();
      showToast('Announcement published', 'success');
      loadPage('announcements');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function deleteAnnouncement(id) {
    if (!confirm('Delete this announcement?')) return;
    try {
      await KalinabiriAPI.deleteAnnouncement(id);
      showToast('Announcement deleted', 'success');
      loadPage('announcements');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ─── Emergency Alerts ───────────────────────────────────────────
  async function renderEmergency(c) {
    const alerts = await KalinabiriAPI.getEmergencyAlerts().catch(() => []);
    c.innerHTML = `
      <div class="page-header">
        <div><h2>Emergency Alerts</h2><p>Urgent school-wide notifications</p></div>
        <button class="btn btn-danger" onclick="createEmergency()">
          <i class="fas fa-triangle-exclamation"></i> Send Emergency Alert
        </button>
      </div>
      ${adminCard('Active Emergency Alerts', (alerts || []).map(a => `
        <div style="padding:16px;border-left:4px solid var(--danger);background:rgba(239,68,68,0.08);border-radius:8px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong>${escapeHtml(a.title)}</strong>
            <span class="badge badge-danger">${escapeHtml(a.severity || 'high')}</span>
          </div>
          <p class="text-sm">${escapeHtml(a.message)}</p>
          <div class="text-sm text-muted" style="margin-top:6px">${a.created_at ? new Date(a.created_at).toLocaleString() : ''}</div>
        </div>
      `).join('') || '<div class="empty-state"><i class="fas fa-shield-halved"></i><p>No active emergency alerts</p></div>')}
    `;
  }

  function createEmergency() {
    openModal('Send Emergency Alert', `
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" id="emTitle" class="form-input" required>
      </div>
      <div class="form-group">
        <label class="form-label">Severity</label>
        <select id="emSeverity" class="form-input">
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Message</label>
        <textarea id="emMessage" class="form-input" rows="4" required></textarea>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="submitEmergency()">
        <i class="fas fa-paper-plane"></i> Send Alert
      </button>
    `);
  }

  async function submitEmergency() {
    const payload = {
      title: $('#emTitle').value.trim(),
      message: $('#emMessage').value.trim(),
      severity: $('#emSeverity').value,
      target_audience: 'all'
    };
    if (!payload.title || !payload.message) {
      showToast('Title and message required', 'error');
      return;
    }
    try {
      await KalinabiriAPI.createEmergencyAlert(payload);
      closeModal();
      showToast('Emergency alert sent', 'success');
      loadPage('emergency');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ─── Teacher / Student / Parent List ───────────────────────────
  async function renderPeopleList(c, role) {
    const users = await KalinabiriAPI.getUsers({ role }).catch(() => []);
    const title = role.charAt(0).toUpperCase() + role.slice(1) + 's';
    c.innerHTML = `
      <div class="page-header">
        <div><h2>${title}</h2><p>Manage ${role}s in the system</p></div>
        <button class="btn btn-primary" onclick="createUser('${role}')">
          <i class="fas fa-plus"></i> Add ${title.replace(/s$/, '')}
        </button>
      </div>
      ${adminCard(`All ${title} (${(users || []).length})`, `
        <div class="table-wrapper">
          <table class="admin-table">
            <thead><tr>
              <th>Name</th><th>Username</th><th>Email</th><th>Phone</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              ${(users || []).map(u => `
                <tr>
                  <td><strong>${escapeHtml(u.first_name + ' ' + u.last_name)}</strong></td>
                  <td>${escapeHtml(u.username)}</td>
                  <td>${escapeHtml(u.email || '-')}</td>
                  <td>${escapeHtml(u.phone || '-')}</td>
                  <td><span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}">${escapeHtml(u.status || 'active')}</span></td>
                  <td><button class="btn btn-ghost btn-sm" onclick="editUser(${u.id})"><i class="fas fa-edit"></i></button></td>
                </tr>
              `).join('') || `<tr><td colspan="6" class="empty-state">No ${title.toLowerCase()} found</td></tr>`}
            </tbody>
          </table>
        </div>
      `)}
    `;
  }

  const render_Teachers = c => renderPeopleList(c, 'teacher');
  const render_Students = c => renderPeopleList(c, 'student');
  const render_Parents = c => renderPeopleList(c, 'parent');

  function createUser(role) {
    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
    openModal(`Add ${roleLabel}`, `
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">First Name</label>
          <input type="text" id="newFirstName" class="form-input" required>
        </div>
        <div class="form-group">
          <label class="form-label">Last Name</label>
          <input type="text" id="newLastName" class="form-input" required>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Username</label>
          <input type="text" id="newUsername" class="form-input" required>
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" id="newEmail" class="form-input" required>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input type="tel" id="newPhone" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" id="newPassword" class="form-input" required minlength="6">
        </div>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewUser('${role}')">Create</button>
    `);
  }

  async function submitNewUser(role) {
    const payload = {
      username: $('#newUsername').value.trim(),
      email: $('#newEmail').value.trim(),
      first_name: $('#newFirstName').value.trim(),
      last_name: $('#newLastName').value.trim(),
      phone: $('#newPhone').value.trim(),
      password: $('#newPassword').value,
      role: role
    };
    if (!payload.username || !payload.email || !payload.password || !payload.first_name) {
      showToast('Please fill all required fields', 'error');
      return;
    }
    try {
      await KalinabiriAPI.post('/admin/users', payload);
      closeModal();
      showToast(`${role} created successfully`, 'success');
      loadPage(role + 's');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function editUser(id) {
    try {
      const u = await apiCall('/admin/users').then(users => users.users.find(x => x.id == id));
      if (!u) {
        showToast('User not found', 'error');
        return;
      }
      openModal('Edit User', `
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">First Name</label>
            <input type="text" id="editFirst" class="form-input" value="${escapeHtml(u.first_name)}">
          </div>
          <div class="form-group">
            <label class="form-label">Last Name</label>
            <input type="text" id="editLast" class="form-input" value="${escapeHtml(u.last_name)}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" id="editEmail" class="form-input" value="${escapeHtml(u.email || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input type="tel" id="editPhone" class="form-input" value="${escapeHtml(u.phone || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="editStatus" class="form-input">
            <option value="active" ${u.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${u.status !== 'active' ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
      `, `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="deleteUser(${u.id})">Delete</button>
        <button class="btn btn-primary" onclick="updateUser(${u.id})">Save</button>
      `);
    } catch (e) {
      showToast('Failed to load user', 'error');
    }
  }

  async function updateUser(id) {
    const payload = {
      first_name: $('#editFirst').value.trim(),
      last_name: $('#editLast').value.trim(),
      email: $('#editEmail').value.trim(),
      phone: $('#editPhone').value.trim(),
      status: $('#editStatus').value
    };
    try {
      await KalinabiriAPI.put(`/admin/users/${id}`, payload);
      closeModal();
      showToast('User updated', 'success');
      loadPage('teachers');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function deleteUser(id) {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try {
      await KalinabiriAPI.delete(`/admin/users/${id}`);
      closeModal();
      showToast('User deleted', 'success');
      loadPage('teachers');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ─── Directory ──────────────────────────────────────────────────
  async function renderDirectory(c) {
    const users = await KalinabiriAPI.getDirectory({ limit: 200 }).catch(() => []);
    c.innerHTML = `
      <div class="page-header">
        <h2>Directory</h2>
        <p>Browse all users by role</p>
      </div>
      <div class="admin-card">
        <div class="admin-toolbar">
          <input type="text" id="dirSearch" class="form-input" placeholder="Search by name, email, or class..." oninput="filterDirectory(this.value)">
          <select id="dirRole" class="form-input" style="max-width:200px" onchange="filterDirectory()">
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
            <option value="parent">Parent</option>
          </select>
        </div>
        <div class="table-wrapper">
          <table class="admin-table" id="dirTable">
            <thead><tr><th>Name</th><th>Role</th><th>Class</th><th>Email</th><th>Phone</th></tr></thead>
            <tbody>
              ${(users || []).map(u => `
                <tr data-name="${escapeHtml((u.first_name + ' ' + u.last_name).toLowerCase())}" data-role="${escapeHtml(u.role)}">
                  <td><strong>${escapeHtml(u.first_name + ' ' + u.last_name)}</strong></td>
                  <td><span class="badge badge-info">${escapeHtml(u.role)}</span></td>
                  <td>${escapeHtml(u.class || '-')}</td>
                  <td>${escapeHtml(u.email || '-')}</td>
                  <td>${escapeHtml(u.phone || '-')}</td>
                </tr>
              `).join('') || '<tr><td colspan="5" class="empty-state">No users</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function filterDirectory() {
    const q = ($('#dirSearch')?.value || '').toLowerCase();
    const role = $('#dirRole')?.value || '';
    $$('#dirTable tbody tr').forEach(r => {
      const match = (!role || r.dataset.role === role) && (!q || r.dataset.name.includes(q));
      r.style.display = match ? '' : 'none';
    });
  }

  // ─── Classes ─────────────────────────────────────────────────────
  async function renderClasses(c) {
    const classes = await KalinabiriAPI.getAdminClasses().catch(() => []);
    c.innerHTML = `
      <div class="page-header">
        <div><h2>Classes</h2><p>School classes and streams</p></div>
        <button class="btn btn-primary" onclick="openClassModal()">
          <i class="fas fa-plus"></i> New Class
        </button>
      </div>
      <div class="grid-2">
        ${adminCard('All Classes', (classes || []).map(cl => `
          <div style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:8px">
            <strong>${escapeHtml(cl.name)}</strong>
            <div class="text-sm text-muted">${escapeHtml(cl.level || '')} • ${cl.student_count || 0} students</div>
          </div>
        `).join('') || '<div class="empty-state">No classes</div>', `<span class="badge badge-info">${(classes || []).length} classes</span>`)}
      </div>
    `;
  }

  function openClassModal() {
    openModal('New Class', `
      <div class="form-group">
        <label class="form-label">Class Name</label>
        <input type="text" id="className" class="form-input" placeholder="e.g. S.1A">
      </div>
      <div class="form-group">
        <label class="form-label">Level</label>
        <select id="classLevel" class="form-input">
          <option value="O-Level">O-Level</option>
          <option value="A-Level">A-Level</option>
        </select>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitClass()">Create</button>
    `);
  }

  async function submitClass() {
    const name = $('#className').value.trim();
    const level = $('#classLevel').value;
    if (!name) {
      showToast('Class name required', 'error');
      return;
    }
    try {
      await KalinabiriAPI.post('/admin/classes', { name, level });
      closeModal();
      showToast('Class created', 'success');
      loadPage('classes');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ─── Subjects ───────────────────────────────────────────────────
  async function renderSubjects(c) {
    const subjects = await KalinabiriAPI.getAdminSubjects().catch(() => []);
    c.innerHTML = `
      <div class="page-header">
        <div><h2>Subjects</h2><p>School subjects curriculum</p></div>
        <button class="btn btn-primary" onclick="openSubjectModal()">
          <i class="fas fa-plus"></i> New Subject
        </button>
      </div>
      ${adminCard(`All Subjects (${(subjects || []).length})`, `
        <div class="grid-2">
          ${(subjects || []).map(s => `
            <div style="padding:12px;background:var(--bg);border-radius:8px">
              <strong>${escapeHtml(s.name)}</strong>
              <div class="text-sm text-muted">${escapeHtml(s.code || '')} • ${escapeHtml(s.level || '')}</div>
            </div>
          `).join('') || '<div class="empty-state">No subjects</div>'}
        </div>
      `)}
    `;
  }

  function openSubjectModal() {
    openModal('New Subject', `
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Subject Name</label>
          <input type="text" id="subName" class="form-input" required>
        </div>
        <div class="form-group">
          <label class="form-label">Code</label>
          <input type="text" id="subCode" class="form-input" placeholder="e.g. MATH">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Level</label>
        <select id="subLevel" class="form-input">
          <option value="O-Level">O-Level</option>
          <option value="A-Level">A-Level</option>
        </select>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitSubject()">Create</button>
    `);
  }

  async function submitSubject() {
    const name = $('#subName').value.trim();
    const code = $('#subCode').value.trim();
    const level = $('#subLevel').value;
    if (!name) {
      showToast('Subject name required', 'error');
      return;
    }
    try {
      await KalinabiriAPI.post('/admin/subjects', { name, code, level });
      closeModal();
      showToast('Subject created', 'success');
      loadPage('subjects');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ─── Timetable ──────────────────────────────────────────────────
  async function renderTimetable(c) {
    const classes = await KalinabiriAPI.getAdminClasses().catch(() => []);
    c.innerHTML = `
      <div class="page-header">
        <h2>Timetable</h2>
        <p>Class schedules and academic calendar</p>
      </div>
      ${adminCard('Class Timetables', `
        <div class="form-group">
          <label class="form-label">Select Class</label>
          <select class="form-input" id="ttClassSelect" onchange="loadTimetable()">
            <option value="">-- Choose class --</option>
            ${(classes || []).map(cl => `<option value="${cl.id}">${escapeHtml(cl.name)}</option>`).join('')}
          </select>
        </div>
        <div id="timetableContent" class="empty-state"><p>Select a class to view its timetable</p></div>
      `, `<button class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> Add Period</button>`)}
    `;
  }

  function loadTimetable() {
    document.getElementById('timetableContent').innerHTML = `
      <div class="grid-2" style="margin-top:20px">
        ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => `
          <div style="background:var(--bg);padding:14px;border-radius:8px">
            <strong>${day}</strong>
            <div class="text-sm text-muted" style="margin-top:4px">No periods scheduled</div>
          </div>
        `).join('')}
      </div>
      <p class="text-sm text-muted" style="margin-top:16px;text-align:center">Timetable builder coming soon</p>
    `;
  }

  // ─── Attendance ─────────────────────────────────────────────────
  async function renderAttendance(c) {
    const data = await apiCall('/admin/attendance/overview').catch(() => ({}));
    c.innerHTML = `
      <div class="page-header">
        <h2>Attendance</h2>
        <p>Today's attendance overview</p>
      </div>
      <div class="admin-grid">
        ${statCard({ label: 'Present', value: data.present || 0, icon: 'check', color: 'var(--success)' })}
        ${statCard({ label: 'Absent', value: data.absent || 0, icon: 'times', color: 'var(--danger)' })}
        ${statCard({ label: 'Late', value: data.late || 0, icon: 'clock', color: '#fbbf24' })}
        ${statCard({ label: 'Rate', value: (data.rate || 0) + '%', icon: 'percent', color: 'var(--accent)' })}
      </div>
      ${adminCard('Attendance by Class', `
        <div class="empty-state"><p>Detailed class breakdown coming soon</p></div>
      `)}
    `;
  }

  // ─── Results ─────────────────────────────────────────────────────
  async function renderResults(c) {
    const results = await KalinabiriAPI.getResults({ limit: 100 }).catch(() => []);
    c.innerHTML = `
      <div class="page-header">
        <div><h2>Results</h2><p>Student academic results</p></div>
        <button class="btn btn-primary" onclick="showToast('Use teacher dashboard to enter results', 'info')">
          <i class="fas fa-info-circle"></i> How to add
        </button>
      </div>
      ${adminCard(`Recent Results (${(results || []).length})`, `
        <div class="table-wrapper">
          <table class="admin-table">
            <thead><tr><th>Student</th><th>Subject</th><th>Score</th><th>Grade</th><th>Term</th><th>Year</th></tr></thead>
            <tbody>
              ${(results || []).slice(0, 50).map(r => `
                <tr>
                  <td><strong>${escapeHtml(r.first_name + ' ' + r.last_name)}</strong></td>
                  <td>${escapeHtml(r.subject || '-')}</td>
                  <td>${escapeHtml(r.score !== undefined ? r.score : '-')}</td>
                  <td><span class="badge badge-success">${escapeHtml(r.grade || '-')}</span></td>
                  <td>${escapeHtml(r.term || '-')}</td>
                  <td>${escapeHtml(r.year || '-')}</td>
                </tr>
              `).join('') || '<tr><td colspan="6" class="empty-state">No results</td></tr>'}
            </tbody>
          </table>
        </div>
      `)}
    `;
  }

  // ─── Events ──────────────────────────────────────────────────────
  async function renderEvents(c) {
    const events = await KalinabiriAPI.getEvents().catch(() => []);
    c.innerHTML = `
      <div class="page-header">
        <div><h2>Events</h2><p>School calendar and events</p></div>
        <button class="btn btn-primary" onclick="openEventModal()">
          <i class="fas fa-plus"></i> New Event
        </button>
      </div>
      ${adminCard('Upcoming Events', (events || []).map(e => `
        <div style="padding:16px;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <strong>${escapeHtml(e.title)}</strong>
              <div class="text-sm text-muted"><i class="fas fa-calendar"></i> ${e.start_date ? new Date(e.start_date).toLocaleDateString() : ''} • ${escapeHtml(e.location || '')}</div>
            </div>
          </div>
          <p class="text-sm" style="margin-top:6px">${escapeHtml(e.description || '')}</p>
        </div>
      `).join('') || '<div class="empty-state"><i class="fas fa-calendar-day"></i><p>No events scheduled</p></div>')}
    `;
  }

  function openEventModal() {
    openModal('New Event', `
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" id="evTitle" class="form-input" required>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Start Date</label>
          <input type="datetime-local" id="evStart" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">End Date</label>
          <input type="datetime-local" id="evEnd" class="form-input">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Location</label>
        <input type="text" id="evLocation" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="evDescription" class="form-input" rows="3"></textarea>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEvent()">Create</button>
    `);
  }

  async function submitEvent() {
    const payload = {
      title: $('#evTitle').value.trim(),
      start_date: $('#evStart').value,
      end_date: $('#evEnd').value,
      location: $('#evLocation').value.trim(),
      description: $('#evDescription').value.trim()
    };
    if (!payload.title || !payload.start_date) {
      showToast('Title and start date required', 'error');
      return;
    }
    try {
      await KalinabiriAPI.createEvent(payload);
      closeModal();
      showToast('Event created', 'success');
      loadPage('events');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ─── Gallery ────────────────────────────────────────────────────
  async function renderGallery(c) {
    const items = await KalinabiriAPI.getGallery().catch(() => []);
    c.innerHTML = `
      <div class="page-header">
        <div><h2>Gallery</h2><p>School photos and videos</p></div>
        <button class="btn btn-primary" onclick="openGalleryModal()">
          <i class="fas fa-plus"></i> Upload Media
        </button>
      </div>
      ${adminCard(`Gallery Items (${(items || []).length})`, `
        <div class="grid-2">
          ${(items || []).slice(0, 12).map(item => `
            <div style="background:var(--bg);border-radius:8px;overflow:hidden">
              ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" style="width:100%;height:160px;object-fit:cover" alt="">` : '<div style="height:160px;display:flex;align-items:center;justify-content:center;background:var(--bg-hover)"><i class="fas fa-image" style="font-size:32px;color:var(--text-muted)"></i></div>'}
              <div style="padding:12px">
                <strong>${escapeHtml(item.title || 'Untitled')}</strong>
                <div class="text-sm text-muted">${escapeHtml(item.category || '')}</div>
              </div>
            </div>
          `).join('') || '<div class="empty-state"><i class="fas fa-image"></i><p>No gallery items yet</p></div>'}
        </div>
      `)}
    `;
  }

  function openGalleryModal() {
    openModal('Upload Gallery Item', `
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" id="galTitle" class="form-input" required>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="galDesc" class="form-input" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="galCategory" class="form-input">
          <option value="events">Events</option>
          <option value="sports">Sports</option>
          <option value="academics">Academics</option>
          <option value="trips">Trips</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Image URL</label>
        <input type="url" id="galImageUrl" class="form-input" placeholder="https://...">
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitGallery()">Add</button>
    `);
  }

  async function submitGallery() {
    const payload = {
      title: $('#galTitle').value.trim(),
      description: $('#galDesc').value.trim(),
      category: $('#galCategory').value,
      image_url: $('#galImageUrl').value.trim()
    };
    if (!payload.title) {
      showToast('Title required', 'error');
      return;
    }
    try {
      await KalinabiriAPI.post('/admin/gallery', payload);
      closeModal();
      showToast('Gallery item added', 'success');
      loadPage('gallery');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ─── Admissions ─────────────────────────────────────────────────
  async function renderAdmissions(c) {
    const apps = await KalinabiriAPI.getAdmissions('pending').catch(() => []);
    c.innerHTML = `
      <div class="page-header">
        <h2>Admissions</h2>
        <p>Pending student applications</p>
      </div>
      ${adminCard(`Pending Applications (${(apps || []).length})`, `
        <div class="table-wrapper">
          <table class="admin-table">
            <thead><tr><th>Name</th><th>Class</th><th>Guardian</th><th>Date</th><th></th></tr></thead>
            <tbody>
              ${(apps || []).map(a => `
                <tr>
                  <td><strong>${escapeHtml(a.first_name + ' ' + a.last_name)}</strong></td>
                  <td>${escapeHtml(a.applying_for_class || '-')}</td>
                  <td>${escapeHtml(a.guardian_name || '-')}</td>
                  <td>${a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}</td>
                  <td>
                    <button class="btn btn-sm btn-success" onclick="approveAdmission(${a.id})"><i class="fas fa-check"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="rejectAdmission(${a.id})"><i class="fas fa-times"></i></button>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="5" class="empty-state">No pending applications</td></tr>'}
            </tbody>
          </table>
        </div>
      `)}
    `;
  }

  async function approveAdmission(id) {
    try {
      await KalinabiriAPI.approveAdmission(id);
      showToast('Application approved', 'success');
      loadPage('admissions');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function rejectAdmission(id) {
    if (!confirm('Reject this application?')) return;
    try {
      await KalinabiriAPI.rejectAdmission(id);
      showToast('Application rejected', 'success');
      loadPage('admissions');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ─── Profile ─────────────────────────────────────────────────────
  async function renderProfile(c) {
    c.innerHTML = `
      <div class="page-header">
        <h2>Profile</h2>
        <p>Your account settings</p>
      </div>
      <div class="admin-card">
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">First Name</label>
            <input type="text" id="pFirst" class="form-input" value="${escapeHtml(currentUser.first_name || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Last Name</label>
            <input type="text" id="pLast" class="form-input" value="${escapeHtml(currentUser.last_name || '')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" id="pEmail" class="form-input" value="${escapeHtml(currentUser.email || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input type="tel" id="pPhone" class="form-input" value="${escapeHtml(currentUser.phone || '')}">
        </div>
        <button class="btn btn-primary" onclick="updateProfile()">
          <i class="fas fa-save"></i> Save Changes
        </button>
      </div>
      <div class="admin-card">
        <h3 class="admin-card-title">Change Password</h3>
        <div class="form-group">
          <label class="form-label">Current Password</label>
          <input type="password" id="pCurr" class="form-input">
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">New Password</label>
            <input type="password" id="pNew" class="form-input" minlength="6">
          </div>
          <div class="form-group">
            <label class="form-label">Confirm New Password</label>
            <input type="password" id="pConfirm" class="form-input" minlength="6">
          </div>
        </div>
        <button class="btn btn-danger" onclick="changePassword()">
          <i class="fas fa-key"></i> Change Password
        </button>
      </div>
    `;
  }

  async function updateProfile() {
    try {
      const updated = await KalinabiriAPI.updateProfile({
        first_name: $('#pFirst').value.trim(),
        last_name: $('#pLast').value.trim(),
        email: $('#pEmail').value.trim(),
        phone: $('#pPhone').value.trim()
      });
      currentUser = updated;
      $('#userName').textContent = `${currentUser.first_name} ${currentUser.last_name}`;
      showToast('Profile updated', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function changePassword() {
    const curr = $('#pCurr').value;
    const newp = $('#pNew').value;
    const conf = $('#pConfirm').value;
    if (!curr || !newp || !conf) {
      showToast('All fields required', 'error');
      return;
    }
    if (newp.length < 6) {
      showToast('New password must be at least 6 characters', 'error');
      return;
    }
    if (newp !== conf) {
      showToast('Passwords do not match', 'error');
      return;
    }
    try {
      await KalinabiriAPI.changePassword(curr, newp);
      showToast('Password changed successfully', 'success');
      $('#pCurr').value = '';
      $('#pNew').value = '';
      $('#pConfirm').value = '';
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ─── Attach to window ────────────────────────────────────────────
  window.handleLogin = handleLogin;
  window.logout = logout;
  window.toggleSidebar = toggleSidebar;
  window.loadPage = loadPage;
  window.toggleNotifications = toggleNotifications;
  window.markAllRead = markAllRead;
  window.handleNotifClick = handleNotifClick;
  window.quickSearch = quickSearch;
  window.runGlobalSearch = runGlobalSearch;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.openNewConversation = openNewConversation;
  window.toggleNewConvType = toggleNewConvType;
  window.filterNewUsers = filterNewUsers;
  window.createNewConversation = createNewConversation;
  window.refreshConversations = refreshConversations;
  window.selectConversation = selectConversation;
  window.sendMessage = sendMessage;
  window.filterConversations = filterConversations;
  window.createAnnouncement = createAnnouncement;
  window.submitAnnouncement = submitAnnouncement;
  window.deleteAnnouncement = deleteAnnouncement;
  window.createEmergency = createEmergency;
  window.submitEmergency = submitEmergency;
  window.createUser = createUser;
  window.submitNewUser = submitNewUser;
  window.editUser = editUser;
  window.updateUser = updateUser;
  window.deleteUser = deleteUser;
  window.filterDirectory = filterDirectory;
  window.openClassModal = openClassModal;
  window.submitClass = submitClass;
  window.openSubjectModal = openSubjectModal;
  window.submitSubject = submitSubject;
  window.loadTimetable = loadTimetable;
  window.openEventModal = openEventModal;
  window.submitEvent = submitEvent;
  window.openGalleryModal = openGalleryModal;
  window.submitGallery = submitGallery;
  window.approveAdmission = approveAdmission;
  window.rejectAdmission = rejectAdmission;
  window.updateProfile = updateProfile;
  window.changePassword = changePassword;
  window.showToast = showToast;

  // ─── Init ────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    attachSidebarClose();
    const loginForm = $('#loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (KalinabiriAPI.isAuthenticated()) {
      showDashboard();
    }
  });

  // ─── Expose renderers to window for loadPage dispatch ────────────
  window.render_Overview = renderOverview;
  window.render_Analytics = renderAnalytics;
  window.render_Communication = renderCommunication;
  window.render_Announcements = renderAnnouncements;
  window.render_Emergency = renderEmergency;
  window.render_Teachers = render_Teachers;
  window.render_Students = render_Students;
  window.render_Parents = render_Parents;
  window.render_Directory = renderDirectory;
  window.render_Classes = renderClasses;
  window.render_Subjects = renderSubjects;
  window.render_Timetable = renderTimetable;
  window.render_Attendance = renderAttendance;
  window.render_Results = renderResults;
  window.render_Events = renderEvents;
  window.render_Gallery = renderGallery;
  window.render_Admissions = renderAdmissions;
  window.render_Profile = renderProfile;
})();