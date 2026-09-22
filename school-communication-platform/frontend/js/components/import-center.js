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
 *   8 Marks      → report cards (spreadsheet, or PDFs named with the student ID)
 *
 * Every step previews first and saves second, and the preview is produced by the
 * same code that does the import, so it cannot promise something the import
 * will not do.
 */
(function () {
  const API = window.API;
  const UI = window.UI;

  const KINDS_WITH_TERM = new Set(['attendance', 'fees', 'payments', 'reports']);
  const REPORT_TYPES = ['csv', 'xlsx', 'pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'zip'];

  /** UI.modal() gives us the dialog shell; swapping its body is our job. */
  function setBody(modal, html) {
    const body = modal.backdrop && modal.backdrop.querySelector('.modal-body');
    if (body) body.innerHTML = html;
  }

  function icon(name, size) {
    return window.Icons ? window.Icons.svg(name, { size: size || 18 }) : '';
  }

  function fileIcon(name) {
    const ext = String(name || '').split('.').pop().toLowerCase();
    if (ext === 'zip') return icon('package', 14);
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return icon('chart', 14);
    return icon('document', 14);
  }

  /**
   * A click on the label text (or its icon) must open the file dialog exactly
   * once. If the transparent input did not receive the click, open it here.
   * Clicks that already hit the input are left alone, or the dialog opens twice.
   */
  function bindUploadLabel(label) {
    if (!label || label.dataset.bound) return;
    label.dataset.bound = '1';
    label.addEventListener('click', (e) => {
      const input = label.querySelector('input[type="file"]');
      if (!input || e.target === input || input.contains(e.target)) return;
      e.preventDefault();
      input.click();
    });
  }

  /** Save a same-origin download (session cookie included) and surface failures. */
  async function downloadAuth(url, fallbackName) {
    const res = await API.raw(url);
    const blob = await res.blob();
    const disp = res.headers.get('content-disposition') || '';
    const match = /filename="([^"]+)"/.exec(disp);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (match && match[1]) || fallbackName || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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
          ${this.stat('school', 'ic-blue', counts.classes, 'Classes')}
          ${this.stat('teachers', 'ic-green', counts.teachers, 'Teachers')}
          ${this.stat('students', 'ic-amber', counts.students, 'Students')}
          ${this.stat('parents', 'ic-blue', counts.parents, 'Guardians')}
          ${this.stat('wallet', 'ic-green', counts.payments, 'Payments recorded')}
          ${this.stat('document', 'ic-amber', counts.reportCards + counts.reportFiles, 'Report cards')}
        </div>

        <div id="ic-steps">${steps.map((s, i) => this.stepCard(s, i, counts)).join('')}</div>
      `;

      const pack = this.container.querySelector('#ic-pack');
      if (pack) pack.onclick = () => { window.open(`${API.base || ''}/api/imports/starter-pack.zip`, '_blank'); };
      const termSel = this.container.querySelector('#ic-term');
      termSel.onchange = () => { this.term = termSel.value; };
      const yearInput = this.container.querySelector('#ic-year');
      yearInput.onchange = () => { this.year = yearInput.value.trim() || this.year; };

      this.container.querySelectorAll('[data-template]').forEach((b) => {
        b.onclick = () => window.open(`${API.base || ''}/api/imports/template.csv?type=${encodeURIComponent(b.dataset.template)}`, '_blank');
      });
      this.container.querySelectorAll('[data-pdf-format]').forEach((b) => {
        b.onclick = () => this.downloadPdfFormat();
      });
      // The file input sits over the Upload label, so the browser opens the
      // picker itself. This handler is what runs after a file is chosen.
      this.container.querySelectorAll('label.ic-upload').forEach(bindUploadLabel);
      this.container.querySelectorAll('[data-pick]').forEach((input) => {
        input.onchange = () => {
          const files = input.files ? [...input.files] : [];
          input.value = '';
          if (!files.length) return;
          if (files.length === 1) this.preview(input.dataset.pick, files[0]);
          else this.previewMany(input.dataset.pick, files);
        };
      });
    }

    stat(name, cls, num, label) {
      return `<div class="card stat-card"><div class="stat-ic ${cls}">${icon(name, 22)}</div>
        <div><div class="stat-num">${num}</div><div class="stat-label">${UI.esc(label)}</div></div></div>`;
    }

    acceptFor(step, k) {
      const types = new Set((k && k.fileTypes) || []);
      if (!types.size) ['csv', 'xlsx'].forEach((t) => types.add(t));
      if (step.key === 'reports') REPORT_TYPES.forEach((t) => types.add(t));
      return [...types].map((t) => '.' + t).join(',');
    }

    async downloadPdfFormat() {
      const q = `term=${encodeURIComponent(this.term)}&year=${encodeURIComponent(this.year)}`;
      try {
        await downloadAuth(`/api/reports/format.zip?${q}`, `report-card-format-${this.term}-${this.year}.zip`);
        UI.toast('PDF format downloaded. Keep the file names, then upload the zip or the PDFs.', 'success');
      } catch (e) {
        UI.toast(e.message, 'error');
      }
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
              ${isReports ? `<p class="muted" style="margin:6px 0 0;font-size:12.5px"><strong>PDF format:</strong> download it, keep each file name (the student ID, for example STU-2026-100.pdf), replace a card with the school's own PDF if you already have one, then press Upload. A zip of those PDFs is accepted, and so are Word files and scans with the same names.</p>` : ''}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <button type="button" class="btn ghost sm" data-template="${step.key}">${isReports ? 'Marks template' : 'Template'}</button>
              ${isReports ? `<button type="button" class="btn ghost sm" data-pdf-format>${icon('document', 14)} PDF format</button>` : ''}
              <label class="btn sm ic-upload">${icon('upload', 14)} Upload
                <input type="file" data-pick="${step.key}" accept="${this.acceptFor(step, k)}" ${isReports ? 'multiple' : ''} aria-label="Upload ${UI.esc(step.label)}">
              </label>
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
        titleIcon: 'import',
        wide: true,
        body: `<div class="empty-state">Reading ${UI.esc(file.name)}…</div>`,
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
      const okCount = isDocs ? (c.matched || 0) : (c.valid || 0) + (c.warnings || 0);
      const fileCount = isDocs ? (c.files || 0) : 0;
      const problemCount = isDocs ? (c.unmatched || 0) + (c.failed || 0) : c.errors || 0;
      const canApply = isDocs ? fileCount > 0 : okCount > 0;
      const applyLabel = isDocs
        ? `Import ${fileCount} file${fileCount === 1 ? '' : 's'}`
        : `Import ${okCount} row${okCount === 1 ? '' : 's'}`;

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
        ${kind === 'reports' && isDocs ? '<p class="muted" style="margin:0 0 10px;font-size:12.5px">PDFs are matched by the file name. Use the student ID (STU-2026-100.pdf) or the child\'s full name. Files that do not match are still saved, so you can choose the child on Report Cards.</p>' : ''}
        ${isDocs
          ? `${(data.matched || []).length ? `<h4 style="margin:12px 0 6px;font-size:13px">Matched to a child</h4>${(data.matched || []).map((m) => `<div class="ic-row"><span class="badge green">${fileIcon(m.file)}</span><span style="flex:1">${UI.esc(m.file)}</span><span class="muted" style="font-size:12.5px">${UI.esc(m.student)}</span></div>`).join('')}` : ''}
             ${(data.unmatched || []).length ? `<h4 style="margin:12px 0 6px;font-size:13px">Needs a child chosen</h4>${(data.unmatched || []).map((m) => `<div class="ic-row"><span class="badge amber">${fileIcon(m.file)}</span><span style="flex:1">${UI.esc(m.file)}</span><span class="muted" style="font-size:12.5px">${UI.esc(m.why || '')}</span></div>`).join('')}` : ''}`
          : (rows.length ? `<div style="max-height:46vh;overflow:auto">${listOf(rows, '')}</div>` : '<div class="muted" style="font-size:13px">No data rows found.</div>')}
        <div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">
          <button type="button" class="btn secondary" data-cancel>Cancel</button>
          <button type="button" class="btn" data-apply ${canApply ? '' : 'disabled'}>${applyLabel}</button>
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

    /** Several PDFs (or a mix) chosen at once — preview each, then import the ones that can be read. */
    async previewMany(kind, files) {
      const modal = UI.modal({
        title: `Preview — ${files.length} files`,
        titleIcon: 'import',
        wide: true,
        body: `<div class="empty-state">Reading ${files.length} file(s)… nothing is saved yet.</div>`,
      });
      const rows = [];
      for (const file of files) {
        const form = new FormData();
        form.append('kind', kind);
        form.append('file', file);
        form.append('dryRun', '1');
        form.append('options', JSON.stringify(this.optionsFor(kind)));
        try {
          const data = await API.upload('/api/imports/run', form);
          rows.push({ file, ok: true, summary: data.message || 'Ready' });
        } catch (e) {
          rows.push({ file, ok: false, summary: e.message });
        }
      }
      const ready = rows.filter((r) => r.ok);
      setBody(modal, `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <span class="badge ${ready.length ? 'green' : 'gray'}">${ready.length} ready</span>
          ${rows.length - ready.length ? `<span class="badge red">${rows.length - ready.length} could not be read</span>` : ''}
          <span class="badge gray">nothing saved yet</span>
        </div>
        <p class="muted" style="margin:0 0 10px;font-size:12.5px">Name each PDF with the student ID (STU-2026-100.pdf) or the child's full name. A file that matches nobody is saved so you can choose the child on Report Cards.</p>
        <div style="max-height:46vh;overflow:auto">
          ${rows.map((r) => `<div class="ic-row"><span class="badge ${r.ok ? 'green' : 'red'}">${r.ok ? 'Ready' : 'Check'}</span><span style="flex:1">${fileIcon(r.file.name)} ${UI.esc(r.file.name)}</span><span class="muted" style="font-size:12.5px">${UI.esc(r.summary)}</span></div>`).join('')}
        </div>
        <div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">
          <button type="button" class="btn secondary" data-cancel>Cancel</button>
          <button type="button" class="btn" data-apply ${ready.length ? '' : 'disabled'}>Import ${ready.length} file${ready.length === 1 ? '' : 's'}</button>
        </div>`);
      const root = modal.backdrop;
      const cancel = root.querySelector('[data-cancel]');
      if (cancel) cancel.onclick = () => modal.close();
      const apply = root.querySelector('[data-apply]');
      if (!apply) return;
      apply.onclick = async () => {
        apply.disabled = true;
        apply.textContent = 'Importing…';
        const created = [];
        const linked = [];
        const failed = [];
        let imported = 0;
        for (const row of ready) {
          const form = new FormData();
          form.append('kind', kind);
          form.append('file', row.file);
          form.append('dryRun', '0');
          form.append('options', JSON.stringify(this.optionsFor(kind)));
          try {
            const out = await API.upload('/api/imports/run', form);
            imported += (out.counts && (out.counts.imported ?? out.counts.files)) || 0;
            created.push(...(out.created || []));
            linked.push(...(out.linked || []));
            failed.push(...(out.failures || out.failed || []));
          } catch (e) {
            failed.push({ file: row.file.name, why: e.message });
          }
        }
        this.showOutcome(modal, kind, {
          message: `${imported} imported${failed.length ? `, ${failed.length} could not be saved` : ''}.`,
          counts: { imported },
          created, linked, failed,
        });
        this.refreshCounts();
      };
    }

    showOutcome(modal, kind, out) {
      const created = out.created || [];
      const linked = out.linked || [];
      const creds = out.credentials || [];
      const failures = (out.failures || out.failed || []).map((f) => ({
        row: f.row || f.file || '—',
        reason: f.reason || f.why || '',
      }));
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
          ${failures.map((f) => `<div class="ic-row"><span class="badge red">${UI.esc(String(f.row))}</span><span style="flex:1">${UI.esc(f.reason || '')}</span></div>`).join('')}` : ''}
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
