/**
 * TEACHER DASHBOARD
 * Simple and focused: my classes & students, messages, documents, announcements.
 */
(async function () {
  const API = window.API;
  const UI = window.UI;

  // Session lives in an HttpOnly cookie: ask the server who we are.
  const user = await API.requireUser('teacher');
  if (!user) return;

  let layout;
  let messaging = null;
  let documents = null;
  let announcements = null;

  const nav = [
    { key: 'home', label: 'Home', icon: 'home', section: 'Main' },
    { key: 'messages', label: 'Messages', icon: 'messages', section: 'Main' },
    { key: 'documents', label: 'Documents', icon: 'document', section: 'Main' },
    { key: 'announcements', label: 'Announcements', icon: 'announcements', section: 'Main' },
    { key: 'classes', label: 'My Classes', icon: 'classes', section: 'Teaching' },
    { key: 'students', label: 'Students', icon: 'students', section: 'Teaching' },
    { key: 'attendance', label: 'Attendance', icon: 'check', section: 'Teaching' },
    { key: 'assignments', label: 'Assignments', icon: 'assignments', section: 'Teaching' },
    { key: 'exams', label: 'Exams & Results', icon: 'exams', section: 'Teaching' },
    { key: 'timetable', label: 'My Timetable', icon: 'timetable', section: 'Teaching' },
    { key: 'notifications', label: 'Notifications', icon: 'notifications', section: 'Account' },
    { key: 'profile', label: 'Profile', icon: 'profile', section: 'Account' },
  ];
  const bottomNav = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'messages', label: 'Messages', icon: 'messages' },
    { key: 'documents', label: 'Documents', icon: 'document' },
    { key: 'classes', label: 'Classes', icon: 'classes' },
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
        <h2 style="color:#fff;margin-bottom:2px">Hello, ${UI.esc(user.fullName.split(' ')[0])}! <svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M7 11V7a2 2 0 0 1 4 0v4"/><path d="M11 11V5a2 2 0 0 1 4 0v6"/><path d="M15 11V6a2 2 0 0 1 4 0v9a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-4a2 2 0 0 1 4 0"/></svg></h2>
        <div style="opacity:.92">Welcome back to your teaching dashboard.</div>
      </div>
      <div class="grid grid-4" style="margin-top:16px">
        ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>', c.classes || 0, 'My classes', 'ic-purple')}
        ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg>', c.students || 0, 'Students', 'ic-blue')}
        ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg>', c.unreadMessages || 0, 'Unread messages', 'ic-green')}
        ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>', c.documents || 0, 'My documents', 'ic-amber')}
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg> My classes</h3><div id="home-classes"></div></div>
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M14.5 8.5a5 5 0 0 1 0 7"/><path d="M17.5 5.5a9 9 0 0 1 0 13"/></svg> Latest announcements</h3><div id="home-ann"></div></div>
      </div>`;

    const clsBox = box.querySelector('#home-classes');
    for (const cl of (stats.classes || [])) {
      clsBox.appendChild(UI.el(`<div class="child-card" data-goto="classes" style="margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg></div>
          <div style="flex:1"><div class="doc-name">${UI.esc(cl.name)} ${UI.esc(cl.stream || '')}</div>
          <div class="doc-meta">${cl.student_count || 0} students${cl.unread ? ' · <svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg> ' + cl.unread + ' unread' : ''}</div></div>
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
    if (!classes.length) { box.innerHTML = '<div class="empty-state"><div class="big"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg></div><p>No classes assigned to you yet.</p></div>'; return; }

    box.innerHTML = `<div class="grid grid-3" id="class-grid"></div>`;
    const grid = box.querySelector('#class-grid');
    for (const cl of classes) {
      grid.appendChild(UI.el(`<div class="card" style="cursor:pointer" data-cid="${cl.id}">
        <h3>${UI.esc(cl.name)} ${UI.esc(cl.stream || '')}</h3>
        <div class="doc-meta">${cl.student_count || 0} students · ${UI.esc(cl.academic_year)}</div>
        <div style="margin-top:10px;display:flex;gap:6px">
          <button class="btn sm" data-open>View class</button>
          <button class="btn secondary sm" data-chat><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg> Class chat</button>
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
      title: `${detail.name} ${detail.stream || ''} — Class details`,
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
        if (!students.length) { list.innerHTML = '<div class="empty-state"><div class="big"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg></div>No students found.</div>'; return; }
        list.innerHTML = '';
        for (const s of students) {
          list.appendChild(UI.el(`<div class="doc-item">
            <div class="avatar">${UI.initials(s.full_name)}</div>
            <div style="flex:1;min-width:0">
              <div class="doc-name">${UI.esc(s.full_name)}</div>
              <div class="doc-meta">${UI.esc(s.student_code)} · ${UI.esc(s.class_name || '')} ${UI.esc(s.class_stream || '')}${s.parent_phone ? ' · <svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg> ' + UI.esc(s.parent_phone) : ''}</div>
            </div>
            ${s.user_id ? `<button class="btn secondary sm" data-msg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg> Message</button>` : ''}
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
    const icons = { message: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg>', document: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>', announcement: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M14.5 8.5a5 5 0 0 1 0 7"/><path d="M17.5 5.5a9 9 0 0 1 0 13"/></svg>', assignment: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>', attendance: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>', exam: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>', results: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg>', fee: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>', system: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>', account: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' };
    box.innerHTML = `<div class="card"><h3>Notifications</h3><div id="nt-list" style="margin-top:8px"></div></div>`;
    const list = box.querySelector('#nt-list');
    if (!items.length) list.innerHTML = '<div class="doc-meta">No notifications yet.</div>';
    for (const n of items) {
      list.appendChild(UI.el(`<div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" style="border-radius:10px;margin-bottom:6px">
        <span class="n-ic">${icons[n.type] || '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>'}</span>
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
        <button class="btn secondary sm" id="prof-pass" style="margin-top:8px"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3"/><path d="m16 6 3 3"/><path d="m19 3 3 3"/></svg> Change password</button>
        <button class="btn secondary sm" id="prof-photo" style="margin-top:8px"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Change photo</button></div>
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
