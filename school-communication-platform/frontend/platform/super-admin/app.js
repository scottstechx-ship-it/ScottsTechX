/**
 * SUPER ADMIN DASHBOARD — full platform control.
 * User management, school configuration, permissions, security, backups,
 * activity logs plus the full communication suite.
 */
(function () {
  const API = window.API;
  const UI = window.UI;

  const user = API.getUser();
  if (!API.getToken() || !user || user.role !== 'super_admin') { location.href = '../login.html'; return; }

  let layout;
  let messaging = null;
  let documents = null;
  let announcements = null;
  let ref = { classes: [], teachers: [], students: [], parents: [] };

  const nav = [
    { key: 'home', label: 'Overview', icon: '🏠', section: 'Main' },
    { key: 'messages', label: 'Messages', icon: '💬', section: 'Main' },
    { key: 'documents', label: 'Documents', icon: '📄', section: 'Main' },
    { key: 'announcements', label: 'Announcements', icon: '📢', section: 'Main' },
    { key: 'users', label: 'Users', icon: '👥', section: 'Management' },
    { key: 'students', label: 'Students', icon: '🧑‍🎓', section: 'Management' },
    { key: 'teachers', label: 'Teachers', icon: '👩‍🏫', section: 'Management' },
    { key: 'parents', label: 'Parents', icon: '👨‍👧‍👦', section: 'Management' },
    { key: 'classes', label: 'Classes', icon: '🏫', section: 'Management' },
    { key: 'admissions', label: 'Admissions', icon: '🎓', section: 'Website' },
    { key: 'website-gallery', label: 'Website Gallery', icon: '🖼️', section: 'Website' },
    { key: 'website-news', label: 'Website News', icon: '📰', section: 'Website' },
    { key: 'settings', label: 'School Settings', icon: '⚙️', section: 'System' },
    { key: 'permissions', label: 'Permissions', icon: '🔐', section: 'System' },
    { key: 'security', label: 'Security & API', icon: '🛡️', section: 'System' },
    { key: 'backup', label: 'Backup', icon: '💾', section: 'System' },
    { key: 'logs', label: 'Activity Logs', icon: '🕒', section: 'System' },
    { key: 'notifications', label: 'Notifications', icon: '🔔', section: 'Account' },
    { key: 'profile', label: 'Profile', icon: '👤', section: 'Account' },
  ];
  const bottomNav = [
    { key: 'home', label: 'Home', icon: '🏠' },
    { key: 'messages', label: 'Messages', icon: '💬' },
    { key: 'users', label: 'Users', icon: '👥' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  UI.initLayout({ nav, bottomNav, title: 'Super Admin', onNav: (k) => show(k) }).then(async (l) => {
    layout = l;
    window.__setNavBadge = (k, n) => l.setBadge(k, n);
    window.__navHandler = (k) => show(k);
    try { ref = await API.get('/api/settings/classes-reference'); } catch {}
    window.Realtime.start();
    show('home');
  });

  async function show(key) {
    layout.setActive(key);
    const titles = { home: 'Overview', messages: 'Messages', documents: 'Documents', announcements: 'Announcements', users: 'User Management', students: 'Students', teachers: 'Teachers', parents: 'Parents', classes: 'Classes', admissions: 'Admission Applications', 'website-gallery': 'Website Gallery', 'website-news': 'Website News', settings: 'School Settings', permissions: 'Permissions', security: 'Security & API', backup: 'Backup', logs: 'Activity Logs', notifications: 'Notifications', profile: 'Profile' };
    layout.setTitle(titles[key] || 'Dashboard');
    const content = layout.content;

    if (key === 'home') return renderHome(content);
    if (key === 'messages') return renderMessages(content);
    if (key === 'documents') return renderDocuments(content);
    if (key === 'announcements') return renderAnnouncements(content);
    if (key === 'users') return renderUsers(content);
    if (key === 'students') return renderStudents(content);
    if (key === 'teachers') return renderTeachers(content);
    if (key === 'parents') return renderParents(content);
    if (key === 'classes') return renderClasses(content);
    if (key === 'admissions') { content.innerHTML = '<div class="view active"></div>'; return window.Website.AdmissionsView.render(content.firstElementChild); }
    if (key === 'website-gallery') { content.innerHTML = '<div class="view active"></div>'; return window.Website.GalleryManager.render(content.firstElementChild); }
    if (key === 'website-news') { content.innerHTML = '<div class="view active"></div>'; return window.Website.NewsManager.render(content.firstElementChild); }
    if (key === 'settings') return renderSettings(content);
    if (key === 'permissions') return renderPermissions(content);
    if (key === 'security') return renderSecurity(content);
    if (key === 'backup') return renderBackup(content);
    if (key === 'logs') return renderLogs(content);
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
      <div class="card" style="background:linear-gradient(135deg,#1e1b4b,#4f46e5);color:#fff;border:none">
        <h2 style="color:#fff;margin-bottom:2px">Platform overview, ${UI.esc(user.fullName.split(' ')[0])} 🛡️</h2>
        <div style="opacity:.9">Super admin control centre.</div>
      </div>
      <div class="grid grid-4" style="margin-top:16px">
        ${stat('🧑‍🎓', c.students || 0, 'Students', 'ic-blue')}
        ${stat('👩‍🏫', c.teachers || 0, 'Teachers', 'ic-purple')}
        ${stat('👨‍💼', c.admins || 0, 'Admins', 'ic-amber')}
        ${stat('👨‍👧‍👦', c.parents || 0, 'Parents', 'ic-green')}
        ${stat('👥', c.activeUsers || 0, 'Active users', 'ic-red')}
        ${stat('🏫', c.classes || 0, 'Classes', 'ic-blue')}
        ${stat('📝', c.assignments || 0, 'Assignments', 'ic-green')}
        ${stat('📋', c.exams || 0, 'Exams', 'ic-purple')}
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3>🧑‍🎓 Students per class</h3><div id="home-chart"></div></div>
        <div class="card"><h3>💰 Fees overview</h3><div id="home-fees"></div></div>
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3>👥 Users by role</h3><div id="home-roles"></div></div>
        <div class="card"><h3>🕒 Recent activity</h3><div id="home-act"></div></div>
      </div>
      <div class="grid grid-2">
        <div class="card"><h3>📄 Recent documents</h3><div id="home-docs"></div></div>
        <div class="card"><h3>📢 Recent announcements</h3><div id="home-ann"></div></div>
      </div>`;

    UI.barChart(box.querySelector('#home-chart'), (stats.studentsPerClass || []).map((r) => ({ label: r.label, value: r.value })));
    const fees = stats.fees || {};
    box.querySelector('#home-fees').innerHTML =
      `<div class="list-row"><span class="k">Total billed</span><span class="v">${UI.money(fees.due)}</span></div>
       <div class="list-row"><span class="k">Total paid</span><span class="v">${UI.money(fees.paid)}</span></div>
       <div class="list-row"><span class="k">Outstanding</span><span class="v" style="color:var(--danger)">${UI.money((fees.due || 0) - (fees.paid || 0))}</span></div>`;

    const rolesBox = box.querySelector('#home-roles');
    for (const r of (stats.usersByRole || [])) {
      rolesBox.appendChild(UI.el(`<div class="list-row"><span class="k">${UI.esc(r.role.replace('_', ' '))}</span><span class="v">${r.c}</span></div>`));
    }
    if (!(stats.usersByRole || []).length) rolesBox.innerHTML = '<div class="doc-meta">No data.</div>';

    const actBox = box.querySelector('#home-act');
    for (const a of (stats.recentActivity || []).slice(0, 8)) {
      actBox.appendChild(UI.el(`<div class="list-row"><span class="k">${UI.esc(a.user_name || 'System')} · <code>${UI.esc(a.action)}</code></span><span class="v">${UI.timeAgo(a.created_at)}</span></div>`));
    }
    if (!(stats.recentActivity || []).length) actBox.innerHTML = '<div class="doc-meta">No activity yet.</div>';

    const docBox = box.querySelector('#home-docs');
    for (const d of (stats.recentDocuments || []).slice(0, 4)) {
      docBox.appendChild(UI.el(`<div class="doc-item" style="margin-bottom:8px"><div class="file-ic file-pdf">📄</div><div style="min-width:0"><div class="doc-name">${UI.esc(d.name)}</div><div class="doc-meta">${UI.timeAgo(d.created_at)}</div></div></div>`));
    }
    if (!(stats.recentDocuments || []).length) docBox.innerHTML = '<div class="doc-meta">Nothing yet.</div>';

    const annBox = box.querySelector('#home-ann');
    for (const a of (stats.recentAnnouncements || []).slice(0, 4)) {
      annBox.appendChild(UI.el(`<div class="ann-item" style="margin-bottom:8px"><div class="ann-title">${UI.esc(a.title)}</div><div class="ann-meta">${UI.timeAgo(a.created_at)}</div></div>`));
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

  // ----------------------------------------------------------------- USERS
  async function renderUsers(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = `
      <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <div class="search-input" style="flex:1;min-width:160px"><input id="u-search" placeholder="Search users…"></div>
        <select id="u-role" style="width:auto"><option value="">All roles</option><option>super_admin</option><option>admin</option><option>teacher</option><option>student</option><option>parent</option></select>
        <select id="u-status" style="width:auto"><option value="">All statuses</option><option>active</option><option>inactive</option><option>suspended</option></select>
        <button class="btn" id="u-add">＋ Create user</button>
      </div>
      <div class="card table-responsive"><div id="u-list"></div></div>`;

    box.querySelector('#u-add').onclick = () => userModal(null, () => loadUsers());

    const loadUsers = async () => {
      const params = new URLSearchParams();
      const q = box.querySelector('#u-search').value.trim();
      if (q) params.set('search', q);
      if (box.querySelector('#u-role').value) params.set('role', box.querySelector('#u-role').value);
      if (box.querySelector('#u-status').value) params.set('status', box.querySelector('#u-status').value);
      try {
        const data = await API.get('/api/users?' + params.toString());
        const list = box.querySelector('#u-list');
        const users = data.users || [];
        if (!users.length) { list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="big">👥</div>No users found.</div>'; return; }
        list.innerHTML = `<table class="table"><thead><tr>
          <th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th style="text-align:right">Actions</th>
        </tr></thead><tbody></tbody></table>`;
        const tbody = list.querySelector('tbody');
        users.forEach((u) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="Name"><strong>${UI.esc(u.full_name)}</strong></td>
            <td data-label="Username">${UI.esc(u.username)}</td>
            <td data-label="Email">${UI.esc(u.email || '—')}</td>
            <td data-label="Role">${roleBadge(u.role)}</td>
            <td data-label="Status">${statusBadge(u.status)}</td>
            <td data-label="Last login">${UI.timeAgo(u.last_login) || 'Never'}</td>
            <td data-label="" class="actions-cell"><div class="actions">
              <button class="btn secondary sm" data-edit>✏️</button>
              <button class="btn secondary sm" data-pass>🔑</button>
              <button class="btn danger sm" data-del>🗑</button>
            </div></td>`;
          tbody.appendChild(tr);
          tr.querySelector('[data-edit]').onclick = () => userModal(u, () => loadUsers());
          tr.querySelector('[data-pass]').onclick = () => resetPasswordModal(u);
          tr.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Delete user ${UI.esc(u.full_name)} (${UI.esc(u.username)})? This permanently removes their account.`, { title: 'Delete user', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/users/${u.id}`); UI.toast('User deleted.', 'success'); loadUsers(); } catch (e) { UI.toast(e.message, 'error'); }
          };
        });
      } catch (e) { UI.toast(e.message, 'error'); }
    };
    ['#u-search', '#u-role', '#u-status'].forEach((sel) => box.querySelector(sel).addEventListener('input', loadUsers));
    box.querySelector('#u-role').addEventListener('change', loadUsers);
    box.querySelector('#u-status').addEventListener('change', loadUsers);
    await loadUsers();
  }

  function userModal(u, onSave) {
    const isEdit = !!u;
    let modal;
    modal = UI.openModal({
      title: isEdit ? 'Edit user' : 'Create user',
      body: `<div class="form-row">
        <label class="field">Full name <span class="req">*</span><input id="u-name" value="${isEdit ? UI.esc(u.full_name) : ''}"></label>
        <label class="field">Username <span class="req">*</span><input id="u-username" value="${isEdit ? UI.esc(u.username) : ''}" ${isEdit ? 'disabled' : ''}></label>
      </div>
      <div class="form-row">
        <label class="field">Email<input id="u-email" value="${isEdit ? UI.esc(u.email || '') : ''}"></label>
        <label class="field">Phone<input id="u-phone" value="${isEdit ? UI.esc(u.phone || '') : ''}"></label>
      </div>
      <div class="form-row">
        <label class="field">Role<select id="u-role2">${['super_admin', 'admin', 'teacher', 'student', 'parent'].map((r) => `<option ${isEdit && u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
        <label class="field">Status<select id="u-status2">${['active', 'inactive', 'suspended'].map((s) => `<option ${isEdit && u.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      </div>
      ${!isEdit ? '<label class="field">Password <span class="req">*</span><input type="password" id="u-pass" placeholder="min 8 chars, letter + number"></label>' : ''}`,
      foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>${isEdit ? 'Save' : 'Create'}</button>`,
    });
    modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
    modal.backdrop.querySelector('[data-save]').onclick = async () => {
      const body = {
        fullName: modal.backdrop.querySelector('#u-name').value.trim(),
        email: modal.backdrop.querySelector('#u-email').value.trim(),
        phone: modal.backdrop.querySelector('#u-phone').value.trim(),
        role: modal.backdrop.querySelector('#u-role2').value,
        status: modal.backdrop.querySelector('#u-status2').value,
      };
      if (!isEdit) {
        body.username = modal.backdrop.querySelector('#u-username').value.trim();
        body.password = modal.backdrop.querySelector('#u-pass').value;
      }
      try {
        if (isEdit) await API.put(`/api/users/${u.id}`, body);
        else await API.post('/api/users', body);
        UI.toast(isEdit ? 'User updated.' : 'User created.', 'success');
        modal.close();
        onSave && onSave();
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  function resetPasswordModal(u) {
    let modal;
    modal = UI.openModal({
      title: `Reset password — ${UI.esc(u.full_name)}`,
      body: '<label class="field">New password <span class="req">*</span><input type="password" id="rp-pass" placeholder="min 8 chars, letter + number"></label>',
      foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Reset password</button>`,
    });
    modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
    modal.backdrop.querySelector('[data-save]').onclick = async () => {
      const newPassword = modal.backdrop.querySelector('#rp-pass').value;
      try {
        await API.post(`/api/users/${u.id}/reset-password`, { newPassword });
        UI.toast('Password reset.', 'success');
        modal.close();
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  // ----------------------------------------------------------------- STUDENTS (compact reuse)
  async function renderStudents(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = `
      <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <div class="search-input" style="flex:1;min-width:180px"><input id="s-search" placeholder="Search students…"></div>
        <button class="btn" id="s-add">＋ Add student</button>
      </div>
      <div class="card table-responsive"><div id="s-list"></div></div>`;
    box.querySelector('#s-add').onclick = () => studentModal(null, () => loadStudents());
    const loadStudents = async () => {
      const q = box.querySelector('#s-search').value.trim();
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      try {
        const data = await API.get('/api/students?' + params.toString());
        const list = box.querySelector('#s-list');
        const students = data.students || [];
        if (!students.length) { list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="big">🧑‍🎓</div>No students found.</div>'; return; }
        list.innerHTML = `<table class="table"><thead><tr><th>Student</th><th>Number</th><th>Class</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead><tbody></tbody></table>`;
        const tbody = list.querySelector('tbody');
        students.forEach((s) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="Student"><strong>${UI.esc(s.full_name)}</strong></td>
            <td data-label="Number">${UI.esc(s.student_code)}</td>
            <td data-label="Class">${UI.esc(s.class_name || '—')} ${UI.esc(s.class_stream || '')}</td>
            <td data-label="Status">${statusBadge(s.status)}</td>
            <td data-label="" class="actions-cell"><div class="actions">
              <button class="btn secondary sm" data-edit>✏️</button>
              <button class="btn danger sm" data-del>🗑</button>
            </div></td>`;
          tbody.appendChild(tr);
          tr.querySelector('[data-edit]').onclick = () => studentModal(s, () => loadStudents());
          tr.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Delete student ${UI.esc(s.full_name)}?`, { title: 'Delete student', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/students/${s.id}`); UI.toast('Deleted.', 'success'); loadStudents(); } catch (e) { UI.toast(e.message, 'error'); }
          };
        });
      } catch (e) { UI.toast(e.message, 'error'); }
    };
    box.querySelector('#s-search').oninput = () => loadStudents();
    await loadStudents();
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
        <label class="field">Class<select id="s-class"><option value="">— Unassigned —</option>${ref.classes.map((c) => `<option value="${c.id}" ${isEdit && s.class_id === c.id ? 'selected' : ''}>${UI.esc(c.name)} ${UI.esc(c.stream)}</option>`).join('')}</select></label>
        <label class="field">Parent name<input id="s-pname" value="${isEdit ? UI.esc(s.parent_name || '') : ''}"></label>
      </div>
      <div class="form-row">
        <label class="field">Parent phone<input id="s-pphone" value="${isEdit ? UI.esc(s.parent_phone || '') : ''}"></label>
        <label class="field">Gender<select id="s-gender"><option value="">—</option><option ${isEdit && s.gender === 'Male' ? 'selected' : ''}>Male</option><option ${isEdit && s.gender === 'Female' ? 'selected' : ''}>Female</option></select></label>
      </div>
      ${!isEdit ? `<div class="form-row">
        <label class="field">Login username<input id="s-username"></label>
        <label class="field">Login password<input id="s-password" type="password"></label>
      </div>` : ''}`,
      foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>${isEdit ? 'Save' : 'Add'}</button>`,
    });
    modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
    modal.backdrop.querySelector('[data-save]').onclick = async () => {
      const body = {
        fullName: modal.backdrop.querySelector('#s-name').value.trim(),
        studentCode: modal.backdrop.querySelector('#s-code').value.trim(),
        classId: modal.backdrop.querySelector('#s-class').value || null,
        parentName: modal.backdrop.querySelector('#s-pname').value.trim(),
        parentPhone: modal.backdrop.querySelector('#s-pphone').value.trim(),
        gender: modal.backdrop.querySelector('#s-gender').value || null,
      };
      if (!isEdit) {
        body.username = modal.backdrop.querySelector('#s-username').value.trim();
        body.password = modal.backdrop.querySelector('#s-password').value;
      }
      try {
        if (isEdit) await API.put(`/api/students/${s.id}`, body);
        else await API.post('/api/students', body);
        UI.toast('Saved.', 'success'); modal.close(); onSave && onSave();
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  // ----------------------------------------------------------------- TEACHERS (compact)
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
        const data = await API.get('/api/teachers?' + params.toString());
        const list = box.querySelector('#t-list');
        const teachers = data.teachers || [];
        if (!teachers.length) { list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="big">👩‍🏫</div>No teachers found.</div>'; return; }
        list.innerHTML = `<table class="table"><thead><tr><th>Teacher</th><th>Staff No.</th><th>Subjects</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead><tbody></tbody></table>`;
        const tbody = list.querySelector('tbody');
        teachers.forEach((t) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="Teacher"><strong>${UI.esc(t.full_name)}</strong></td>
            <td data-label="Staff No.">${UI.esc(t.staff_code)}</td>
            <td data-label="Subjects">${(t.subjects || []).map(UI.esc).join(', ') || '—'}</td>
            <td data-label="Status">${statusBadge(t.status)}</td>
            <td data-label="" class="actions-cell"><div class="actions">
              <button class="btn secondary sm" data-edit>✏️</button>
              <button class="btn danger sm" data-del>🗑</button>
            </div></td>`;
          tbody.appendChild(tr);
          tr.querySelector('[data-edit]').onclick = () => teacherModal(t, () => loadTeachers());
          tr.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Delete teacher ${UI.esc(t.full_name)}?`, { title: 'Delete teacher', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/teachers/${t.id}`); UI.toast('Deleted.', 'success'); loadTeachers(); } catch (e) { UI.toast(e.message, 'error'); }
          };
        });
      } catch (e) { UI.toast(e.message, 'error'); }
    };
    box.querySelector('#t-search').oninput = () => loadTeachers();
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
        <label class="field">Subjects (comma separated)<input id="t-subjects" value="${isEdit ? UI.esc((t.subjects || []).join(', ')) : ''}"></label>
        <label class="field">Phone<input id="t-phone" value="${isEdit ? UI.esc(t.phone || '') : ''}"></label>
      </div>
      <label class="field">Classes<select id="t-classes" multiple size="4">${ref.classes.map((c) => {
        const has = isEdit && (t.classes || []).some((tc) => tc.id === c.id);
        return `<option value="${c.id}" ${has ? 'selected' : ''}>${UI.esc(c.name)} ${UI.esc(c.stream)}</option>`;
      }).join('')}</select></label>
      ${!isEdit ? `<div class="form-row">
        <label class="field">Login username<input id="t-username"></label>
        <label class="field">Login password<input id="t-password" type="password"></label>
      </div>` : ''}`,
      foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>${isEdit ? 'Save' : 'Add'}</button>`,
    });
    modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
    modal.backdrop.querySelector('[data-save]').onclick = async () => {
      const sel = modal.backdrop.querySelector('#t-classes');
      const body = {
        fullName: modal.backdrop.querySelector('#t-name').value.trim(),
        staffCode: modal.backdrop.querySelector('#t-code').value.trim(),
        subjects: modal.backdrop.querySelector('#t-subjects').value.split(',').map((s) => s.trim()).filter(Boolean),
        phone: modal.backdrop.querySelector('#t-phone').value.trim(),
        classIds: [...sel.selectedOptions].map((o) => Number(o.value)),
      };
      if (!isEdit) {
        body.username = modal.backdrop.querySelector('#t-username').value.trim();
        body.password = modal.backdrop.querySelector('#t-password').value;
      }
      try {
        if (isEdit) await API.put(`/api/teachers/${t.id}`, body);
        else await API.post('/api/teachers', body);
        UI.toast('Saved.', 'success'); modal.close();
        ref = await API.get('/api/settings/classes-reference');
        onSave && onSave();
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  // ----------------------------------------------------------------- PARENTS (compact)
  async function renderParents(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = `
      <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <div class="search-input" style="flex:1;min-width:180px"><input id="p-search" placeholder="Search parents…"></div>
        <button class="btn" id="p-add">＋ Add parent</button>
      </div>
      <div class="card table-responsive"><div id="p-list"></div></div>`;
    box.querySelector('#p-add').onclick = () => parentModal(null, () => loadParents());
    const loadParents = async () => {
      const q = box.querySelector('#p-search').value.trim();
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      try {
        const data = await API.get('/api/parents?' + params.toString());
        const list = box.querySelector('#p-list');
        const parents = data.parents || [];
        if (!parents.length) { list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="big">👨‍👧‍👦</div>No parents found.</div>'; return; }
        list.innerHTML = `<table class="table"><thead><tr><th>Parent</th><th>Phone</th><th>Children</th><th style="text-align:right">Actions</th></tr></thead><tbody></tbody></table>`;
        const tbody = list.querySelector('tbody');
        parents.forEach((p) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="Parent"><strong>${UI.esc(p.full_name)}</strong></td>
            <td data-label="Phone">${UI.esc(p.phone || '—')}</td>
            <td data-label="Children">${(p.children || []).map((c) => UI.esc(c.full_name)).join(', ') || '—'}</td>
            <td data-label="" class="actions-cell"><div class="actions">
              <button class="btn secondary sm" data-edit>✏️</button>
              <button class="btn danger sm" data-del>🗑</button>
            </div></td>`;
          tbody.appendChild(tr);
          tr.querySelector('[data-edit]').onclick = () => parentModal(p, () => loadParents());
          tr.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Delete parent ${UI.esc(p.full_name)}?`, { title: 'Delete parent', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/parents/${p.id}`); UI.toast('Deleted.', 'success'); loadParents(); } catch (e) { UI.toast(e.message, 'error'); }
          };
        });
      } catch (e) { UI.toast(e.message, 'error'); }
    };
    box.querySelector('#p-search').oninput = () => loadParents();
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
      <label class="field">Linked children<select id="p-children" multiple size="4">${ref.students.map((s) => `<option value="${s.id}" ${linked.includes(s.id) ? 'selected' : ''}>${UI.esc(s.full_name)}</option>`).join('')}</select></label>
      ${!isEdit ? `<div class="form-row">
        <label class="field">Login username<input id="p-username"></label>
        <label class="field">Login password<input id="p-password" type="password"></label>
      </div>` : ''}`,
      foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>${isEdit ? 'Save' : 'Add'}</button>`,
    });
    modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
    modal.backdrop.querySelector('[data-save]').onclick = async () => {
      const sel = modal.backdrop.querySelector('#p-children');
      const body = {
        fullName: modal.backdrop.querySelector('#p-name').value.trim(),
        parentCode: modal.backdrop.querySelector('#p-code').value.trim(),
        phone: modal.backdrop.querySelector('#p-phone').value.trim(),
        email: modal.backdrop.querySelector('#p-email').value.trim(),
        childIds: [...sel.selectedOptions].map((o) => Number(o.value)),
      };
      if (!isEdit) {
        body.username = modal.backdrop.querySelector('#p-username').value.trim();
        body.password = modal.backdrop.querySelector('#p-password').value;
      }
      try {
        if (isEdit) await API.put(`/api/parents/${p.id}`, body);
        else await API.post('/api/parents', body);
        UI.toast('Saved.', 'success'); modal.close(); onSave && onSave();
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  // ----------------------------------------------------------------- CLASSES (compact)
  async function renderClasses(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = `<div class="card" style="display:flex;gap:10px;align-items:center"><h3 style="flex:1;margin:0">Classes</h3>
      <button class="btn" id="c-add">＋ Add class</button></div>
      <div class="grid grid-3" id="c-grid"></div>`;
    box.querySelector('#c-add').onclick = () => classModal(null, () => renderClasses(content));
    try {
      const data = await API.get('/api/classes');
      const grid = box.querySelector('#c-grid');
      const classes = data.classes || [];
      if (!classes.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="big">🏫</div>No classes yet.</div>'; return; }
      grid.innerHTML = '';
      for (const cl of classes) {
        grid.appendChild(UI.el(`<div class="card">
          <h3>${UI.esc(cl.name)} ${UI.esc(cl.stream || '')}</h3>
          <div class="doc-meta">${cl.student_count || 0} students · ${UI.esc(cl.academic_year)}</div>
          <div style="margin-top:10px;display:flex;gap:6px">
            <button class="btn secondary sm" data-edit>✏️</button>
            <button class="btn danger sm" data-del>🗑</button>
          </div></div>`));
      }
      grid.querySelectorAll('.card').forEach((card, i) => {
        const cl = classes[i];
        card.querySelector('[data-edit]').onclick = () => classModal(cl, () => renderClasses(content));
        card.querySelector('[data-del]').onclick = async () => {
          const ok = await UI.confirmDialog(`Delete class ${UI.esc(cl.name)} ${UI.esc(cl.stream)}?`, { title: 'Delete class', confirmText: 'Delete' });
          if (!ok) return;
          try { await API.del(`/api/classes/${cl.id}`); UI.toast('Deleted.', 'success'); renderClasses(content); } catch (e) { UI.toast(e.message, 'error'); }
        };
      });
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  function classModal(cl, onSave) {
    const isEdit = !!cl;
    let modal;
    modal = UI.openModal({
      title: isEdit ? 'Edit class' : 'Add class',
      body: `<div class="form-row">
        <label class="field">Class name <span class="req">*</span><input id="c-name" value="${isEdit ? UI.esc(cl.name) : ''}" placeholder="Senior 2"></label>
        <label class="field">Stream<input id="c-stream" value="${isEdit ? UI.esc(cl.stream || 'A') : 'A'}"></label>
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
        UI.toast('Saved.', 'success'); modal.close(); onSave && onSave();
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  // ----------------------------------------------------------------- SETTINGS
  async function renderSettings(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    let s;
    try { s = await API.get('/api/settings/all'); } catch (e) { UI.toast(e.message, 'error'); return; }
    const school = s.school || {};
    box.innerHTML = `<div class="card">
      <h3>🏫 School information</h3>
      <div class="form-row">
        <label class="field">School name<input id="st-name" value="${UI.esc(school.name || '')}"></label>
        <label class="field">Motto<input id="st-motto" value="${UI.esc(school.motto || '')}"></label>
      </div>
      <div class="form-row">
        <label class="field">Phone<input id="st-phone" value="${UI.esc(school.phone || '')}"></label>
        <label class="field">Email<input id="st-email" value="${UI.esc(school.email || '')}"></label>
      </div>
      <div class="form-row">
        <label class="field">Address<input id="st-address" value="${UI.esc(school.address || '')}"></label>
        <label class="field">Website<input id="st-website" value="${UI.esc(school.website || '')}"></label>
      </div>
      <div class="form-row">
        <label class="field">Current academic year<input id="st-year" value="${UI.esc(school.currentAcademicYear || '')}"></label>
        <label class="field">Academic years (comma separated)<input id="st-years" value="${UI.esc((school.academicYears || []).join(', '))}"></label>
      </div>
      <div class="form-row">
        <label class="field">Streams (comma separated)<input id="st-streams" value="${UI.esc((school.streams || []).join(', '))}"></label>
        <label class="field">Departments (comma separated)<input id="st-depts" value="${UI.esc((school.departments || []).join(', '))}"></label>
      </div>
      <button class="btn" id="st-save">💾 Save school settings</button>
    </div>
    <div class="card">
      <h3>🖼 School logo</h3>
      <p class="doc-meta">This logo appears on the login page and in the sidebar of every dashboard. PNG, JPG, WEBP or GIF, up to 2 MB.</p>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <div id="logo-preview" style="width:120px;height:120px;border:1px solid var(--border);border-radius:12px;display:grid;place-items:center;background:var(--bg);overflow:hidden;font-size:34px">🎓</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
          <button class="btn" id="logo-choose">📁 Choose logo image</button>
          <button class="btn success" id="logo-save" disabled>💾 Save logo</button>
          <button class="btn danger" id="logo-remove">🗑 Remove logo</button>
        </div>
      </div>
      <div class="doc-meta" id="logo-status" style="margin-top:10px"></div>
    </div>
    <div class="card">
      <h3>🔔 Notification preferences</h3>
      <p class="doc-meta">School-wide defaults for in-app notifications. These are enforced by the backend when events are created.</p>
      <div id="nt-prefs"></div>
      <button class="btn" id="nt-prefs-save" style="margin-top:12px">💾 Save notification settings</button>
    </div>
    <div class="card">
      <h3>🔗 API & integration</h3>
      <div class="list-row"><span class="k">API base URL</span><span class="v"><code>${UI.esc(API.base)}</code></span></div>
      <div class="list-row"><span class="k">Max file size</span><span class="v">${s.api && s.api.maxFileSizeMB || 15} MB</span></div>
      <div class="list-row"><span class="k">API documentation</span><span class="v"><a href="/docs/api.html" target="_blank">Open API docs ↗</a></span></div>
      <div class="list-row"><span class="k">Environment</span><span class="v"><code>${UI.esc(s.school && s.school.name ? 'configured' : 'demo')}</code></span></div>
    </div>`;

    // notification preferences
    const prefs = s.notifications || {};
    const prefRow = (key, label, desc) => `<div class="list-row"><span><span class="k">${UI.esc(label)}</span><br><small>${UI.esc(desc || '')}</small></span>
      <input type="checkbox" data-pref="${key}" ${prefs[key] ? 'checked' : ''} style="width:auto;margin:0"></div>`;
    box.querySelector('#nt-prefs').innerHTML =
      prefRow('newMessage', 'New message notifications', 'When someone messages you') +
      prefRow('newDocument', 'New document notifications', 'When a document is shared with you') +
      prefRow('newAnnouncement', 'New announcement notifications', 'When an announcement is published') +
      prefRow('importantNotices', 'Important notices', 'Highlighted urgent announcements') +
      prefRow('accountChanges', 'Account changes', 'Password resets, profile changes');
    box.querySelector('#nt-prefs-save').onclick = async () => {
      const next = {};
      box.querySelectorAll('[data-pref]').forEach((el) => { next[el.dataset.pref] = el.checked; });
      try {
        await API.put('/api/settings/notifications', next);
        UI.toast('Notification settings saved.', 'success');
      } catch (e) { UI.toast(e.message, 'error'); }
    };

    // ---- school logo ----
    const logoBox = box.querySelector('#logo-preview');
    const logoStatus = box.querySelector('#logo-status');
    const logoFile = box.querySelector('#logo-file');
    const logoChoose = box.querySelector('#logo-choose');
    const logoSave = box.querySelector('#logo-save');
    const logoRemove = box.querySelector('#logo-remove');
    let selectedFile = null;

    // show the current logo (or the fallback mark)
    (function loadCurrentLogo() {
      const img = new Image();
      img.onload = () => { logoBox.innerHTML = ''; logoBox.appendChild(img); logoStatus.textContent = 'Logo is set. You can replace or remove it below.'; };
      img.onerror = () => { logoBox.textContent = '🎓'; logoStatus.textContent = 'No logo uploaded yet — choose an image to get started.'; };
      img.src = UI.logoUrl() + '?t=' + Date.now();
      img.alt = 'School logo';
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
    })();

    logoChoose.onclick = () => logoFile.click();
    logoFile.onchange = () => {
      selectedFile = logoFile.files[0];
      if (!selectedFile) return;
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(selectedFile.type)) {
        UI.toast('Logo must be a PNG, JPG, WEBP or GIF image.', 'error');
        logoFile.value = '';
        selectedFile = null;
        logoSave.disabled = true;
        return;
      }
      if (selectedFile.size > 2 * 1024 * 1024) {
        UI.toast('Logo is too large. Maximum size is 2 MB.', 'error');
        logoFile.value = '';
        selectedFile = null;
        logoSave.disabled = true;
        return;
      }
      // local preview before saving
      const reader = new FileReader();
      reader.onload = (e) => { logoBox.innerHTML = ''; const img = new Image(); img.src = e.target.result; img.alt = 'New logo preview'; img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block'; logoBox.appendChild(img); };
      reader.readAsDataURL(selectedFile);
      logoStatus.textContent = 'Preview of the new logo. Click "Save logo" to upload it.';
      logoSave.disabled = false;
    };
    logoSave.onclick = async () => {
      if (!selectedFile) return;
      const form = new FormData();
      form.append('file', selectedFile);
      try {
        const r = await API.upload('/api/settings/logo', form);
        UI.toast(r.message || 'School logo updated.', 'success');
        logoStatus.textContent = 'Logo saved. Reloading the page to update everywhere…';
        setTimeout(() => location.reload(), 900);
      } catch (e) { UI.toast(e.message, 'error'); }
    };
    logoRemove.onclick = async () => {
      const ok = await UI.confirmDialog('Remove the school logo? The 🎓 mark will be used instead.', { title: 'Remove logo', confirmText: 'Remove', danger: true });
      if (!ok) return;
      try {
        await API.del('/api/settings/logo');
        UI.toast('School logo removed.', 'success');
        logoBox.textContent = '🎓';
        logoStatus.textContent = 'No logo uploaded yet.';
      } catch (e) { UI.toast(e.message, 'error'); }
    };

    box.querySelector('#st-save').onclick = async () => {
      try {
        await API.put('/api/settings/school', {
          name: box.querySelector('#st-name').value.trim(),
          motto: box.querySelector('#st-motto').value.trim(),
          phone: box.querySelector('#st-phone').value.trim(),
          email: box.querySelector('#st-email').value.trim(),
          address: box.querySelector('#st-address').value.trim(),
          website: box.querySelector('#st-website').value.trim(),
          currentAcademicYear: box.querySelector('#st-year').value.trim(),
          academicYears: box.querySelector('#st-years').value.split(',').map((x) => x.trim()).filter(Boolean),
          streams: box.querySelector('#st-streams').value.split(',').map((x) => x.trim()).filter(Boolean),
          departments: box.querySelector('#st-depts').value.split(',').map((x) => x.trim()).filter(Boolean),
        });
        UI.toast('School settings saved.', 'success');
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  // ----------------------------------------------------------------- PERMISSIONS
  async function renderPermissions(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    let s;
    try { s = await API.get('/api/settings/all'); } catch (e) { UI.toast(e.message, 'error'); return; }
    const p = s.permissions || {};
    const toggle = (key, checked, label, desc) => `<div class="list-row"><span><span class="k">${UI.esc(label)}</span><br><small>${UI.esc(desc || '')}</small></span>
      <input type="checkbox" data-pkey="${key}" ${checked ? 'checked' : ''} style="width:auto;margin:0"></div>`;

    box.innerHTML = `<div class="card">
      <h3>🔐 Messaging permissions</h3>
      <p class="doc-meta">These rules are enforced by the API. Changing them here updates the whole platform.</p>
      <h4 style="margin-top:12px">Students</h4>
      ${toggle('student.messageTeacher', !!(p.student && p.student.messageTeacher), 'Students can message their teachers')}
      ${toggle('student.messageAdmin', !!(p.student && p.student.messageAdmin), 'Students can message school administration')}
      ${toggle('student.messageClassChat', !!(p.student && p.student.messageClassChat), 'Students can use the class chat')}
      ${toggle('student.sendAttachments', !!(p.student && p.student.sendAttachments), 'Students can send attachments')}
      <h4 style="margin-top:12px">Parents</h4>
      ${toggle('parent.messageClassTeacher', !!(p.parent && p.parent.messageClassTeacher), 'Parents can message class teachers')}
      ${toggle('parent.messageSubjectTeacher', !!(p.parent && p.parent.messageSubjectTeacher), 'Parents can message subject teachers')}
      ${toggle('parent.messageAdmin', !!(p.parent && p.parent.messageAdmin), 'Parents can message school administration')}
      ${toggle('parent.sendAttachments', !!(p.parent && p.parent.sendAttachments), 'Parents can send attachments')}
      <h4 style="margin-top:12px">Teachers</h4>
      ${toggle('teacher.messageStudents', !!(p.teacher && p.teacher.messageStudents), 'Teachers can message students of their classes')}
      ${toggle('teacher.messageParents', !!(p.teacher && p.teacher.messageParents), 'Teachers can message parents of their classes')}
      ${toggle('teacher.messageAdmin', !!(p.teacher && p.teacher.messageAdmin), 'Teachers can message administration')}
      <h4 style="margin-top:12px">General</h4>
      ${toggle('studentMessagingEnabled', !!p.studentMessagingEnabled, 'Enable student messaging overall')}
      ${toggle('parentMessagingEnabled', !!p.parentMessagingEnabled, 'Enable parent messaging overall')}
      <button class="btn" id="perm-save" style="margin-top:12px">💾 Save permissions</button>
    </div>`;

    box.querySelector('#perm-save').onclick = async () => {
      const next = {};
      box.querySelectorAll('[data-pkey]').forEach((el) => {
        const path = el.dataset.pkey.split('.');
        if (path.length === 2) {
          next[path[0]] = next[path[0]] || {};
          next[path[0]][path[1]] = el.checked;
        } else {
          next[path[0]] = el.checked;
        }
      });
      try {
        await API.put('/api/settings/permissions', next);
        UI.toast('Permissions saved. They are enforced immediately.', 'success');
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  // ----------------------------------------------------------------- SECURITY
  async function renderSecurity(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    let s;
    try { s = await API.get('/api/settings/all'); } catch (e) { UI.toast(e.message, 'error'); return; }
    const sec = s.security || {};
    box.innerHTML = `<div class="card">
      <h3>🛡️ Security settings</h3>
      <div class="list-row"><span class="k">Password hashing</span><span class="v"><span class="badge green">bcrypt (10 rounds)</span></span></div>
      <div class="list-row"><span class="k">Authentication</span><span class="v">JWT · expires ${UI.esc(sec.sessionExpiryDays || 1) === '1' ? '12h' : ''} (configurable)</span></div>
      <div class="list-row"><span class="k">Strong passwords (letter + number)</span><span><input type="checkbox" id="sec-strong" ${sec.strongPasswords ? 'checked' : ''} style="width:auto;margin:0"></span></div>
      <div class="list-row"><span class="k">Login attempts limit (per 15 min)</span><span class="v">${sec.loginRateLimit || 20}</span></div>
      <button class="btn" id="sec-save">💾 Save security settings</button>
    </div>
    <div class="card">
      <h3>🌐 CORS (approved origins)</h3>
      <p class="doc-meta">Configured on the server in your <code>.env</code> file via <code>ALLOWED_ORIGINS</code>. Never use a wildcard in production.</p>
      <div class="list-row"><span class="k">Environment</span><span class="v"><code>${UI.esc(location.origin)}</code></span></div>
    </div>`;
    box.querySelector('#sec-save').onclick = async () => {
      try {
        await API.put('/api/settings/security', { strongPasswords: box.querySelector('#sec-strong').checked });
        UI.toast('Security settings saved.', 'success');
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  // ----------------------------------------------------------------- BACKUP
  async function renderBackup(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = `<div class="card">
      <h3>💾 Backup</h3>
      <p>Download a full JSON snapshot of the database (users, students, teachers, parents, classes, messages, documents, announcements, notifications and settings).</p>
      <button class="btn" id="bk-run">⬇ Download backup (JSON)</button>
      <div class="doc-meta" id="bk-info" style="margin-top:10px"></div>
    </div>
    <div class="card">
      <h3>📦 Database</h3>
      <p class="doc-meta">The platform uses SQLite by default for zero-configuration deployment. For high traffic you can swap the database layer for PostgreSQL/MySQL — the schema is documented in <code>backend/database/schema.sql</code> and all queries use prepared statements.</p>
    </div>`;
    box.querySelector('#bk-run').onclick = async () => {
      try {
        const res = await API.raw('/api/settings/backup');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'school-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        box.querySelector('#bk-info').textContent = 'Backup downloaded at ' + new Date().toLocaleTimeString();
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  // ----------------------------------------------------------------- LOGS
  async function renderLogs(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    box.innerHTML = `
      <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <div class="search-input" style="flex:1;min-width:180px"><input id="log-search" placeholder="Search activity…"></div>
        <button class="btn secondary" id="log-refresh">🔄 Refresh</button>
        <a class="btn secondary" href="${API.base}/api/logs/export" download="audit-log.csv">⬇ Export CSV</a>
      </div>
      <div class="card table-responsive"><div id="log-list"></div></div>`;

    const load = async () => {
      const q = box.querySelector('#log-search').value.trim();
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      params.set('limit', '100');
      try {
        const data = await API.get('/api/logs?' + params.toString());
        const list = box.querySelector('#log-list');
        const logs = data.logs || [];
        if (!logs.length) { list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="big">🕒</div>No activity recorded yet.</div>'; return; }
        list.innerHTML = `<table class="table"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody></tbody></table>`;
        const tbody = list.querySelector('tbody');
        logs.forEach((l) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="When">${UI.fmtDate(l.created_at)}<br><small>${UI.fmtTime(l.created_at)}</small></td>
            <td data-label="User">${UI.esc(l.user_name || 'System')}<br><small class="doc-meta">${UI.esc(l.role || '')}</small></td>
            <td data-label="Action"><code>${UI.esc(l.action)}</code></td>
            <td data-label="Details">${UI.esc(l.details || '')}</td>`;
          tbody.appendChild(tr);
        });
      } catch (e) { UI.toast(e.message, 'error'); }
    };
    box.querySelector('#log-search').oninput = () => load();
    box.querySelector('#log-refresh').onclick = () => load();
    await load();
  }

  // ----------------------------------------------------------------- NOTIFICATIONS
  async function renderNotifications(content) {
    content.innerHTML = `<div class="view active"></div>`;
    const box = content.firstElementChild;
    let items = [];
    try { items = (await API.get('/api/notifications?limit=100')).notifications; } catch (e) { UI.toast(e.message, 'error'); }
    const icons = { message: '💬', document: '📄', announcement: '📢', system: '🔔', account: '🔐' };
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
    box.innerHTML = `<div class="card" style="display:flex;gap:16px;align-items:center">
        <div class="avatar-lg">${UI.initials(u.fullName)}</div>
        <div><h2>${UI.esc(u.fullName)}</h2><div class="doc-meta">${UI.esc(u.email || '')} · Super Admin</div>
        <button class="btn secondary sm" id="prof-pass" style="margin-top:8px">🔑 Change password</button>
        <button class="btn secondary sm" id="prof-photo" style="margin-top:8px">📷 Change photo</button></div>
      </div>
      <div class="card" style="margin-top:16px"><h3>Account</h3>
        ${row('Username', u.username)} ${row('Phone', u.phone || '—')} ${row('Email', u.email || '—')}
        ${row('Member since', UI.fmtDate(u.createdAt))}
      </div>
      <div id="prof-prefs" style="margin-top:16px"></div>`;
    box.querySelector('#prof-pass').onclick = () => UI.openChangePassword();
    box.querySelector('#prof-photo').onclick = () => UI.openAvatarUpload();
    await UI.profileSettingsPanel(box.querySelector('#prof-prefs'));
  }

  function roleBadge(role) {
    const colors = { super_admin: 'purple', admin: 'amber', teacher: 'blue', student: 'green', parent: 'gray' };
    return `<span class="badge ${colors[role] || 'gray'}">${UI.esc(role.replace('_', ' '))}</span>`;
  }
  function statusBadge(status) {
    if (status === 'active') return '<span class="badge green">Active</span>';
    return `<span class="badge red">${UI.esc(status)}</span>`;
  }
  function row(k, v) { return `<div class="list-row"><span class="k">${UI.esc(k)}</span><span class="v">${UI.esc(v)}</span></div>`; }
})();
