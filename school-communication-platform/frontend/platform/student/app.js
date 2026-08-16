/**
 * STUDENT DASHBOARD
 * Simple, focused on learning: messages, documents, announcements, classes.
 */
(function () {
  const API = window.API;
  const UI = window.UI;

  // ---- auth guard ----------------------------------------------------------
  const user = API.getUser();
  if (!API.getToken() || !user || user.role !== 'student') {
    location.href = '../login.html';
    return;
  }

  let messaging = null;
  let documents = null;
  let announcements = null;
  let activeView = 'home';

  const nav = [
    { key: 'home', label: 'Home', icon: '🏠', section: 'Main' },
    { key: 'messages', label: 'Messages', icon: '💬', section: 'Main' },
    { key: 'documents', label: 'Documents', icon: '📄', section: 'Main' },
    { key: 'announcements', label: 'Announcements', icon: '📢', section: 'Main' },
    { key: 'assignments', label: 'Assignments', icon: '📝', section: 'Learning' },
    { key: 'results', label: 'Results', icon: '🎓', section: 'Learning' },
    { key: 'attendance', label: 'Attendance', icon: '✅', section: 'Learning' },
    { key: 'timetable', label: 'Timetable', icon: '🕒', section: 'Learning' },
    { key: 'classes', label: 'My Class', icon: '🏫', section: 'School' },
    { key: 'notifications', label: 'Notifications', icon: '🔔', section: 'School' },
    { key: 'profile', label: 'Profile', icon: '👤', section: 'Account' },
  ];
  const bottomNav = [
    { key: 'home', label: 'Home', icon: '🏠' },
    { key: 'messages', label: 'Messages', icon: '💬' },
    { key: 'assignments', label: 'Assignments', icon: '📝' },
    { key: 'classes', label: 'Class', icon: '🏫' },
  ];

  let layout;
  UI.initLayout({
    nav,
    bottomNav,
    title: 'Student Dashboard',
    onNav: (key) => show(key),
  }).then((l) => {
    layout = l;
    window.__setNavBadge = (key, n) => l.setBadge(key, n);
    window.__navHandler = (key) => show(key);
    window.Realtime.start();
    show('home');
  });

  async function show(key) {
    activeView = key;
    layout.setActive(key);
    const titles = { home: 'Home', messages: 'Messages', documents: 'Documents', announcements: 'Announcements', classes: 'My Class', notifications: 'Notifications', profile: 'Profile' };
    layout.setTitle(titles[key] || 'Dashboard');
    const content = layout.content;

    if (key === 'home') return renderHome(content);
    if (key === 'messages') return renderMessages(content);
    if (key === 'documents') return renderDocuments(content);
    if (key === 'announcements') return renderAnnouncements(content);
    if (key === 'assignments') return renderAssignments(content);
    if (key === 'results') return renderResults(content);
    if (key === 'attendance') return renderAttendance(content);
    if (key === 'timetable') return renderTimetable(content);
    if (key === 'classes') return renderClasses(content);
    if (key === 'notifications') return renderNotifications(content);
    if (key === 'profile') return renderProfile(content);
  }

  // ------------------------------------------------------------------ HOME
  async function renderHome(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    let stats;
    try { stats = await API.get('/api/stats/overview'); } catch (e) { UI.toast(e.message, 'error'); return; }
    const c = stats.counts || {};

    box.innerHTML = `
      <div class="card" style="display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;border:none">
        <div class="avatar-lg" style="background:rgba(255,255,255,.2)">${UI.initials(user.fullName)}</div>
        <div>
          <h2 style="color:#fff;margin-bottom:2px">Hello, ${UI.esc(user.fullName.split(' ')[0])}! 👋</h2>
          <div style="opacity:.9">${c.className ? 'Class: ' + UI.esc(c.className) : 'Welcome to your dashboard'} · Stay on top of your school day.</div>
        </div>
      </div>
      <div class="grid grid-4" style="margin-top:16px">
        ${stat('💬', c.unreadMessages || 0, 'Unread messages', 'ic-blue')}
        ${stat('📝', c.openAssignments || 0, 'Assignments to do', 'ic-amber')}
        ${stat('📋', c.examsUpcoming || 0, 'Upcoming exams', 'ic-purple')}
        ${stat('🏫', c.className || '—', 'Your class', 'ic-green')}
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3>📢 Recent announcements</h3><div id="home-ann"></div></div>
        <div class="card"><h3>📄 Recent documents</h3><div id="home-docs"></div></div>
      </div>`;

    const annBox = box.querySelector('#home-ann');
    for (const a of (stats.recentAnnouncements || []).slice(0, 4)) {
      annBox.appendChild(UI.el(`<div class="ann-item ${a.is_read ? '' : 'unread'}" style="margin-bottom:8px">
        <div class="ann-title"><span>${UI.esc(a.title)}</span></div>
        <div class="ann-meta">${UI.timeAgo(a.created_at)}</div></div>`));
    }
    if (!(stats.recentAnnouncements || []).length) annBox.innerHTML = '<div class="doc-meta">Nothing yet.</div>';

    const docBox = box.querySelector('#home-docs');
    for (const d of (stats.recentDocuments || []).slice(0, 4)) {
      docBox.appendChild(UI.el(`<div class="doc-item" style="margin-bottom:8px">
        <div class="file-ic file-pdf">📄</div>
        <div style="min-width:0"><div class="doc-name">${UI.esc(d.name)}</div><div class="doc-meta">${UI.timeAgo(d.created_at)}</div></div></div>`));
    }
    if (!(stats.recentDocuments || []).length) docBox.innerHTML = '<div class="doc-meta">Nothing yet.</div>';
  }

  function stat(icon, num, label, cls) {
    return `<div class="card stat-card"><div class="stat-ic ${cls}">${icon}</div><div><div class="stat-num">${UI.esc(String(num))}</div><div class="stat-label">${UI.esc(label)}</div></div></div>`;
  }

  // ----------------------------------------------------------------- MESSAGES
  async function renderMessages(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    if (messaging) messaging.destroy();
    messaging = new window.MessagingView({ container: box, canCompose: true, allowClassChat: true });
    await messaging.render();
  }

  // ----------------------------------------------------------------- DOCUMENTS
  async function renderDocuments(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    if (documents) documents.destroy();
    documents = new window.DocumentsView({ container: box, canUpload: true, canManage: true });
    await documents.render();
    documents.loadFolders();
  }

  // ----------------------------------------------------------------- ANNOUNCEMENTS
  async function renderAnnouncements(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    announcements = new window.AnnouncementsView({ container: box, canPost: false });
    await announcements.render();
  }

  // ----------------------------------------------------------------- CLASSES
  async function renderClasses(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    let data;
    try { data = await API.get('/api/classes'); } catch (e) { UI.toast(e.message, 'error'); return; }
    const cls = data.classes[0];
    if (!cls) {
      box.innerHTML = `<div class="empty-state"><div class="big">🏫</div><p>You are not assigned to a class yet.</p></div>`;
      return;
    }
    let detail;
    try { detail = (await API.get(`/api/classes/${cls.id}`)).class; } catch { detail = null; }

    box.innerHTML = `<div class="card">
        <h2>${UI.esc(cls.name)} ${UI.esc(cls.stream || '')}</h2>
        <div class="doc-meta">Academic year ${UI.esc(cls.academic_year)}</div>
        <div class="grid grid-3" style="margin-top:14px">
          <div class="card" style="margin:0"><div class="stat-label">Class teacher</div><div class="doc-name" style="margin-top:4px">${UI.esc(cls.class_teacher_name || 'Not assigned')}</div></div>
          <div class="card" style="margin:0"><div class="stat-label">Students</div><div class="stat-num" style="margin-top:4px">${cls.student_count || 0}</div></div>
        </div>
      </div>
      <div class="card"><h3>👩‍🏫 Your teachers</h3><div id="cls-teachers"></div></div>
      <div class="card"><h3>🧑‍🎓 Classmates (${(detail && detail.students || []).length})</h3><div id="cls-students"></div></div>`;

    const tBox = box.querySelector('#cls-teachers');
    if (detail && detail.teachers && detail.teachers.length) {
      for (const t of detail.teachers) {
        tBox.appendChild(UI.el(`<div class="list-row"><span class="k">${UI.esc(t.full_name)}${t.subject ? ' — ' + UI.esc(t.subject) : ''}</span><span class="badge blue">Teacher</span></div>`));
      }
    } else tBox.innerHTML = '<div class="doc-meta">No teachers assigned yet.</div>';

    const sBox = box.querySelector('#cls-students');
    if (detail && detail.students) {
      for (const s of detail.students) {
        sBox.appendChild(UI.el(`<div class="list-row"><span class="k">${UI.esc(s.full_name)}</span><span class="badge gray">${UI.esc(s.student_code)}</span></div>`));
      }
    } else sBox.innerHTML = '<div class="doc-meta">No classmates listed.</div>';
  }

  // ----------------------------------------------------------------- LEARNING
  async function renderAssignments(content) {
    content.innerHTML = `<div class="view active"></div>`;
    let me;
    try { me = (await API.get('/api/auth/me')).profile; } catch {}
    await window.Academics.AssignmentsView.studentView(content.firstElementChild, { studentId: me ? me.id : null });
  }
  async function renderResults(content) {
    content.innerHTML = `<div class="view active"></div>`;
    await window.Academics.ExamsView.studentView(content.firstElementChild);
  }
  async function renderAttendance(content) {
    content.innerHTML = `<div class="view active"></div>`;
    let me;
    try { me = (await API.get('/api/auth/me')).profile; } catch {}
    if (me && me.id) await window.Academics.AttendanceView.viewer(content.firstElementChild, { studentId: me.id, studentName: user.fullName });
    else content.firstElementChild.innerHTML = '<div class="doc-meta">Student profile not found.</div>';
  }
  async function renderTimetable(content) {
    content.innerHTML = `<div class="view active"></div>`;
    await window.Academics.TimetableView.view(content.firstElementChild, { manage: false });
  }

  // ----------------------------------------------------------------- NOTIFICATIONS
  async function renderNotifications(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    let items = [];
    try { items = (await API.get('/api/notifications?limit=100')).notifications; } catch (e) { UI.toast(e.message, 'error'); }
    const icons = { message: '💬', document: '📄', announcement: '📢', assignment: '📝', attendance: '✅', exam: '📋', results: '🎓', fee: '💰', system: '🔔', account: '🔐' };
    box.innerHTML = `<div class="card">
      <div style="display:flex;align-items:center;gap:10px"><h3 style="flex:1">Notifications</h3>
      <button class="btn secondary sm" id="nt-mark-all">Mark all read</button></div>
      <div id="nt-list" style="margin-top:8px"></div></div>`;
    const list = box.querySelector('#nt-list');
    if (!items.length) { list.innerHTML = '<div class="doc-meta">No notifications yet.</div>'; }
    for (const n of items) {
      list.appendChild(UI.el(`<div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" style="border-radius:10px;margin-bottom:6px">
        <span class="n-ic">${icons[n.type] || '🔔'}</span>
        <div><div class="n-title">${UI.esc(n.title)}</div>${n.body ? `<div class="n-body">${UI.esc(n.body)}</div>` : ''}<div class="n-time">${UI.timeAgo(n.created_at)}</div></div></div>`));
    }
    list.querySelectorAll('.notif-item').forEach((el) => el.addEventListener('click', async () => {
      try { await API.put(`/api/notifications/${el.dataset.id}/read`); } catch {}
      el.classList.remove('unread');
      UI.refreshUnreadCounts();
    }));
    box.querySelector('#nt-mark-all').onclick = async () => {
      try { await API.put('/api/notifications/read-all'); UI.toast('All notifications marked as read.', 'success'); renderNotifications(content); UI.refreshUnreadCounts(); }
      catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  // ----------------------------------------------------------------- PROFILE
  async function renderProfile(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    let me;
    try { me = await API.get('/api/auth/me'); } catch (e) { UI.toast(e.message, 'error'); return; }
    const u = me.user;
    const p = me.profile || {};
    box.innerHTML = `<div class="card" style="display:flex;gap:16px;align-items:center">
        <div class="avatar-lg">${UI.initials(u.fullName)}</div>
        <div><h2>${UI.esc(u.fullName)}</h2><div class="doc-meta">${UI.esc(u.email || '')} · Student</div>
        <button class="btn secondary sm" id="prof-pass" style="margin-top:8px">🔑 Change password</button>
        <button class="btn secondary sm" id="prof-photo" style="margin-top:8px">📷 Change photo</button></div>
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3>Account</h3>
          ${row('Username', u.username)}
          ${row('Email', u.email || '—')}
          ${row('Phone', u.phone || '—')}
          ${row('Member since', UI.fmtDate(u.createdAt))}
        </div>
        <div class="card"><h3>School info</h3>
          ${p.class_name ? row('Class', `${p.class_name} ${p.stream || ''}`) : ''}
          ${p.student_code ? row('Student number', p.student_code) : ''}
          ${p.enrollment_date ? row('Enrolled', p.enrollment_date) : ''}
          ${p.class_teacher && p.class_teacher.full_name ? row('Class teacher', p.class_teacher.full_name) : ''}
        </div>
      </div>
      <div id="prof-prefs" style="margin-top:16px"></div>`;
    box.querySelector('#prof-pass').onclick = () => UI.openChangePassword();
    box.querySelector('#prof-photo').onclick = () => UI.openAvatarUpload();
    await UI.profileSettingsPanel(box.querySelector('#prof-prefs'));
  }

  function row(k, v) { return `<div class="list-row"><span class="k">${UI.esc(k)}</span><span class="v">${UI.esc(v)}</span></div>`; }
})();
