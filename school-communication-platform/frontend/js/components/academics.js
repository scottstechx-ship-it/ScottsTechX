/**
 * Academics components — attendance, assignments, exams, timetable, fees.
 * One shared module used by Admin, Teacher, Parent and Student dashboards.
 * Every action connects to the API; every role sees only what it may access.
 */
(function () {
  const API = window.API;
  const UI = window.UI;
  const me = () => API.getUser();

  // =========================================================================
  // ATTENDANCE
  // =========================================================================
  const AttendanceView = {
    /** Teacher/Admin: mark + history. */
    async teacherView(container) {
      container.innerHTML = `
        <div class="card" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
          <label class="field" style="margin:0;min-width:160px;flex:1">Class
            <select id="att-class"></select></label>
          <label class="field" style="margin:0">Date
            <input type="date" id="att-date"></label>
          <button class="btn" id="att-load">Load roster</button>
          <button class="btn success" id="att-save">💾 Save attendance</button>
        </div>
        <div class="card" id="att-roster"><div class="doc-meta">Pick a class and date, then load the roster.</div></div>
        <div class="card"><h3>🕒 History</h3><div id="att-history"></div></div>`;

      const classes = (await API.get('/api/classes')).classes || [];
      const sel = container.querySelector('#att-class');
      classes.forEach((c) => sel.appendChild(UI.el(`<option value="${c.id}">${UI.esc(c.name)} ${UI.esc(c.stream || '')}</option>`)));
      container.querySelector('#att-date').value = new Date().toISOString().slice(0, 10);

      const loadRoster = async () => {
        const classId = sel.value;
        const date = container.querySelector('#att-date').value;
        if (!classId || !date) return;
        const students = (await API.get(`/api/classes/${classId}/students`)).students || [];
        const existing = (await API.get(`/api/attendance?classId=${classId}&date=${date}`)).attendance || [];
        const statusMap = {};
        existing.forEach((a) => { statusMap[a.student_id] = a.status; });
        const box = container.querySelector('#att-roster');
        if (!students.length) { box.innerHTML = '<div class="doc-meta">No students in this class.</div>'; return; }
        box.innerHTML = '<h3>📋 Roster for ' + date + '</h3><div id="roster-rows"></div>';
        const rows = box.querySelector('#roster-rows');
        for (const s of students) {
          const current = statusMap[s.id] || 'present';
          rows.appendChild(UI.el(`<div class="doc-item">
            <div style="flex:1;min-width:0"><div class="doc-name">${UI.esc(s.full_name)}</div>
            <div class="doc-meta">${UI.esc(s.student_code)}</div></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${['present', 'absent', 'late', 'permission'].map((st) =>
                `<button class="btn ${current === st ? '' : 'secondary'} sm" data-status="${st}" data-sid="${s.id}" style="${current === st ? 'box-shadow:inset 0 0 0 2px var(--primary)' : ''}">${st[0].toUpperCase() + st.slice(1)}</button>`).join('')}
            </div>
          </div>`));
        }
        rows.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => {
          const sid = b.dataset.sid;
          rows.querySelectorAll(`[data-sid="${sid}"]`).forEach((x) => { x.classList.remove('secondary'); x.style.boxShadow = ''; });
          b.style.boxShadow = 'inset 0 0 0 2px var(--primary)';
          b.dataset.chosen = '1';
          rows.querySelectorAll(`[data-sid="${sid}"]`).forEach((x) => { if (x !== b) x.dataset.chosen = '0'; });
        }));
        container.querySelector('#att-save').onclick = async () => {
          const records = [];
          rows.querySelectorAll('.doc-item').forEach((item) => {
            const sid = Number(item.querySelector('[data-status]').dataset.sid);
            const chosen = item.querySelector('[data-chosen="1"]');
            const status = chosen ? chosen.dataset.status : 'present';
            records.push({ studentId: sid, status });
          });
          try {
            const r = await API.post('/api/attendance', { classId: Number(classId), date, records });
            UI.toast(r.message, 'success');
            await loadHistory();
          } catch (e) { UI.toast(e.message, 'error'); }
        };
      };

      const loadHistory = async () => {
        const classId = sel.value;
        const params = new URLSearchParams();
        if (classId) params.set('classId', classId);
        params.set('limit', '200');
        const data = (await API.get('/api/attendance?' + params.toString())).attendance || [];
        const box = container.querySelector('#att-history');
        if (!data.length) { box.innerHTML = '<div class="doc-meta">No attendance recorded yet.</div>'; return; }
        box.innerHTML = `<div class="table-responsive"><table class="table"><thead><tr>
          <th>Date</th><th>Student</th><th>Status</th><th>Note</th><th style="text-align:right">Actions</th>
        </tr></thead><tbody></tbody></table></div>`;
        const tbody = box.querySelector('tbody');
        data.slice(0, 200).forEach((a) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="Date">${UI.esc(a.date)}</td>
            <td data-label="Student">${UI.esc(a.student_name)}</td>
            <td data-label="Status">${attBadge(a.status)}</td>
            <td data-label="Note">${UI.esc(a.note || '—')}</td>
            <td data-label="" class="actions-cell"><div class="actions">
              <button class="btn secondary sm" data-edit="${a.id}">✏️</button>
              <button class="btn danger sm" data-del="${a.id}">🗑</button>
            </div></td>`;
          tbody.appendChild(tr);
          tr.querySelector('[data-edit]').onclick = async () => {
            const opts = ['present', 'absent', 'late', 'permission'].map((s) => `<option ${a.status === s ? 'selected' : ''}>${s}</option>`).join('');
            const modal = UI.openModal({
              title: 'Correct attendance',
              body: `<label class="field">Status<select id="att-status">${opts}</select></label>
                     <label class="field">Note<textarea id="att-note" rows="2">${UI.esc(a.note || '')}</textarea></label>`,
              foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Save</button>',
            });
            modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
            modal.backdrop.querySelector('[data-save]').onclick = async () => {
              try { await API.put(`/api/attendance/${a.id}`, { status: modal.backdrop.querySelector('#att-status').value, note: modal.backdrop.querySelector('#att-note').value }); UI.toast('Attendance updated.', 'success'); modal.close(); loadHistory(); }
              catch (e) { UI.toast(e.message, 'error'); }
            };
          };
          tr.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog('Delete this attendance record?', { title: 'Delete record', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/attendance/${a.id}`); UI.toast('Record deleted.', 'success'); loadHistory(); } catch (e) { UI.toast(e.message, 'error'); }
          };
        });
      };

      container.querySelector('#att-load').onclick = () => loadRoster();
      sel.addEventListener('change', loadHistory);
      await loadHistory();
    },

    /** Student / Parent: view own / children's attendance. */
    async viewer(container, { studentId, studentName } = {}) {
      container.innerHTML = `<div id="att-summary"></div><div class="card"><h3>🕒 Attendance history — ${UI.esc(studentName || '')}</h3><div id="att-list"></div></div>`;
      try {
        const summary = await API.get(`/api/attendance/summary/student/${studentId}`);
        const box = container.querySelector('#att-summary');
        const pct = summary.percentage === null ? '—' : summary.percentage + '%';
        box.innerHTML = `<div class="grid grid-4">
          ${stat('📊', pct, 'Attendance rate')}
          ${stat('✅', summary.present || 0, 'Present')}
          ${stat('⚠️', summary.absent || 0, 'Absent')}
          ${stat('⏰', summary.late || 0, 'Late')}
        </div>
        ${summary.recentAbsences && summary.recentAbsences.length ? `<div class="card"><h3>Recent absences/lates</h3>${summary.recentAbsences.map((a) => `<div class="list-row"><span class="k">${UI.esc(a.date)}</span><span class="v">${attBadge(a.status)}</span></div>`).join('')}</div>` : ''}`;
        const data = (await API.get(`/api/attendance?studentId=${studentId}&limit=200`)).attendance || [];
        const list = container.querySelector('#att-list');
        if (!data.length) { list.innerHTML = '<div class="doc-meta">No attendance recorded yet.</div>'; return; }
        list.innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Date</th><th>Status</th><th>Note</th></tr></thead><tbody></tbody></table></div>`;
        const tbody = list.querySelector('tbody');
        data.forEach((a) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="Date">${UI.esc(a.date)}</td><td data-label="Status">${attBadge(a.status)}</td><td data-label="Note">${UI.esc(a.note || '—')}</td>`;
          tbody.appendChild(tr);
        });
      } catch (e) { UI.toast(e.message, 'error'); }
    },
  };

  function attBadge(s) {
    const map = { present: ['green', 'Present'], absent: ['red', 'Absent'], late: ['amber', 'Late'], permission: ['blue', 'Permission'] };
    const [c, l] = map[s] || ['gray', s];
    return `<span class="badge ${c}">${l}</span>`;
  }
  function stat(icon, num, label) {
    return `<div class="card stat-card"><div class="stat-ic ic-blue">${icon}</div><div><div class="stat-num">${UI.esc(String(num))}</div><div class="stat-label">${UI.esc(label)}</div></div></div>`;
  }

  // =========================================================================
  // ASSIGNMENTS
  // =========================================================================
  const AssignmentsView = {
    async teacherView(container) {
      container.innerHTML = `
        <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div class="search-input" style="flex:1;min-width:160px"><input id="as-search" placeholder="Search assignments…"></div>
          <select id="as-class" style="width:auto"><option value="">All my classes</option></select>
          <button class="btn" id="as-create">＋ New assignment</button>
        </div>
        <div id="as-list"></div>`;
      const classes = (await API.get('/api/classes')).classes || [];
      const clsSel = container.querySelector('#as-class');
      classes.forEach((c) => clsSel.appendChild(UI.el(`<option value="${c.id}">${UI.esc(c.name)} ${UI.esc(c.stream || '')}</option>`)));

      const load = async () => {
        const params = new URLSearchParams();
        const q = container.querySelector('#as-search').value.trim();
        if (q) params.set('search', q);
        if (clsSel.value) params.set('classId', clsSel.value);
        const data = (await API.get('/api/assignments?' + params.toString())).assignments || [];
        const list = container.querySelector('#as-list');
        if (!data.length) { list.innerHTML = '<div class="empty-state"><div class="big">📚</div>No assignments yet.</div>'; return; }
        list.innerHTML = '';
        for (const a of data) {
          const overdue = a.due_date && a.due_date < new Date().toISOString().slice(0, 10);
          list.appendChild(UI.el(`<div class="doc-item">
            <div style="flex:1;min-width:0">
              <div class="doc-name">${UI.esc(a.title)} ${overdue ? '<span class="badge red">Overdue</span>' : ''}</div>
              <div class="doc-meta">${UI.esc(a.class_name || '')} ${UI.esc(a.class_stream || '')} · ${UI.esc(a.subject || '')} · Due ${UI.esc(a.due_date || '—')} · ${a.submission_count || 0} submissions</div>
            </div>
            <div class="doc-actions">
              <button class="btn secondary sm" data-view="${a.id}">View / grade</button>
              <button class="btn secondary sm" data-edit="${a.id}">✏️</button>
              <button class="btn danger sm" data-del="${a.id}">🗑</button>
            </div>
          </div>`));
        }
        list.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => this.gradeView(Number(b.dataset.view)));
        list.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => this.editAssignment(Number(b.dataset.edit), () => load()));
        list.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
          const ok = await UI.confirmDialog('Delete this assignment? Submissions will also be removed.', { title: 'Delete assignment', confirmText: 'Delete' });
          if (!ok) return;
          try { await API.del(`/api/assignments/${b.dataset.del}`); UI.toast('Assignment deleted.', 'success'); load(); } catch (e) { UI.toast(e.message, 'error'); }
        });
      };
      container.querySelector('#as-search').oninput = UI.debounce(load, 300);
      clsSel.onchange = load;
      container.querySelector('#as-create').onclick = () => this.createAssignment(classes, () => load());
      await load();
    },

    async createAssignment(classes, onSave) {
      const modal = UI.openModal({
        title: 'New assignment',
        wide: true,
        body: `<div class="form-row">
          <label class="field">Title <span class="req">*</span><input id="a-title"></label>
          <label class="field">Class <span class="req">*</span><select id="a-class">${classes.map((c) => `<option value="${c.id}">${UI.esc(c.name)} ${UI.esc(c.stream || '')}</option>`).join('')}</select></label>
        </div>
        <div class="form-row">
          <label class="field">Subject<input id="a-subject"></label>
          <label class="field">Due date<input type="date" id="a-due"></label>
        </div>
        <label class="field">Instructions<textarea id="a-desc" rows="4"></textarea></label>`,
        foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Create</button>',
      });
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        const body = {
          title: modal.backdrop.querySelector('#a-title').value.trim(),
          classId: modal.backdrop.querySelector('#a-class').value,
          subject: modal.backdrop.querySelector('#a-subject').value.trim(),
          dueDate: modal.backdrop.querySelector('#a-due').value,
          description: modal.backdrop.querySelector('#a-desc').value.trim(),
        };
        if (!body.title || !body.classId) return UI.toast('Title and class are required.', 'error');
        try { await API.post('/api/assignments', body); UI.toast('Assignment created.', 'success'); modal.close(); onSave && onSave(); }
        catch (e) { UI.toast(e.message, 'error'); }
      };
    },

    async editAssignment(id, onSave) {
      let a;
      try { a = (await API.get(`/api/assignments/${id}`)).assignment; } catch (e) { return UI.toast(e.message, 'error'); }
      const modal = UI.openModal({
        title: 'Edit assignment',
        body: `<div class="form-row">
          <label class="field">Title<input id="a-title" value="${UI.esc(a.title)}"></label>
          <label class="field">Subject<input id="a-subject" value="${UI.esc(a.subject || '')}"></label>
        </div>
        <div class="form-row">
          <label class="field">Due date<input type="date" id="a-due" value="${UI.esc(a.due_date || '')}"></label>
          <label class="field">Status<select id="a-status"><option ${a.status === 'active' ? 'selected' : ''}>active</option><option ${a.status === 'archived' ? 'selected' : ''}>archived</option></select></label>
        </div>
        <label class="field">Instructions<textarea id="a-desc" rows="4">${UI.esc(a.description || '')}</textarea></label>`,
        foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Save</button>',
      });
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        try {
          await API.put(`/api/assignments/${id}`, {
            title: modal.backdrop.querySelector('#a-title').value.trim(),
            subject: modal.backdrop.querySelector('#a-subject').value.trim(),
            dueDate: modal.backdrop.querySelector('#a-due').value,
            status: modal.backdrop.querySelector('#a-status').value,
            description: modal.backdrop.querySelector('#a-desc').value.trim(),
          });
          UI.toast('Assignment updated.', 'success'); modal.close(); onSave && onSave();
        } catch (e) { UI.toast(e.message, 'error'); }
      };
    },

    async gradeView(id) {
      let a;
      try { a = (await API.get(`/api/assignments/${id}`)).assignment; } catch (e) { return UI.toast(e.message, 'error'); }
      const subs = a.submissions || [];
      let modal;
      modal = UI.openModal({
        title: `Grade — ${UI.esc(a.title)}`,
        wide: true,
        body: `<div class="doc-meta">${UI.esc(a.class_name || '')} · Due ${UI.esc(a.due_date || '—')} · ${subs.length} submission${subs.length === 1 ? '' : 's'}</div>
          <div id="subs-list"></div>
          <button class="btn success" id="publish-grades" style="margin-top:12px">📣 Publish all grades to students</button>`,
        foot: '<button class="btn" data-close>Close</button>',
      });
      modal.backdrop.querySelector('[data-close]').onclick = () => modal.close();
      const list = modal.backdrop.querySelector('#subs-list');
      if (!subs.length) { list.innerHTML = '<div class="doc-meta">No submissions yet.</div>'; }
      for (const s of subs) {
        list.appendChild(UI.el(`<div class="doc-item">
          <div style="flex:1;min-width:0">
            <div class="doc-name">${UI.esc(s.student_name)}</div>
            <div class="doc-meta">${UI.timeAgo(s.submitted_at)}${s.attachment_name ? ' · 📎 ' + UI.esc(s.attachment_name) : ''}</div>
            ${s.content ? `<div style="white-space:pre-wrap;font-size:12.5px;margin-top:4px;background:var(--bg);padding:8px;border-radius:8px">${UI.esc(s.content)}</div>` : ''}
            ${s.grade !== null && s.grade !== undefined ? `<div class="doc-meta" style="margin-top:4px">Grade: <strong>${s.grade}%</strong>${s.released ? ' (released)' : ' (not released yet)'}</div>` : ''}
          </div>
          <div>
            <input type="number" min="0" max="100" placeholder="Grade %" id="g-${s.id}" value="${s.grade ?? ''}" style="width:90px">
            <button class="btn sm" data-grade="${s.id}">Save</button>
          </div>
        </div>`));
      }
      list.querySelectorAll('[data-grade]').forEach((b) => b.onclick = async () => {
        const sid = Number(b.dataset.grade);
        const grade = modal.backdrop.querySelector('#g-' + sid).value;
        try { await API.put(`/api/assignments/${id}/grade/${sid}`, { grade: grade === '' ? undefined : Number(grade), released: false }); UI.toast('Grade saved (not yet released).', 'success'); }
        catch (e) { UI.toast(e.message, 'error'); }
      });
      modal.backdrop.querySelector('#publish-grades').onclick = async () => {
        const ok = await UI.confirmDialog('Publish all grades for this assignment to students?', { title: 'Publish grades', confirmText: 'Publish', danger: false });
        if (!ok) return;
        try { await API.post(`/api/assignments/${id}/publish`); UI.toast('Grades published.', 'success'); modal.close(); } catch (e) { UI.toast(e.message, 'error'); }
      };
    },

    /** Student view: list + submit. */
    async studentView(container, { studentId } = {}) {
      container.innerHTML = `<div id="as-list"></div>`;
      const data = (await API.get('/api/assignments')).assignments || [];
      const list = container.querySelector('#as-list');
      if (!data.length) { list.innerHTML = '<div class="empty-state"><div class="big">📚</div>No assignments for your class yet.</div>'; return; }
      for (const a of data) {
        const sub = a.my_submission;
        const overdue = a.due_date && a.due_date < new Date().toISOString().slice(0, 10);
        list.appendChild(UI.el(`<div class="doc-item">
          <div style="flex:1;min-width:0">
            <div class="doc-name">${UI.esc(a.title)} ${a.due_date ? '<span class="badge amber">due ' + UI.esc(a.due_date) + '</span>' : ''} ${overdue ? '<span class="badge red">Overdue</span>' : ''}</div>
            <div class="doc-meta">${UI.esc(a.subject || '')} · ${UI.esc(a.teacher_name || '')}</div>
            ${sub ? `<div class="doc-meta" style="margin-top:4px">
              ✅ Submitted ${UI.timeAgo(sub.submitted_at)}
              ${sub.grade !== null && sub.grade !== undefined ? ` · <strong>Grade: ${sub.grade}%</strong>` : (sub.released ? '' : ' · awaiting grade')}
            </div>` : '<div class="doc-meta" style="margin-top:4px">Not submitted yet</div>'}
          </div>
          <button class="btn ${sub ? 'secondary' : ''} sm" data-sub="${a.id}">${sub ? 'Resubmit / view' : 'Submit'}</button>
        </div>`));
      }
      list.querySelectorAll('[data-sub]').forEach((b) => b.onclick = () => this.submitModal(Number(b.dataset.sub)));
    },

    async submitModal(id) {
      let a;
      try { a = (await API.get(`/api/assignments/${id}`)).assignment; } catch (e) { return UI.toast(e.message, 'error'); }
      const my = a.my_submission || {};
      const modal = UI.openModal({
        title: `Submit — ${UI.esc(a.title)}`,
        wide: true,
        body: `<div class="doc-meta">${UI.esc(a.description || '')} · Due ${UI.esc(a.due_date || '—')}</div>
          <label class="field">Your work<textarea id="sub-content" rows="5" placeholder="Write your answer here…">${UI.esc(my.content || '')}</textarea></label>
          <label class="field">Attachment (optional)<input type="file" id="sub-file"></label>`,
        foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Submit</button>',
      });
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        try {
          const body = { content: modal.backdrop.querySelector('#sub-content').value.trim() };
          const file = modal.backdrop.querySelector('#sub-file').files[0];
          if (file) {
            const form = new FormData();
            form.append('file', file);
            const up = await API.upload('/api/documents', form);
            body.attachmentId = up.document.id;
          }
          await API.post(`/api/assignments/${id}/submit`, body);
          UI.toast('Assignment submitted.', 'success');
          modal.close();
          location.reload();
        } catch (e) { UI.toast(e.message, 'error'); }
      };
    },
  };

  // =========================================================================
  // EXAMS
  // =========================================================================
  const ExamsView = {
    async staffView(container) {
      container.innerHTML = `
        <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div class="search-input" style="flex:1;min-width:160px"><input id="ex-search" placeholder="Search exams…"></div>
          <select id="ex-class" style="width:auto"><option value="">All classes</option></select>
          <button class="btn" id="ex-create">＋ New exam</button>
        </div>
        <div id="ex-list"></div>`;
      const classes = (await API.get('/api/classes')).classes || [];
      const clsSel = container.querySelector('#ex-class');
      classes.forEach((c) => clsSel.appendChild(UI.el(`<option value="${c.id}">${UI.esc(c.name)} ${UI.esc(c.stream || '')}</option>`)));

      const load = async () => {
        const params = new URLSearchParams();
        const q = container.querySelector('#ex-search').value.trim();
        if (q) params.set('search', q);
        if (clsSel.value) params.set('classId', clsSel.value);
        const data = (await API.get('/api/exams?' + params.toString())).exams || [];
        const list = container.querySelector('#ex-list');
        if (!data.length) { list.innerHTML = '<div class="empty-state"><div class="big">📝</div>No exams yet.</div>'; return; }
        list.innerHTML = '';
        for (const e of data) {
          list.appendChild(UI.el(`<div class="doc-item">
            <div style="flex:1;min-width:0">
              <div class="doc-name">${UI.esc(e.title)} ${statusBadge(e.status)}</div>
              <div class="doc-meta">${UI.esc(e.class_name || '')} ${UI.esc(e.class_stream || '')} · ${UI.esc(e.subject || '')} · ${UI.esc(e.date || 'no date')}${e.results_count ? ' · ' + e.results_count + ' results' : ''}</div>
            </div>
            <div class="doc-actions">
              <button class="btn secondary sm" data-open="${e.id}">${e.status === 'published' ? 'View results' : 'Enter marks'}</button>
              <button class="btn secondary sm" data-edit="${e.id}">✏️</button>
              <button class="btn danger sm" data-del="${e.id}">🗑</button>
            </div>
          </div>`));
        }
        list.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => this.enterMarks(Number(b.dataset.open)));
        list.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => this.editExam(Number(b.dataset.edit), () => load()));
        list.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
          const ok = await UI.confirmDialog('Delete this exam and its results?', { title: 'Delete exam', confirmText: 'Delete' });
          if (!ok) return;
          try { await API.del(`/api/exams/${b.dataset.del}`); UI.toast('Exam deleted.', 'success'); load(); } catch (e) { UI.toast(e.message, 'error'); }
        });
      };
      container.querySelector('#ex-search').oninput = UI.debounce(load, 300);
      clsSel.onchange = load;
      container.querySelector('#ex-create').onclick = () => this.createExam(classes, () => load());
      await load();
    },

    async createExam(classes, onSave) {
      const modal = UI.openModal({
        title: 'New exam',
        body: `<div class="form-row">
          <label class="field">Title <span class="req">*</span><input id="e-title"></label>
          <label class="field">Subject <span class="req">*</span><input id="e-subject"></label>
        </div>
        <div class="form-row">
          <label class="field">Class <span class="req">*</span><select id="e-class">${classes.map((c) => `<option value="${c.id}">${UI.esc(c.name)} ${UI.esc(c.stream || '')}</option>`).join('')}</select></label>
          <label class="field">Date<input type="date" id="e-date"></label>
        </div>
        <div class="form-row">
          <label class="field">Start time<input type="time" id="e-start"></label>
          <label class="field">End time<input type="time" id="e-end"></label>
        </div>
        <label class="field">Term<input id="e-term" placeholder="e.g. Term 1"></label>`,
        foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Create</button>',
      });
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        const body = {
          title: modal.backdrop.querySelector('#e-title').value.trim(),
          subject: modal.backdrop.querySelector('#e-subject').value.trim(),
          classId: modal.backdrop.querySelector('#e-class').value,
          date: modal.backdrop.querySelector('#e-date').value,
          startTime: modal.backdrop.querySelector('#e-start').value,
          endTime: modal.backdrop.querySelector('#e-end').value,
          term: modal.backdrop.querySelector('#e-term').value.trim(),
        };
        if (!body.title || !body.subject || !body.classId) return UI.toast('Title, subject and class are required.', 'error');
        try { await API.post('/api/exams', body); UI.toast('Exam created (draft).', 'success'); modal.close(); onSave && onSave(); }
        catch (e) { UI.toast(e.message, 'error'); }
      };
    },

    async editExam(id, onSave) {
      let e;
      try { e = (await API.get(`/api/exams/${id}`)).exam; } catch (err) { return UI.toast(err.message, 'error'); }
      const statuses = ['draft', 'scheduled', 'completed', 'published'];
      const modal = UI.openModal({
        title: 'Edit exam',
        body: `<label class="field">Title<input id="e-title" value="${UI.esc(e.title)}"></label>
          <div class="form-row">
            <label class="field">Subject<input id="e-subject" value="${UI.esc(e.subject || '')}"></label>
            <label class="field">Date<input type="date" id="e-date" value="${UI.esc(e.date || '')}"></label>
          </div>
          <div class="form-row">
            <label class="field">Start<input type="time" id="e-start" value="${UI.esc(e.start_time || '')}"></label>
            <label class="field">End<input type="time" id="e-end" value="${UI.esc(e.end_time || '')}"></label>
          </div>
          <div class="form-row">
            <label class="field">Term<input id="e-term" value="${UI.esc(e.term || '')}"></label>
            <label class="field">Status<select id="e-status">${statuses.map((s) => `<option ${e.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          </div>`,
        foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Save</button>',
      });
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        try {
          await API.put(`/api/exams/${id}`, {
            title: modal.backdrop.querySelector('#e-title').value.trim(),
            subject: modal.backdrop.querySelector('#e-subject').value.trim(),
            date: modal.backdrop.querySelector('#e-date').value,
            startTime: modal.backdrop.querySelector('#e-start').value,
            endTime: modal.backdrop.querySelector('#e-end').value,
            term: modal.backdrop.querySelector('#e-term').value.trim(),
            status: modal.backdrop.querySelector('#e-status').value,
          });
          UI.toast('Exam updated.', 'success'); modal.close(); onSave && onSave();
        } catch (err) { UI.toast(err.message, 'error'); }
      };
    },

    async enterMarks(id) {
      let e;
      try { e = (await API.get(`/api/exams/${id}`)).exam; } catch (err) { return UI.toast(err.message, 'error'); }
      const isAdmin = ['super_admin', 'admin'].includes(me().role);
      const isTeacher = me().role === 'teacher';
      let modal;
      modal = UI.openModal({
        title: `${UI.esc(e.title)} — ${UI.esc(e.subject || '')}`,
        wide: true,
        body: `<div class="doc-meta">${UI.esc(e.class_name || '')} · ${UI.esc(e.date || 'no date')} · Status: ${UI.esc(e.status)}</div>
          ${e.status === 'published' ? `<div id="res-view"></div>` : `
          <div id="marks-grid"></div>
          <button class="btn success" id="save-marks" style="margin-top:12px">💾 Save marks</button>`}
          ${isAdmin && e.status === 'completed' ? `<button class="btn" id="publish-exam" style="margin-top:8px">📣 Publish results to students</button>` : ''}`,
        foot: '<button class="btn" data-close>Close</button>',
      });
      modal.backdrop.querySelector('[data-close]').onclick = () => modal.close();

      if (e.status === 'published') {
        const view = modal.backdrop.querySelector('#res-view');
        const results = (await API.get(`/api/exams/${id}`)).exam.results || [];
        view.innerHTML = results.length
          ? `<table class="table"><thead><tr><th>Student</th><th>Marks</th><th>Grade</th></tr></thead><tbody>${results.map((r) => `<tr><td>${UI.esc(r.student_name)}</td><td>${r.marks}</td><td>${UI.esc(r.grade || '—')}</td></tr>`).join('')}</tbody></table>`
          : '<div class="doc-meta">No results.</div>';
        return;
      }

      // enter marks: fetch class students
      const students = (await API.get(`/api/classes/${e.class_id}/students`)).students || [];
      const existing = (e.results || []).reduce((m, r) => { m[r.student_id] = r; return m; }, {});
      const grid = modal.backdrop.querySelector('#marks-grid');
      grid.innerHTML = `<table class="table"><thead><tr><th>Student</th><th>Marks (0-100)</th><th>Grade</th><th>Comment</th></tr></thead><tbody></tbody></table>`;
      const tbody = grid.querySelector('tbody');
      for (const s of students) {
        const cur = existing[s.id] || {};
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${UI.esc(s.full_name)}</td>
          <td><input type="number" min="0" max="100" class="mk" data-sid="${s.id}" value="${cur.marks ?? ''}" style="width:80px"></td>
          <td><input class="gr" data-sid="${s.id}" value="${UI.esc(cur.grade || '')}" style="width:50px"></td>
          <td><input class="cm" data-sid="${s.id}" value="${UI.esc(cur.comments || '')}" style="width:100%"></td>`;
        tbody.appendChild(tr);
      }
      const saveBtn = modal.backdrop.querySelector('#save-marks');
      if (!isTeacher || true) saveBtn.onclick = async () => {
        const results = [];
        tbody.querySelectorAll('.mk').forEach((inp) => {
          const sid = Number(inp.dataset.sid);
          const marks = inp.value;
          if (marks === '') return;
          results.push({ studentId: sid, marks: Number(marks), grade: grid.querySelector(`.gr[data-sid="${sid}"]`).value.trim(), comments: grid.querySelector(`.cm[data-sid="${sid}"]`).value.trim() });
        });
        try {
          const r = await API.put(`/api/exams/${id}/results`, { results });
          UI.toast(r.message, 'success');
          modal.close();
        } catch (err) { UI.toast(err.message, 'error'); }
      };
      const pub = modal.backdrop.querySelector('#publish-exam');
      if (pub) pub.onclick = async () => {
        const ok = await UI.confirmDialog(`Publish results for "${e.title}" to the class? This cannot be undone.`, { title: 'Publish results', confirmText: 'Publish', danger: false });
        if (!ok) return;
        try { const r = await API.post(`/api/exams/${id}/publish`); UI.toast(r.message, 'success'); modal.close(); } catch (err) { UI.toast(err.message, 'error'); }
      };
    },

    /** Student / Parent view of exams + published results. */
    async studentView(container, { studentId } = {}) {
      container.innerHTML = `<div id="ex-list"></div>`;
      const data = (await API.get('/api/exams')).exams || [];
      const list = container.querySelector('#ex-list');
      if (!data.length) { list.innerHTML = '<div class="empty-state"><div class="big">📝</div>No exams scheduled.</div>'; return; }
      for (const e of data) {
        list.appendChild(UI.el(`<div class="doc-item">
          <div style="flex:1;min-width:0">
            <div class="doc-name">${UI.esc(e.title)} ${statusBadge(e.status)}</div>
            <div class="doc-meta">${UI.esc(e.subject || '')} · ${UI.esc(e.date || 'no date')}${e.start_time ? ' · ' + UI.esc(e.start_time) + '-' + UI.esc(e.end_time || '') : ''}</div>
          </div>
          <button class="btn secondary sm" data-view="${e.id}">${e.status === 'published' ? 'View result' : 'Details'}</button>
        </div>`));
      }
      list.querySelectorAll('[data-view]').forEach((b) => b.onclick = async () => {
        try {
          const exam = (await API.get(`/api/exams/${b.dataset.view}`)).exam;
          const my = exam.my_result;
          UI.openModal({
            title: UI.esc(exam.title),
            body: `<div class="doc-meta">${UI.esc(exam.subject || '')} · ${UI.esc(exam.date || 'no date')} · Status: ${UI.esc(exam.status)}</div>
              ${my ? `<div style="display:flex;gap:20px;margin-top:14px">
                <div class="card" style="margin:0"><div class="stat-num">${my.marks ?? '—'}</div><div class="stat-label">Marks</div></div>
                <div class="card" style="margin:0"><div class="stat-num">${UI.esc(my.grade || '—')}</div><div class="stat-label">Grade</div></div>
              </div>${my.comments ? `<div class="doc-meta" style="margin-top:10px">Comment: ${UI.esc(my.comments)}</div>` : ''}`
              : `<div class="doc-meta" style="margin-top:12px">${exam.status === 'published' ? 'Your result is not available yet. Contact your teacher.' : 'Results will appear here after the exam is published.'}</div>`}`,
            foot: '<button class="btn" data-close>Close</button>',
          }).backdrop.querySelector('[data-close]').onclick = function () { this.closest('.modal-backdrop').classList.remove('open'); };
        } catch (e) { UI.toast(e.message, 'error'); }
      });
    },
  };

  function statusBadge(s) {
    const map = { draft: ['gray', 'Draft'], scheduled: ['blue', 'Scheduled'], completed: ['amber', 'Completed'], published: ['green', 'Published'] };
    const [c, l] = map[s] || ['gray', s];
    return `<span class="badge ${c}">${l}</span>`;
  }

  // =========================================================================
  // TIMETABLE
  // =========================================================================
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const TimetableView = {
    async view(container, { manage = false } = {}) {
      container.innerHTML = `
        <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <label class="field" style="margin:0;flex:1;min-width:160px">Class
            <select id="tt-class"></select></label>
          ${manage ? '<button class="btn" id="tt-add">＋ Add lesson</button>' : ''}
        </div>
        <div id="tt-grid"></div>`;
      const classes = (await API.get('/api/classes')).classes || [];
      const sel = container.querySelector('#tt-class');
      classes.forEach((c) => sel.appendChild(UI.el(`<option value="${c.id}">${UI.esc(c.name)} ${UI.esc(c.stream || '')}</option>`)));

      const load = async () => {
        const classId = sel.value;
        if (!classId) return;
        const data = (await API.get(`/api/timetable?classId=${classId}`)).entries || [];
        const grid = container.querySelector('#tt-grid');
        grid.innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Teacher</th><th>Room</th>${manage ? '<th style="text-align:right">Actions</th>' : ''}</tr></thead><tbody></tbody></table></div>`;
        const tbody = grid.querySelector('tbody');
        if (!data.length) {
          tbody.innerHTML = '<tr><td colspan="5" class="doc-meta">No timetable entries for this class yet.</td></tr>';
          return;
        }
        for (const e of data) {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="Day">${UI.esc(e.day)}</td>
            <td data-label="Time">${UI.esc(e.start_time)} - ${UI.esc(e.end_time)}</td>
            <td data-label="Subject">${UI.esc(e.subject || '—')}</td>
            <td data-label="Teacher">${UI.esc(e.teacher_name || '—')}</td>
            <td data-label="Room">${UI.esc(e.room || '—')}</td>
            ${manage ? '<td data-label="" class="actions-cell"><button class="btn danger sm" data-del="' + e.id + '">🗑</button></td>' : ''}`;
          tbody.appendChild(tr);
          const del = tr.querySelector('[data-del]');
          if (del) del.onclick = async () => {
            const ok = await UI.confirmDialog('Delete this timetable entry?', { title: 'Delete entry', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/timetable/${e.id}`); UI.toast('Entry deleted.', 'success'); load(); } catch (err) { UI.toast(err.message, 'error'); }
          };
        }
      };

      sel.onchange = load;
      const addBtn = container.querySelector('#tt-add');
      if (addBtn) addBtn.onclick = () => this.addEntry(classes, () => load());
      await load();
    },

    async addEntry(classes, onSave) {
      let teachers = [];
      try { teachers = (await API.get('/api/settings/classes-reference')).teachers || []; } catch {}
      const modal = UI.openModal({
        title: 'Add timetable lesson',
        body: `<div class="form-row">
          <label class="field">Class <span class="req">*</span><select id="t-class">${classes.map((c) => `<option value="${c.id}">${UI.esc(c.name)} ${UI.esc(c.stream || '')}</option>`).join('')}</select></label>
          <label class="field">Subject<input id="t-subject"></label>
        </div>
        <div class="form-row">
          <label class="field">Day <span class="req">*</span><select id="t-day">${DAYS.map((d) => `<option>${d}</option>`).join('')}</select></label>
          <label class="field">Teacher<select id="t-teacher"><option value="">— None —</option>${teachers.map((t) => `<option value="${t.id}">${UI.esc(t.full_name)}</option>`).join('')}</select></label>
        </div>
        <div class="form-row">
          <label class="field">Start <span class="req">*</span><input type="time" id="t-start" value="08:00"></label>
          <label class="field">End <span class="req">*</span><input type="time" id="t-end" value="09:00"></label>
        </div>
        <label class="field">Room<input id="t-room" placeholder="e.g. Lab 2"></label>`,
        foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Add</button>',
      });
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        const body = {
          classId: modal.backdrop.querySelector('#t-class').value,
          subject: modal.backdrop.querySelector('#t-subject').value.trim(),
          day: modal.backdrop.querySelector('#t-day').value,
          teacherId: modal.backdrop.querySelector('#t-teacher').value || null,
          startTime: modal.backdrop.querySelector('#t-start').value,
          endTime: modal.backdrop.querySelector('#t-end').value,
          room: modal.backdrop.querySelector('#t-room').value.trim(),
        };
        try { await API.post('/api/timetable', body); UI.toast('Lesson added.', 'success'); modal.close(); onSave && onSave(); }
        catch (e) { UI.toast(e.message || 'Scheduling conflict — adjust the times.', 'error'); }
      };
    },
  };

  // =========================================================================
  // FEES
  // =========================================================================
  const FeesView = {
    /** Admin: structures + report + payments. */
    async adminView(container) {
      container.innerHTML = `
        <div class="grid grid-3" id="fee-stats"></div>
        <div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <h3 style="flex:1;margin:0">Fee structures</h3>
          <button class="btn" id="fee-create">＋ New fee structure</button>
        </div><div id="fee-structures"></div></div>
        <div class="card"><h3>💳 Record a payment</h3>
          <div class="form-row">
            <label class="field">Student<select id="fee-student"></select></label>
            <label class="field">Amount<input type="number" id="fee-amount" min="1"></label>
          </div>
          <div class="form-row">
            <label class="field">Method<select id="fee-method"><option>cash</option><option>mobile money</option><option>bank transfer</option><option>cheque</option></select></label>
            <label class="field">Reference<input id="fee-ref"></label>
          </div>
          <button class="btn success" id="fee-pay">Record payment</button>
        </div>
        <div class="card"><h3>📋 Outstanding balances</h3><div id="fee-report"></div></div>
        <div class="card"><h3>🧾 Recent payments (undo a mistake)</h3><div id="fee-payments"></div></div>`;

      const loadStats = async () => {
        const rep = await API.get('/api/fees/report');
        container.querySelector('#fee-stats').innerHTML =
          stat('💰', UI.money(rep.totalDue), 'Total billed') +
          stat('✅', UI.money(rep.totalPaid), 'Total paid') +
          stat('⚠️', UI.money(rep.totalBalance), 'Outstanding') +
          stat('🧑‍🎓', rep.outstandingStudents, 'Students with balances');
      };
      const loadStructures = async () => {
        const data = (await API.get('/api/fees/structures')).structures || [];
        const box = container.querySelector('#fee-structures');
        if (!data.length) { box.innerHTML = '<div class="doc-meta">No fee structures yet.</div>'; return; }
        box.innerHTML = '<div class="table-responsive"><table class="table"><thead><tr><th>Name</th><th>Amount</th><th>Year</th><th>Term</th><th>Assigned</th><th style="text-align:right">Actions</th></tr></thead><tbody></tbody></table></div>';
        const tbody = box.querySelector('tbody');
        data.forEach((f) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="Name">${UI.esc(f.name)}</td>
            <td data-label="Amount">${UI.money(f.amount)}</td>
            <td data-label="Year">${UI.esc(f.academic_year)}</td>
            <td data-label="Term">${UI.esc(f.term || '—')}</td>
            <td data-label="Assigned">${f.assigned_count || 0} students</td>
            <td data-label="" class="actions-cell"><div class="actions">
              <button class="btn secondary sm" data-assign="${f.id}">👥 Assign</button>
              <button class="btn danger sm" data-del="${f.id}">🗑</button>
            </div></td>`;
          tbody.appendChild(tr);
          tr.querySelector('[data-assign]').onclick = () => this.assignModal(f, () => loadStructures());
          tr.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Delete fee structure "${f.name}"?`, { title: 'Delete fee', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/fees/structures/${f.id}`); UI.toast('Deleted.', 'success'); loadStructures(); loadStats(); } catch (e) { UI.toast(e.message, 'error'); }
          };
        });
      };
      const loadReport = async () => {
        const rep = await API.get('/api/fees/report');
        const box = container.querySelector('#fee-report');
        if (!rep.rows.length) { box.innerHTML = '<div class="doc-meta">No fee data yet.</div>'; return; }
        box.innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Student</th><th>Class</th><th>Due</th><th>Paid</th><th>Balance</th></tr></thead><tbody></tbody></table></div>`;
        const tbody = box.querySelector('tbody');
        rep.rows.slice(0, 100).forEach((r) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="Student">${UI.esc(r.full_name)}</td>
            <td data-label="Class">${UI.esc(r.class_name || '')} ${UI.esc(r.class_stream || '')}</td>
            <td data-label="Due">${UI.money(r.due)}</td>
            <td data-label="Paid">${UI.money(r.paid)}</td>
            <td data-label="Balance"><span class="badge ${r.balance > 0 ? 'red' : 'green'}">${UI.money(r.balance)}</span></td>`;
          tbody.appendChild(tr);
        });
      };
      const loadPayments = async () => {
        try {
          const rep = await API.get('/api/fees/report');
          // fetch last 50 payments across students via report? Use direct query via each student is heavy;
          // instead list recent payments per student from the report rows we already have is not possible.
          // We fetch the 30 most recently paid students and show their latest payment.
          const students = (await API.get('/api/students?limit=100')).students || [];
          const box = container.querySelector('#fee-payments');
          box.innerHTML = '<div class="doc-meta">Loading…</div>';
          const rows = [];
          for (const s of students.slice(0, 100)) {
            try {
              const sum = await API.get(`/api/fees/student/${s.id}`);
              for (const p of (sum.payments || []).slice(0, 3)) {
                rows.push({ student: s.full_name, studentId: s.id, ...p });
              }
            } catch { /* skip */ }
          }
          rows.sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));
          const recent = rows.slice(0, 30);
          if (!recent.length) { box.innerHTML = '<div class="doc-meta">No payments yet.</div>'; return; }
          box.innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Date</th><th>Student</th><th>Amount</th><th>Method</th><th>Receipt</th><th style="text-align:right">Actions</th></tr></thead><tbody></tbody></table></div>`;
          const tbody = box.querySelector('tbody');
          for (const p of recent) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td data-label="Date">${UI.esc(p.paid_at)}</td><td data-label="Student">${UI.esc(p.student)}</td><td data-label="Amount">${UI.money(p.amount)}</td><td data-label="Method">${UI.esc(p.method)}</td><td data-label="Receipt">${UI.esc(p.receipt_no || '—')}</td>
              <td data-label="" class="actions-cell"><button class="btn danger sm" data-undopay="${p.id}" data-sid="${p.studentId}">↩ Undo</button></td>`;
            tbody.appendChild(tr);
            tr.querySelector('[data-undopay]').onclick = async () => {
              const ok = await UI.confirmDialog(`Undo payment ${p.receipt_no || p.id} (${UI.money(p.amount)})? The balance will be recalculated.`, { title: 'Undo payment', confirmText: 'Undo', danger: true });
              if (!ok) return;
              try { await API.del(`/api/fees/student/${p.studentId}/pay/${p.id}`); UI.toast('Payment undone.', 'success'); loadPayments(); loadStats(); loadReport(); }
              catch (e) { UI.toast(e.message, 'error'); }
            };
          }
        } catch (e) { /* ignore */ }
      };
      const loadStudents = async () => {
        const data = (await API.get('/api/students?limit=500')).students || [];
        const sel = container.querySelector('#fee-student');
        data.forEach((s) => sel.appendChild(UI.el(`<option value="${s.id}">${UI.esc(s.full_name)} (${UI.esc(s.student_code)})</option>`)));
      };

      container.querySelector('#fee-create').onclick = () => this.createStructure(() => { loadStructures(); loadStats(); });
      container.querySelector('#fee-pay').onclick = async () => {
        const studentId = container.querySelector('#fee-student').value;
        const amount = container.querySelector('#fee-amount').value;
        if (!studentId || !amount) return UI.toast('Select a student and enter an amount.', 'error');
        try {
          const r = await API.post(`/api/fees/student/${studentId}/pay`, { amount: Number(amount), method: container.querySelector('#fee-method').value, reference: container.querySelector('#fee-ref').value.trim() });
          UI.toast(`${r.message} Receipt: ${r.receiptNo}`, 'success');
          container.querySelector('#fee-amount').value = '';
          loadStats(); loadReport();
        } catch (e) { UI.toast(e.message, 'error'); }
      };
      await Promise.all([loadStats(), loadStructures(), loadReport(), loadStudents(), loadPayments()]);
    },

    async createStructure(onSave) {
      const classes = (await API.get('/api/classes')).classes || [];
      const modal = UI.openModal({
        title: 'New fee structure',
        body: `<div class="form-row">
          <label class="field">Name <span class="req">*</span><input id="f-name" placeholder="Term 1 Tuition"></label>
          <label class="field">Amount <span class="req">*</span><input type="number" id="f-amount" min="1"></label>
        </div>
        <div class="form-row">
          <label class="field">Academic year<input id="f-year" value="2026"></label>
          <label class="field">Term<input id="f-term" placeholder="Term 1"></label>
        </div>
        <label class="field">Assign to<select id="f-class"><option value="">All classes</option>${classes.map((c) => `<option value="${c.id}">${UI.esc(c.name)} ${UI.esc(c.stream || '')}</option>`).join('')}</select></label>
        <label class="field" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="f-assign" style="width:auto;margin:0" checked> Auto-assign to current students</label>`,
        foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Create</button>',
      });
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        const body = {
          name: modal.backdrop.querySelector('#f-name').value.trim(),
          amount: Number(modal.backdrop.querySelector('#f-amount').value),
          academicYear: modal.backdrop.querySelector('#f-year').value.trim(),
          term: modal.backdrop.querySelector('#f-term').value.trim(),
          classId: modal.backdrop.querySelector('#f-class').value || null,
          assign: modal.backdrop.querySelector('#f-assign').checked,
        };
        if (!body.name || !body.amount) return UI.toast('Name and amount are required.', 'error');
        try { const r = await API.post('/api/fees/structures', body); UI.toast(`${r.message}${r.assigned ? ' (' + r.assigned + ' students).' : ''}`, 'success'); modal.close(); onSave && onSave(); }
        catch (e) { UI.toast(e.message, 'error'); }
      };
    },

    async assignModal(f, onSave) {
      let students = [];
      try { students = (await API.get('/api/students?limit=500')).students || []; } catch {}
      const modal = UI.openModal({
        title: `Assign "${UI.esc(f.name)}"`,
        wide: true,
        body: `<div class="search-input"><input id="assign-search" placeholder="Search students…"></div>
          <div id="assign-list" style="max-height:320px;overflow-y:auto;margin-top:10px"></div>`,
        foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Assign to selected</button>',
      });
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      const list = modal.backdrop.querySelector('#assign-list');
      const render = (filter) => {
        const f = (filter || '').toLowerCase();
        const rows = students.filter((s) => !f || s.full_name.toLowerCase().includes(f) || (s.student_code || '').toLowerCase().includes(f));
        list.innerHTML = rows.length ? rows.slice(0, 120).map((s) => `<label class="list-row" style="cursor:pointer"><span class="k">${UI.esc(s.full_name)} <small class="doc-meta">${UI.esc(s.student_code)}</small></span><input type="checkbox" value="${s.id}" style="width:auto;margin:0"></label>`).join('')
          : '<div class="doc-meta">No students found.</div>';
      };
      modal.backdrop.querySelector('#assign-search').oninput = (e) => render(e.target.value);
      render('');
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        const ids = [...list.querySelectorAll('input:checked')].map((i) => Number(i.value));
        if (!ids.length) return UI.toast('Select at least one student.', 'error');
        try { const r = await API.post('/api/fees/assign', { structureId: f.id, studentIds: ids }); UI.toast(r.message, 'success'); modal.close(); onSave && onSave(); }
        catch (e) { UI.toast(e.message, 'error'); }
      };
    },

    /** Parent / Student view: fee summary for a student. */
    async viewer(container, { studentId, studentName } = {}) {
      container.innerHTML = '<div id="fee-detail"></div>';
      try {
        const data = await API.get(`/api/fees/student/${studentId}`);
        const box = container.querySelector('#fee-detail');
        box.innerHTML = `<h3>💳 Fees — ${UI.esc(studentName || '')}</h3>
          <div class="grid grid-3" style="margin-top:10px">
            ${stat('💰', UI.money(data.totalDue), 'Total due')}
            ${stat('✅', UI.money(data.totalPaid), 'Paid')}
            ${stat('⚠️', UI.money(data.balance), 'Balance')}
          </div>
          ${data.balance > 0 ? '<div class="card" style="background:var(--warning-light)"><strong>Outstanding balance of ' + UI.money(data.balance) + ' — please settle before the deadline.</strong></div>' : ''}
          <div class="card"><h4>Fee items</h4>
            ${data.fees.length ? data.fees.map((f) => `<div class="list-row"><span class="k">${UI.esc(f.name)}${f.term ? ' (' + UI.esc(f.term) + ')' : ''}</span><span class="v">${UI.money(f.due_amount)}</span></div>`).join('') : '<div class="doc-meta">No fees assigned.</div>'}
          </div>
          <div class="card"><h4>Payment history</h4>
            ${data.payments.length ? `<div class="table-responsive"><table class="table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Receipt</th></tr></thead><tbody>${data.payments.map((p) => `<tr><td>${UI.esc(p.paid_at)}</td><td>${UI.money(p.amount)}</td><td>${UI.esc(p.method)}</td><td>${UI.esc(p.receipt_no || '—')}</td></tr>`).join('')}</tbody></table></div>`
              : '<div class="doc-meta">No payments recorded yet.</div>'}
          </div>`;
      } catch (e) { UI.toast(e.message, 'error'); }
    },
  };

  // =========================================================================
  // SUBJECTS (admin)
  // =========================================================================
  const SubjectsView = {
    async view(container) {
      container.innerHTML = `
        <div class="card" style="display:flex;gap:10px;align-items:center"><h3 style="flex:1;margin:0">Subjects</h3>
        <button class="btn" id="sub-add">＋ Add subject</button></div>
        <div class="card table-responsive"><div id="sub-list"></div></div>`;
      const load = async () => {
        const data = (await API.get('/api/subjects')).subjects || [];
        const box = container.querySelector('#sub-list');
        if (!data.length) { box.innerHTML = '<div class="doc-meta">No subjects yet.</div>'; return; }
        box.innerHTML = '<table class="table"><thead><tr><th>Name</th><th>Code</th><th>Department</th><th style="text-align:right">Actions</th></tr></thead><tbody></tbody></table>';
        const tbody = box.querySelector('tbody');
        data.forEach((s) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="Name">${UI.esc(s.name)}</td><td data-label="Code">${UI.esc(s.code || '—')}</td><td data-label="Dept">${UI.esc(s.department || '—')}</td>
            <td data-label="" class="actions-cell"><div class="actions"><button class="btn secondary sm" data-edit="${s.id}">✏️</button><button class="btn danger sm" data-del="${s.id}">🗑</button></div></td>`;
          tbody.appendChild(tr);
          tr.querySelector('[data-edit]').onclick = () => edit(s, () => load());
          tr.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Delete subject "${s.name}"?`, { title: 'Delete subject', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/subjects/${s.id}`); UI.toast('Deleted.', 'success'); load(); } catch (e) { UI.toast(e.message, 'error'); }
          };
        });
      };
      const edit = (s, onSave) => {
        const modal = UI.openModal({
          title: s ? 'Edit subject' : 'Add subject',
          body: `<div class="form-row"><label class="field">Name <span class="req">*</span><input id="s-name" value="${s ? UI.esc(s.name) : ''}"></label>
            <label class="field">Code<input id="s-code" value="${s ? UI.esc(s.code || '') : ''}"></label></div>
            <label class="field">Department<input id="s-dept" value="${s ? UI.esc(s.department || '') : ''}"></label>`,
          foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Save</button>',
        });
        modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
        modal.backdrop.querySelector('[data-save]').onclick = async () => {
          const body = { name: modal.backdrop.querySelector('#s-name').value.trim(), code: modal.backdrop.querySelector('#s-code').value.trim(), department: modal.backdrop.querySelector('#s-dept').value.trim() };
          try {
            if (s) await API.put(`/api/subjects/${s.id}`, body); else await API.post('/api/subjects', body);
            UI.toast('Subject saved.', 'success'); modal.close(); onSave && onSave();
          } catch (e) { UI.toast(e.message, 'error'); }
        };
      };
      container.querySelector('#sub-add').onclick = () => edit(null, () => load());
      await load();
    },
  };

  window.Academics = { AttendanceView, AssignmentsView, ExamsView, TimetableView, FeesView, SubjectsView, attBadge, statusBadge };
})();
