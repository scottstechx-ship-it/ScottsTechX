/**
 * ADMIN DASHBOARD — everyday school management.
 * Students (incl. bulk import), staff, classes, academics (attendance,
 * assignments, exams, timetable, fees), communication & documents.
 */
(async function () {
  const API = window.API;
  const UI = window.UI;

  // Session lives in an HttpOnly cookie: ask the server who we are.
  const user = await API.requireUser('admin');
  if (!user) return;

  let layout;
  let messaging = null;
  let documents = null;
  let announcements = null;
  let ref = { classes: [], teachers: [], students: [], parents: [] };

  const nav = [
    { key: 'home', label: 'Home', icon: 'home', section: 'Main' },
    { key: 'messages', label: 'Messages', icon: 'messages', section: 'Main' },
    { key: 'documents', label: 'Documents', icon: 'document', section: 'Main' },
    { key: 'announcements', label: 'Announcements', icon: 'announcements', section: 'Main' },
    { key: 'students', label: 'Students', icon: 'students', section: 'Management' },
    { key: 'import', label: 'Import Center', icon: 'import', section: 'Management' },
    { key: 'users', label: 'Users & Staff', icon: 'users', section: 'Management' },
    { key: 'teachers', label: 'Teachers', icon: 'teachers', section: 'Management' },
    { key: 'parents', label: 'Parents', icon: 'parents', section: 'Management' },
    { key: 'classes', label: 'Classes', icon: 'classes', section: 'Management' },
    { key: 'subjects', label: 'Subjects', icon: 'subjects', section: 'Management' },
    { key: 'attendance', label: 'Attendance', icon: 'check', section: 'Academic' },
    { key: 'assignments', label: 'Assignments', icon: 'assignments', section: 'Academic' },
    { key: 'exams', label: 'Exams & Results', icon: 'exams', section: 'Academic' },
    { key: 'timetable', label: 'Timetable', icon: 'timetable', section: 'Academic' },
    { key: 'fees', label: 'Fees & Payments', icon: 'fees', section: 'Academic' },
    { key: 'admissions', label: 'Admissions', icon: 'admissions', section: 'Website' },
    { key: 'website-news', label: 'Website News', icon: 'news', section: 'Website' },
    { key: 'website-contact', label: 'Website Messages', icon: 'mail', section: 'Website' },
    { key: 'notifications', label: 'Notifications', icon: 'notifications', section: 'Account' },
    { key: 'profile', label: 'Profile', icon: 'profile', section: 'Account' },
  ];
  const bottomNav = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'messages', label: 'Messages', icon: 'messages' },
    { key: 'students', label: 'Students', icon: 'students' },
    { key: 'documents', label: 'Documents', icon: 'document' },
  ];

  UI.initLayout({ nav, bottomNav, title: 'Admin Dashboard', onNav: (k) => show(k) }).then(async (l) => {
    layout = l;
    window.__setNavBadge = (k, n) => l.setBadge(k, n);
    window.__navHandler = (k) => show(k);
    try { ref = await API.get('/api/settings/classes-reference'); } catch {}
    window.Realtime.start();
    show('home');
  });

  async function show(key) {
    layout.setActive(key);
    const titles = { home: 'Home', messages: 'Messages', documents: 'Documents', announcements: 'Announcements', students: 'Students', import: 'Import Center', users: 'Users & Staff', teachers: 'Teachers', parents: 'Parents', classes: 'Classes', subjects: 'Subjects', attendance: 'Attendance', assignments: 'Assignments', exams: 'Exams & Results', timetable: 'Timetable', fees: 'Fees & Payments', admissions: 'Admission Applications', 'website-news': 'Website News', 'website-contact': 'Website Messages', notifications: 'Notifications', profile: 'Profile' };
    layout.setTitle(titles[key] || 'Dashboard');
    const content = layout.content;

    if (key === 'home') return renderHome(content);
    if (key === 'messages') return renderMessages(content);
    if (key === 'documents') return renderDocuments(content);
    if (key === 'announcements') return renderAnnouncements(content);
    if (key === 'students') return renderStudents(content);
    if (key === 'users') return renderUsers(content);
    if (key === 'import') return renderImportCenter(content);
    if (key === 'teachers') return renderTeachers(content);
    if (key === 'parents') return renderParents(content);
    if (key === 'classes') return renderClasses(content);
    if (key === 'subjects') return renderSubjects(content);
    if (key === 'attendance') return renderAttendance(content);
    if (key === 'assignments') return renderAssignments(content);
    if (key === 'exams') return renderExams(content);
    if (key === 'timetable') return renderTimetable(content);
    if (key === 'fees') return renderFees(content);
    if (key === 'admissions') { content.innerHTML = '<div class="view active"></div>'; return window.Website.AdmissionsView.render(content.firstElementChild); }
    if (key === 'website-news') { content.innerHTML = '<div class="view active"></div>'; return window.Website.NewsManager.render(content.firstElementChild); }
    if (key === 'website-contact') { content.innerHTML = '<div class="view active"></div>'; return window.Website.ContactInbox.render(content.firstElementChild); }
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
      <div class="card" style="background:linear-gradient(135deg,#0f172a,#334155);color:#fff;border:none">
        <h2 style="color:#fff;margin-bottom:2px">Good day, ${UI.esc(user.fullName.split(' ')[0])}! <svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg></h2>
        <div style="opacity:.9">School operations overview.</div>
      </div>
      <div class="grid grid-4" style="margin-top:16px">
        ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg>', c.students || 0, 'Students', 'ic-blue')}
        ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>', c.teachers || 0, 'Teachers', 'ic-purple')}
        ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg>', c.parents || 0, 'Parents', 'ic-green')}
        ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>', c.classes || 0, 'Classes', 'ic-amber')}
        ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>', c.attendanceToday || 0, 'Attendance today', 'ic-green')}
        ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>', c.assignments || 0, 'Assignments', 'ic-blue')}
        ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>', c.exams || 0, 'Exams', 'ic-purple')}
        ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>', c.unreadNotifications || 0, 'Notifications', 'ic-red')}
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg> Students per class</h3><div id="home-chart"></div></div>
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg> Fee snapshot</h3><div id="home-fees"></div></div>
      </div>
      <div class="grid grid-3" style="margin-top:16px">
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 13h6"/><path d="M9 17h4"/></svg> Upcoming exams</h3><div id="home-exams"></div></div>
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> Assignments due soon</h3><div id="home-assign"></div></div>
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M14.5 8.5a5 5 0 0 1 0 7"/><path d="M17.5 5.5a9 9 0 0 1 0 13"/></svg> Recent announcements</h3><div id="home-ann"></div></div>
      </div>`;

    UI.barChart(box.querySelector('#home-chart'), (stats.studentsPerClass || []).map((r) => ({ label: r.label, value: r.value })));

    const fees = stats.fees || {};
    box.querySelector('#home-fees').innerHTML =
      `<div class="list-row"><span class="k">Total billed</span><span class="v">${UI.money(fees.due)}</span></div>
       <div class="list-row"><span class="k">Total paid</span><span class="v">${UI.money(fees.paid)}</span></div>
       <div class="list-row"><span class="k">Outstanding</span><span class="v" style="color:var(--danger)">${UI.money((fees.due || 0) - (fees.paid || 0))}</span></div>
       ${fees.with_outstanding ? `<div class="list-row"><span class="k">Students with balances</span><span class="v">${fees.with_outstanding}</span></div>` : ''}`;

    const examBox = box.querySelector('#home-exams');
    for (const e of (stats.upcomingExams || []).slice(0, 4)) {
      examBox.appendChild(UI.el(`<div class="list-row"><span class="k">${UI.esc(e.title)}</span><span class="v">${UI.esc(e.date || '—')}</span></div>`));
    }
    if (!(stats.upcomingExams || []).length) examBox.innerHTML = '<div class="doc-meta">No upcoming exams.</div>';

    const asBox = box.querySelector('#home-assign');
    for (const a of (stats.upcomingAssignments || []).slice(0, 4)) {
      asBox.appendChild(UI.el(`<div class="list-row"><span class="k">${UI.esc(a.title)}</span><span class="v">${UI.esc(a.due_date || '—')}</span></div>`));
    }
    if (!(stats.upcomingAssignments || []).length) asBox.innerHTML = '<div class="doc-meta">No assignments due soon.</div>';

    const annBox = box.querySelector('#home-ann');
    for (const a of (stats.recentAnnouncements || []).slice(0, 4)) {
      annBox.appendChild(UI.el(`<div class="ann-item ${a.is_read ? '' : 'unread'}" style="margin-bottom:8px"><div class="ann-title">${UI.esc(a.title)}</div><div class="ann-meta">${UI.timeAgo(a.created_at)}</div></div>`));
    }
    if (!(stats.recentAnnouncements || []).length) annBox.innerHTML = '<div class="doc-meta">Nothing yet.</div>';
  }

  function stat(icon, num, label, cls) {
    return `<div class="card stat-card"><div class="stat-ic ${cls}">${icon}</div><div><div class="stat-num">${UI.esc(String(num))}</div><div class="stat-label">${UI.esc(label)}</div></div></div>`;
  }

  // ----------------------------------------------------------------- MESSAGES / DOCUMENTS / ANNOUNCEMENTS
  async function renderMessages(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    if (messaging) messaging.destroy();
    messaging = new window.MessagingView({ container: box, canCompose: true });
    await messaging.render();
  }
  async function renderDocuments(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    if (documents) documents.destroy();
    documents = new window.DocumentsView({ container: box, canUpload: true, canManage: true });
    await documents.render();
    documents.loadFolders();
  }
  async function renderAnnouncements(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    announcements = new window.AnnouncementsView({ container: box, canPost: true, teacherMode: false });
    await announcements.render();
  }

  // ----------------------------------------------------------------- STUDENTS (search/filter/sort/archive/profile)
  async function renderStudents(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = `
      <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <div class="search-input" style="flex:1;min-width:170px"><input id="stu-search" placeholder="Search students…"></div>
        <select id="stu-class" style="width:auto"><option value="">All classes</option>${ref.classes.map((c) => `<option value="${c.id}">${UI.esc(c.name)} ${UI.esc(c.stream)}</option>`).join('')}</select>
        <select id="stu-status" style="width:auto"><option value="">All statuses</option><option>active</option><option>inactive</option><option>archived</option></select>
        <select id="stu-sort" style="width:auto"><option value="name">Sort: Name</option><option value="code">Sort: ID</option><option value="class">Sort: Class</option></select>
        <button class="btn" id="stu-add">＋ Add student</button>
        <button class="btn secondary" id="stu-import"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg> Import</button>
      </div>
      <div class="card table-responsive"><div id="stu-list"></div>
        <button class="btn secondary block" id="stu-more" style="margin-top:12px;display:none">Load more</button>
      </div>`;

    box.querySelector('#stu-add').onclick = () => studentModal(null, () => loadStudents(true));
    box.querySelector('#stu-import').onclick = () => openImportWizard();
    const search = box.querySelector('#stu-search');
    const clsSel = box.querySelector('#stu-class');
    const statusSel = box.querySelector('#stu-status');
    const sortSel = box.querySelector('#stu-sort');
    let offset = 0;
    const PAGE = 50;

    const loadStudents = async (reset = false) => {
      if (reset) offset = 0;
      const params = new URLSearchParams();
      if (search.value.trim()) params.set('search', search.value.trim());
      if (clsSel.value) params.set('classId', clsSel.value);
      if (statusSel.value) params.set('status', statusSel.value);
      params.set('limit', String(PAGE));
      params.set('offset', String(offset));
      try {
        const data = await API.get('/api/students?' + params.toString());
        let students = data.students || [];
        // client-side sort for the visible page
        if (sortSel.value === 'code') students.sort((a, b) => a.student_code.localeCompare(b.student_code));
        else if (sortSel.value === 'class') students.sort((a, b) => (a.class_name || '').localeCompare(b.class_name || ''));
        else students.sort((a, b) => a.full_name.localeCompare(b.full_name));

        const list = box.querySelector('#stu-list');
        const more = box.querySelector('#stu-more');
        if (reset) list.innerHTML = '';
        if (!students.length && reset) { list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="big"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg></div>No students found.</div>'; more.style.display = 'none'; return; }
        more.style.display = students.length >= PAGE ? 'block' : 'none';
        if (reset) {
          list.innerHTML = `<table class="table"><thead><tr>
            <th>Student</th><th>Number</th><th>Class</th><th>Guardian</th><th>Status</th><th style="text-align:right">Actions</th>
          </tr></thead><tbody></tbody></table>`;
        }
        const tbody = list.querySelector('tbody');
        students.forEach((s) => {
          if (tbody.querySelector(`[data-sid="${s.id}"]`)) return; // dedupe on load-more
          const tr = document.createElement('tr');
          tr.setAttribute('data-sid', s.id);
          tr.innerHTML = `
            <td data-label="Student"><a href="#" data-view="${s.id}" style="font-weight:600">${UI.esc(s.full_name)}</a></td>
            <td data-label="Number">${UI.esc(s.student_code)}</td>
            <td data-label="Class">${UI.esc(s.class_name || '—')} ${UI.esc(s.class_stream || '')}</td>
            <td data-label="Guardian">${UI.esc(s.parent_name || '—')}${s.parent_phone ? '<br><small>' + UI.esc(s.parent_phone) + '</small>' : ''}</td>
            <td data-label="Status">${statusBadge(s.status)}</td>
            <td data-label="" class="actions-cell"><div class="actions">
              <button class="btn secondary sm" data-view="${s.id}" title="View profile"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg></button>
              <button class="btn secondary sm" data-edit="${s.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
              <button class="btn secondary sm" data-archive="${s.id}" title="${s.status === 'archived' ? 'Restore' : 'Archive'}">${s.status === 'archived' ? '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10"/><path d="M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/></svg>' : '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5"/><path d="M12 12v10"/></svg>'}</button>
              <button class="btn danger sm" data-del="${s.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
            </div></td>`;
          tbody.appendChild(tr);
          tr.querySelector('[data-edit]').onclick = () => studentModal(s, () => loadStudents(true));
          tr.querySelector('[data-view]').onclick = (e) => { e.preventDefault(); openStudentProfile(s.id); };
          tr.querySelector('[data-archive]').onclick = async () => {
            const next = s.status === 'archived' ? 'active' : 'archived';
            try { await API.put(`/api/students/${s.id}/status`, { status: next }); UI.toast(next === 'archived' ? 'Student archived.' : 'Student restored.', 'success'); loadStudents(true); }
            catch (e) { UI.toast(e.message, 'error'); }
          };
          tr.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Delete student ${UI.esc(s.full_name)}? This also removes their account.`, { title: 'Delete student', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/students/${s.id}`); UI.toast('Student deleted.', 'success'); loadStudents(true); } catch (e) { UI.toast(e.message, 'error'); }
          };
        });
        offset += PAGE;
      } catch (e) { UI.toast(e.message, 'error'); }
    };
    search.oninput = UI.debounce(() => loadStudents(true), 350);
    clsSel.onchange = () => loadStudents(true);
    statusSel.onchange = () => loadStudents(true);
    sortSel.onchange = () => loadStudents(true);
    box.querySelector('#stu-more').onclick = () => loadStudents(false);
    await loadStudents(true);
  }

  /** Student profile with tabs — everything about one student. */
  async function openStudentProfile(id) {
    let student;
    try { student = (await API.get(`/api/students/${id}`)).student; } catch (e) { return UI.toast(e.message, 'error'); }
    let modal;
    modal = UI.openModal({
      title: `${UI.esc(student.full_name)} — ${UI.esc(student.student_code)}`,
      wide: true,
      body: `<div class="tabs" id="prof-tabs">
        <button class="tab active" data-tab="overview">Overview</button>
        <button class="tab" data-tab="attendance">Attendance</button>
        <button class="tab" data-tab="fees">Fees</button>
        <button class="tab" data-tab="results">Results</button>
        <button class="tab" data-tab="assignments">Assignments</button>
        <button class="tab" data-tab="timetable">Timetable</button>
      </div><div id="prof-body"></div>`,
      foot: '<button class="btn secondary" data-edit><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> Edit</button><button class="btn" data-close>Close</button>',
    });
    modal.backdrop.querySelector('[data-close]').onclick = () => modal.close();
    modal.backdrop.querySelector('[data-edit]').onclick = () => { studentModal(student, () => openStudentProfile(id)); modal.close(); };

    const tabs = modal.backdrop.querySelector('#prof-tabs');
    const body = modal.backdrop.querySelector('#prof-body');

    const showTab = async (tab) => {
      tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
      if (tab === 'overview') {
        body.innerHTML = `<div class="list-row"><span class="k">Student number</span><span class="v">${UI.esc(student.student_code)}</span></div>
          <div class="list-row"><span class="k">Class</span><span class="v">${UI.esc(student.class_name || 'Unassigned')} ${UI.esc(student.class_stream || '')}</span></div>
          <div class="list-row"><span class="k">Gender</span><span class="v">${UI.esc(student.gender || '—')}</span></div>
          <div class="list-row"><span class="k">Date of birth</span><span class="v">${UI.esc(student.date_of_birth || '—')}</span></div>
          <div class="list-row"><span class="k">Enrolled</span><span class="v">${UI.esc(student.enrollment_date || '—')}</span></div>
          <div class="list-row"><span class="k">Status</span><span class="v">${statusBadge(student.status)}</span></div>
          <h4 style="margin-top:14px">Guardian</h4>
          <div class="list-row"><span class="k">Name</span><span class="v">${UI.esc(student.parent_name || '—')}</span></div>
          <div class="list-row"><span class="k">Phone</span><span class="v">${UI.esc(student.parent_phone || '—')}</span></div>
          <div class="list-row"><span class="k">Email</span><span class="v">${UI.esc(student.parent_email || '—')}</span></div>
          <div class="list-row"><span class="k">Address</span><span class="v">${UI.esc(student.address || '—')}</span></div>`;
      } else if (tab === 'attendance') {
        body.innerHTML = '<div class="doc-meta">Loading…</div>';
        await window.Academics.AttendanceView.viewer(body, { studentId: id, studentName: student.full_name });
      } else if (tab === 'fees') {
        body.innerHTML = '<div class="doc-meta">Loading…</div>';
        await window.Academics.FeesView.viewer(body, { studentId: id, studentName: student.full_name });
      } else if (tab === 'results') {
        body.innerHTML = '<div class="doc-meta">Loading…</div>';
        try {
          const data = (await API.get('/api/exams?classId=' + (student.class_id || ''))).exams || [];
          const published = data.filter((e) => e.status === 'published');
          if (!published.length) { body.innerHTML = '<div class="doc-meta">No published results yet.</div>'; return; }
          body.innerHTML = '<div class="table-responsive"><table class="table"><thead><tr><th>Exam</th><th>Subject</th><th>Marks</th><th>Grade</th></tr></thead><tbody></tbody></table></div>';
          const tbody = body.querySelector('tbody');
          for (const e of published) {
            const exam = (await API.get(`/api/exams/${e.id}`)).exam;
            const res = (exam.results || []).find((r) => r.student_id === id);
            const tr = document.createElement('tr');
            tr.innerHTML = `<td data-label="Exam">${UI.esc(e.title)}</td><td data-label="Subject">${UI.esc(e.subject || '')}</td><td data-label="Marks">${res ? res.marks : '—'}</td><td data-label="Grade">${res ? UI.esc(res.grade || '—') : '—'}</td>`;
            tbody.appendChild(tr);
          }
        } catch (e) { body.innerHTML = `<div class="doc-meta">${UI.esc(e.message)}</div>`; }
      } else if (tab === 'assignments') {
        body.innerHTML = '<div class="doc-meta">Loading…</div>';
        try {
          const data = (await API.get('/api/assignments?classId=' + (student.class_id || ''))).assignments || [];
          if (!data.length) { body.innerHTML = '<div class="doc-meta">No assignments for this class.</div>'; return; }
          body.innerHTML = data.map((a) => `<div class="list-row"><span class="k">${UI.esc(a.title)} ${UI.esc(a.due_date ? '· due ' + a.due_date : '')}</span><span class="v">${a.submission_count || 0} submissions</span></div>`).join('');
        } catch (e) { body.innerHTML = `<div class="doc-meta">${UI.esc(e.message)}</div>`; }
      } else if (tab === 'timetable') {
        body.innerHTML = '<div class="doc-meta">Loading…</div>';
        if (student.class_id) {
          const entries = (await API.get(`/api/timetable?classId=${student.class_id}`)).entries || [];
          body.innerHTML = entries.length ? `<div class="table-responsive"><table class="table"><thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Room</th></tr></thead><tbody>${entries.map((e) => `<tr><td data-label="Day">${UI.esc(e.day)}</td><td data-label="Time">${UI.esc(e.start_time)}-${UI.esc(e.end_time)}</td><td data-label="Subject">${UI.esc(e.subject || '—')}</td><td data-label="Room">${UI.esc(e.room || '—')}</td></tr>`).join('')}</tbody></table></div>`
            : '<div class="doc-meta">No timetable for this class.</div>';
        } else body.innerHTML = '<div class="doc-meta">Student has no class assigned.</div>';
      }
    };
    tabs.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
    await showTab('overview');
  }

  function studentModal(s, onSave) {
    const isEdit = !!s;
    let modal;
    modal = UI.openModal({
      title: isEdit ? 'Edit student' : 'Add student',
      wide: true,
      body: `<div class="form-row">
        <label class="field">Full name <span class="req">*</span><input id="s-name" value="${isEdit ? UI.esc(s.full_name) : ''}"></label>
        <label class="field">Student number <span class="req">*</span><input id="s-code" value="${isEdit ? UI.esc(s.student_code) : ''}"></label>
      </div>
      <div class="form-row">
        <label class="field">Class (transfer)<select id="s-class"><option value="">— Unassigned —</option>${ref.classes.map((c) => `<option value="${c.id}" ${isEdit && s.class_id === c.id ? 'selected' : ''}>${UI.esc(c.name)} ${UI.esc(c.stream)}</option>`).join('')}</select></label>
        <label class="field">Gender<select id="s-gender"><option value="">—</option><option ${isEdit && s.gender === 'Male' ? 'selected' : ''}>Male</option><option ${isEdit && s.gender === 'Female' ? 'selected' : ''}>Female</option></select></label>
      </div>
      <div class="form-row">
        <label class="field">Parent/guardian name<input id="s-pname" value="${isEdit ? UI.esc(s.parent_name || '') : ''}"></label>
        <label class="field">Parent phone<input id="s-pphone" value="${isEdit ? UI.esc(s.parent_phone || '') : ''}"></label>
      </div>
      <div class="form-row">
        <label class="field">Parent email<input id="s-pemail" value="${isEdit ? UI.esc(s.parent_email || '') : ''}"></label>
        <label class="field">Date of birth<input type="date" id="s-dob" value="${isEdit ? UI.esc(s.date_of_birth || '') : ''}"></label>
      </div>
      <label class="field">Address<input id="s-address" value="${isEdit ? UI.esc(s.address || '') : ''}"></label>
      <div class="form-row">
        <label class="field">Enrollment date<input type="date" id="s-enroll" value="${isEdit ? UI.esc(s.enrollment_date || '') : ''}"></label>
        <label class="field">Status<select id="s-status">${['active', 'inactive', 'archived'].map((st) => `<option ${isEdit && s.status === st ? 'selected' : ''}>${st}</option>`).join('')}</select></label>
      </div>
      ${!isEdit ? `<div class="form-row">
        <label class="field">Login username (optional)<input id="s-username" placeholder="student2026"></label>
        <label class="field">Login password (optional)<input id="s-password" type="password" placeholder="min 8 characters"></label>
      </div>` : ''}`,
      foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>${isEdit ? 'Save changes' : 'Add student'}</button>`,
    });
    modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
    modal.backdrop.querySelector('[data-save]').onclick = async () => {
      const body = {
        fullName: modal.backdrop.querySelector('#s-name').value.trim(),
        studentCode: modal.backdrop.querySelector('#s-code').value.trim(),
        classId: modal.backdrop.querySelector('#s-class').value || null,
        gender: modal.backdrop.querySelector('#s-gender').value || null,
        parentName: modal.backdrop.querySelector('#s-pname').value.trim(),
        parentPhone: modal.backdrop.querySelector('#s-pphone').value.trim(),
        parentEmail: modal.backdrop.querySelector('#s-pemail').value.trim(),
        dateOfBirth: modal.backdrop.querySelector('#s-dob').value,
        address: modal.backdrop.querySelector('#s-address').value.trim(),
        enrollmentDate: modal.backdrop.querySelector('#s-enroll').value,
        status: modal.backdrop.querySelector('#s-status').value,
      };
      if (!isEdit) {
        body.username = modal.backdrop.querySelector('#s-username').value.trim();
        body.password = modal.backdrop.querySelector('#s-password').value;
      }
      try {
        if (isEdit) await API.put(`/api/students/${s.id}`, body);
        else await API.post('/api/students', body);
        UI.toast(isEdit ? 'Student updated.' : 'Student added.', 'success');
        modal.close();
        onSave && onSave();
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  // ----------------------------------------------------------------- BULK IMPORT WIZARD
  // ---------- IMPORT CENTER: students, teachers, fees + templates ----------
  async function downloadTemplate(type) {
    try {
      // Session cookie is sent automatically; no token in JS any more.
      const res = await fetch(`${API.base}/api/imports/template.csv?type=${type}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Could not download the template.');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${type}-import-template.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  function simpleImport(kind, endpoint, title, help) {
    const modal = UI.openModal({
      title,
      wide: true,
      body: `<p>${help}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">
          <button class="btn secondary sm" data-tpl><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg> Download ${kind} template</button>
        </div>
        <input type="file" id="si-file" accept=".csv,.xlsx,.xls">
        <div id="si-result" style="margin-top:14px"></div>`,
      foot: '<button class="btn secondary" data-cancel>Close</button>',
    });
    modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
    modal.backdrop.querySelector('[data-tpl]').onclick = () => downloadTemplate(kind);
    modal.backdrop.querySelector('#si-file').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const result = modal.backdrop.querySelector('#si-result');
      result.innerHTML = '<div class="doc-meta">Importing… please wait.</div>';
      const form = new FormData();
      form.append('file', file);
      try {
        const r = await API.upload(endpoint, form);
        let html = `<div class="card" style="background:var(--success-light)"><b><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> ${UI.esc(r.message)}</b></div>`;
        if (r.credentials && r.credentials.length) {
          html += `<div class="card" style="margin-top:10px"><b>Login codes created:</b>
            <div class="table-responsive"><table class="table"><thead><tr><th>Name</th><th>Code</th><th>Username</th><th>Password</th></tr></thead>
            <tbody>${r.credentials.map((c) => `<tr><td data-label="Name">${UI.esc(c.name)}</td><td data-label="Code">${UI.esc(c.staffCode || c.username)}</td><td data-label="Username">${UI.esc(c.username)}</td><td data-label="Password">${UI.esc(c.password)}</td></tr>`).join('')}</tbody></table></div>
            <div class="doc-meta" style="margin-top:6px">Each person must change the password on first login. Save this list — passwords are not shown again.</div></div>`;
        }
        if (r.failures && r.failures.length) {
          html += `<div class="card" style="margin-top:10px;background:var(--danger-light)"><b><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg> ${r.failures.length} row(s) skipped:</b>
            ${r.failures.slice(0, 20).map((f) => `<div class="doc-meta">Row ${f.row}: ${UI.esc(f.name)} — ${UI.esc(f.reason)}</div>`).join('')}</div>`;
        }
        result.innerHTML = html;
      } catch (err) {
        result.innerHTML = `<div class="card" style="background:var(--danger-light)"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg> ${UI.esc(err.message)}</div>`;
      }
      e.target.value = '';
    };
  }

  async function renderImportCenter(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin:0 0 4px"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg> Import Center</h3>
        <div class="doc-meta">Bulk-load school data from Excel/CSV. Download a template first to see exactly how to organise the columns — codes, usernames and passwords are generated automatically, accounts are created, and roles are assigned.</div>
      </div>
      <div class="grid-3" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
        <div class="card">
          <h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg> Students</h3>
          <div class="doc-meta" style="margin:6px 0 12px">Guided 6-step wizard: upload, map columns, validate, preview, import. Student codes + logins auto-generated.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn" id="imp-students">Start student import</button>
            <button class="btn secondary" data-tpl="students"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg> Template</button>
          </div>
        </div>
        <div class="card">
          <h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg> Teachers</h3>
          <div class="doc-meta" style="margin:6px 0 12px">One-step import: each teacher gets a staff code + login account (username = staff code) with a default password changed on first login.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn" id="imp-teachers">Import teachers</button>
            <button class="btn secondary" data-tpl="teachers"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg> Template</button>
          </div>
        </div>
        <div class="card">
          <h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg> Fees</h3>
          <div class="doc-meta" style="margin:6px 0 12px">Each row becomes a fee structure, automatically assigned to that class's students (or all students when class is blank).</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn" id="imp-fees">Import fees</button>
            <button class="btn secondary" data-tpl="fees"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg> Template</button>
          </div>
        </div>
      </div>`;
    box.querySelectorAll('[data-tpl]').forEach((b) => { b.onclick = () => downloadTemplate(b.dataset.tpl); });
    box.querySelector('#imp-students').onclick = () => openImportWizard();
    box.querySelector('#imp-teachers').onclick = () => simpleImport('teachers', '/api/imports/teachers',
      '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg> Import teachers', 'Upload an Excel/CSV of teachers. Staff IDs may be left blank — the system generates them. Every teacher automatically gets a login account and the teacher role.');
    box.querySelector('#imp-fees').onclick = () => simpleImport('fees', '/api/imports/fees',
      '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg> Import fee structures', 'Upload an Excel/CSV of fees. Each row becomes a fee structure assigned to its class (leave Class blank to apply to all classes).');
  }

  async function openImportWizard() {
    let step = 1;
    let importId = null;
    let headers = [];
    let mapping = {};
    let validation = null;
    let importDbId = null;

    const wizard = UI.openModal({
      title: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg> Import students — Step 1 of 6: Upload',
      wide: true,
      body: `<div class="wiz-progress doc-meta" style="margin-bottom:14px"></div>
        <div id="wiz-body"></div>`,
      foot: '<button class="btn secondary" data-cancel>Close</button>',
    });
    const progress = wizard.backdrop.querySelector('.wiz-progress');
    const body = wizard.backdrop.querySelector('#wiz-body');
    wizard.backdrop.querySelector('[data-cancel]').onclick = () => wizard.close();

    const setProgress = () => {
      progress.textContent = `Step ${step} of 6: ${['Upload', 'Analyze', 'Map columns', 'Validate', 'Preview', 'Import'][step - 1]}`;
    };

    const renderUpload = () => {
      body.innerHTML = `<p>Upload an Excel (.xlsx) or CSV file containing student information.</p>
        <input type="file" id="imp-file" accept=".csv,.xlsx,.xls">
        <p class="doc-meta" style="margin-top:10px">Tip: download a starter template below.</p>
        <button class="btn secondary sm" id="imp-tpl-btn"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg> Download template</button>`;
      body.querySelector('#imp-tpl-btn').onclick = () => downloadTemplate('students');
      body.querySelector('#imp-file').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const form = new FormData();
        form.append('file', file);
        try {
          const r = await API.upload('/api/imports/upload', form);
          importId = r.importId;
          importDbId = r.importDbId;
          headers = r.headers;
          step = 2;
          setProgress();
          renderMap(r);
        } catch (err) { UI.toast(err.message, 'error'); }
      };
    };

    const guess = (h) => {
      const s = String(h).toLowerCase().replace(/[^a-z]/g, '');
      if (s.includes('firstname') || s === 'first') return 'firstName';
      if (s.includes('lastname') || s === 'last' || s.includes('surname')) return 'lastName';
      if (s.includes('fullname') || s.includes('studentname')) return 'fullName';
      if (s.includes('studentid') || s.includes('admission') || s.includes('regno') || s.includes('idnumber')) return 'studentCode';
      if (s.includes('class') || s.includes('grade') || s.includes('yeargroup')) return 'className';
      if (s.includes('stream')) return 'stream';
      if (s.includes('gender') || s.includes('sex')) return 'gender';
      if (s.includes('dateofbirth') || s.includes('dob') || s.includes('birth')) return 'dateOfBirth';
      if (s.includes('parentname') || s.includes('guardian')) return 'parentName';
      if (s.includes('parentphone') || s.includes('guardianphone') || s.includes('phone')) return 'parentPhone';
      if (s.includes('parentemail') || s.includes('email')) return 'parentEmail';
      if (s.includes('address')) return 'address';
      if (s.includes('enrollment') || s.includes('admissiondate') || s.includes('enrolldate')) return 'enrollmentDate';
      if (s.includes('username') || s.includes('login')) return 'username';
      if (s.includes('password')) return 'password';
      return '';
    };

    const renderMap = (r) => {
      body.innerHTML = `<p>Map your spreadsheet columns to the school's student fields. The system guessed the mappings — correct them if needed.</p>
        <div id="map-rows"></div>
        <p class="doc-meta">Sample data: ${JSON.stringify(r.sample && r.sample[0] ? Object.values(r.sample[0]).slice(0, 4).join(' · ') : '')}</p>
        <div class="modal-foot" style="position:static;padding:12px 0 0;border:none;display:flex;justify-content:flex-end;gap:8px">
          <button class="btn secondary" data-back><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg> Back</button>
          <button class="btn" data-next>Continue <svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></button>
        </div>`;
      const rows = body.querySelector('#map-rows');
      headers.forEach((h) => {
        const field = guess(h);
        rows.appendChild(UI.el(`<div class="form-row" style="margin-bottom:8px">
          <label class="field" style="margin:0">Spreadsheet column<strong>${UI.esc(h)}</strong></label>
          <label class="field" style="margin:0">Maps to
            <select data-map="${UI.esc(h)}">
              <option value="">— Skip —</option>
              ${Object.entries(r.fields || {}).map(([k, v]) => `<option value="${k}" ${field === k ? 'selected' : ''}>${UI.esc(v)}</option>`).join('')}
            </select>
          </label>
        </div>`));
      });
      rows.querySelectorAll('select').forEach((sel) => sel.addEventListener('change', () => { mapping[sel.dataset.map] = sel.value; }));
      // collect initial guesses
      headers.forEach((h) => { const f = guess(h); if (f) mapping[h] = f; });
      body.querySelector('[data-back]').onclick = () => { step = 1; setProgress(); renderUpload(); };
      body.querySelector('[data-next]').onclick = async () => {
        // read any changed selects
        rows.querySelectorAll('select').forEach((sel) => { mapping[sel.dataset.map] = sel.value; });
        if (!Object.values(mapping).some((v) => v)) return UI.toast('Map at least one column.', 'error');
        if (!mapping.fullName && !(mapping.firstName && mapping.lastName)) {
          // try to derive a fullName mapping
          if (mapping.firstName || mapping.lastName) { /* validated server-side as missing names */ }
          return UI.toast('Map a full name (or first + last name) column.', 'error');
        }
        step = 3;
        setProgress();
        await renderValidate();
      };
    };

    const renderValidate = async () => {
      body.innerHTML = '<div class="doc-meta">Validating…</div>';
      try {
        const r = await API.post('/api/imports/validate', { importId, mapping });
        validation = r;
        step = 4;
        setProgress();
        const s = r.summary;
        body.innerHTML = `
          <div class="grid grid-4">
            ${wizStat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>', s.valid, 'Valid')}
            ${wizStat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>', s.warnings, 'Need review')}
            ${wizStat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>', s.errors, 'Will be skipped')}
            ${wizStat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>', s.total, 'Total rows')}
          </div>
          <div id="val-rows" style="max-height:340px;overflow-y:auto;margin-top:12px"></div>
          <div class="modal-foot" style="position:static;padding:12px 0 0;border:none;display:flex;justify-content:flex-end;gap:8px">
            <button class="btn secondary" data-back><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg> Back</button>
            <button class="btn" data-next>Preview & confirm <svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></button>
          </div>`;
        const list = body.querySelector('#val-rows');
        r.rows.slice(0, 120).forEach((row) => {
          const name = row.data.fullName || row.data.firstName + ' ' + row.data.lastName;
          list.appendChild(UI.el(`<div class="doc-item">
            <div style="flex:1;min-width:0">
              <div class="doc-name">${UI.esc(name || 'Row ' + (row.index + 2))} ${row.data.studentCode ? '<small>· ' + UI.esc(row.data.studentCode) + '</small>' : ''}</div>
              <div class="doc-meta">${row.errors.length ? row.errors.join('; ') : (row.warnings.length ? row.warnings.join('; ') : 'Ready to import')}</div>
            </div>${valBadge(row.status)}
          </div>`));
        });
        body.querySelector('[data-back]').onclick = () => { step = 2; setProgress(); renderMap({ headers, sample: validation.rows.slice(0, 5), fields: FIELD_LABELS() }); };
        body.querySelector('[data-next]').onclick = () => { step = 5; setProgress(); renderPreview(); };
      } catch (e) { UI.toast(e.message, 'error'); }
    };

    const FIELD_LABELS = () => {
      const labels = {};
      ['fullName', 'firstName', 'lastName', 'studentCode', 'className', 'stream', 'gender', 'dateOfBirth', 'parentName', 'parentPhone', 'parentEmail', 'address', 'enrollmentDate', 'username', 'password'].forEach((k) => { labels[k] = k; });
      return labels;
    };

    const renderPreview = async () => {
      body.innerHTML = '<div class="doc-meta">Loading preview…</div>';
      const r = await API.post('/api/imports/preview', { importId, mapping, limit: 50 });
      const s = r.summary;
      step = 5;
      setProgress();
      body.innerHTML = `
        <p><strong>${s.valid}</strong> valid · <strong>${s.warnings}</strong> need review · <strong>${s.errors}</strong> will be skipped (of ${r.total} rows)</p>
        <div id="prev-rows" style="max-height:340px;overflow-y:auto"></div>
        <div class="modal-foot" style="position:static;padding:12px 0 0;border:none;display:flex;justify-content:flex-end;gap:8px">
          <button class="btn secondary" data-back><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg> Back</button>
          <button class="btn success" data-import><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg> Import valid records</button>
        </div>`;
      const list = body.querySelector('#prev-rows');
      r.rows.forEach((row) => {
        const name = row.data.fullName || (row.data.firstName + ' ' + row.data.lastName);
        list.appendChild(UI.el(`<div class="doc-item">
          <div style="flex:1;min-width:0"><div class="doc-name">${UI.esc(name || 'Row ' + (row.index + 2))}</div>
          <div class="doc-meta">${row.errors.length ? UI.esc(row.errors.join('; ')) : (row.warnings.length ? UI.esc(row.warnings.join('; ')) : 'Ready')}</div></div>
          ${valBadge(row.status)}</div>`));
      });
      body.querySelector('[data-back]').onclick = () => { step = 4; setProgress(); renderValidate(); };
      body.querySelector('[data-import]').onclick = async () => {
        try {
          const result = await API.post('/api/imports/import', { importId, mapping });
          step = 6;
          setProgress();
          const c = result.counts;
          body.innerHTML = `<div class="card" style="text-align:center;border:none">
            <div style="font-size:40px"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div>
            <h3>Import complete</h3>
            <div class="grid grid-4">
              ${wizStat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>', c.imported, 'Imported')}
              ${wizStat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>', c.skipped, 'Skipped')}
              ${wizStat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>', c.failed, 'Failed')}
              ${wizStat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>', c.warnings || 0, 'With warnings')}
            </div>
            ${result.failures && result.failures.length ? `<div class="doc-meta" style="margin-top:10px">${result.failures.slice(0, 5).map((f) => UI.esc('Row ' + f.row + ': ' + f.reason)).join('<br>')}</div>` : ''}
            ${result.credentialsCount ? `<div class="card" style="margin-top:12px;text-align:left;background:var(--primary-light)">
              <strong><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3"/><path d="m16 6 3 3"/><path d="m19 3 3 3"/></svg> Login codes generated (${result.credentialsCount})</strong>
              <p class="doc-meta">Each student was given a login code (username) and a default password. Share these with them — they will be asked to set their own password on first login.</p>
              <div style="max-height:180px;overflow-y:auto;font-size:12.5px">${(result.credentials || []).slice(0, 50).map((c) => `<div class="list-row"><span class="k">${UI.esc(c.name)}</span><span class="v"><code>${UI.esc(c.username)}</code> / <code>${UI.esc(c.password)}</code></span></div>`).join('')}</div>
              ${result.credentialsCount > 50 ? '<div class="doc-meta">… and more. Download the full list below.</div>' : ''}
            </div>` : ''}
            <button class="btn secondary sm" data-report><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg> Download error report</button>
            ${result.credentialsCount ? '<button class="btn" data-creds><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3"/><path d="m16 6 3 3"/><path d="m19 3 3 3"/></svg> Download login codes (CSV)</button>' : ''}
            <button class="btn secondary" data-done style="margin-left:8px">Done</button>
          </div>`;
          body.querySelector('[data-done]').onclick = () => { wizard.close(); if (window.location.hash) {} location.reload(); };
          const rep = body.querySelector('[data-report]');
          if (rep) rep.onclick = () => { const a = document.createElement('a'); a.href = API.base + `/api/imports/${importDbId || ''}/report.csv`; a.download = 'import-report.csv'; document.body.appendChild(a); a.click(); a.remove(); };
          const creds = body.querySelector('[data-creds]');
          if (creds) creds.onclick = () => { const a = document.createElement('a'); a.href = API.base + `/api/imports/${importDbId || ''}/credentials.csv`; a.download = 'import-credentials.csv'; document.body.appendChild(a); a.click(); a.remove(); };
          // refresh the students list behind the modal
          try { await API.get('/api/imports'); } catch {}
        } catch (e) { UI.toast(e.message, 'error'); }
      };
    };

    function wizStat(icon, num, label) {
      return `<div class="card stat-card" style="margin:0"><div class="stat-ic ic-blue">${icon}</div><div><div class="stat-num">${UI.esc(String(num))}</div><div class="stat-label">${UI.esc(label)}</div></div></div>`;
    }
    function valBadge(status) {
      if (status === 'valid') return '<span class="badge green">Valid</span>';
      if (status === 'warning') return '<span class="badge amber">Review</span>';
      return '<span class="badge red">Skipped</span>';
    }

    setProgress();
    renderUpload();
  }

  // ----------------------------------------------------------------- USERS & STAFF
  async function renderUsers(content) {
    content.innerHTML = `<div class="view active"></div>`;
    await window.UsersView.render(content.firstElementChild);
  }

  // ----------------------------------------------------------------- TEACHERS / PARENTS / CLASSES / SUBJECTS
  async function renderTeachers(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = `
      <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <div class="search-input" style="flex:1;min-width:180px"><input id="t-search" placeholder="Search teachers…"></div>
        <button class="btn" id="t-add">＋ Add teacher</button>
      </div>
      <div class="card table-responsive"><div id="t-list"></div></div>`;
    box.querySelector('#t-add').onclick = () => teacherModal(null, () => loadTeachers());
    const loadTeachers = async () => {
      const q = box.querySelector('#t-search').value.trim();
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      try {
        const data = await API.get('/api/teachers' + (params.toString() ? '?' + params.toString() : ''));
        const list = box.querySelector('#t-list');
        const teachers = data.teachers || [];
        if (!teachers.length) { list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="big"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg></div>No teachers found.</div>'; return; }
        list.innerHTML = `<table class="table"><thead><tr>
          <th>Teacher</th><th>Staff No.</th><th>Subjects</th><th>Classes</th><th>Contact</th><th>Status</th><th style="text-align:right">Actions</th>
        </tr></thead><tbody></tbody></table>`;
        const tbody = list.querySelector('tbody');
        teachers.forEach((t) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="Teacher"><strong>${UI.esc(t.full_name)}</strong></td>
            <td data-label="Staff No.">${UI.esc(t.staff_code)}</td>
            <td data-label="Subjects">${(t.subjects || []).map(UI.esc).join(', ') || '—'}</td>
            <td data-label="Classes">${(t.classes || []).map((c) => UI.esc(c.name) + ' ' + UI.esc(c.stream)).join(', ') || '—'}</td>
            <td data-label="Contact">${UI.esc(t.phone || '—')}</td>
            <td data-label="Status">${statusBadge(t.status)}</td>
            <td data-label="" class="actions-cell"><div class="actions">
              <button class="btn secondary sm" data-edit><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
              <button class="btn danger sm" data-del><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
            </div></td>`;
          tbody.appendChild(tr);
          tr.querySelector('[data-edit]').onclick = () => teacherModal(t, () => loadTeachers());
          tr.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Delete teacher ${UI.esc(t.full_name)}?`, { title: 'Delete teacher', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/teachers/${t.id}`); UI.toast('Teacher deleted.', 'success'); loadTeachers(); } catch (e) { UI.toast(e.message, 'error'); }
          };
        });
      } catch (e) { UI.toast(e.message, 'error'); }
    };
    box.querySelector('#t-search').oninput = UI.debounce(loadTeachers, 300);
    await loadTeachers();
  }

  function teacherModal(t, onSave) {
    const isEdit = !!t;
    let modal;
    modal = UI.openModal({
      title: isEdit ? 'Edit teacher' : 'Add teacher',
      wide: true,
      body: `<div class="form-row">
        <label class="field">Full name <span class="req">*</span><input id="t-name" value="${isEdit ? UI.esc(t.full_name) : ''}"></label>
        <label class="field">Staff number <span class="req">*</span><input id="t-code" value="${isEdit ? UI.esc(t.staff_code) : ''}"></label>
      </div>
      <div class="form-row">
        <label class="field">Subjects (comma separated)<input id="t-subjects" value="${isEdit ? UI.esc((t.subjects || []).join(', ')) : ''}" placeholder="Mathematics, Physics"></label>
        <label class="field">Phone<input id="t-phone" value="${isEdit ? UI.esc(t.phone || '') : ''}"></label>
      </div>
      <div class="form-row">
        <label class="field">Email<input id="t-email" value="${isEdit ? UI.esc(t.email || '') : ''}"></label>
        <label class="field">Qualification<input id="t-qual" value="${isEdit ? UI.esc(t.qualification || '') : ''}"></label>
      </div>
      <label class="field">Classes<select id="t-classes" multiple size="4">${ref.classes.map((c) => {
        const has = isEdit && (t.classes || []).some((tc) => tc.id === c.id);
        return `<option value="${c.id}" ${has ? 'selected' : ''}>${UI.esc(c.name)} ${UI.esc(c.stream)}</option>`;
      }).join('')}</select>
      <small class="doc-meta">Hold Ctrl (Cmd on Mac) to select multiple.</small></label>
      ${!isEdit ? `<div class="form-row">
        <label class="field">Login username (optional)<input id="t-username"></label>
        <label class="field">Login password (optional)<input id="t-password" type="password"></label>
      </div>` : ''}`,
      foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>${isEdit ? 'Save changes' : 'Add teacher'}</button>`,
    });
    modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
    modal.backdrop.querySelector('[data-save]').onclick = async () => {
      const clsSel = modal.backdrop.querySelector('#t-classes');
      const body = {
        fullName: modal.backdrop.querySelector('#t-name').value.trim(),
        staffCode: modal.backdrop.querySelector('#t-code').value.trim(),
        subjects: modal.backdrop.querySelector('#t-subjects').value.split(',').map((s) => s.trim()).filter(Boolean),
        phone: modal.backdrop.querySelector('#t-phone').value.trim(),
        email: modal.backdrop.querySelector('#t-email').value.trim(),
        qualification: modal.backdrop.querySelector('#t-qual').value.trim(),
        classIds: [...clsSel.selectedOptions].map((o) => Number(o.value)),
      };
      if (!isEdit) {
        body.username = modal.backdrop.querySelector('#t-username').value.trim();
        body.password = modal.backdrop.querySelector('#t-password').value;
      }
      try {
        if (isEdit) await API.put(`/api/teachers/${t.id}`, body);
        else await API.post('/api/teachers', body);
        UI.toast(isEdit ? 'Teacher updated.' : 'Teacher added.', 'success');
        modal.close();
        ref = await API.get('/api/settings/classes-reference');
        onSave && onSave();
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  async function renderParents(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = `
      <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <div class="search-input" style="flex:1;min-width:180px"><input id="p-search" placeholder="Search parents…"></div>
        <button class="btn" id="p-add">＋ Add parent</button>
      </div>
      <div class="card" id="p-pending-wrap" style="display:none">
        <h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg> Pending registrations</h3>
        <p class="doc-meta">Parents who registered themselves and are waiting for approval. Approve them after verifying they are valid.</p>
        <div id="p-pending"></div>
      </div>
      <div class="card table-responsive"><div id="p-list"></div></div>`;
    box.querySelector('#p-add').onclick = () => parentModal(null, () => loadParents());

    // pending registrations
    const loadPending = async () => {
      try {
        const data = await API.get('/api/parents/pending');
        const pending = data.pending || [];
        const wrap = box.querySelector('#p-pending-wrap');
        const list = box.querySelector('#p-pending');
        if (!pending.length) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';
        list.innerHTML = '';
        for (const p of pending) {
          const kids = (p.claimed_children || []).map((c) => `${c.full_name} (${c.student_code}${c.class_name ? ', ' + c.class_name + ' ' + (c.stream || '') : ''})`).join('; ');
          const row = UI.el(`<div class="doc-item">
            <div style="flex:1;min-width:0">
              <div class="doc-name">${UI.esc(p.full_name)} <span class="badge blue">pending approval</span></div>
              <div class="doc-meta">${UI.esc(p.email || '')} · ${UI.esc(p.phone || '—')} · registered ${UI.timeAgo(p.registered_at)}</div>
              <div class="doc-meta" style="margin-top:4px"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg> Claims guardianship of: <b>${UI.esc(kids || 'no children listed')}</b></div>
              <div class="doc-meta" style="color:var(--warning)">Verify with the class teacher / school records before approving. Login details are emailed automatically on approval.</div>
            </div>
            <div class="doc-actions">
              <button class="btn success sm" data-ap="${p.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> Approve</button>
              <button class="btn danger sm" data-rj="${p.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg> Reject</button>
            </div>
          </div>`);
          list.appendChild(row);
          row.querySelector('[data-ap]').onclick = async () => {
            try { await API.post(`/api/parents/${p.id}/approve`); UI.toast(`${p.full_name} approved.`, 'success'); loadPending(); loadParents(); }
            catch (e) { UI.toast(e.message, 'error'); }
          };
          row.querySelector('[data-rj]').onclick = async () => {
            const ok = await UI.confirmDialog(`Reject the registration of ${UI.esc(p.full_name)}? They will not be able to log in.`, { title: 'Reject registration', confirmText: 'Reject', danger: true });
            if (!ok) return;
            try { await API.post(`/api/parents/${p.id}/reject`); UI.toast('Registration rejected.', 'success'); loadPending(); loadParents(); }
            catch (e) { UI.toast(e.message, 'error'); }
          };
        }
      } catch (e) { /* ignore */ }
    };
    await loadPending();
    const loadParents = async () => {
      const q = box.querySelector('#p-search').value.trim();
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      try {
        const data = await API.get('/api/parents' + (params.toString() ? '?' + params.toString() : ''));
        const list = box.querySelector('#p-list');
        const parents = data.parents || [];
        if (!parents.length) { list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="big"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg></div>No parents found.</div>'; return; }
        list.innerHTML = `<table class="table"><thead><tr>
          <th>Parent</th><th>Phone</th><th>Children</th><th style="text-align:right">Actions</th>
        </tr></thead><tbody></tbody></table>`;
        const tbody = list.querySelector('tbody');
        parents.forEach((p) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="Parent"><strong>${UI.esc(p.full_name)}</strong></td>
            <td data-label="Phone">${UI.esc(p.phone || '—')}</td>
            <td data-label="Children">${(p.children || []).map((c) => UI.esc(c.full_name) + ' (' + UI.esc(c.class_name || '') + ' ' + UI.esc(c.stream || '') + ')').join(', ') || '—'}</td>
            <td data-label="" class="actions-cell"><div class="actions">
              <button class="btn secondary sm" data-edit><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
              <button class="btn danger sm" data-del><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
            </div></td>`;
          tbody.appendChild(tr);
          tr.querySelector('[data-edit]').onclick = () => parentModal(p, () => loadParents());
          tr.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Delete parent ${UI.esc(p.full_name)}?`, { title: 'Delete parent', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/parents/${p.id}`); UI.toast('Parent deleted.', 'success'); loadParents(); } catch (e) { UI.toast(e.message, 'error'); }
          };
        });
      } catch (e) { UI.toast(e.message, 'error'); }
    };
    box.querySelector('#p-search').oninput = UI.debounce(loadParents, 300);
    await loadParents();
  }

  function parentModal(p, onSave) {
    const isEdit = !!p;
    const linked = (p && p.children || []).map((c) => c.id);
    let modal;
    modal = UI.openModal({
      title: isEdit ? 'Edit parent' : 'Add parent',
      wide: true,
      body: `<div class="form-row">
        <label class="field">Full name <span class="req">*</span><input id="p-name" value="${isEdit ? UI.esc(p.full_name) : ''}"></label>
        <label class="field">Parent code <span class="req">*</span><input id="p-code" value="${isEdit ? UI.esc(p.parent_code) : ''}"></label>
      </div>
      <div class="form-row">
        <label class="field">Phone<input id="p-phone" value="${isEdit ? UI.esc(p.phone || '') : ''}"></label>
        <label class="field">Email<input id="p-email" value="${isEdit ? UI.esc(p.email || '') : ''}"></label>
      </div>
      <label class="field">Address<input id="p-address" value="${isEdit ? UI.esc(p.address || '') : ''}"></label>
      <label class="field">Linked children<select id="p-children" multiple size="4">${ref.students.map((s) => `<option value="${s.id}" ${linked.includes(s.id) ? 'selected' : ''}>${UI.esc(s.full_name)} (${UI.esc(s.student_code)})</option>`).join('')}</select>
      <small class="doc-meta">Hold Ctrl (Cmd on Mac) to select multiple children.</small></label>
      ${!isEdit ? `<div class="form-row">
        <label class="field">Login username (optional)<input id="p-username"></label>
        <label class="field">Login password (optional)<input id="p-password" type="password"></label>
      </div>` : ''}`,
      foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>${isEdit ? 'Save changes' : 'Add parent'}</button>`,
    });
    modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
    modal.backdrop.querySelector('[data-save]').onclick = async () => {
      const sel = modal.backdrop.querySelector('#p-children');
      const body = {
        fullName: modal.backdrop.querySelector('#p-name').value.trim(),
        parentCode: modal.backdrop.querySelector('#p-code').value.trim(),
        phone: modal.backdrop.querySelector('#p-phone').value.trim(),
        email: modal.backdrop.querySelector('#p-email').value.trim(),
        address: modal.backdrop.querySelector('#p-address').value.trim(),
        childIds: [...sel.selectedOptions].map((o) => Number(o.value)),
      };
      if (!isEdit) {
        body.username = modal.backdrop.querySelector('#p-username').value.trim();
        body.password = modal.backdrop.querySelector('#p-password').value;
      }
      try {
        if (isEdit) await API.put(`/api/parents/${p.id}`, body);
        else await API.post('/api/parents', body);
        UI.toast(isEdit ? 'Parent updated.' : 'Parent added.', 'success');
        modal.close();
        ref = await API.get('/api/settings/classes-reference');
        onSave && onSave();
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  async function renderClasses(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = `
      <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <h3 style="flex:1;margin:0">Classes</h3>
        <button class="btn" id="c-add">＋ Add class</button>
      </div>
      <div class="grid grid-3" id="c-grid"></div>`;
    box.querySelector('#c-add').onclick = () => classModal(null, () => renderClasses(content));
    const load = async () => {
      try {
        const data = await API.get('/api/classes');
        const grid = box.querySelector('#c-grid');
        const classes = data.classes || [];
        if (!classes.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="big"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg></div>No classes yet.</div>'; return; }
        grid.innerHTML = '';
        for (const cl of classes) {
          grid.appendChild(UI.el(`<div class="card">
            <h3>${UI.esc(cl.name)} ${UI.esc(cl.stream || '')}</h3>
            <div class="doc-meta">${cl.student_count || 0} students · ${UI.esc(cl.academic_year)} · Teacher: ${UI.esc(cl.class_teacher_name || '—')}</div>
            <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn secondary sm" data-view>View students</button>
              <button class="btn secondary sm" data-edit><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
              <button class="btn danger sm" data-del><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
            </div>
          </div>`));
        }
        grid.querySelectorAll('.card').forEach((card, i) => {
          const cl = classes[i];
          card.querySelector('[data-view]').onclick = () => viewClassStudents(cl);
          card.querySelector('[data-edit]').onclick = () => classModal(cl, () => renderClasses(content));
          card.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Delete class ${UI.esc(cl.name)} ${UI.esc(cl.stream)}? Students become unassigned.`, { title: 'Delete class', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/classes/${cl.id}`); UI.toast('Class deleted.', 'success'); renderClasses(content); } catch (e) { UI.toast(e.message, 'error'); }
          };
        });
      } catch (e) { UI.toast(e.message, 'error'); }
    };
    await load();
  }

  async function viewClassStudents(cl) {
    try {
      const data = await API.get(`/api/classes/${cl.id}`);
      const c = data.class;
      const modal = UI.openModal({
        title: `${UI.esc(c.name)} ${UI.esc(c.stream || '')} — ${(c.students || []).length} students`,
        wide: true,
        body: (c.students || []).map((s) => `<div class="list-row"><span class="k">${UI.esc(s.full_name)}</span><span class="v">${UI.esc(s.student_code)}</span></div>`).join('') || '<div class="doc-meta">No students.</div>',
        foot: `<button class="btn" data-close>Close</button>`,
      });
      modal.backdrop.querySelector('[data-close]').onclick = () => modal.close();
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  function classModal(cl, onSave) {
    const isEdit = !!cl;
    let modal;
    modal = UI.openModal({
      title: isEdit ? 'Edit class' : 'Add class',
      body: `<div class="form-row">
        <label class="field">Class name <span class="req">*</span><input id="c-name" value="${isEdit ? UI.esc(cl.name) : ''}" placeholder="Senior 2"></label>
        <label class="field">Stream<input id="c-stream" value="${isEdit ? UI.esc(cl.stream || 'A') : 'A'}" placeholder="A"></label>
      </div>
      <div class="form-row">
        <label class="field">Academic year<input id="c-year" value="${isEdit ? UI.esc(cl.academic_year) : '2026'}"></label>
        <label class="field">Class teacher<select id="c-teacher"><option value="">— None —</option>${ref.teachers.map((t) => `<option value="${t.id}" ${isEdit && cl.class_teacher_id === t.id ? 'selected' : ''}>${UI.esc(t.full_name)}</option>`).join('')}</select></label>
      </div>`,
      foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>${isEdit ? 'Save' : 'Create'}</button>`,
    });
    modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
    modal.backdrop.querySelector('[data-save]').onclick = async () => {
      const body = {
        name: modal.backdrop.querySelector('#c-name').value.trim(),
        stream: modal.backdrop.querySelector('#c-stream').value.trim(),
        academicYear: modal.backdrop.querySelector('#c-year').value.trim(),
        classTeacherId: modal.backdrop.querySelector('#c-teacher').value || null,
      };
      try {
        if (isEdit) await API.put(`/api/classes/${cl.id}`, body);
        else await API.post('/api/classes', body);
        UI.toast('Class saved.', 'success');
        modal.close();
        ref = await API.get('/api/settings/classes-reference');
        onSave && onSave();
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  // ----------------------------------------------------------------- ACADEMIC VIEWS
  async function renderSubjects(content) {
    content.innerHTML = `<div class="view active"></div>`;
    await window.Academics.SubjectsView.view(content.firstElementChild);
  }
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
    await window.Academics.TimetableView.view(content.firstElementChild, { manage: true });
  }
  async function renderFees(content) {
    content.innerHTML = `<div class="view active"></div>`;
    await window.Academics.FeesView.adminView(content.firstElementChild);
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
    box.innerHTML = `<div class="card" style="display:flex;gap:16px;align-items:center">
        <div class="avatar-lg">${UI.initials(u.fullName)}</div>
        <div><h2>${UI.esc(u.fullName)}</h2><div class="doc-meta">${UI.esc(u.email || '')} · Administrator</div>
        <button class="btn secondary sm" id="prof-pass" style="margin-top:8px"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3"/><path d="m16 6 3 3"/><path d="m19 3 3 3"/></svg> Change password</button>
        <button class="btn secondary sm" id="prof-photo" style="margin-top:8px"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Change photo</button></div>
      </div>
      <div id="prof-prefs" style="margin-top:16px"></div>`;
    box.querySelector('#prof-pass').onclick = () => UI.openChangePassword();
    box.querySelector('#prof-photo').onclick = () => UI.openAvatarUpload();
    await UI.profileSettingsPanel(box.querySelector('#prof-prefs'));
  }

  function statusBadge(status) {
    const map = { active: 'green', inactive: 'amber', archived: 'gray', suspended: 'red' };
    return `<span class="badge ${map[status] || 'gray'}">${UI.esc(status)}</span>`;
  }
  function row(k, v) { return `<div class="list-row"><span class="k">${UI.esc(k)}</span><span class="v">${UI.esc(v)}</span></div>`; }
})();
