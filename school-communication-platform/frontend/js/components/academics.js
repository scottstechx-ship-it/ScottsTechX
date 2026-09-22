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
    /** Teacher/Admin: mark + history + term report. */
    async teacherView(container) {
      container.innerHTML = `
        <div class="tabs att-tabs" role="tablist" style="margin-bottom:12px">
          <button class="tab active" data-att-tab="register" role="tab" aria-selected="true" aria-controls="att-pane-register">Register</button>
          <button class="tab" data-att-tab="report" role="tab" aria-selected="false" aria-controls="att-pane-report">Term report</button>
        </div>
        <div data-att-pane="register" id="att-pane-register" role="tabpanel">
          <div class="card" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
            <label class="field" style="margin:0;min-width:160px;flex:1">Class
              <select id="att-class"></select></label>
            <label class="field" style="margin:0">Date
              <input type="date" id="att-date"></label>
            <button class="btn" id="att-load">Load roster</button>
            <button class="btn att-bulk present" id="att-all-present" type="button">Mark all present</button>
            <button class="btn att-bulk absent" id="att-all-absent" type="button">Mark all absent</button>
            <button class="btn success" id="att-save"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg> Save attendance</button>
          </div>
          <div class="card" id="att-term-note"><div class="doc-meta">Checking the school calendar…</div></div>
          <div class="card" id="att-roster"><div class="doc-meta">Pick a class and date, then load the roster.</div></div>
          <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg> History</h3><div id="att-history"></div></div>
        </div>
        <div data-att-pane="report" id="att-pane-report" role="tabpanel" hidden>
          <div class="card" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
            <label class="field" style="margin:0;min-width:160px;flex:1">Class
              <select id="rep-class"></select></label>
            <label class="field" style="margin:0">Term<select id="rep-term"></select></label>
            <label class="field" style="margin:0;max-width:120px">At risk below (%)<input type="number" id="rep-threshold" min="1" max="100" value="80"></label>
            <button class="btn" id="rep-load">Show report</button>
            <button class="btn secondary" id="rep-print"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print report</button>
          </div>
          <div id="rep-body"></div>
        </div>`;

      const classes = (await API.get('/api/classes')).classes || [];
      const sel = container.querySelector('#att-class');
      const repClass = container.querySelector('#rep-class');
      classes.forEach((c) => {
        const label = `${UI.esc(c.name)} ${UI.esc(c.stream || '')}`;
        sel.appendChild(UI.el(`<option value="${c.id}">${label}</option>`));
        repClass.appendChild(UI.el(`<option value="${c.id}">${label}</option>`));
      });
      container.querySelector('#att-date').value = new Date().toISOString().slice(0, 10);

      // tabs
      container.querySelectorAll('[data-att-tab]').forEach((tab) => tab.addEventListener('click', () => {
        container.querySelectorAll('[data-att-tab]').forEach((t) => {
          t.classList.toggle('active', t === tab);
          t.setAttribute('aria-selected', String(t === tab));
        });
        container.querySelectorAll('[data-att-pane]').forEach((p) => { p.hidden = p.dataset.attPane !== tab.dataset.attTab; });
        if (tab.dataset.attTab === 'report') loadReport();
      }));

      // which term the marks will be stamped with — shown, never guessed silently
      let termInfo = null;
      try { termInfo = await API.get('/api/attendance/terms'); } catch {}
      const termBox = container.querySelector('#att-term-note');
      if (termInfo && (termInfo.terms || []).length) {
        const options = termInfo.terms.map((t) => `<option value="${UI.esc(t.term)}|${UI.esc(t.year)}" ${termInfo.current && t.term === termInfo.current.term && t.year === termInfo.current.year ? 'selected' : ''}>${UI.esc(t.term)} ${UI.esc(t.year)}${t.from ? ` (${UI.esc(t.from)} → ${UI.esc(t.to)})` : ''}</option>`).join('');
        termBox.innerHTML = `<div class="doc-meta" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:0">
          <label class="field" style="margin:0;min-width:220px;flex:1">Marks are recorded against
            <select id="att-term">${options}</select></label>
          <span class="doc-meta" style="max-width:320px">Today falls in <strong>${UI.esc((termInfo.current && termInfo.current.term) || 'no term')}</strong>${termInfo.current && termInfo.current.year ? ' ' + UI.esc(termInfo.current.year) : ''} according to the school calendar.</span>
        </div>`;
      } else {
        termBox.innerHTML = '<div class="doc-meta">No term calendar is set for this year — marks are still saved against today\'s date.</div>';
      }
      // term picker for the report: every term the school has a calendar for
      const repTermSel = container.querySelector('#rep-term');
      if (termInfo && (termInfo.terms || []).length) {
        repTermSel.innerHTML = termInfo.terms.map((t) => `<option value="${UI.esc(t.term)}|${UI.esc(t.year)}" ${termInfo.current && t.term === termInfo.current.term && t.year === termInfo.current.year ? 'selected' : ''}>${UI.esc(t.term)} ${UI.esc(t.year)}</option>`).join('');
      } else {
        repTermSel.innerHTML = '<option value="|">All dates on record</option>';
      }

      const termSel = container.querySelector('#att-term');
      const chosenTerm = () => {
        if (!termSel || !termSel.value) return {};
        const [term, year] = termSel.value.split('|');
        return { term, year };
      };

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
        const statusLabel = (st) => st[0].toUpperCase() + st.slice(1);
        box.innerHTML = '<h3>Roster for ' + date + '</h3>'
          + '<div class="att-legend"><span>The filled button with a tick is the mark that will be saved.</span></div>'
          + '<div id="roster-rows"></div>';
        const rows = box.querySelector('#roster-rows');
        const paintStatus = (sid, status) => {
          rows.querySelectorAll('[data-sid="' + sid + '"]').forEach((x) => {
            const on = x.dataset.status === status;
            x.classList.toggle('is-on', on);
            x.setAttribute('aria-pressed', on ? 'true' : 'false');
            x.dataset.chosen = on ? '1' : '0';
          });
          const label = rows.querySelector('[data-chosen-label="' + sid + '"]');
          if (label) {
            label.dataset.pick = status;
            label.textContent = 'Selected: ' + statusLabel(status);
          }
        };
        const paintBulk = () => {
          const chosen = [...rows.querySelectorAll('[data-chosen="1"]')].map((b) => b.dataset.status);
          const allSame = chosen.length && chosen.every((s) => s === chosen[0]);
          const presentBtn = container.querySelector('#att-all-present');
          const absentBtn = container.querySelector('#att-all-absent');
          if (presentBtn) presentBtn.classList.toggle('is-on', allSame && chosen[0] === 'present');
          if (absentBtn) absentBtn.classList.toggle('is-on', allSame && chosen[0] === 'absent');
        };
        for (const s of students) {
          const current = statusMap[s.id] || 'present';
          const picks = ['present', 'absent', 'late', 'permission'].map((st) =>
            '<button type="button" class="att-status' + (current === st ? ' is-on' : '') + '" data-status="' + st + '" data-sid="' + s.id + '" data-chosen="' + (current === st ? '1' : '0') + '" aria-pressed="' + (current === st ? 'true' : 'false') + '">' + statusLabel(st) + '</button>'
          ).join('');
          rows.appendChild(UI.el('<div class="doc-item">'
            + '<div style="flex:1;min-width:0"><div class="doc-name">' + UI.esc(s.full_name) + '</div>'
            + '<div class="doc-meta">' + UI.esc(s.student_code) + '</div>'
            + '<div class="att-picked" data-chosen-label="' + s.id + '" data-pick="' + current + '">Selected: ' + statusLabel(current) + '</div></div>'
            + '<div class="att-picks">' + picks + '</div></div>'));
        }
        paintBulk();
        rows.querySelectorAll('button.att-status').forEach((b) => b.addEventListener('click', () => {
          paintStatus(b.dataset.sid, b.dataset.status);
          paintBulk();
        }));
        const saveRecords = async (records) => {
          try {
            const r = await API.post('/api/attendance', { classId: Number(classId), date, records, ...chosenTerm() });
            if (!r.marked) {
              UI.toast('Nothing was saved. Load the roster and choose a mark again.', 'error');
              return false;
            }
            UI.toast(r.message, 'success');
            await loadHistory();
            return true;
          } catch (e) { UI.toast(e.message, 'error'); return false; }
        };
        container.querySelector('#att-save').onclick = async () => {
          const records = [];
          rows.querySelectorAll('.doc-item').forEach((item) => {
            // The "Selected" label also describes the mark. Read the filled
            // button, which is the only element that carries the student id.
            const chosen = item.querySelector('button.att-status[data-chosen="1"]')
              || item.querySelector('button.att-status.is-on');
            if (!chosen || !chosen.dataset.sid) return;
            records.push({ studentId: Number(chosen.dataset.sid), status: chosen.dataset.status });
          });
          if (!records.length) return UI.toast('Load the roster, then choose a mark for each student.', 'error');
          const saved = await saveRecords(records);
          if (saved) await loadRoster();
        };
        // one tap for the whole class — the filled bulk button shows which one is in use
        const markEveryone = async (status) => {
          const word = status === 'absent' ? 'absent' : 'present';
          const ok = await UI.confirmDialog(
            `Mark all ${students.length} students in this class ${word} for ${date}?`,
            { title: `Mark everyone ${word}`, danger: status === 'absent', confirmText: `Mark all ${word}` }
          );
          if (!ok) return;
          students.forEach((s) => paintStatus(String(s.id), status));
          paintBulk();
          const saved = await saveRecords(students.map((s) => ({ studentId: s.id, status })));
          if (saved) await loadRoster();
        };
        container.querySelector('#att-all-present').onclick = () => markEveryone('present');
        container.querySelector('#att-all-absent').onclick = () => markEveryone('absent');
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
              <button aria-label="Edit" title="Edit" class="btn secondary sm" data-edit="${a.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
              <button aria-label="Delete" title="Delete" class="btn danger sm" data-del="${a.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
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

      // ---------------- term report + absence trend ----------------
      // The report must not open on a class with nothing recorded — an empty
      // report reads as a broken feature. Probe the teacher's own classes (a
      // handful) and, unless the teacher explicitly picked one, open on the
      // class with the most marks in the chosen term.
      let repClassTouched = false;
      const reportDays = new Map();          // `${term}|${year}|${classId}` -> days
      async function daysRecorded(cid, term, year) {
        const key = `${term}|${year}|${cid}`;
        if (reportDays.has(key)) return reportDays.get(key);
        let days = 0;
        try {
          const r = await API.get(`/api/attendance/term-report?classId=${cid}${term ? `&term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}` : ''}`);
          days = r.days || 0;
        } catch { days = 0; }               // not permitted / offline: treat as empty
        reportDays.set(key, days);
        return days;
      }

      const loadReport = async (_retried) => {
        const classId = repClass.value;
        if (!classId) return;
        const threshold = Math.min(Math.max(Number(container.querySelector('#rep-threshold').value) || 80, 1), 100);
        const [term, year] = (container.querySelector('#rep-term').value || '|').split('|');
        const body = container.querySelector('#rep-body');
        body.innerHTML = '<div class="card"><div class="doc-meta">Building the report…</div></div>';
        let rep; let trend;
        try {
          const qs = `classId=${classId}${term ? `&term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}` : ''}&threshold=${threshold}`;
          [rep, trend] = await Promise.all([
            API.get('/api/attendance/term-report?' + qs),
            API.get(`/api/attendance/trend?${qs}&weeks=10`),
          ]);
        } catch (e) {
          body.innerHTML = `<div class="card"><div class="doc-meta">${UI.esc(e.message)}</div></div>`;
          return;
        }
        let suggestion = '';
        if (!rep.days) {
          const others = classes.filter((c) => String(c.id) !== String(classId));
          const probes = await Promise.all(others.map(async (c) => ({ c, days: await daysRecorded(c.id, term, year) })));
          const withData = probes.filter((p) => p.days > 0).sort((a, b) => b.days - a.days);
          if (withData.length && !repClassTouched && !_retried) {
            repClass.value = String(withData[0].c.id);
            return loadReport(true);
          }
          const cls = classes.find((c) => String(c.id) === String(classId)) || {};
          suggestion = `<div class="card" style="border-left:4px solid var(--warning,#f59e0b)">
            <h3 style="margin:0 0 4px">Nothing recorded for ${UI.esc(cls.name || 'this class')} ${UI.esc(cls.stream || '')} in ${UI.esc(rep.term || 'this term')} ${UI.esc(rep.year || '')}</h3>
            <div class="doc-meta">Attendance is marked on the Register tab; anything saved there appears here.${withData.length ? ' These classes do have marks this term:' : ''}</div>
            ${withData.slice(0, 4).map((p, i) => `<button class="btn btn-sm secondary" style="margin-top:8px;margin-right:6px" data-rep-suggest="${p.c.id}">${UI.esc(p.c.name)} ${UI.esc(p.c.stream || '')} — ${p.days} day${p.days === 1 ? '' : 's'}</button>`).join('')}
          </div>`;
        }
        const pct = (v) => (v === null || v === undefined ? '—' : v + '%');
        const period = rep.from && rep.to ? `${UI.esc(rep.from)} → ${UI.esc(rep.to)}` : 'all dates on record';
        body.innerHTML = suggestion + `
          <div class="grid grid-4">
            ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>', pct(rep.summary.percentage), 'Class attendance')}
            ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>', rep.days, 'Days recorded')}
            ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>', rep.summary.absent, 'Absences')}
            ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>', rep.summary.chronicCount, 'Below ' + rep.threshold + '%')}
          </div>
          <div class="card"><h3>${UI.esc((rep.term || 'Current term') + ' ' + (rep.year || ''))} attendance — week by week</h3>
            <div class="doc-meta" style="margin-bottom:8px">${period}${rep.calendarConfigured ? '' : ' · no calendar set for this year, showing recorded dates'}</div>
            <div id="rep-chart"></div>
            <div class="table-responsive" style="margin-top:10px"><table class="table"><thead><tr><th>Week of</th><th>Days marked</th><th>Attendance</th></tr></thead>
              <tbody>${(trend.series || []).map((w) => `<tr><td data-label="Week of">${UI.esc(w.weekStart)}</td><td data-label="Marked">${w.marked}</td><td data-label="Attendance">${pct(w.percentage)}</td></tr>`).join('') || '<tr><td colspan="3" class="doc-meta">Nothing recorded in this period.</td></tr>'}</tbody></table></div>
          </div>
          ${(trend.chronic || []).length ? `<div class="card"><h3>Needs follow-up (below ${rep.threshold}%)</h3>
            ${trend.chronic.map((c) => `<div class="list-row"><span class="k">${UI.esc(c.name)} <span class="doc-meta">${UI.esc(c.code || '')}</span></span>
              <span class="v">${pct(c.percentage)} · absent ${c.absent} of ${c.marked}${c.missedRun > 1 ? ` · ${c.missedRun} school days in a row` : ''}</span></div>`).join('')}
          </div>` : ''}
          <div class="card"><h3>Per student — ${UI.esc((rep.term || 'current term'))}</h3>
            <div class="table-responsive"><table class="table"><thead><tr>
              <th>Student</th><th>Admission no</th><th class="num">Present</th><th class="num">Late</th><th class="num">Permission</th><th class="num">Absent</th><th class="num">Rate</th><th>Flag</th>
            </tr></thead><tbody>
              ${(rep.students || []).map((r) => `<tr>
                <td data-label="Student">${UI.esc(r.name)}</td>
                <td data-label="Admission no">${UI.esc(r.code || '—')}</td>
                <td data-label="Present" class="num">${r.present}</td>
                <td data-label="Late" class="num">${r.late}</td>
                <td data-label="Permission" class="num">${r.permission}</td>
                <td data-label="Absent" class="num">${r.absent}</td>
                <td data-label="Rate" class="num">${pct(r.percentage)}</td>
                <td data-label="Flag">${r.chronic ? '<span class="badge red">at risk</span>' : (r.marked ? '<span class="badge green">ok</span>' : '<span class="badge gray">no marks</span>')}</td>
              </tr>`).join('') || '<tr><td colspan="8" class="doc-meta">No active students in this class.</td></tr>'}
            </tbody></table></div>
          </div>`;
        const chart = body.querySelector('#rep-chart');
        if (chart) UI.barChart(chart, (trend.series || []).map((w) => ({ label: w.weekStart, value: w.percentage === null ? 0 : w.percentage })));

        // one-click jump to a class that does have marks
        body.querySelectorAll('[data-rep-suggest]').forEach((b) => b.addEventListener('click', () => {
          repClassTouched = true;
          repClass.value = b.dataset.repSuggest;
          loadReport();
        }));
      };

      container.querySelector('#rep-load').onclick = () => loadReport();
      repClass.addEventListener('change', () => {
        repClassTouched = true;
        if (!container.querySelector('[data-att-pane="report"]').hidden) loadReport();
      });
      // changing the term or the at-risk threshold should refresh the report
      // instead of silently leaving the previous term's numbers on screen
      for (const el of [container.querySelector('#rep-term'), container.querySelector('#rep-threshold')]) {
        if (el) el.addEventListener('change', () => {
          if (!container.querySelector('[data-att-pane="report"]').hidden) loadReport();
        });
      }
      container.querySelector('#rep-print').onclick = () => {
        const [term, year] = (container.querySelector('#rep-term').value || '|').split('|');
        const qs = new URLSearchParams({ classId: repClass.value });
        if (term) { qs.set('term', term); qs.set('year', year); }
        UI.openPrintable('/api/print/attendance/' + repClass.value + '?' + qs.toString());
      };

      container.querySelector('#att-load').onclick = () => loadRoster();
      sel.addEventListener('change', loadHistory);
      await loadHistory();
      await loadReport();
    },

    /** Student / Parent: view own / children's attendance, by term. */
    async viewer(container, { studentId, studentName } = {}) {
      let termInfo = null;
      try { termInfo = await API.get('/api/attendance/terms'); } catch {}
      const termOptions = (termInfo && (termInfo.terms || []).length)
        ? termInfo.terms.map((t) => `<option value="${UI.esc(t.term)}|${UI.esc(t.year)}" ${termInfo.current && t.term === termInfo.current.term && t.year === termInfo.current.year ? 'selected' : ''}>${UI.esc(t.term)} ${UI.esc(t.year)}</option>`).join('')
        : '<option value="|">All dates on record</option>';

      container.innerHTML = `
        <div class="card" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
          <label class="field" style="margin:0;min-width:200px;flex:1">Period
            <select id="att-period">${termOptions}<option value="|all">Everything on record</option></select></label>
          <span class="doc-meta" id="att-period-note"></span>
        </div>
        <div id="att-summary"></div>
        <div class="card" id="att-trend-card" hidden><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg> Week by week</h3><div id="att-trend"></div></div>
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg> Attendance history — ${UI.esc(studentName || '')}</h3><div id="att-list"></div></div>`;

      const loadViewer = async () => {
      const raw = container.querySelector('#att-period').value;
      const [term, year] = raw.split('|');
      const scoped = term && year ? `?term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}` : '';
      try {
        const summary = await API.get(`/api/attendance/summary/student/${studentId}${scoped}`);
        const box = container.querySelector('#att-summary');
        const pct = summary.percentage === null ? '—' : summary.percentage + '%';
        container.querySelector('#att-period-note').innerHTML = summary.from && summary.to
          ? `${UI.esc(summary.term || 'Period')}: ${UI.esc(summary.from)} → ${UI.esc(summary.to)}`
          : 'No term calendar set — showing every recorded date.';
        box.innerHTML = `<div class="grid grid-4">
          ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>', pct, 'Attendance rate')}
          ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>', summary.present || 0, 'Present')}
          ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>', summary.absent || 0, 'Absent')}
          ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>', summary.late || 0, 'Late')}
        </div>
        ${summary.recentAbsences && summary.recentAbsences.length ? `<div class="card"><h3>Recent absences/lates</h3>${summary.recentAbsences.map((a) => `<div class="list-row"><span class="k">${UI.esc(a.date)}</span><span class="v">${attBadge(a.status)}</span></div>`).join('')}</div>` : ''}
        ${summary.chronic ? `<div class="card" style="border-left:4px solid var(--danger)"><h3>Attendance needs attention</h3>
          <div class="doc-meta">Attendance is ${pct} for this period, below the ${summary.threshold}% the school expects${summary.missedRun > 1 ? `, including ${summary.missedRun} school days missed in a row` : ''}. Please speak to the class teacher.</div></div>` : ''}`;

        // week-by-week trend so a slow slide is visible, not just one number
        const trendCard = container.querySelector('#att-trend-card');
        const series = summary.series || [];
        if (series.length > 1) {
          trendCard.hidden = false;
          UI.barChart(container.querySelector('#att-trend'), series.map((w) => ({ label: w.weekStart, value: w.percentage === null ? 0 : w.percentage })));
        } else {
          trendCard.hidden = true;
        }

        const data = (await API.get(`/api/attendance?studentId=${studentId}&limit=200${scoped ? '&' + scoped.slice(1) : ''}`)).attendance || [];
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
      };
      container.querySelector('#att-period').addEventListener('change', loadViewer);
      await loadViewer();
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
  function assignmentFilesHtml(files) {
    return (files || []).map((f) =>
      '<div class="as-file"><span>' + UI.esc(f.name) + '</span>'
      + '<button type="button" class="btn secondary sm" data-dl="' + f.id + '" data-name="' + UI.esc(f.name) + '">Download</button></div>'
    ).join('');
  }
  function bindAssignmentDownloads(root) {
    if (!root) return;
    root.querySelectorAll('[data-dl]').forEach((b) => {
      b.onclick = (e) => {
        e.preventDefault();
        if (window.DocumentsView) DocumentsView.downloadDoc(Number(b.dataset.dl), b.dataset.name);
        else UI.toast('Open Documents to download this file.', 'warning');
      };
    });
  }
  async function uploadClassFile(file, classId) {
    const form = new FormData();
    form.append('file', file);
    form.append('description', 'Assignment file for the class');
    if (classId) form.append('share', JSON.stringify([{ targetType: 'class', targetId: String(classId) }]));
    const up = await API.upload('/api/documents', form);
    if (!up.document || !up.document.id) throw new Error('The file did not upload.');
    return up.document;
  }
  async function uploadOwnFile(file) {
    const form = new FormData();
    form.append('file', file);
    const up = await API.upload('/api/documents', form);
    if (!up.document || !up.document.id) throw new Error('The file did not upload.');
    return up.document;
  }

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
        if (!data.length) { list.innerHTML = '<div class="empty-state"><div class="big">No assignments yet.</div></div>'; return; }
        list.innerHTML = '';
        for (const a of data) {
          const overdue = a.due_date && a.due_date < new Date().toISOString().slice(0, 10);
          const files = a.files || [];
          list.appendChild(UI.el(`<div class="doc-item">
            <div style="flex:1;min-width:0">
              <div class="doc-name">${UI.esc(a.title)} ${overdue ? '<span class="badge red">Overdue</span>' : ''}</div>
              <div class="doc-meta">${UI.esc(a.class_name || '')} ${UI.esc(a.class_stream || '')} · ${UI.esc(a.subject || '')} · Due ${UI.esc(a.due_date || '—')} · ${a.submission_count || 0} submissions · ${files.length} file${files.length === 1 ? '' : 's'} for students</div>
              ${a.description ? '<div class="as-brief clamp" style="margin-top:8px">' + UI.esc(a.description) + '</div>' : ''}
            </div>
            <div class="doc-actions">
              <button class="btn secondary sm" data-view="${a.id}">View / grade</button>
              <button aria-label="Edit" title="Edit" class="btn secondary sm" data-edit="${a.id}">Edit</button>
              <button aria-label="Delete" title="Delete" class="btn danger sm" data-del="${a.id}">Delete</button>
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
        <div class="as-side teacher">
          <h4>What the student should do</h4>
          <label class="field">Instructions<textarea id="a-desc" rows="4" placeholder="Write the task. Students see this before they answer."></textarea></label>
          <label class="field">Files for the class<input type="file" id="a-files" multiple>
            <span class="doc-meta">Worksheet, notes or a photo of the board. The class can open these files.</span>
          </label>
        </div>`,
        foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Create</button>',
      });
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        const classId = modal.backdrop.querySelector('#a-class').value;
        const body = {
          title: modal.backdrop.querySelector('#a-title').value.trim(),
          classId,
          subject: modal.backdrop.querySelector('#a-subject').value.trim(),
          dueDate: modal.backdrop.querySelector('#a-due').value,
          description: modal.backdrop.querySelector('#a-desc').value.trim(),
          resources: [],
        };
        if (!body.title || !body.classId) return UI.toast('Title and class are required.', 'error');
        const saveBtn = modal.backdrop.querySelector('[data-save]');
        saveBtn.disabled = true;
        try {
          const files = [...modal.backdrop.querySelector('#a-files').files];
          for (const file of files) {
            const doc = await uploadClassFile(file, classId);
            body.resources.push(doc.id);
          }
          await API.post('/api/assignments', body);
          UI.toast('Assignment created.', 'success');
          modal.close();
          onSave && onSave();
        } catch (e) { UI.toast(e.message, 'error'); saveBtn.disabled = false; }
      };
    },

    async editAssignment(id, onSave) {
      let a;
      try { a = (await API.get(`/api/assignments/${id}`)).assignment; } catch (e) { return UI.toast(e.message, 'error'); }
      const existing = a.files || [];
      const modal = UI.openModal({
        title: 'Edit assignment',
        wide: true,
        body: `<div class="form-row">
          <label class="field">Title<input id="a-title" value="${UI.esc(a.title)}"></label>
          <label class="field">Subject<input id="a-subject" value="${UI.esc(a.subject || '')}"></label>
        </div>
        <div class="form-row">
          <label class="field">Due date<input type="date" id="a-due" value="${UI.esc(a.due_date || '')}"></label>
          <label class="field">Status<select id="a-status"><option ${a.status === 'active' ? 'selected' : ''}>active</option><option ${a.status === 'archived' ? 'selected' : ''}>archived</option></select></label>
        </div>
        <div class="as-side teacher">
          <h4>What the student should do</h4>
          <label class="field">Instructions<textarea id="a-desc" rows="4">${UI.esc(a.description || '')}</textarea></label>
          <div class="doc-meta">Files already shared with the class</div>
          <div id="a-existing">${assignmentFilesHtml(existing) || '<div class="doc-meta">No file attached yet.</div>'}</div>
          <label class="field">Add more files<input type="file" id="a-files" multiple></label>
        </div>`,
        foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Save</button>',
      });
      const kept = new Set(existing.map((f) => f.id));
      modal.backdrop.querySelectorAll('[data-dl]').forEach((b) => {
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'btn ghost sm';
        rm.textContent = 'Remove';
        rm.onclick = () => { kept.delete(Number(b.dataset.dl)); b.closest('.as-file').remove(); };
        b.parentElement.appendChild(rm);
      });
      bindAssignmentDownloads(modal.backdrop);
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        const saveBtn = modal.backdrop.querySelector('[data-save]');
        saveBtn.disabled = true;
        try {
          const resources = [...kept];
          const files = [...modal.backdrop.querySelector('#a-files').files];
          for (const file of files) {
            const doc = await uploadClassFile(file, a.class_id);
            resources.push(doc.id);
          }
          await API.put(`/api/assignments/${id}`, {
            title: modal.backdrop.querySelector('#a-title').value.trim(),
            subject: modal.backdrop.querySelector('#a-subject').value.trim(),
            dueDate: modal.backdrop.querySelector('#a-due').value,
            status: modal.backdrop.querySelector('#a-status').value,
            description: modal.backdrop.querySelector('#a-desc').value.trim(),
            resources,
          });
          UI.toast('Assignment updated.', 'success'); modal.close(); onSave && onSave();
        } catch (e) { UI.toast(e.message, 'error'); saveBtn.disabled = false; }
      };
    },

    async gradeView(id) {
      let a;
      try { a = (await API.get(`/api/assignments/${id}`)).assignment; } catch (e) { return UI.toast(e.message, 'error'); }
      const subs = a.submissions || [];
      const files = a.files || [];
      let modal;
      modal = UI.openModal({
        title: `Grade — ${a.title}`,
        wide: true,
        body: `<div class="as-side teacher">
            <h4>What you asked the class to do</h4>
            <div class="as-brief">${UI.esc(a.description || 'No written instructions.')}</div>
            <div class="doc-meta" style="margin-top:8px">Files you attached</div>
            ${assignmentFilesHtml(files) || '<div class="doc-meta">No file attached.</div>'}
          </div>
          <div class="doc-meta" style="margin-top:10px">${UI.esc(a.class_name || '')} · Due ${UI.esc(a.due_date || '—')} · ${subs.length} submission${subs.length === 1 ? '' : 's'}</div>
          <div id="subs-list"></div>
          <button class="btn success" id="publish-grades" style="margin-top:12px">Publish all grades to students</button>`,
        foot: '<button class="btn" data-close>Close</button>',
      });
      bindAssignmentDownloads(modal.backdrop);
      modal.backdrop.querySelector('[data-close]').onclick = () => modal.close();
      const list = modal.backdrop.querySelector('#subs-list');
      if (!subs.length) { list.innerHTML = '<div class="doc-meta">No submissions yet.</div>'; }
      for (const s of subs) {
        const answerFile = s.attachment_id
          ? '<div class="as-file"><span>' + UI.esc(s.attachment_name || 'Student file') + '</span><button type="button" class="btn secondary sm" data-dl="' + s.attachment_id + '" data-name="' + UI.esc(s.attachment_name || 'answer') + '">Open student file</button></div>'
          : '<div class="doc-meta">No file from this student.</div>';
        list.appendChild(UI.el(`<div class="doc-item as-side student">
          <div style="flex:1;min-width:0">
            <div class="doc-name">${UI.esc(s.student_name)}</div>
            <div class="doc-meta">${UI.timeAgo(s.submitted_at)}</div>
            <h4>Student's answer</h4>
            ${s.content ? `<div class="as-brief">${UI.esc(s.content)}</div>` : '<div class="doc-meta">No written answer.</div>'}
            ${answerFile}
            ${s.grade !== null && s.grade !== undefined ? `<div class="doc-meta" style="margin-top:4px">Grade: <strong>${s.grade}%</strong>${s.released ? ' (released)' : ' (not released yet)'}</div>` : ''}
          </div>
          <div>
            <input type="number" min="0" max="100" placeholder="Grade %" id="g-${s.id}" value="${s.grade ?? ''}" style="width:90px">
            <button class="btn sm" data-grade="${s.id}">Save</button>
          </div>
        </div>`));
      }
      bindAssignmentDownloads(list);
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

    /** Student view: read the teacher's task, then send text and/or a file. */
    async studentView(container, { studentId } = {}) {
      container.innerHTML = `<div id="as-list"></div>`;
      const data = (await API.get('/api/assignments')).assignments || [];
      const list = container.querySelector('#as-list');
      if (!data.length) { list.innerHTML = '<div class="empty-state"><div class="big">No assignments for your class yet.</div></div>'; return; }
      for (const a of data) {
        const sub = a.my_submission;
        const overdue = a.due_date && a.due_date < new Date().toISOString().slice(0, 10);
        const files = a.files || [];
        const brief = (a.description || '').trim();
        list.appendChild(UI.el(`<div class="doc-item" style="align-items:stretch">
          <div style="flex:1;min-width:0">
            <div class="doc-name">${UI.esc(a.title)} ${a.due_date ? '<span class="badge amber">due ' + UI.esc(a.due_date) + '</span>' : ''} ${overdue ? '<span class="badge red">Overdue</span>' : ''}</div>
            <div class="doc-meta">${UI.esc(a.subject || '')} · ${UI.esc(a.teacher_name || '')}</div>
            <div class="as-side teacher">
              <h4>What the teacher wants</h4>
              <div class="as-brief clamp">${UI.esc(brief || 'No written instructions. Open the files, then send your answer.')}</div>
              ${files.length ? '<div class="doc-meta" style="margin-top:8px">Teacher\'s files</div>' + assignmentFilesHtml(files) : '<div class="doc-meta" style="margin-top:6px">No file from the teacher.</div>'}
            </div>
            <div class="as-side student">
              <h4>Your answer</h4>
              ${sub ? `<div class="doc-meta">Submitted ${UI.timeAgo(sub.submitted_at)}${sub.grade !== null && sub.grade !== undefined ? ' · Grade: <strong>' + sub.grade + '%</strong>' : ' · awaiting grade'}</div>
                ${sub.content ? '<div class="as-brief clamp">' + UI.esc(sub.content) + '</div>' : ''}
                ${sub.attachment_id ? '<div class="as-file"><span>' + UI.esc(sub.attachment_name || 'Your file') + '</span><button type="button" class="btn secondary sm" data-dl="' + sub.attachment_id + '" data-name="' + UI.esc(sub.attachment_name || 'answer') + '">Download</button></div>' : '<div class="doc-meta">No file sent yet.</div>'}`
                : '<div class="doc-meta">Not submitted yet. Read the instructions, then send your answer.</div>'}
            </div>
          </div>
          <button class="btn ${sub ? 'secondary' : ''} sm" data-sub="${a.id}">${sub ? 'Update answer' : 'Send answer'}</button>
        </div>`));
      }
      bindAssignmentDownloads(list);
      list.querySelectorAll('[data-sub]').forEach((b) => b.onclick = () => this.submitModal(Number(b.dataset.sub), () => this.studentView(container, { studentId })));
    },

    async submitModal(id, onDone) {
      let a;
      try { a = (await API.get(`/api/assignments/${id}`)).assignment; } catch (e) { return UI.toast(e.message, 'error'); }
      const my = a.my_submission || {};
      const files = a.files || [];
      const modal = UI.openModal({
        title: `Answer — ${a.title}`,
        wide: true,
        body: `<div class="as-side teacher">
            <h4>What the teacher wants</h4>
            <div class="doc-meta">Due ${UI.esc(a.due_date || '—')}</div>
            <div class="as-brief">${UI.esc(a.description || 'No written instructions.')}</div>
            <div class="doc-meta" style="margin-top:8px">Teacher's files</div>
            ${assignmentFilesHtml(files) || '<div class="doc-meta">No file attached.</div>'}
          </div>
          <div class="as-side student">
            <h4>Your answer</h4>
            <label class="field">Write your answer<textarea id="sub-content" rows="5" placeholder="Write your answer here. You can also attach a file, or both.">${UI.esc(my.content || '')}</textarea></label>
            ${my.attachment_id ? '<div class="doc-meta">File already sent: ' + UI.esc(my.attachment_name || 'your file') + '. Leave the box empty to keep it.</div><div class="as-file"><span>' + UI.esc(my.attachment_name || 'Your file') + '</span><button type="button" class="btn secondary sm" data-dl="' + my.attachment_id + '" data-name="' + UI.esc(my.attachment_name || 'answer') + '">Download</button></div>' : ''}
            <label class="field">Attach your work<input type="file" id="sub-file">
              <span class="doc-meta">A photo of your book, a PDF, or a document. The teacher can open it.</span>
            </label>
          </div>`,
        foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Send answer</button>',
      });
      bindAssignmentDownloads(modal.backdrop);
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        const saveBtn = modal.backdrop.querySelector('[data-save]');
        saveBtn.disabled = true;
        try {
          const body = { content: modal.backdrop.querySelector('#sub-content').value.trim() };
          const file = modal.backdrop.querySelector('#sub-file').files[0];
          if (file) {
            const doc = await uploadOwnFile(file);
            body.attachmentId = doc.id;
          }
          if (!body.content && !body.attachmentId && !my.attachment_id) {
            saveBtn.disabled = false;
            return UI.toast('Write an answer or attach a file.', 'error');
          }
          await API.post(`/api/assignments/${id}/submit`, body);
          UI.toast('Answer sent.', 'success');
          modal.close();
          if (onDone) onDone();
        } catch (e) { UI.toast(e.message, 'error'); saveBtn.disabled = false; }
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
        if (!data.length) { list.innerHTML = '<div class="empty-state"><div class="big"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></div>No exams yet.</div>'; return; }
        list.innerHTML = '';
        for (const e of data) {
          list.appendChild(UI.el(`<div class="doc-item">
            <div style="flex:1;min-width:0">
              <div class="doc-name">${UI.esc(e.title)} ${statusBadge(e.status)}</div>
              <div class="doc-meta">${UI.esc(e.class_name || '')} ${UI.esc(e.class_stream || '')} · ${UI.esc(e.subject || '')} · ${UI.esc(e.date || 'no date')}${e.results_count ? ' · ' + e.results_count + ' results' : ''}</div>
            </div>
            <div class="doc-actions">
              <button class="btn secondary sm" data-open="${e.id}">${e.status === 'published' ? 'View results' : 'Enter marks'}</button>
              <button aria-label="Edit" title="Edit" class="btn secondary sm" data-edit="${e.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
              <button aria-label="Delete" title="Delete" class="btn danger sm" data-del="${e.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
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
        title: `${e.title} — ${e.subject || ''}`,
        wide: true,
        body: `<div class="doc-meta">${UI.esc(e.class_name || '')} · ${UI.esc(e.date || 'no date')} · Status: ${UI.esc(e.status)}</div>
          ${e.status === 'published' ? `<div id="res-view"></div>` : `
          <div id="marks-grid"></div>
          <button class="btn success" id="save-marks" style="margin-top:12px"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg> Save marks</button>`}
          ${isAdmin && e.status === 'completed' ? `<button class="btn" id="publish-exam" style="margin-top:8px"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M14.5 8.5a5 5 0 0 1 0 7"/><path d="M17.5 5.5a9 9 0 0 1 0 13"/></svg> Publish results to students</button>` : ''}`,
        foot: '<button class="btn" data-close>Close</button>',
      });
      modal.backdrop.querySelector('[data-close]').onclick = () => modal.close();

      if (e.status === 'published') {
        const view = modal.backdrop.querySelector('#res-view');
        const results = (await API.get(`/api/exams/${id}`)).exam.results || [];
        view.innerHTML = results.length
          ? `<div class="table-responsive"><table class="table"><thead><tr><th>Student</th><th>Marks</th><th>Grade</th><th style="text-align:right">Report card</th></tr></thead><tbody>${results.map((r) => `<tr><td data-label="Student">${UI.esc(r.student_name)}</td><td data-label="Marks">${r.marks}</td><td data-label="Grade">${UI.esc(r.grade || '—')}</td><td data-label="" class="actions-cell"><button class="btn secondary sm" data-rc="${r.student_id}">Print</button></td></tr>`).join('')}</tbody></table></div>`
              + `<button class="btn secondary sm" id="rc-all" style="margin-top:10px">Print every report card in this class</button>`
              + `<div id="rc-progress" class="doc-meta" style="margin-top:6px"></div>`
          : '<div class="doc-meta">No results.</div>';
        // Report cards print from the server so the school letterhead, term
        // average, position and attendance are all on one page.
        view.querySelectorAll('[data-rc]').forEach((b) => {
          b.onclick = () => UI.openPrintable(`/api/print/report-card/${b.dataset.rc}?term=${encodeURIComponent(e.term || '')}`);
        });
        const all = view.querySelector('#rc-all');
        if (all) all.onclick = async () => {
          const kids = [...view.querySelectorAll('[data-rc]')];
          const prog = view.querySelector('#rc-progress');
          prog.textContent = 'Opening ' + kids.length + ' report cards…';
          for (const b of kids) {
            UI.openPrintable(`/api/print/report-card/${b.dataset.rc}?term=${encodeURIComponent(e.term || '')}`);
            await new Promise((r) => setTimeout(r, 350));   // browsers block a burst of tabs
          }
          prog.textContent = 'If some tabs did not open, allow pop-ups for this site.';
        };
        return;
      }

      // enter marks: fetch class students
      const students = (await API.get(`/api/classes/${e.class_id}/students`)).students || [];
      const existing = (e.results || []).reduce((m, r) => { m[r.student_id] = r; return m; }, {});
      const grid = modal.backdrop.querySelector('#marks-grid');
      grid.innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Student</th><th>Marks (0-100)</th><th>Grade</th><th>Comment</th></tr></thead><tbody></tbody></table>`;
      const tbody = grid.querySelector('tbody');
      for (const s of students) {
        const cur = existing[s.id] || {};
        const tr = document.createElement('tr');
        tr.innerHTML = `<td data-label="Student">${UI.esc(s.full_name)}</td>
          <td data-label="Marks"><input type="number" min="0" max="100" class="mk" data-sid="${s.id}" value="${cur.marks ?? ''}" style="width:80px"></td>
          <td data-label="Grade"><input class="gr" data-sid="${s.id}" value="${UI.esc(cur.grade || '')}" style="width:50px"></td>
          <td data-label="Comment"><input class="cm" data-sid="${s.id}" value="${UI.esc(cur.comments || '')}" style="width:100%"></td>`;
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
      const me = (API.getUser() || {});
      // who is this report card for? a student sees their own; a parent picks a child
      let myStudentId = studentId || null;
      if (!myStudentId && me.role === 'parent') {
        try {
          const kids = (await API.get('/api/parents/children')).children || [];
          myStudentId = kids[0] ? kids[0].id : null;
        } catch { /* no children linked */ }
      }
      container.innerHTML = `${myStudentId ? `<div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div style="flex:1;min-width:180px"><strong>Report card</strong>
            <div class="doc-meta">Every published result, your average, class position and attendance — ready to print or save as a PDF.</div></div>
          <input id="rc-term" placeholder="Term (optional)" style="width:150px">
          <button class="btn" id="rc-print">Print report card</button>
        </div>` : ''}<div id="ex-list"></div>`;
      if (myStudentId) {
        container.querySelector('#rc-print').onclick = () => {
          const term = container.querySelector('#rc-term').value.trim();
          UI.openPrintable(`/api/print/report-card/${myStudentId}${term ? '?term=' + encodeURIComponent(term) : ''}`);
        };
      }
      const data = (await API.get('/api/exams')).exams || [];
      const list = container.querySelector('#ex-list');
      if (!data.length) { list.innerHTML = '<div class="empty-state"><div class="big"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></div>No exams scheduled.</div>'; return; }
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
            title: exam.title,
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
            ${manage ? '<td data-label="" class="actions-cell"><button aria-label="Delete" title="Delete" class="btn danger sm" data-del="' + e.id + '"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button></td>' : ''}`;
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
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg> Record a payment</h3>
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
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 13h6"/><path d="M9 17h4"/></svg> Outstanding balances</h3><div id="fee-report"></div></div>
        <div class="card"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg> Recent payments (undo a mistake)</h3><div id="fee-payments"></div></div>`;

      const loadStats = async () => {
        const rep = await API.get('/api/fees/report');
        container.querySelector('#fee-stats').innerHTML =
          stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>', UI.money(rep.totalDue), 'Total billed') +
          stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>', UI.money(rep.totalPaid), 'Total paid') +
          stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>', UI.money(rep.totalBalance), 'Outstanding') +
          stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg>', rep.outstandingStudents, 'Students with balances');
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
              <button class="btn secondary sm" data-assign="${f.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Assign</button>
              <button aria-label="Delete" title="Delete" class="btn danger sm" data-del="${f.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
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
        box.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <button class="btn secondary sm" id="fee-collection-report">Print collection report (all students)</button>
          </div>
          <div class="table-responsive"><table class="table"><thead><tr><th>Student</th><th>Class</th><th>Due</th><th>Paid</th><th>Balance</th><th style="text-align:right">Statement</th></tr></thead><tbody></tbody></table></div>`;
        box.querySelector('#fee-collection-report').onclick = () => UI.openPrintable('/api/print/fee-statements');
        const tbody = box.querySelector('tbody');
        rep.rows.slice(0, 100).forEach((r) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td data-label="Student">${UI.esc(r.full_name)}</td>
            <td data-label="Class">${UI.esc(r.class_name || '')} ${UI.esc(r.class_stream || '')}</td>
            <td data-label="Due">${UI.money(r.due)}</td>
            <td data-label="Paid">${UI.money(r.paid)}</td>
            <td data-label="Balance"><span class="badge ${r.balance > 0 ? 'red' : 'green'}">${UI.money(r.balance)}</span></td>
            <td data-label="" class="actions-cell"><button class="btn secondary sm" data-st="${r.student_id}">Print</button></td>`;
          tbody.appendChild(tr);
          tr.querySelector('[data-st]').onclick = () => UI.openPrintable(`/api/print/fee-statement/${r.student_id}`);
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
              <td data-label="" class="actions-cell"><button class="btn danger sm" data-undopay="${p.id}" data-sid="${p.studentId}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg> Undo</button></td>`;
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
        title: `Assign "${f.name}"`,
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
        box.innerHTML = `<h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg> Fees — ${UI.esc(studentName || '')}</h3>
          <div class="grid grid-3" style="margin-top:10px">
            ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>', UI.money(data.totalDue), 'Total due')}
            ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>', UI.money(data.totalPaid), 'Paid')}
            ${stat('<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>', UI.money(data.balance), 'Balance')}
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
              <button class="btn secondary sm" id="fee-statement"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg> Print fee statement</button>
            </div>
          </div>
          ${data.balance > 0 ? '<div class="card" style="background:var(--warning-light)"><strong>Outstanding balance of ' + UI.money(data.balance) + ' — please settle before the deadline.</strong></div>' : ''}
          <div class="card"><h4>Fee items</h4>
            ${data.fees.length ? data.fees.map((f) => `<div class="list-row"><span class="k">${UI.esc(f.name)}${f.term ? ' (' + UI.esc(f.term) + ')' : ''}</span><span class="v">${UI.money(f.due_amount)}</span></div>`).join('') : '<div class="doc-meta">No fees assigned.</div>'}
          </div>
          <div class="card"><h4>Payment history</h4>
            ${data.payments.length ? `<div class="table-responsive"><table class="table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Receipt</th><th style="text-align:right">Print</th></tr></thead><tbody>${data.payments.map((p) => `<tr><td data-label="Date">${UI.esc(p.paid_at)}</td><td data-label="Amount">${UI.money(p.amount)}</td><td data-label="Method">${UI.esc(p.method)}</td><td data-label="Receipt">${UI.esc(p.receipt_no || '—')}</td><td data-label="" class="actions-cell"><button class="btn secondary sm" data-receipt="${p.id}">Receipt</button></td></tr>`).join('')}</tbody></table></div>`
              : '<div class="doc-meta">No payments recorded yet.</div>'}
          </div>`;
        // print actions: the statement covers everything, a receipt covers one payment
        box.querySelector('#fee-statement').onclick = () => UI.openPrintable(`/api/print/fee-statement/${studentId}`);
        box.querySelectorAll('[data-receipt]').forEach((b) => {
          b.onclick = () => UI.openPrintable(`/api/print/receipt/${studentId}/${b.dataset.receipt}`);
        });
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
            <td data-label="" class="actions-cell"><div class="actions"><button aria-label="Edit" title="Edit" class="btn secondary sm" data-edit="${s.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button><button aria-label="Delete" title="Delete" class="btn danger sm" data-del="${s.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button></div></td>`;
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

  // Guarded: a view that fails (no network, server error) explains itself and
  // offers a retry instead of leaving a blank panel and a console error.
  window.Academics = UI.guardViews({ AttendanceView, AssignmentsView, ExamsView, TimetableView, FeesView, SubjectsView, attBadge, statusBadge });
})();
