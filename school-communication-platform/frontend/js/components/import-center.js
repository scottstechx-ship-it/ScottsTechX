/**
 * IMPORT CENTER — the guided way to fill the platform from the school's own
 * spreadsheets, in the order that keeps everything connected:
 *
 *   1 Timetable  → creates classes + subjects and links teachers
 *   2 Teachers   → logins, subjects, classes
 *   3 Students   → put into their classes
 *   4 Guardians  → linked to their children
 *   5 Attendance
 *   6 Fees       → billed to the right students
 *   7 Payments
 *   8 Marks      → report cards (PDF report cards live on the Reports screen)
 *
 * Every step previews first and saves second, and the preview is produced by the
 * same code that does the import, so it cannot promise something the import
 * will not do.
 */
(function () {
  const API = window.API;
  const UI = window.UI;

  const KINDS_WITH_TERM = new Set(['attendance', 'fees', 'payments', 'reports']);

  /** UI.modal() gives us the dialog shell; swapping its body is our job. */
  function setBody(modal, html) {
    const body = modal.backdrop && modal.backdrop.querySelector('.modal-body');
    if (body) body.innerHTML = html;
  }

  function fileIcon(name) {
    const ext = String(name || '').split('.').pop().toLowerCase();
    if (ext === 'zip') return '📦';
    if (ext === 'pdf') return '📄';
    if (ext === 'xlsx' || ext === 'xls') return '📊';
    return '📋';
  }

  class ImportCenter {
    constructor(container) {
      this.container = container;
      this.guide = null;
      this.term = '';
      this.year = String(new Date().getFullYear());
      this.busy = false;
    }

    async render() {
      this.container.innerHTML = '<div class="empty-state">Loading the import guide…</div>';
      try {
        const [guide, terms] = await Promise.all([
          API.get('/api/imports/guide'),
          API.get('/api/attendance/terms').catch(() => ({ terms: [], current: null })),
        ]);
        this.guide = guide;
        this.termList = terms.terms || [];
        const current = terms.current || {};
        this.term = current.term || (this.termList[0] && this.termList[0].term) || 'Term 1';
        this.year = String(current.year || new Date().getFullYear());
      } catch (e) {
        this.container.innerHTML = `<div class="empty-state">Could not load the import guide.<br><span class="muted">${UI.esc(e.message)}</span>
          <div style="margin-top:12px"><button class="btn" id="ic-retry">Try again</button></div></div>`;
        const retry = this.container.querySelector('#ic-retry');
        if (retry) retry.onclick = () => this.render();
        return;
      }
      this.paint();
    }

    paint() {
      const { pipeline, kinds, counts } = this.guide;
      const steps = pipeline.filter((p) => kinds[p.key]);

      this.container.innerHTML = `
        <div class="card" style="margin-bottom:14px">
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
            <div style="flex:1;min-width:240px">
              <h2 style="margin:0 0 6px">Import Center</h2>
              <p class="muted" style="margin:0;font-size:13.5px">
                Work down the list. Each step previews what will happen before anything is saved, and
                everything the school already has is linked automatically — teachers to their classes and
                subjects, students to their classes, guardians to their children, fees and report cards to the right child.
              </p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn secondary" id="ic-pack">Download all templates</button>
            </div>
          </div>
          <div class="grid grid-2" style="margin-top:14px;gap:10px">
            <label class="field" style="margin:0">Term
              <select id="ic-term">${this.termOptions()}</select>
            </label>
            <label class="field" style="margin:0">Year
              <input id="ic-year" value="${UI.esc(this.year)}" inputmode="numeric" placeholder="2026">
            </label>
          </div>
          <p class="muted" style="margin:8px 0 0;font-size:12.5px">
            Term and year are used by attendance, fees, payments and report cards when the file does not say.
          </p>
        </div>

        <div class="grid grid-3" style="margin-bottom:14px">
          <div class="card stat-card"><div class="stat-ic" style="background:var(--primary-light)">🏫</div>
            <div><div class="stat-num">${counts.classes}</div><div class="stat-label">Classes</div></div></div>
          <div class="card stat-card"><div class="stat-ic" style="background:var(--success-light)">👩‍🏫</div>
            <div><div class="stat-num">${counts.teachers}</div><div class="stat-label">Teachers</div></div></div>
          <div class="card stat-card"><div class="stat-ic" style="background:var(--warning-light)">🎒</div>
            <div><div class="stat-num">${counts.students}</div><div class="stat-label">Students</div></div></div>
          <div class="card stat-card"><div class="stat-ic" style="background:var(--primary-light)">👨‍👩‍👧</div>
            <div><div class="stat-num">${counts.parents}</div><div class="stat-label">Guardians</div></div></div>
          <div class="card stat-card"><div class="stat-ic" style="background:var(--success-light)">💰</div>
            <div><div class="stat-num">${counts.payments}</div><div class="stat-label">Payments recorded</div></div></div>
          <div class="card stat-card"><div class="stat-ic" style="background:var(--warning-light)">📄</div>
            <div><div class="stat-num">${counts.reportCards + counts.reportFiles}</div><div class="stat-label">Report cards</div></div></div>
        </div>

        <div id="ic-steps">${steps.map((s, i) => this.stepCard(s, i, counts)).join('')}</div>
      `;

      this.container.querySelector('#ic-pack').onclick = () => {
        window.open(`${API.base || ''}/api/imports/starter-pack.zip`, '_blank');
      };
      const termSel = this.container.querySelector('#ic-term');
      termSel.onchange = () => { this.term = termSel.value; };
      const yearInput = this.container.querySelector('#ic-year');
      yearInput.onchange = () => { this.year = yearInput.value.trim() || this.year; };

      this.container.querySelectorAll('[data-template]').forEach((b) => {
        b.onclick = () => window.open(`${API.base || ''}/api/imports/template.csv?type=${encodeURIComponent(b.dataset.template)}`, '_blank');
      });
      this.container.querySelectorAll('[data-pick]').forEach((input) => {
        input.onchange = () => {
          const file = input.files && input.files[0];
          input.value = '';
          if (file) this.preview(input.dataset.pick, file);
        };
      });
    }

    termOptions() {
      const list = (this.termList || []).map((t) => t.term || t);
      const names = list.length ? list : ['Term 1', 'Term 2', 'Term 3'];
      return names.map((t) => `<option value="${UI.esc(t)}" ${t === this.term ? 'selected' : ''}>${UI.esc(t)}</option>`).join('');
    }

    stepCard(step, index, counts) {
      const k = this.guide.kinds[step.key];
      const isReports = step.key === 'reports';
      const stat = isReports
        ? `${counts.reportFiles} file(s), ${counts.reportCards} card(s)`
        : ({
          timetable: `${counts.classes} classes · ${counts.subjects} subjects`,
          teachers: `${counts.teachers} teachers`,
          students: `${counts.students} students`,
          guardians: `${counts.parents} guardians`,
          attendance: `${counts.attendance} records`,
          fees: `${counts.feeStructures} fee(s)`,
          payments: `${counts.payments} payments`,
          classes: `${counts.classes} classes`,
          subjects: `${counts.subjects} subjects`,
        }[step.key] || '');

      return `
        <div class="card" style="margin-bottom:12px" data-step="${step.key}">
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
            <div style="flex:1;min-width:230px">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span class="badge blue">${index + 1}</span>
                <strong style="font-size:15px">${UI.esc(step.label.replace(/^\d+\.\s*/, ''))}</strong>
                ${stat ? `<span class="badge gray">${UI.esc(stat)}</span>` : ''}
              </div>
              <p class="muted" style="margin:6px 0 4px;font-size:13px">${UI.esc(step.why)}</p>
              <p class="muted" style="margin:0;font-size:12.5px"><strong>What you need:</strong> ${UI.esc(step.requirement)}</p>
              <p class="muted" style="margin:6px 0 0;font-size:12px">Columns: ${UI.esc((k.columns || []).join(' · '))}</p>
              ${isReports ? '<p class="muted" style="margin:6px 0 0;font-size:12px">Already have the cards as PDFs, Word files or scans? Use the <strong>Report Cards</strong> screen — single files or a whole zip.</p>' : ''}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn ghost sm" data-template="${step.key}">Template</button>
              <button class="btn sm" data-open="${step.key}">Upload</button>
              <input type="file" data-pick="${step.key}" accept="${k.fileTypes.map((t) => '.' + t).join(',')}" style="display:none">
            </div>
          </div>
        </div>`;
    }

    fileInput(kind) {
      return this.container.querySelector(`input[data-pick="${kind}"]`);
    }

    /** Pick a file → preview it (dry run) → offer the real import. */
    preview(kind, file) {
      const modal = UI.modal({
        title: `Preview — ${this.guide.kinds[kind].label}`,
        icon: 'import',
        wide: true,
        body: `<div class="empty-state">Reading ${fileIcon(file.name)} ${UI.esc(file.name)}…</div>`,
      });

      const form = new FormData();
      form.append('kind', kind);
      form.append('file', file);
      form.append('dryRun', '1');
      form.append('options', JSON.stringify(this.optionsFor(kind)));

      API.upload('/api/imports/run', form).then((data) => {
        setBody(modal, this.previewBody(kind, file, data));
        this.wirePreview(modal, kind, file, data);
      }).catch((e) => {
        setBody(modal, `<div class="empty-state">This file could not be read.<br><span class="muted">${UI.esc(e.message)}</span><br><br>
          Check that it is the right kind of file for this step, then try again.</div>`);
      });
    }

    optionsFor(kind) {
      const o = { year: this.year, term: this.term, createMissing: true };
      if (KINDS_WITH_TERM.has(kind)) o.term = this.term;
      return o;
    }

    previewBody(kind, file, data) {
      const c = data.counts || {};
      const isDocs = !!c.files && c.matched !== undefined;
      const rows = data.rows || [];
      const okCount = isDocs ? c.imported || c.matched || 0 : (c.valid || 0) + (c.warnings || 0);
      const problemCount = isDocs ? (c.unmatched || 0) + (c.failed || 0) : c.errors || 0;

      const listOf = (arr, emptyText) => (!arr || !arr.length ? `<div class="muted" style="font-size:13px">${emptyText}</div>`
        : arr.map((r) => `<div class="ic-row">
            <span class="badge ${r.status === 'error' ? 'red' : r.status === 'warning' ? 'amber' : 'green'}">${r.status === 'error' ? 'Row ' + r.row : r.status === 'warning' ? 'Check' : 'Ready'}</span>
            <span style="flex:1;min-width:180px">${UI.esc(r.summary || r.file || '')}</span>
            ${(r.errors && r.errors.length) ? `<span class="ic-note">${UI.esc(r.errors.join('; '))}</span>` : ''}
            ${(r.warnings && r.warnings.length) ? `<span class="ic-note muted">${UI.esc(r.warnings.join('; '))}</span>` : ''}
            ${(r.willCreate && r.willCreate.length) ? `<span class="ic-note muted">will create: ${UI.esc(r.willCreate.join(', '))}</span>` : ''}
          </div>`).join(''));

      return `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <span class="badge ${okCount ? 'green' : 'gray'}">${okCount} ready</span>
          ${problemCount ? `<span class="badge red">${problemCount} need attention</span>` : ''}
          <span class="badge gray">nothing saved yet</span>
        </div>
        <p style="margin:0 0 12px;font-size:13.5px">${UI.esc(data.message || '')}</p>
        ${isDocs
          ? `${(data.matched || []).length ? `<h4 style="margin:12px 0 6px;font-size:13px">Matched to a child</h4>${(data.matched || []).map((m) => `<div class="ic-row"><span class="badge green">${fileIcon(m.file)}</span><span style="flex:1">${UI.esc(m.file)}</span><span class="muted" style="font-size:12.5px">${UI.esc(m.student)}</span></div>`).join('')}` : ''}
             ${(data.unmatched || []).length ? `<h4 style="margin:12px 0 6px;font-size:13px">Needs a child chosen</h4>${(data.unmatched || []).map((m) => `<div class="ic-row"><span class="badge amber">${fileIcon(m.file)}</span><span style="flex:1">${UI.esc(m.file)}</span><span class="muted" style="font-size:12.5px">${UI.esc(m.why || '')}</span></div>`).join('')}` : ''}`
          : (rows.length ? `<div style="max-height:46vh;overflow:auto">${listOf(rows, '')}</div>` : '<div class="muted" style="font-size:13px">No data rows found.</div>')}
        <div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">
          <button class="btn secondary" data-cancel>Cancel</button>
          <button class="btn" data-apply ${okCount ? '' : 'disabled'}>Import ${okCount} row${okCount === 1 ? '' : 's'}</button>
        </div>`;
    }

    wirePreview(modal, kind, file, data) {
      const root = modal.backdrop;
      const cancel = root.querySelector('[data-cancel]');
      if (cancel) cancel.onclick = () => modal.close();
      const apply = root.querySelector('[data-apply]');
      if (!apply) return;
      apply.onclick = async () => {
        apply.disabled = true;
        apply.textContent = 'Importing…';
        const form = new FormData();
        form.append('kind', kind);
        form.append('file', file);
        form.append('dryRun', '0');
        form.append('options', JSON.stringify(this.optionsFor(kind)));
        try {
          const out = await API.upload('/api/imports/run', form);
          this.showOutcome(modal, kind, out);
          this.refreshCounts();
        } catch (e) {
          UI.toast(e.message, 'error');
          apply.disabled = false;
          apply.textContent = 'Try again';
        }
      };
    }

    showOutcome(modal, kind, out) {
      const created = out.created || [];
      const linked = out.linked || [];
      const creds = out.credentials || [];
      const failures = out.failures || [];
      const html = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <span class="badge green">${UI.esc(String((out.counts && (out.counts.imported ?? out.counts.files)) || 0))} imported</span>
          ${failures.length ? `<span class="badge red">${failures.length} could not be saved</span>` : ''}
        </div>
        <p style="margin:0 0 12px;font-size:13.5px">${UI.esc(out.message || '')}</p>
        ${created.length ? `<h4 style="margin:12px 0 6px;font-size:13px">Created</h4>
          <div style="max-height:30vh;overflow:auto">${created.slice(0, 200).map((c) => `<div class="ic-row"><span class="badge green">+</span><span style="flex:1">${UI.esc(c)}</span></div>`).join('')}</div>` : ''}
        ${linked.length ? `<h4 style="margin:12px 0 6px;font-size:13px">Linked automatically</h4>
          <div style="max-height:30vh;overflow:auto">${linked.slice(0, 200).map((c) => `<div class="ic-row"><span class="badge blue">→</span><span style="flex:1">${UI.esc(c)}</span></div>`).join('')}</div>` : ''}
        ${failures.length ? `<h4 style="margin:12px 0 6px;font-size:13px">Rows that could not be saved</h4>
          ${failures.map((f) => `<div class="ic-row"><span class="badge red">Row ${f.row}</span><span style="flex:1">${UI.esc(f.reason || '')}</span></div>`).join('')}` : ''}
        ${creds.length ? `<h4 style="margin:12px 0 6px;font-size:13px">${creds.length} new login(s)</h4>
          <p class="muted" style="margin:0 0 8px;font-size:12.5px">Download these now — the passwords are shown to the school only in this session.</p>
          <div style="max-height:30vh;overflow:auto">${creds.slice(0, 200).map((c) => `<div class="ic-row"><span class="badge gray">${UI.esc(c.username || '')}</span><span style="flex:1">${UI.esc(c.name || '')}</span><span class="muted" style="font-size:12.5px">${UI.esc(c.password || '')}</span></div>`).join('')}</div>
          <button class="btn secondary sm" data-creds style="margin-top:8px">Download logins (CSV)</button>` : ''}
        <div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
          <button class="btn" data-done>Done</button>
        </div>`;
      setBody(modal, html);

      const root = modal.backdrop;
      const done = root.querySelector('[data-done]');
      if (done) done.onclick = () => modal.close();
      const credsBtn = root.querySelector('[data-creds]');
      if (credsBtn) {
        credsBtn.onclick = () => {
          const csv = ['name,username,password', ...creds.map((c) => [c.name, c.username, c.password].map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(','))].join('\n');
          const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = `logins-${kind}.csv`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        };
      }
    }

    async refreshCounts() {
      try {
        const guide = await API.get('/api/imports/guide');
        this.guide = guide;
        const term = this.term;
        const year = this.year;
        this.term = term;
        this.year = year;
        this.paint();
      } catch { /* the numbers will be right next time the screen opens */ }
    }
  }

  window.ImportCenter = {
    render(container) {
      const view = new ImportCenter(container);
      return view.render();
    },
  };
})();
