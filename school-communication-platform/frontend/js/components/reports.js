/**
 * REPORT CARDS — one screen for the whole end-of-term job.
 *
 * The office uploads the cards (PDFs, Word files, scans, a whole zip, or a
 * spreadsheet of marks), the screen lines every child up with their card and
 * their fee balance, pre-ticks the children who have cleared their fees, and
 * sends the chosen cards to their parents.
 *
 * Children who still owe are never auto-ticked; the office can tick them on
 * purpose (the balance is shown next to each one), and the server double-checks
 * the gate before anything is delivered.
 */
(function () {
  const API = window.API;
  const UI = window.UI;

  const money = (n) => (typeof n === 'number' ? UI.money(n) : '—');

  class ReportsView {
    constructor(container) {
      this.container = container;
      this.term = '';
      this.year = String(new Date().getFullYear());
      this.classId = '';
      this.filter = '';
      this.data = { rows: [], totals: {} };
      this.unmatched = [];
      this.selected = new Set();
      this.classes = [];
      this.students = [];
    }

    async render() {
      this.container.innerHTML = '<div class="empty-state">Loading report cards…</div>';
      try {
        const [terms, ref] = await Promise.all([
          API.get('/api/attendance/terms').catch(() => ({ terms: [], current: null })),
          API.get('/api/settings/classes-reference').catch(() => ({ classes: [], students: [] })),
        ]);
        this.termList = terms.terms || [];
        const current = terms.current || {};
        this.term = this.term || current.term || (this.termList[0] && this.termList[0].term) || 'Term 1';
        this.year = this.year || String(current.year || new Date().getFullYear());
        this.classes = ref.classes || [];
        this.students = ref.students || [];
      } catch { /* the screen still works with its defaults */ }
      this.paint();
      await this.load();
    }

    paint() {
      this.container.innerHTML = `
        <div class="card" style="margin-bottom:14px">
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
            <div style="flex:1;min-width:230px">
              <h2 style="margin:0 0 6px">Report Cards</h2>
              <p class="muted" style="margin:0;font-size:13.5px">
                Upload the term's report cards as PDF — one file per child, or a zip. Name each PDF with the student ID
                (for example STU-2026-100.pdf) or the child's full name. Download the PDF format to get a card for every
                child already named, fill it or replace it with the school's own PDF, then upload the zip.
              </p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="btn secondary" id="rp-format">PDF format</button>
              <label class="btn ic-upload" id="rp-upload">Upload report cards
                <input type="file" id="rp-files" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.csv,.xlsx,.zip" aria-label="Upload report card PDFs">
              </label>
            </div>
          </div>
          <div class="grid grid-3" style="margin-top:14px;gap:10px">
            <label class="field" style="margin:0">Term
              <select id="rp-term">${(this.termList.length ? this.termList.map((t) => t.term || t) : ['Term 1', 'Term 2', 'Term 3'])
                .map((t) => `<option value="${UI.esc(t)}" ${t === this.term ? 'selected' : ''}>${UI.esc(t)}</option>`).join('')}</select>
            </label>
            <label class="field" style="margin:0">Year
              <input id="rp-year" value="${UI.esc(this.year)}" inputmode="numeric">
            </label>
            <label class="field" style="margin:0">Class
              <select id="rp-class"><option value="">All classes</option>
                ${this.classes.map((c) => `<option value="${c.id}" ${String(c.id) === String(this.classId) ? 'selected' : ''}>${UI.esc([c.name, c.stream].filter(Boolean).join(' '))}</option>`).join('')}
              </select>
            </label>
          </div>
        </div>

        <div class="grid grid-4" id="rp-stats" style="margin-bottom:14px"></div>

        <div id="rp-unmatched" style="margin-bottom:14px"></div>

        <div class="card">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
            <strong style="flex:1;min-width:160px">Children in this term</strong>
            <select id="rp-filter" style="max-width:190px">
              <option value="">Everyone</option>
              <option value="ready" ${this.filter === 'ready' ? 'selected' : ''}>Ready to send</option>
              <option value="owing" ${this.filter === 'owing' ? 'selected' : ''}>Still owing</option>
              <option value="sent" ${this.filter === 'sent' ? 'selected' : ''}>Already sent</option>
              <option value="missing" ${this.filter === 'missing' ? 'selected' : ''}>No report card yet</option>
            </select>
            <button class="btn secondary sm" id="rp-tick">Tick all cleared</button>
            <button class="btn ghost sm" id="rp-untick">Clear ticks</button>
            <button class="btn sm" id="rp-send">Send to parents</button>
          </div>
          <div class="table-responsive" id="rp-table"></div>
        </div>
      `;

      this.container.querySelector('#rp-format').onclick = () => this.downloadFormat();
      const uploadLabel = this.container.querySelector('#rp-upload');
      if (uploadLabel && !uploadLabel.dataset.bound) {
        uploadLabel.dataset.bound = '1';
        uploadLabel.addEventListener('click', (e) => {
          const input = uploadLabel.querySelector('input[type="file"]');
          if (!input || e.target === input || input.contains(e.target)) return;
          e.preventDefault();
          input.click();
        });
      }
      this.container.querySelector('#rp-files').onchange = (e) => this.uploadFiles([...(e.target.files || [])]);
      this.container.querySelector('#rp-term').onchange = (e) => { this.term = e.target.value; this.selected.clear(); this.load(); };
      this.container.querySelector('#rp-year').onchange = (e) => { this.year = e.target.value.trim() || this.year; this.selected.clear(); this.load(); };
      this.container.querySelector('#rp-class').onchange = (e) => { this.classId = e.target.value; this.selected.clear(); this.load(); };
      this.container.querySelector('#rp-filter').onchange = (e) => { this.filter = e.target.value; this.load(); };
      this.container.querySelector('#rp-tick').onclick = () => this.tickCleared();
      this.container.querySelector('#rp-untick').onclick = () => { this.selected.clear(); this.paintTable(); this.paintStats(); };
      this.container.querySelector('#rp-send').onclick = () => this.openSend();
    }

    async load() {
      const q = `term=${encodeURIComponent(this.term)}&year=${encodeURIComponent(this.year)}${this.classId ? `&classId=${encodeURIComponent(this.classId)}` : ''}${this.filter ? `&only=${encodeURIComponent(this.filter)}` : ''}`;
      try {
        const [data, un] = await Promise.all([
          API.get(`/api/reports?${q}`),
          API.get('/api/reports/unmatched').catch(() => ({ files: [] })),
        ]);
        this.data = data;
        this.unmatched = un.files || [];
      } catch (e) {
        this.container.querySelector('#rp-table').innerHTML = `<div class="empty-state">${UI.esc(e.message)}</div>`;
        return;
      }
      this.autoTick();
      this.paintStats();
      this.paintUnmatched();
      this.paintTable();
    }

    /** Only fully cleared children are ticked by themselves. */
    autoTick() {
      this.selected = new Set();
      for (const r of this.data.rows) {
        if (r.reportId && r.cleared && !r.sentAt && r.parentLinked) this.selected.add(r.studentId);
      }
    }

    tickCleared() {
      for (const r of this.data.rows) {
        if (r.reportId && r.cleared && !r.sentAt && r.parentLinked) this.selected.add(r.studentId);
      }
      this.paintTable();
      this.paintStats();
    }

    paintStats() {
      const t = this.data.totals || {};
      const box = this.container.querySelector('#rp-stats');
      if (!box) return;
      const card = (icon, bg, num, label) => `<div class="card stat-card"><div class="stat-ic" style="background:${bg}">${icon}</div>
        <div><div class="stat-num">${num}</div><div class="stat-label">${label}</div></div></div>`;
      box.innerHTML = [
        card('📄', 'var(--primary-light)', t.withReport || 0, 'Cards ready'),
        card('✅', 'var(--success-light)', t.cleared || 0, 'Fees cleared'),
        card('⏳', 'var(--warning-light)', t.owing || 0, 'Still owing'),
        card('📤', 'var(--success-light)', t.alreadySent || 0, 'Sent to parents'),
      ].join('');
      const send = this.container.querySelector('#rp-send');
      if (send) send.textContent = this.selected.size ? `Send ${this.selected.size} to parents` : 'Send to parents';
    }

    paintUnmatched() {
      const box = this.container.querySelector('#rp-unmatched');
      if (!box) return;
      if (!this.unmatched.length) { box.innerHTML = ''; return; }
      box.innerHTML = `
        <div class="card" style="border-left:4px solid var(--warning)">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <strong style="flex:1">${this.unmatched.length} uploaded file(s) need a child chosen</strong>
            <span class="muted" style="font-size:12.5px">The file name did not contain a student ID or a name we know.</span>
          </div>
          <div style="margin-top:10px">
            ${this.unmatched.map((f) => `
              <div class="ic-row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0;border-top:1px solid var(--border)">
                <span style="flex:1;min-width:170px">${UI.esc(f.fileName || 'file')}</span>
                <span class="muted" style="font-size:12.5px">${UI.esc(f.why || '')}</span>
                <button class="btn sm" data-match="${f.id}">Choose child</button>
                <button class="btn ghost sm" data-download="${f.id}">Open</button>
              </div>`).join('')}
          </div>
        </div>`;
      box.querySelectorAll('[data-match]').forEach((b) => { b.onclick = () => this.openMatch(Number(b.dataset.match)); });
      box.querySelectorAll('[data-download]').forEach((b) => {
        b.onclick = () => window.open(`${API.base || ''}/api/reports/${b.dataset.download}/file`, '_blank');
      });
    }

    paintTable() {
      const box = this.container.querySelector('#rp-table');
      if (!box) return;
      const rows = this.data.rows || [];
      if (!rows.length) {
        box.innerHTML = '<div class="empty-state">Nothing to show for this term yet. Upload the report cards above.</div>';
        return;
      }
      box.innerHTML = `<table>
        <thead><tr>
          <th style="width:34px"></th><th>Child</th><th>Class</th><th>Report</th><th>Fees</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
        ${rows.map((r) => {
          const ticked = this.selected.has(r.studentId);
          const canSend = !!r.reportId && !r.sentAt && r.parentLinked;
          return `<tr data-row="${r.studentId}">
            <td data-label="Send"><input type="checkbox" data-tick="${r.studentId}" ${ticked ? 'checked' : ''} ${canSend ? '' : 'disabled'} aria-label="Send report to ${UI.esc(r.name)}'s parents"></td>
            <td data-label="Child"><strong>${UI.esc(r.name)}</strong><br><span class="muted" style="font-size:12px">${UI.esc(r.studentCode || '')}</span></td>
            <td data-label="Class">${UI.esc(r.className || '—')}</td>
            <td data-label="Report">${r.reportId
              ? `<span class="badge ${r.hasFile ? 'blue' : 'gray'}">${r.hasFile ? 'File' : 'Marks'}</span>
                 ${r.average != null ? `<span class="muted" style="font-size:12.5px"> avg ${r.average}%${r.position ? `, pos ${r.position}/${r.classSize || '?'}` : ''}</span>` : ''}`
              : '<span class="badge amber">missing</span>'}</td>
            <td data-label="Fees">${r.hasFees
              ? (r.cleared ? '<span class="badge green">cleared</span>' : `<span class="badge red">owes ${money(r.balance)}</span>`)
              : '<span class="muted">no fees billed</span>'}</td>
            <td data-label="Status">${r.sentAt
              ? `<span class="badge green">sent</span> <span class="muted" style="font-size:12px">${UI.esc(UI.fmtDate(r.sentAt))}</span>`
              : (r.parentLinked ? '<span class="badge gray">not sent</span>' : '<span class="badge amber">no guardian linked</span>')}</td>
            <td class="actions-cell">${r.reportId ? `<button class="btn ghost sm" data-open="${r.reportId}">Open</button>` : ''}</td>
          </tr>`;
        }).join('')}
        </tbody></table>`;

      box.querySelectorAll('[data-tick]').forEach((cb) => {
        cb.onchange = () => {
          const id = Number(cb.dataset.tick);
          if (cb.checked) this.selected.add(id); else this.selected.delete(id);
          this.paintStats();
        };
      });
      box.querySelectorAll('[data-open]').forEach((b) => {
        b.onclick = async () => {
          try {
            await API.get(`/api/reports/${b.dataset.open}/file`, { raw: true });
          } catch { /* fall through to the new tab, which carries the session cookie */ }
          window.open(`${API.base || ''}/api/reports/${b.dataset.open}/file`, '_blank');
        };
      });
    }

    /** Named PDFs for this class and term — the format the school uploads. */
    async downloadFormat() {
      const q = `term=${encodeURIComponent(this.term)}&year=${encodeURIComponent(this.year)}${this.classId ? `&classId=${encodeURIComponent(this.classId)}` : ''}`;
      try {
        const res = await API.raw(`/api/reports/format.zip?${q}`);
        const blob = await res.blob();
        const a = document.createElement('a');
        const safe = `${this.term}-${this.year}`.replace(/[^\w.-]+/g, '-');
        a.href = URL.createObjectURL(blob);
        a.download = `report-card-format-${safe}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        UI.toast('PDF format downloaded. Keep the file names, then upload the zip.', 'success');
      } catch (e) {
        UI.toast(e.message, 'error');
      }
    }

    /** Upload one or many files; a zip is expanded on the server. */
    async uploadFiles(files) {
      if (!files.length) return;
      const modal = UI.modal({
        title: 'Uploading report cards',
        icon: 'import',
        body: `<div class="empty-state">Sending ${files.length} file(s)…</div>`,
      });
      const lines = [];
      for (const file of files) {
        const form = new FormData();
        form.append('kind', 'reports');
        form.append('file', file);
        form.append('dryRun', '0');
        form.append('options', JSON.stringify({ term: this.term, year: this.year, classId: this.classId || null }));
        try {
          const out = await API.upload('/api/imports/run', form);
          lines.push(`<div class="ic-row" style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--border)">
            <span class="badge green">ok</span><span style="flex:1">${UI.esc(file.name)}</span>
            <span class="muted" style="font-size:12.5px">${UI.esc(out.message || '')}</span></div>`);
        } catch (e) {
          lines.push(`<div class="ic-row" style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--border)">
            <span class="badge red">failed</span><span style="flex:1">${UI.esc(file.name)}</span>
            <span class="muted" style="font-size:12.5px">${UI.esc(e.message)}</span></div>`);
        }
      }
      const body = modal.backdrop.querySelector('.modal-body');
      if (body) {
        body.innerHTML = `<p style="margin:0 0 10px;font-size:13.5px">Finished. Anything without a child in its name is waiting below for you to choose one.</p>${lines.join('')}
          <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn" data-done>Done</button></div>`;
        const done = body.querySelector('[data-done]');
        if (done) done.onclick = () => modal.close();
      }
      const input = this.container.querySelector('#rp-files');
      if (input) input.value = '';
      await this.load();
    }

    /** Say which child a file belongs to. */
    openMatch(reportId) {
      const options = this.students
        .map((s) => `<option value="${s.id}">${UI.esc(s.full_name)}${s.student_code ? ` (${UI.esc(s.student_code)})` : ''}</option>`)
        .join('');
      const modal = UI.modal({
        title: 'Which child is this report card for?',
        body: `
          <label class="field">Search child
            <input id="rp-search" placeholder="Type a name or student ID" autocomplete="off">
          </label>
          <label class="field">Child
            <select id="rp-child" size="7" style="height:auto">${options}</select>
          </label>`,
        foot: `<button class="btn secondary" data-close2>Cancel</button><button class="btn" data-save>Match file</button>`,
      });
      const search = modal.backdrop.querySelector('#rp-search');
      const select = modal.backdrop.querySelector('#rp-child');
      const all = this.students;
      const refill = (q) => {
        const term = String(q || '').toLowerCase().trim();
        const list = term
          ? all.filter((s) => String(s.full_name).toLowerCase().includes(term) || String(s.student_code || '').toLowerCase().includes(term))
          : all;
        select.innerHTML = list.slice(0, 300).map((s) => `<option value="${s.id}">${UI.esc(s.full_name)}${s.student_code ? ` (${UI.esc(s.student_code)})` : ''}</option>`).join('')
          || '<option value="">No match</option>';
      };
      search.oninput = () => refill(search.value);
      modal.backdrop.querySelector('[data-close2]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        const studentId = Number(select.value);
        if (!studentId) return UI.toast('Choose a child first.', 'error');
        try {
          const out = await API.post(`/api/reports/${reportId}/match`, { studentId, term: this.term, year: this.year });
          UI.toast(out.message || 'Matched.', 'success');
          modal.close();
          await this.load();
        } catch (e) { UI.toast(e.message, 'error'); }
      };
      requestAnimationFrame(() => search.focus());
    }

    openSend() {
      const chosen = (this.data.rows || []).filter((r) => this.selected.has(r.studentId));
      if (!chosen.length) return UI.toast('Tick the children whose reports should go out.', 'error');
      const owing = chosen.filter((r) => !r.cleared);
      const modal = UI.modal({
        title: `Send ${chosen.length} report card(s)`,
        body: `
          <p style="margin:0 0 10px;font-size:13.5px">Each child's parents get an alert in the platform, plus an email when the school has email set up.</p>
          ${owing.length ? `<div class="card" style="background:var(--warning-light);border:0;padding:10px 12px;margin-bottom:10px">
            <strong>${owing.length} of the ticked children still owe fees.</strong>
            <p class="muted" style="margin:4px 0 0;font-size:12.5px">${owing.slice(0, 6).map((r) => `${UI.esc(r.name)} (${money(r.balance)})`).join(', ')}${owing.length > 6 ? ' …' : ''}</p>
            <label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-size:13px">
              <input type="checkbox" id="rp-allow-owing"> Send to those children anyway
            </label>
          </div>` : ''}
          <label class="field">Note to parents (optional, shown in the message)
            <input id="rp-note" maxlength="200" placeholder="e.g. Collect the printed copy from the office">
          </label>
          <p class="muted" style="margin:0;font-size:12.5px">Reports already marked sent are skipped.</p>`,
        foot: `<button class="btn secondary" data-close2>Cancel</button><button class="btn" data-sendnow>Send now</button>`,
      });
      modal.backdrop.querySelector('[data-close2]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-sendnow]').onclick = async () => {
        const allowOwing = modal.backdrop.querySelector('#rp-allow-owing');
        const note = modal.backdrop.querySelector('#rp-note').value.trim();
        const unpaid = allowOwing && allowOwing.checked;
        const ids = chosen.filter((r) => unpaid || r.cleared).map((r) => r.studentId);
        if (!ids.length) return UI.toast('Nothing to send — every ticked child owes fees.', 'error');
        const btn = modal.backdrop.querySelector('[data-sendnow]');
        btn.disabled = true;
        btn.textContent = 'Sending…';
        try {
          const out = await API.post('/api/reports/send', { term: this.term, year: this.year, studentIds: ids, note, onlyCleared: !unpaid });
          UI.toast(out.message, out.sent ? 'success' : 'error');
          if (out.skipped) {
            const reasons = (out.results || []).filter((r) => !r.ok).slice(0, 5).map((r) => `${r.student || 'child'}: ${r.reason}`).join(' · ');
            if (reasons) UI.toast(reasons, 'info');
          }
          modal.close();
          await this.load();
        } catch (e) {
          UI.toast(e.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Send now';
        }
      };
    }
  }

  window.ReportsView = {
    render(container) {
      const view = new ReportsView(container);
      return view.render();
    },
  };
})();
