/**
 * PARENT DASHBOARD
 * Simple, mobile-first. Focus: communication with teachers/administration,
 * documents and announcements for the parent's children.
 */
(async function () {
  const API = window.API;
  const UI = window.UI;

  // Session lives in an HttpOnly cookie: ask the server who we are.
  const user = await API.requireUser('parent');
  if (!user) return;

  let layout;
  let children = [];
  let activeChildId = null;
  let dashboardPrefs = {};   // stored on the server, not in the browser
  let messaging = null;
  let documents = null;
  let announcements = null;

  // Which child is being viewed is a preference kept in the database so it
  // follows the parent across devices instead of living in one browser.
  try {
    const prefs = await API.get('/api/auth/preferences');
    dashboardPrefs = (prefs && prefs.preferences && prefs.preferences.dashboardPrefs) || {};
    activeChildId = Number(dashboardPrefs.activeChildId) || null;
  } catch { activeChildId = null; }

  function setActiveChild(id) {
    activeChildId = id || null;
    dashboardPrefs = { ...dashboardPrefs, activeChildId: id || null };
    API.put('/api/auth/preferences', { dashboardPrefs }).catch(() => {});
  }

  function currentChild() {
    return children.find((c) => c.id === activeChildId) || children[0] || null;
  }

  const nav = [
    { key: 'home', label: 'Home', icon: 'home', section: 'Main' },
    { key: 'messages', label: 'Messages', icon: 'messages', section: 'Main' },
    { key: 'documents', label: 'Documents', icon: 'document', section: 'Main' },
    { key: 'announcements', label: 'Announcements', icon: 'announcements', section: 'Main' },
    { key: 'reports', label: 'Report Cards', icon: 'exams', section: 'Family' },
    { key: 'children', label: 'My Children', icon: 'parents', section: 'Family' },
    { key: 'notifications', label: 'Notifications', icon: 'notifications', section: 'Family' },
    { key: 'profile', label: 'Profile', icon: 'profile', section: 'Account' },
  ];
  const bottomNav = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'messages', label: 'Messages', icon: 'messages' },
    { key: 'documents', label: 'Documents', icon: 'document' },
    { key: 'children', label: 'Children', icon: 'parents' },
  ];

  UI.initLayout({ nav, bottomNav, title: 'Parent Dashboard', onNav: (k) => show(k) }).then(async (l) => {
    layout = l;
    window.__setNavBadge = (k, n) => l.setBadge(k, n);
    window.__navHandler = (k) => show(k);
    await loadChildren();
    window.Realtime.start();
    show('home');
  });

  async function loadChildren() {
    try {
      children = (await API.get('/api/parents/children')).children || [];
    } catch (e) { UI.toast(e.message, 'error'); }
    if (!activeChildId && children.length) activeChildId = children[0].id;
    if (!children.some((c) => c.id === activeChildId) && children.length) activeChildId = children[0].id;
    setActiveChild(activeChildId || null);
  }

  async function show(key) {
    layout.setActive(key);
    const titles = { home: 'Home', messages: 'Messages', documents: 'Documents', announcements: 'Announcements', reports: 'Report Cards', children: 'My Children', notifications: 'Notifications', profile: 'Profile' };
    layout.setTitle(titles[key] || 'Dashboard');
    const content = layout.content;

    if (key === 'home') return renderHome(content);
    if (key === 'messages') return renderMessages(content);
    if (key === 'documents') return renderDocuments(content);
    if (key === 'announcements') return renderAnnouncements(content);
    if (key === 'reports') return renderReports(content);
    if (key === 'children') return renderChildren(content);
    if (key === 'notifications') return renderNotifications(content);
    if (key === 'profile') return renderProfile(content);
  }

  function childSelectorHtml(current) {
    if (!children.length) return '';
    return `<div class="card" style="background:var(--primary-light)">
      <div class="stat-label" style="font-weight:700;margin-bottom:8px">SELECT CHILD</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${children.map((c) => `<button class="chip ${c.id === (current || {}).id ? 'active' : ''}" data-child="${c.id}">
          ${UI.esc(c.full_name)} <small>· ${UI.esc(c.class_name || '')} ${UI.esc(c.stream || '')}</small></button>`).join('')}
      </div></div>`;
  }

  function bindChildChips(root) {
    root.querySelectorAll('[data-child]').forEach((b) => b.addEventListener('click', () => {
      activeChildId = Number(b.dataset.child);
      setActiveChild(activeChildId);
      show(activeViewName());
    }));
  }
  let activeViewName = () => 'home';

  // --------------------------------------------------------- REPORT CARDS
  async function renderReports(content) {
    activeViewName = () => 'reports';
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = '<div class="empty-state">Loading report cards…</div>';
    let data;
    try { data = await API.get('/api/reports/my'); }
    catch (e) { box.innerHTML = `<div class="empty-state">${UI.esc(e.message)}</div>`; return; }

    const students = data.students || [];
    const cards = students.flatMap((s) => (s.reports || []).map((r) => ({ ...r, studentName: s.studentName })));
    if (!cards.length) {
      box.innerHTML = `<div class="empty-state"><div class="big">📄</div>No report cards have been released yet.</div>`;
      return;
    }
    box.innerHTML = `
      <div class="card"><strong>${cards.length} report card${cards.length === 1 ? '' : 's'}</strong>
        <div class="muted" style="font-size:13px;margin-top:4px">Report cards appear here as soon as the school releases them. Open one to read or save it.</div>
      </div>
      ${students.filter((s) => (s.reports || []).length).map((s) => `
        <div class="card">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <strong style="flex:1">${UI.esc(s.studentName)}</strong>
            <span class="muted" style="font-size:12.5px">${UI.esc(s.studentCode || '')}</span>
          </div>
          <div style="margin-top:8px">
            ${s.reports.map((r) => `
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--border)">
                <span class="badge blue">${UI.esc(r.term || '')} ${UI.esc(r.academic_year || '')}</span>
                ${r.average != null ? `<span class="muted" style="font-size:12.5px">avg ${r.average}%${r.position ? ` · position ${r.position}${r.class_size ? `/${r.class_size}` : ''}` : ''}</span>` : ''}
                <span style="flex:1"></span>
                <button class="btn sm" data-open="${r.id}">Open</button>
                <button class="btn ghost sm" data-save="${r.id}">Download</button>
              </div>`).join('')}
          </div>
        </div>`).join('')}`;

    const open = (id) => window.open(`${API.base || ''}/api/reports/${id}/file`, '_blank');
    box.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => open(b.dataset.open); });
    box.querySelectorAll('[data-save]').forEach((b) => { b.onclick = () => open(b.dataset.save); });
  }

  // ------------------------------------------------------------------ HOME
  async function renderHome(content) {
    activeViewName = () => 'home';
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    const child = currentChild();
    let stats;
    try { stats = await API.get('/api/stats/overview'); } catch (e) { UI.toast(e.message, 'error'); }

    const c = stats ? stats.counts || {} : {};
    const firstName = (user.fullName || 'Parent').split(' ')[0];
    box.innerHTML = `
      <div class="card" style="background:linear-gradient(135deg,#047857,#10b981);color:#fff;border:none">
        <h2 style="color:#fff;margin-bottom:2px">Welcome, ${UI.esc(firstName.toUpperCase())} </h2>
        <div style="opacity:.92">Here is the latest from school.</div>
      </div>
      ${childSelectorHtml(child)}
      <div class="grid grid-3">
        <div class="card stat-card"><div class="stat-ic ic-blue"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg></div><div><div class="stat-num">${c.unreadMessages || 0}</div><div class="stat-label">Unread messages</div></div></div>
        <div class="card stat-card"><div class="stat-ic ic-green"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></div><div><div class="stat-num">${c.unreadNotifications || 0}</div><div class="stat-label">Notifications</div></div></div>
        <div class="card stat-card"><div class="stat-ic ic-purple"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div><div class="stat-num">${children.length}</div><div class="stat-label">Children</div></div></div>
      </div>
      ${stats && stats.fees ? `<div class="card"><div class="grid grid-3" style="gap:10px">
        <div class="stat-card card" style="margin:0"><div class="stat-ic ic-amber"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg></div><div><div class="stat-num">${UI.money(stats.fees.totalDue)}</div><div class="stat-label">Fees due</div></div></div>
        <div class="stat-card card" style="margin:0"><div class="stat-ic ic-green"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div><div><div class="stat-num">${UI.money(stats.fees.totalPaid)}</div><div class="stat-label">Paid</div></div></div>
        <div class="stat-card card" style="margin:0"><div class="stat-ic ic-red"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></div><div><div class="stat-num">${UI.money((stats.fees.totalDue || 0) - (stats.fees.totalPaid || 0))}</div><div class="stat-label">Outstanding</div></div></div>
      </div></div>` : ''}
      <div class="grid grid-2">
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Your children</h3><div id="home-children"></div></div>
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M14.5 8.5a5 5 0 0 1 0 7"/><path d="M17.5 5.5a9 9 0 0 1 0 13"/></svg> Recent updates</h3><div id="home-updates"></div></div>
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 13h6"/><path d="M9 17h4"/></svg> Upcoming exams</h3><div id="home-exams"></div></div>
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> Assignments due soon</h3><div id="home-assign"></div></div>
      </div>`;

    const hc = box.querySelector('#home-children');
    for (const ch of children) {
      hc.appendChild(UI.el(`<div class="child-card ${ch.id === (child || {}).id ? 'active' : ''}" data-child="${ch.id}" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar">${UI.initials(ch.full_name)}</div>
          <div><div class="doc-name">${UI.esc(ch.full_name)}</div>
          <div class="doc-meta">${UI.esc(ch.class_name || 'Unassigned')} ${UI.esc(ch.stream || '')} · Class teacher: ${UI.esc(ch.class_teacher_name || '—')}</div></div>
        </div></div>`));
    }
    hc.querySelectorAll('[data-child]').forEach((b) => b.addEventListener('click', () => {
      activeChildId = Number(b.dataset.child);
      setActiveChild(activeChildId);
      show('home');
    }));

    const up = box.querySelector('#home-updates');
    const anns = (stats && stats.recentAnnouncements || []).slice(0, 4);
    if (!anns.length) up.innerHTML = '<div class="doc-meta">No recent announcements.</div>';
    for (const a of anns) {
      up.appendChild(UI.el(`<div class="ann-item ${a.is_read ? '' : 'unread'}" style="margin-bottom:8px">
        <div class="ann-title"><span>${a.important ? '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/></svg> ' : ''}${UI.esc(a.title)}</span></div>
        <div class="ann-meta">${UI.timeAgo(a.created_at)}</div></div>`));
    }
    const exBox = box.querySelector('#home-exams');
    for (const e of (stats && stats.upcomingExams || []).slice(0, 4)) {
      exBox.appendChild(UI.el(`<div class="list-row"><span class="k">${UI.esc(e.title)}</span><span class="v">${UI.esc(e.date || '—')}</span></div>`));
    }
    if (!(stats && stats.upcomingExams || []).length) exBox.innerHTML = '<div class="doc-meta">No upcoming exams.</div>';
    const asBox = box.querySelector('#home-assign');
    for (const a of (stats && stats.upcomingAssignments || []).slice(0, 4)) {
      asBox.appendChild(UI.el(`<div class="list-row"><span class="k">${UI.esc(a.title)}</span><span class="v">${UI.esc(a.due_date || '—')}</span></div>`));
    }
    if (!(stats && stats.upcomingAssignments || []).length) asBox.innerHTML = '<div class="doc-meta">No assignments due soon.</div>';
    bindChildChips(box);
  }

  // ----------------------------------------------------------------- MESSAGES
  async function renderMessages(content) {
    activeViewName = () => 'messages';
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    const child = currentChild();

    // quick contact bar per child
    let quick = '';
    try {
      const contacts = (await API.get('/api/parents/contacts')).contacts;
      const grp = contacts.groups.find((g) => g.childId === (child || {}).id);
      if (grp && grp.classTeacherUserId) {
        quick = `<div class="card" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="flex:1"><strong>${UI.esc(child.full_name)}</strong> — ${UI.esc(grp.className)}</div>
          <button class="btn" id="quick-ct"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg> Contact ${UI.esc(child.class_teacher_name || 'Class Teacher')}</button>
        </div>`;
      }
    } catch {}

    box.innerHTML = quick + `<div id="msg-box"></div>`;
    if (messaging) messaging.destroy();
    messaging = new window.MessagingView({ container: box.querySelector('#msg-box'), canCompose: true });
    await messaging.render();
    const q = box.querySelector('#quick-ct');
    if (q) {
      const contacts = (await API.get('/api/parents/contacts')).contacts;
      const grp = contacts.groups.find((g) => g.childId === (child || {}).id);
      q.onclick = () => messaging.openDirect(grp.classTeacherUserId);
    }
  }

  // ----------------------------------------------------------------- DOCUMENTS
  async function renderDocuments(content) {
    activeViewName = () => 'documents';
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    const child = currentChild();
    box.innerHTML = childSelectorHtml(child) + '<div id="doc-box"></div>';
    if (documents) documents.destroy();
    documents = new window.DocumentsView({
      container: box.querySelector('#doc-box'),
      canUpload: true,
      canManage: false,
      parentMode: true,
      childFilter: child && child.class_id ? { classId: child.class_id } : null,
    });
    await documents.render();
    documents.loadFolders();
    bindChildChips(box);
  }

  // ----------------------------------------------------------------- ANNOUNCEMENTS
  async function renderAnnouncements(content) {
    activeViewName = () => 'announcements';
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    announcements = new window.AnnouncementsView({ container: box, canPost: false });
    await announcements.render();
  }

  // ----------------------------------------------------------------- CHILDREN
  async function renderChildren(content) {
    activeViewName = () => 'children';
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = `<div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Your children</h3>
      <p class="doc-meta">Select a child to view their school information.</p>
      <div id="child-cards"></div></div>
      <div id="child-detail"></div>`;

    const cards = box.querySelector('#child-cards');
    for (const ch of children) {
      cards.appendChild(UI.el(`<div class="child-card ${ch.id === activeChildId ? 'active' : ''}" data-child="${ch.id}" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar">${UI.initials(ch.full_name)}</div>
          <div><div class="doc-name">${UI.esc(ch.full_name)}</div>
          <div class="doc-meta">${UI.esc(ch.class_name || 'Unassigned')} ${UI.esc(ch.stream || '')}</div></div>
          <div style="margin-left:auto">${ch.status === 'active' ? '<span class="badge green">Active</span>' : '<span class="badge red">' + UI.esc(ch.status) + '</span>'}</div>
        </div></div>`));
    }
    cards.querySelectorAll('[data-child]').forEach((b) => b.addEventListener('click', () => {
      activeChildId = Number(b.dataset.child);
      setActiveChild(activeChildId);
      renderChildren(content);
    }));

    const child = currentChild();
    if (!child) { box.querySelector('#child-detail').innerHTML = '<div class="doc-meta">No children linked.</div>'; return; }

    let detail = null;
    try { detail = (await API.get(`/api/parents/children/${child.id}`)).child; } catch {}

    box.querySelector('#child-detail').innerHTML = `<div class="card">
      <h3>${UI.esc(child.full_name)}</h3>
      ${row('Student number', detail ? detail.student_code : '—')}
      ${row('Class', child.class_name ? `${child.class_name} ${child.stream || ''}` : 'Unassigned')}
      ${row('Class teacher', child.class_teacher_name || '—')}
      ${row('Gender', detail ? (detail.gender || '—') : '—')}
      ${row('Date of birth', detail ? (detail.date_of_birth || '—') : '—')}
      ${row('Enrolled', detail ? (detail.enrollment_date || '—') : '—')}
      ${row('Status', detail ? detail.status : '—')}
    </div>
    <div class="card">
      <div class="tabs" id="child-tabs">
        <button class="tab active" data-tab="overview">Overview</button>
        <button class="tab" data-tab="attendance">Attendance</button>
        <button class="tab" data-tab="fees">Fees</button>
        <button class="tab" data-tab="results">Results</button>
        <button class="tab" data-tab="timetable">Timetable</button>
        <button class="tab" data-tab="assignments">Assignments</button>
      </div>
      <div id="child-tab-body"><div class="doc-meta">Select a tab to view details.</div></div>
    </div>`;

    const tabs = box.querySelector('#child-tabs');
    const tabBody = box.querySelector('#child-tab-body');
    const showChildTab = async (tab) => {
      tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
      tabBody.innerHTML = '<div class="doc-meta">Loading…</div>';
      if (tab === 'attendance') await window.Academics.AttendanceView.viewer(tabBody, { studentId: child.id, studentName: child.full_name });
      else if (tab === 'fees') await window.Academics.FeesView.viewer(tabBody, { studentId: child.id, studentName: child.full_name });
      else if (tab === 'results') {
        try {
          const data = (await API.get('/api/exams?classId=' + (child.class_id || ''))).exams || [];
          const published = data.filter((e) => e.status === 'published');
          if (!published.length) { tabBody.innerHTML = '<div class="doc-meta">No published results yet.</div>'; return; }
          let html = '<div class="table-responsive"><table class="table"><thead><tr><th>Exam</th><th>Subject</th><th>Marks</th><th>Grade</th></tr></thead><tbody>';
          for (const e of published) {
            const exam = (await API.get(`/api/exams/${e.id}`)).exam;
            const res = (exam.results || []).find((r) => r.student_id === child.id);
            html += `<tr><td data-label="Exam">${UI.esc(e.title)}</td><td data-label="Subject">${UI.esc(e.subject || '')}</td><td data-label="Marks">${res ? res.marks : '—'}</td><td data-label="Grade">${res ? UI.esc(res.grade || '—') : '—'}</td></tr>`;
          }
          tabBody.innerHTML = html + '</tbody></table></div>';
        } catch (e) { tabBody.innerHTML = `<div class="doc-meta">${UI.esc(e.message)}</div>`; }
      } else if (tab === 'timetable') {
        if (child.class_id) {
          const entries = (await API.get(`/api/timetable?classId=${child.class_id}`)).entries || [];
          tabBody.innerHTML = entries.length ? `<div class="table-responsive"><table class="table"><thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Room</th></tr></thead><tbody>${entries.map((e) => `<tr><td data-label="Day">${UI.esc(e.day)}</td><td data-label="Time">${UI.esc(e.start_time)}-${UI.esc(e.end_time)}</td><td data-label="Subject">${UI.esc(e.subject || '—')}</td><td data-label="Room">${UI.esc(e.room || '—')}</td></tr>`).join('')}</tbody></table></div>`
            : '<div class="doc-meta">No timetable for this class yet.</div>';
        } else tabBody.innerHTML = '<div class="doc-meta">Child has no class assigned.</div>';
      } else if (tab === 'assignments') {
        const data = (await API.get('/api/assignments?classId=' + (child.class_id || ''))).assignments || [];
        tabBody.innerHTML = data.length ? data.map((a) => `<div class="list-row"><span class="k">${UI.esc(a.title)} ${a.due_date ? '· due ' + UI.esc(a.due_date) : ''}</span><span class="v">${a.submission_count || 0} submitted</span></div>`).join('') : '<div class="doc-meta">No assignments for this class.</div>';
      } else {
        tabBody.innerHTML = `<div class="list-row"><span class="k">Student number</span><span class="v">${UI.esc(detail ? detail.student_code : '—')}</span></div>
          <div class="list-row"><span class="k">Class</span><span class="v">${child.class_name ? UI.esc(child.class_name) + ' ' + UI.esc(child.stream || '') : 'Unassigned'}</span></div>
          <div class="list-row"><span class="k">Class teacher</span><span class="v">${UI.esc(child.class_teacher_name || '—')}</span></div>
          <div class="list-row"><span class="k">Gender</span><span class="v">${UI.esc((detail && detail.gender) || '—')}</span></div>
          <div class="list-row"><span class="k">Date of birth</span><span class="v">${UI.esc((detail && detail.date_of_birth) || '—')}</span></div>
          <div class="list-row"><span class="k">Enrolled</span><span class="v">${UI.esc((detail && detail.enrollment_date) || '—')}</span></div>`;
      }
    };
    tabs.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showChildTab(t.dataset.tab)));
  }

  // ----------------------------------------------------------------- NOTIFICATIONS
  async function renderNotifications(content) {
    activeViewName = () => 'notifications';
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    let items = [];
    try { items = (await API.get('/api/parents/notifications?limit=100')).notifications; } catch (e) { UI.toast(e.message, 'error'); }
    const icons = { message: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg>', document: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>', announcement: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M14.5 8.5a5 5 0 0 1 0 7"/><path d="M17.5 5.5a9 9 0 0 1 0 13"/></svg>', assignment: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>', attendance: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>', exam: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>', results: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg>', fee: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>', system: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>', account: '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' };
    box.innerHTML = `<div class="card"><h3>Notifications</h3>
      <button class="btn secondary sm" id="nt-all" style="margin-top:8px">Mark all read</button>
      <div id="nt-list" style="margin-top:8px"></div></div>`;
    const list = box.querySelector('#nt-list');
    if (!items.length) list.innerHTML = '<div class="doc-meta">No notifications yet.</div>';
    for (const n of items) {
      list.appendChild(UI.el(`<div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" style="border-radius:10px;margin-bottom:6px">
        <span class="n-ic">${icons[n.type] || '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>'}</span>
        <div><div class="n-title">${UI.esc(n.title)}</div>${n.body ? `<div class="n-body">${UI.esc(n.body)}</div>` : ''}<div class="n-time">${UI.timeAgo(n.created_at)}</div></div></div>`));
    }
    list.querySelectorAll('.notif-item').forEach((el) => el.addEventListener('click', async () => {
      try { await API.put(`/api/parents/notifications/${el.dataset.id}/read`); } catch {}
      el.classList.remove('unread');
      UI.refreshUnreadCounts();
    }));
    box.querySelector('#nt-all').onclick = async () => {
      try { await API.put('/api/notifications/read-all'); UI.toast('Done.', 'success'); renderNotifications(content); } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  // ----------------------------------------------------------------- PROFILE
  async function renderProfile(content) {
    activeViewName = () => 'profile';
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    let me;
    try { me = await API.get('/api/auth/me'); } catch (e) { UI.toast(e.message, 'error'); return; }
    const u = me.user;
    const p = me.profile || {};
    box.innerHTML = `<div class="card" style="display:flex;gap:16px;align-items:center">
        <div class="avatar-lg">${UI.initials(u.fullName)}</div>
        <div><h2>${UI.esc(u.fullName)}</h2><div class="doc-meta">${UI.esc(u.email || '')} · Parent/Guardian</div>
        <button class="btn secondary sm" id="prof-pass" style="margin-top:8px"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3"/><path d="m16 6 3 3"/><path d="m19 3 3 3"/></svg> Change password</button>
        <button class="btn secondary sm" id="prof-photo" style="margin-top:8px"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Change photo</button></div>
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3>Account</h3>
          ${row('Username', u.username)} ${row('Phone', u.phone || '—')} ${row('Email', u.email || '—')}
          ${row('Member since', UI.fmtDate(u.createdAt))}
        </div>
        <div class="card"><h3>Linked children</h3>
          ${p.children && p.children.length ? p.children.map((c) => `<div class="list-row"><span class="k">${UI.esc(c.full_name)}</span><span class="v">${UI.esc(c.class_name || '')} ${UI.esc(c.stream || '')}</span></div>`).join('') : '<div class="doc-meta">No children linked yet.</div>'}
        </div>
      </div>
      <div id="prof-prefs" style="margin-top:16px"></div>`;
    box.querySelector('#prof-pass').onclick = () => UI.openChangePassword();
    box.querySelector('#prof-photo').onclick = () => UI.openAvatarUpload();
    await UI.profileSettingsPanel(box.querySelector('#prof-prefs'));
  }

  function row(k, v) { return `<div class="list-row"><span class="k">${UI.esc(k)}</span><span class="v">${UI.esc(v)}</span></div>`; }
})();
