/**
 * ADMIN DASHBOARD — everyday school management.
 * Students (incl. bulk import), staff, classes, academics (attendance,
 * assignments, exams, timetable, fees), communication & documents.
 */
(function () {
  const API = window.API;
  const UI = window.UI;

  const user = API.getUser();
  if (!API.getToken() || !user || user.role !== 'admin') { location.href = '../login.html'; return; }

  let layout;
  let messaging = null;
  let documents = null;
  let announcements = null;
  let ref = { classes: [], teachers: [], students: [], parents: [] };

  const nav = [
    { key: 'home', label: 'Home', icon: '🏠', section: 'Main' },
    { key: 'messages', label: 'Messages', icon: '💬', section: 'Main' },
    { key: 'documents', label: 'Documents', icon: '📄', section: 'Main' },
    { key: 'announcements', label: 'Announcements', icon: '📢', section: 'Main' },
    { key: 'students', label: 'Students', icon: '🧑‍🎓', section: 'Management' },
    { key: 'import', label: 'Import Students', icon: '📥', section: 'Management' },
    { key: 'users', label: 'Users & Staff', icon: '👥', section: 'Management' },
    { key: 'teachers', label: 'Teachers', icon: '👩‍🏫', section: 'Management' },
    { key: 'parents', label: 'Parents', icon: '👨‍👧‍👦', section: 'Management' },
    { key: 'classes', label: 'Classes', icon: '🏫', section: 'Management' },
    { key: 'subjects', label: 'Subjects', icon: '📚', section: 'Management' },
    { key: 'attendance', label: 'Attendance', icon: '✅', section: 'Academic' },
    { key: 'assignments', label: 'Assignments', icon: '📝', section: 'Academic' },
    { key: 'exams', label: 'Exams & Results', icon: '📋', section: 'Academic' },
    { key: 'timetable', label: 'Timetable', icon: '🕒', section: 'Academic' },
    { key: 'fees', label: 'Fees & Payments', icon: '💰', section: 'Academic' },
    { key: 'admissions', label: 'Admissions', icon: '🎓', section: 'Website' },
    { key: 'website-news', label: 'Website News', icon: '📰', section: 'Website' },
    { key: 'notifications', label: 'Notifications', icon: '🔔', section: 'Account' },
    { key: 'profile', label: 'Profile', icon: '👤', section: 'Account' },
  ];
  const bottomNav = [
    { key: 'home', label: 'Home', icon: '🏠' },
    { key: 'messages', label: 'Messages', icon: '💬' },
    { key: 'students', label: 'Students', icon: '🧑‍🎓' },
    { key: 'documents', label: 'Documents', icon: '📄' },
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
    const titles = { home: 'Home', messages: 'Messages', documents: 'Documents', announcements: 'Announcements', students: 'Students', import: 'Import Students', users: 'Users & Staff', teachers: 'Teachers', parents: 'Parents', classes: 'Classes', subjects: 'Subjects', attendance: 'Attendance', assignments: 'Assignments', exams: 'Exams & Results', timetable: 'Timetable', fees: 'Fees & Payments', admissions: 'Admission Applications', 'website-news': 'Website News', notifications: 'Notifications', profile: 'Profile' };
    layout.setTitle(titles[key] || 'Dashboard');
    const content = layout.content;

    if (key === 'home') return renderHome(content);
    if (key === 'messages') return renderMessages(content);
    if (key === 'documents') return renderDocuments(content);
    if (key === 'announcements') return renderAnnouncements(content);
    if (key === 'students') return renderStudents(content);
    if (key === 'users') return renderUsers(content);
    if (key === 'import') return openImportWizard();
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
        <h2 style="color:#fff;margin-bottom:2px">Good day, ${UI.esc(user.fullName.split(' ')[0])}! 🏫</h2>
        <div style="opacity:.9">School operations overview.</div>
      </div>
      <div class="grid grid-4" style="margin-top:16px">
        ${stat('🧑‍🎓', c.students || 0, 'Students', 'ic-blue')}
        ${stat('👩‍🏫', c.teachers || 0, 'Teachers', 'ic-purple')}
        ${stat('👨‍👧‍👦', c.parents || 0, 'Parents', 'ic-green')}
        ${stat('🏫', c.classes || 0, 'Classes', 'ic-amber')}
        ${stat('✅', c.attendanceToday || 0, 'Attendance today', 'ic-green')}
        ${stat('📝', c.assignments || 0, 'Assignments', 'ic-blue')}
        ${stat('📋', c.exams || 0, 'Exams', 'ic-purple')}
        ${stat('🔔', c.unreadNotifications || 0, 'Notifications', 'ic-red')}
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3>🧑‍🎓 Students per class</h3><div id="home-chart"></div></div>
        <div class="card"><h3>💰 Fee snapshot</h3><div id="home-fees"></div></div>
      </div>
      <div class="grid grid-3" style="margin-top:16px">
        <div class="card"><h3>📋 Upcoming exams</h3><div id="home-exams"></div></div>
        <div class="card"><h3>📝 Assignments due soon</h3><div id="home-assign"></div></div>
        <div class="card"><h3>📢 Recent announcements</h3><div id="home-ann"></div></div>
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
        <button class="btn secondary" id="stu-import">📥 Import</button>
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
        if (!students.length && reset) { list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="big">🧑‍🎓</div>No students found.</div>'; more.style.display = 'none'; return; }
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
              <button class="btn secondary sm" data-view="${s.id}" title="View profile">👁</button>
              <button class="btn secondary sm" data-edit="${s.id}">✏️</button>
              <button class="btn secondary sm" data-archive="${s.id}" title="${s.status === 'archived' ? 'Restore' : 'Archive'}">${s.status === 'archived' ? '♻️' : '📦'}</button>
              <button class="btn danger sm" data-del="${s.id}">🗑</button>
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
      foot: '<button class="btn secondary" data-edit>✏️ Edit</button><button class="btn" data-close>Close</button>',
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
            tr.innerHTML = `<td>${UI.esc(e.title)}</td><td>${UI.esc(e.subject || '')}</td><td>${res ? res.marks : '—'}</td><td>${res ? UI.esc(res.grade || '—') : '—'}</td>`;
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
          body.innerHTML = entries.length ? `<div class="table-responsive"><table class="table"><thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Room</th></tr></thead><tbody>${entries.map((e) => `<tr><td>${UI.esc(e.day)}</td><td>${UI.esc(e.start_time)}-${UI.esc(e.end_time)}</td><td>${UI.esc(e.subject || '—')}</td><td>${UI.esc(e.room || '—')}</td></tr>`).join('')}</tbody></table></div>`
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
  async function openImportWizard() {
    let step = 1;
    let importId = null;
    let headers = [];
    let mapping = {};
    let validation = null;
    let importDbId = null;

    const wizard = UI.openModal({
      title: '📥 Import students — Step 1 of 6: Upload',
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
        <a class="btn secondary sm" href="${API.base}/api/imports/template.csv" target="_blank">⬇ Download template</a>`;
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
          <button class="btn secondary" data-back>← Back</button>
          <button class="btn" data-next>Continue →</button>
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
            ${wizStat('✅', s.valid, 'Valid')}
            ${wizStat('⚠️', s.warnings, 'Need review')}
            ${wizStat('❌', s.errors, 'Will be skipped')}
            ${wizStat('📄', s.total, 'Total rows')}
          </div>
          <div id="val-rows" style="max-height:340px;overflow-y:auto;margin-top:12px"></div>
          <div class="modal-foot" style="position:static;padding:12px 0 0;border:none;display:flex;justify-content:flex-end;gap:8px">
            <button class="btn secondary" data-back>← Back</button>
            <button class="btn" data-next>Preview & confirm →</button>
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
          <button class="btn secondary" data-back>← Back</button>
          <button class="btn success" data-import>🚀 Import valid records</button>
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
            <div style="font-size:40px">✅</div>
            <h3>Import complete</h3>
            <div class="grid grid-4">
              ${wizStat('➕', c.imported, 'Imported')}
              ${wizStat('⚠️', c.skipped, 'Skipped')}
              ${wizStat('❌', c.failed, 'Failed')}
              ${wizStat('📄', c.warnings || 0, 'With warnings')}
            </div>
            ${result.failures && result.failures.length ? `<div class="doc-meta" style="margin-top:10px">${result.failures.slice(0, 5).map((f) => UI.esc('Row ' + f.row + ': ' + f.reason)).join('<br>')}</div>` : ''}
            ${result.credentialsCount ? `<div class="card" style="margin-top:12px;text-align:left;background:var(--primary-light)">
              <strong>🔑 Login codes generated (${result.credentialsCount})</strong>
              <p class="doc-meta">Each student was given a login code (username) and a default password. Share these with them — they will be asked to set their own password on first login.</p>
              <div style="max-height:180px;overflow-y:auto;font-size:12.5px">${(result.credentials || []).slice(0, 50).map((c) => `<div class="list-row"><span class="k">${UI.esc(c.name)}</span><span class="v"><code>${UI.esc(c.username)}</code> / <code>${UI.esc(c.password)}</code></span></div>`).join('')}</div>
              ${result.credentialsCount > 50 ? '<div class="doc-meta">… and more. Download the full list below.</div>' : ''}
            </div>` : ''}
            <button class="btn secondary sm" data-report>⬇ Download error report</button>
            ${result.credentialsCount ? '<button class="btn" data-creds>🔑 Download login codes (CSV)</button>' : ''}
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
        if (!teachers.length) { list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="big">👩‍🏫</div>No teachers found.</div>'; return; }
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
              <button class="btn secondary sm" data-edit>✏️</button>
              <button class="btn danger sm" data-del>🗑</button>
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
        <h3>🕓 Pending registrations</h3>
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
          const row = UI.el(`<div class="doc-item">
            <div style="flex:1;min-width:0">
              <div class="doc-name">${UI.esc(p.full_name)} ${p.email_verified ? '<span class="badge green">email verified</span>' : '<span class="badge amber">email not verified</span>'}</div>
              <div class="doc-meta">${UI.esc(p.email || '')} · ${UI.esc(p.phone || '—')} · registered ${UI.timeAgo(p.registered_at)}</div>
            </div>
            <div class="doc-actions">
              <button class="btn success sm" data-ap="${p.id}">✓ Approve</button>
              <button class="btn danger sm" data-rj="${p.id}">✕ Reject</button>
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
        if (!parents.length) { list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="big">👨‍👧‍👦</div>No parents found.</div>'; return; }
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
              <button class="btn secondary sm" data-edit>✏️</button>
              <button class="btn danger sm" data-del>🗑</button>
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
        if (!classes.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="big">🏫</div>No classes yet.</div>'; return; }
        grid.innerHTML = '';
        for (const cl of classes) {
          grid.appendChild(UI.el(`<div class="card">
            <h3>${UI.esc(cl.name)} ${UI.esc(cl.stream || '')}</h3>
            <div class="doc-meta">${cl.student_count || 0} students · ${UI.esc(cl.academic_year)} · Teacher: ${UI.esc(cl.class_teacher_name || '—')}</div>
            <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn secondary sm" data-view>View students</button>
              <button class="btn secondary sm" data-edit>✏️</button>
              <button class="btn danger sm" data-del>🗑</button>
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
    box.innerHTML = `<div class="card" style="display:flex;gap:16px;align-items:center">
        <div class="avatar-lg">${UI.initials(u.fullName)}</div>
        <div><h2>${UI.esc(u.fullName)}</h2><div class="doc-meta">${UI.esc(u.email || '')} · Administrator</div>
        <button class="btn secondary sm" id="prof-pass" style="margin-top:8px">🔑 Change password</button>
        <button class="btn secondary sm" id="prof-photo" style="margin-top:8px">📷 Change photo</button></div>
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
