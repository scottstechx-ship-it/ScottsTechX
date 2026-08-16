/**
 * PARENT DASHBOARD
 * Simple, mobile-first. Focus: communication with teachers/administration,
 * documents and announcements for the parent's children.
 */
(function () {
  const API = window.API;
  const UI = window.UI;

  const user = API.getUser();
  if (!API.getToken() || !user || user.role !== 'parent') { location.href = '../login.html'; return; }

  let layout;
  let children = [];
  let activeChildId = Number(localStorage.getItem('scp_child_id')) || null;
  let messaging = null;
  let documents = null;
  let announcements = null;

  function currentChild() {
    return children.find((c) => c.id === activeChildId) || children[0] || null;
  }

  const nav = [
    { key: 'home', label: 'Home', icon: '🏠', section: 'Main' },
    { key: 'messages', label: 'Messages', icon: '💬', section: 'Main' },
    { key: 'documents', label: 'Documents', icon: '📄', section: 'Main' },
    { key: 'announcements', label: 'Announcements', icon: '📢', section: 'Main' },
    { key: 'children', label: 'My Children', icon: '👨‍👧‍👦', section: 'Family' },
    { key: 'notifications', label: 'Notifications', icon: '🔔', section: 'Family' },
    { key: 'profile', label: 'Profile', icon: '👤', section: 'Account' },
  ];
  const bottomNav = [
    { key: 'home', label: 'Home', icon: '🏠' },
    { key: 'messages', label: 'Messages', icon: '💬' },
    { key: 'documents', label: 'Documents', icon: '📄' },
    { key: 'children', label: 'Children', icon: '👨‍👧‍👦' },
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
    localStorage.setItem('scp_child_id', activeChildId || '');
  }

  async function show(key) {
    layout.setActive(key);
    const titles = { home: 'Home', messages: 'Messages', documents: 'Documents', announcements: 'Announcements', children: 'My Children', notifications: 'Notifications', profile: 'Profile' };
    layout.setTitle(titles[key] || 'Dashboard');
    const content = layout.content;

    if (key === 'home') return renderHome(content);
    if (key === 'messages') return renderMessages(content);
    if (key === 'documents') return renderDocuments(content);
    if (key === 'announcements') return renderAnnouncements(content);
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
      localStorage.setItem('scp_child_id', activeChildId);
      show(activeViewName());
    }));
  }
  let activeViewName = () => 'home';

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
        <h2 style="color:#fff;margin-bottom:2px">Welcome, ${UI.esc(firstName.toUpperCase())} 👋</h2>
        <div style="opacity:.92">Here is the latest from school.</div>
      </div>
      ${childSelectorHtml(child)}
      <div class="grid grid-3">
        <div class="card stat-card"><div class="stat-ic ic-blue">💬</div><div><div class="stat-num">${c.unreadMessages || 0}</div><div class="stat-label">Unread messages</div></div></div>
        <div class="card stat-card"><div class="stat-ic ic-green">🔔</div><div><div class="stat-num">${c.unreadNotifications || 0}</div><div class="stat-label">Notifications</div></div></div>
        <div class="card stat-card"><div class="stat-ic ic-purple">👨‍👧‍👦</div><div><div class="stat-num">${children.length}</div><div class="stat-label">Children</div></div></div>
      </div>
      ${stats && stats.fees ? `<div class="card"><div class="grid grid-3" style="gap:10px">
        <div class="stat-card card" style="margin:0"><div class="stat-ic ic-amber">💰</div><div><div class="stat-num">${UI.money(stats.fees.totalDue)}</div><div class="stat-label">Fees due</div></div></div>
        <div class="stat-card card" style="margin:0"><div class="stat-ic ic-green">✅</div><div><div class="stat-num">${UI.money(stats.fees.totalPaid)}</div><div class="stat-label">Paid</div></div></div>
        <div class="stat-card card" style="margin:0"><div class="stat-ic ic-red">⚠️</div><div><div class="stat-num">${UI.money((stats.fees.totalDue || 0) - (stats.fees.totalPaid || 0))}</div><div class="stat-label">Outstanding</div></div></div>
      </div></div>` : ''}
      <div class="grid grid-2">
        <div class="card"><h3>👨‍👧‍👦 Your children</h3><div id="home-children"></div></div>
        <div class="card"><h3>📢 Recent updates</h3><div id="home-updates"></div></div>
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3>📋 Upcoming exams</h3><div id="home-exams"></div></div>
        <div class="card"><h3>📝 Assignments due soon</h3><div id="home-assign"></div></div>
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
      localStorage.setItem('scp_child_id', activeChildId);
      show('home');
    }));

    const up = box.querySelector('#home-updates');
    const anns = (stats && stats.recentAnnouncements || []).slice(0, 4);
    if (!anns.length) up.innerHTML = '<div class="doc-meta">No recent announcements.</div>';
    for (const a of anns) {
      up.appendChild(UI.el(`<div class="ann-item ${a.is_read ? '' : 'unread'}" style="margin-bottom:8px">
        <div class="ann-title"><span>${a.important ? '🔴 ' : ''}${UI.esc(a.title)}</span></div>
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
          <button class="btn" id="quick-ct">💬 Contact ${UI.esc(child.class_teacher_name || 'Class Teacher')}</button>
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
    box.innerHTML = `<div class="card"><h3>👨‍👧‍👦 Your children</h3>
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
      localStorage.setItem('scp_child_id', activeChildId);
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
            html += `<tr><td>${UI.esc(e.title)}</td><td>${UI.esc(e.subject || '')}</td><td>${res ? res.marks : '—'}</td><td>${res ? UI.esc(res.grade || '—') : '—'}</td></tr>`;
          }
          tabBody.innerHTML = html + '</tbody></table></div>';
        } catch (e) { tabBody.innerHTML = `<div class="doc-meta">${UI.esc(e.message)}</div>`; }
      } else if (tab === 'timetable') {
        if (child.class_id) {
          const entries = (await API.get(`/api/timetable?classId=${child.class_id}`)).entries || [];
          tabBody.innerHTML = entries.length ? `<div class="table-responsive"><table class="table"><thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Room</th></tr></thead><tbody>${entries.map((e) => `<tr><td>${UI.esc(e.day)}</td><td>${UI.esc(e.start_time)}-${UI.esc(e.end_time)}</td><td>${UI.esc(e.subject || '—')}</td><td>${UI.esc(e.room || '—')}</td></tr>`).join('')}</tbody></table></div>`
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
    const icons = { message: '💬', document: '📄', announcement: '📢', assignment: '📝', attendance: '✅', exam: '📋', results: '🎓', fee: '💰', system: '🔔', account: '🔐' };
    box.innerHTML = `<div class="card"><h3>Notifications</h3>
      <button class="btn secondary sm" id="nt-all" style="margin-top:8px">Mark all read</button>
      <div id="nt-list" style="margin-top:8px"></div></div>`;
    const list = box.querySelector('#nt-list');
    if (!items.length) list.innerHTML = '<div class="doc-meta">No notifications yet.</div>';
    for (const n of items) {
      list.appendChild(UI.el(`<div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" style="border-radius:10px;margin-bottom:6px">
        <span class="n-ic">${icons[n.type] || '🔔'}</span>
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
        <button class="btn secondary sm" id="prof-pass" style="margin-top:8px">🔑 Change password</button>
        <button class="btn secondary sm" id="prof-photo" style="margin-top:8px">📷 Change photo</button></div>
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
