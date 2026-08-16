/**
 * TEACHER DASHBOARD
 * Simple and focused: my classes & students, messages, documents, announcements.
 */
(function () {
  const API = window.API;
  const UI = window.UI;

  const user = API.getUser();
  if (!API.getToken() || !user || user.role !== 'teacher') { location.href = '../login.html'; return; }

  let layout;
  let messaging = null;
  let documents = null;
  let announcements = null;

  const nav = [
    { key: 'home', label: 'Home', icon: '🏠', section: 'Main' },
    { key: 'messages', label: 'Messages', icon: '💬', section: 'Main' },
    { key: 'documents', label: 'Documents', icon: '📄', section: 'Main' },
    { key: 'announcements', label: 'Announcements', icon: '📢', section: 'Main' },
    { key: 'classes', label: 'My Classes', icon: '🏫', section: 'Teaching' },
    { key: 'students', label: 'Students', icon: '🧑‍🎓', section: 'Teaching' },
    { key: 'attendance', label: 'Attendance', icon: '✅', section: 'Teaching' },
    { key: 'assignments', label: 'Assignments', icon: '📝', section: 'Teaching' },
    { key: 'exams', label: 'Exams & Results', icon: '📋', section: 'Teaching' },
    { key: 'timetable', label: 'My Timetable', icon: '🕒', section: 'Teaching' },
    { key: 'notifications', label: 'Notifications', icon: '🔔', section: 'Account' },
    { key: 'profile', label: 'Profile', icon: '👤', section: 'Account' },
  ];
  const bottomNav = [
    { key: 'home', label: 'Home', icon: '🏠' },
    { key: 'messages', label: 'Messages', icon: '💬' },
    { key: 'documents', label: 'Documents', icon: '📄' },
    { key: 'classes', label: 'Classes', icon: '🏫' },
  ];

  UI.initLayout({ nav, bottomNav, title: 'Teacher Dashboard', onNav: (k) => show(k) }).then((l) => {
    layout = l;
    window.__setNavBadge = (k, n) => l.setBadge(k, n);
    window.__navHandler = (k) => show(k);
    window.Realtime.start();
    show('home');
  });

  async function show(key) {
    layout.setActive(key);
    const titles = { home: 'Home', messages: 'Messages', documents: 'Documents', announcements: 'Announcements', classes: 'My Classes', students: 'Students', notifications: 'Notifications', profile: 'Profile' };
    layout.setTitle(titles[key] || 'Dashboard');
    const content = layout.content;

    if (key === 'home') return renderHome(content);
    if (key === 'messages') return renderMessages(content);
    if (key === 'documents') return renderDocuments(content);
    if (key === 'announcements') return renderAnnouncements(content);
    if (key === 'classes') return renderClasses(content);
    if (key === 'students') return renderStudents(content);
    if (key === 'attendance') return renderAttendance(content);
    if (key === 'assignments') return renderAssignments(content);
    if (key === 'exams') return renderExams(content);
    if (key === 'timetable') return renderTimetable(content);
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
      <div class="card" style="background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#fff;border:none">
        <h2 style="color:#fff;margin-bottom:2px">Hello, ${UI.esc(user.fullName.split(' ')[0])}! 👩‍🏫</h2>
        <div style="opacity:.92">Welcome back to your teaching dashboard.</div>
      </div>
      <div class="grid grid-4" style="margin-top:16px">
        ${stat('🏫', c.classes || 0, 'My classes', 'ic-purple')}
        ${stat('🧑‍🎓', c.students || 0, 'Students', 'ic-blue')}
        ${stat('💬', c.unreadMessages || 0, 'Unread messages', 'ic-green')}
        ${stat('📄', c.documents || 0, 'My documents', 'ic-amber')}
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3>🏫 My classes</h3><div id="home-classes"></div></div>
        <div class="card"><h3>📢 Latest announcements</h3><div id="home-ann"></div></div>
      </div>`;

    const clsBox = box.querySelector('#home-classes');
    for (const cl of (stats.classes || [])) {
      clsBox.appendChild(UI.el(`<div class="child-card" data-goto="classes" style="margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar">🏫</div>
          <div style="flex:1"><div class="doc-name">${UI.esc(cl.name)} ${UI.esc(cl.stream || '')}</div>
          <div class="doc-meta">${cl.student_count || 0} students${cl.unread ? ' · 💬 ' + cl.unread + ' unread' : ''}</div></div>
        </div></div>`));
    }
    if (!(stats.classes || []).length) clsBox.innerHTML = '<div class="doc-meta">You have no classes assigned yet.</div>';
    clsBox.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => show('classes')));

    const annBox = box.querySelector('#home-ann');
    for (const a of (stats.recentAnnouncements || []).slice(0, 4)) {
      annBox.appendChild(UI.el(`<div class="ann-item ${a.is_read ? '' : 'unread'}" style="margin-bottom:8px"><div class="ann-title">${UI.esc(a.title)}</div><div class="ann-meta">${UI.timeAgo(a.created_at)}</div></div>`));
    }
    if (!(stats.recentAnnouncements || []).length) annBox.innerHTML = '<div class="doc-meta">Nothing yet.</div>';
  }

  function stat(icon, num, label, cls) {
    return `<div class="card stat-card"><div class="stat-ic ${cls}">${icon}</div><div><div class="stat-num">${UI.esc(String(num))}</div><div class="stat-label">${UI.esc(label)}</div></div></div>`;
  }

  // ----------------------------------------------------------------- MESSAGES
  async function renderMessages(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    if (messaging) messaging.destroy();
    messaging = new window.MessagingView({ container: box, canCompose: true });
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
    announcements = new window.AnnouncementsView({ container: box, canPost: true, teacherMode: true });
    await announcements.render();
  }

  // ----------------------------------------------------------------- CLASSES
  async function renderClasses(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    let data;
    try { data = await API.get('/api/classes'); } catch (e) { UI.toast(e.message, 'error'); return; }
    const classes = data.classes || [];
    if (!classes.length) { box.innerHTML = '<div class="empty-state"><div class="big">🏫</div><p>No classes assigned to you yet.</p></div>'; return; }

    box.innerHTML = `<div class="grid grid-3" id="class-grid"></div>`;
    const grid = box.querySelector('#class-grid');
    for (const cl of classes) {
      grid.appendChild(UI.el(`<div class="card" style="cursor:pointer" data-cid="${cl.id}">
        <h3>${UI.esc(cl.name)} ${UI.esc(cl.stream || '')}</h3>
        <div class="doc-meta">${cl.student_count || 0} students · ${UI.esc(cl.academic_year)}</div>
        <div style="margin-top:10px;display:flex;gap:6px">
          <button class="btn sm" data-open>View class</button>
          <button class="btn secondary sm" data-chat>💬 Class chat</button>
        </div>
      </div>`));
    }
    grid.querySelectorAll('.card').forEach((card) => {
      card.querySelector('[data-open]').onclick = () => openClassDetail(Number(card.dataset.cid));
      card.querySelector('[data-chat]').onclick = async () => {
        try {
          const r = await API.post('/api/messages/conversations', { type: 'class', classId: Number(card.dataset.cid) });
          show('messages');
          setTimeout(() => messaging && messaging.select(r.conversation.id), 250);
        } catch (e) { UI.toast(e.message, 'error'); }
      };
    });
  }

  async function openClassDetail(cid) {
    let detail;
    try { detail = (await API.get(`/api/classes/${cid}`)).class; } catch (e) { return UI.toast(e.message, 'error'); }
    const modal = UI.openModal({
      title: `${UI.esc(detail.name)} ${UI.esc(detail.stream || '')} — Class details`,
      wide: true,
      body: `<h4>Teachers</h4>
        ${detail.teachers && detail.teachers.length ? detail.teachers.map((t) => `<div class="list-row"><span class="k">${UI.esc(t.full_name)}</span><span class="v">${UI.esc(t.subject || '')}</span></div>`).join('') : '<div class="doc-meta">None</div>'}
        <h4 style="margin-top:14px">Students (${(detail.students || []).length})</h4>
        <div style="max-height:300px;overflow-y:auto">${(detail.students || []).map((s) => `<div class="list-row"><span class="k">${UI.esc(s.full_name)}</span><span class="v">${UI.esc(s.student_code || '')}</span></div>`).join('') || '<div class="doc-meta">No students.</div>'}</div>`,
      foot: `<button class="btn" data-close>Close</button>`,
    });
    modal.backdrop.querySelector('[data-close]').onclick = () => modal.close();
  }

  // ----------------------------------------------------------------- STUDENTS
  async function renderStudents(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = `<div class="card">
        <div class="search-input"><input id="stu-search" placeholder="Search students…"></div>
        <div class="doc-meta" style="margin-top:8px">Only students in your classes are shown.</div>
      </div><div id="stu-list"></div>`;

    const load = async () => {
      const q = box.querySelector('#stu-search').value.trim();
      try {
        const params = new URLSearchParams();
        if (q) params.set('search', q);
        const data = await API.get('/api/students' + (params.toString() ? '?' + params.toString() : ''));
        const list = box.querySelector('#stu-list');
        const students = data.students || [];
        if (!students.length) { list.innerHTML = '<div class="empty-state"><div class="big">🧑‍🎓</div>No students found.</div>'; return; }
        list.innerHTML = '';
        for (const s of students) {
          list.appendChild(UI.el(`<div class="doc-item">
            <div class="avatar">${UI.initials(s.full_name)}</div>
            <div style="flex:1;min-width:0">
              <div class="doc-name">${UI.esc(s.full_name)}</div>
              <div class="doc-meta">${UI.esc(s.student_code)} · ${UI.esc(s.class_name || '')} ${UI.esc(s.class_stream || '')}${s.parent_phone ? ' · 📞 ' + UI.esc(s.parent_phone) : ''}</div>
            </div>
            ${s.user_id ? `<button class="btn secondary sm" data-msg>💬 Message</button>` : ''}
          </div>`));
        }
        list.querySelectorAll('[data-msg]').forEach((b, i) => b.addEventListener('click', async () => {
          const s = students[i];
          show('messages');
          setTimeout(() => messaging && messaging.openDirect(s.user_id), 250);
        }));
      } catch (e) { UI.toast(e.message, 'error'); }
    };
    box.querySelector('#stu-search').oninput = () => load();
    await load();
  }

  // ----------------------------------------------------------------- ACADEMIC
  async function renderAttendance(content) {
    content.innerHTML = `<div class="view active"></div>`;
    await window.Academics.AttendanceView.teacherView(content.firstElementChild);
  }
  async function renderAssignments(content) {
    content.innerHTML = `<div class="view active"></div>`;
    await window.Academics.AssignmentsView.teacherView(content.firstElementChild);
  }
  async function renderExams(content) {
    content.innerHTML = `<div class="view active"></div>`;
    await window.Academics.ExamsView.staffView(content.firstElementChild);
  }
  async function renderTimetable(content) {
    content.innerHTML = `<div class="view active"></div>`;
    // teachers see the timetable of their classes (read-only)
    await window.Academics.TimetableView.view(content.firstElementChild, { manage: false });
  }

  // ----------------------------------------------------------------- NOTIFICATIONS
  async function renderNotifications(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    let items = [];
    try { items = (await API.get('/api/notifications?limit=100')).notifications; } catch (e) { UI.toast(e.message, 'error'); }
    const icons = { message: '💬', document: '📄', announcement: '📢', assignment: '📝', attendance: '✅', exam: '📋', results: '🎓', fee: '💰', system: '🔔', account: '🔐' };
    box.innerHTML = `<div class="card"><h3>Notifications</h3><div id="nt-list" style="margin-top:8px"></div></div>`;
    const list = box.querySelector('#nt-list');
    if (!items.length) list.innerHTML = '<div class="doc-meta">No notifications yet.</div>';
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
        <div><h2>${UI.esc(u.fullName)}</h2><div class="doc-meta">${UI.esc(u.email || '')} · Teacher</div>
        <button class="btn secondary sm" id="prof-pass" style="margin-top:8px">🔑 Change password</button>
        <button class="btn secondary sm" id="prof-photo" style="margin-top:8px">📷 Change photo</button></div>
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3>Account</h3>
          ${row('Username', u.username)} ${row('Phone', u.phone || '—')} ${row('Email', u.email || '—')}
          ${row('Member since', UI.fmtDate(u.createdAt))}
        </div>
        <div class="card"><h3>Teaching</h3>
          ${p.staff_code ? row('Staff number', p.staff_code) : ''}
          ${p.subjects && p.subjects.length ? row('Subjects', p.subjects.join(', ')) : ''}
          ${p.classes && p.classes.length ? row('Classes', p.classes.map((c) => `${c.name} ${c.stream || ''}`).join(', ')) : ''}
          ${p.qualification ? row('Qualification', p.qualification) : ''}
          ${p.date_joined ? row('Joined', p.date_joined) : ''}
        </div>
      </div>
      <div id="prof-prefs" style="margin-top:16px"></div>`;
    box.querySelector('#prof-pass').onclick = () => UI.openChangePassword();
    box.querySelector('#prof-photo').onclick = () => UI.openAvatarUpload();
    await UI.profileSettingsPanel(box.querySelector('#prof-prefs'));
  }

  function row(k, v) { return `<div class="list-row"><span class="k">${UI.esc(k)}</span><span class="v">${UI.esc(v)}</span></div>`; }
})();
