/**
 * Documents component — list, upload, folders, download, preview, share,
 * rename and delete. Access control is enforced by the backend.
 */
(function () {
  const API = window.API;
  const UI = window.UI;

  const FILE_ICONS = {
    pdf: { cls: 'file-pdf', ic: 'PDF' }, doc: { cls: 'file-doc', ic: 'DOC' }, docx: { cls: 'file-doc', ic: 'DOC' },
    xls: { cls: 'file-xls', ic: 'XLS' }, xlsx: { cls: 'file-xls', ic: 'XLS' },
    ppt: { cls: 'file-ppt', ic: 'PPT' }, pptx: { cls: 'file-ppt', ic: 'PPT' },
    jpg: { cls: 'file-img', ic: 'IMG' }, jpeg: { cls: 'file-img', ic: 'IMG' }, png: { cls: 'file-img', ic: 'IMG' },
    gif: { cls: 'file-img', ic: 'IMG' }, webp: { cls: 'file-img', ic: 'IMG' },
    zip: { cls: 'file-zip', ic: 'ZIP' }, txt: { cls: 'file-txt', ic: 'TXT' }, csv: { cls: 'file-txt', ic: 'CSV' },
  };
  function fileIcon(name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    return FILE_ICONS[ext] || { cls: 'file-other', ic: 'FILE' };
  }

  class DocumentsView {
    constructor({ container, canUpload = true, canManage = true, parentMode = false, childFilter = null }) {
      this.container = container;
      this.canUpload = canUpload;
      this.canManage = canManage;
      this.parentMode = parentMode;
      this.childFilter = childFilter; // {classId} for parent child view
      this.documents = [];
      this.folders = [];
      this.activeFolder = null; // null = all, 0 = root
      this.pollTimer = null;
    }

    destroy() {
      if (this.pollTimer) clearInterval(this.pollTimer);
      (this.unsubs || []).forEach((u) => { try { u(); } catch {} });
      this.unsubs = [];
    }

    async render() {
      this.container.innerHTML = `
        <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div class="search-input" style="flex:1;min-width:200px"><input id="doc-search" placeholder="Search documents…"></div>
          ${this.canUpload ? '<button class="btn" id="doc-upload">⬆️ Upload</button>' : ''}
        </div>
        <div class="card" id="doc-folders" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"></div>
        <div id="doc-list"></div>`;

      const search = this.container.querySelector('#doc-search');
      search.oninput = () => this.load();
      if (this.canUpload) this.container.querySelector('#doc-upload').onclick = () => this.openUpload();

      this.unsubs = this.unsubs || [];
      this.unsubs.push(window.Realtime.on('poll', () => this.load({ quiet: true })));
      await this.load();
    }

    async load({ quiet = false } = {}) {
      try {
        const params = new URLSearchParams();
        const q = this.container.querySelector('#doc-search');
        if (q && q.value.trim()) params.set('search', q.value.trim());
        if (this.childFilter && this.childFilter.classId) params.set('classId', this.childFilter.classId);
        const path = (this.parentMode ? '/api/parents/documents' : '/api/documents') + (params.toString() ? '?' + params.toString() : '');
        const data = await API.get(path);
        this.documents = data.documents || [];
      } catch (e) { if (!quiet) UI.toast(e.message, 'error'); return; }

      this.renderList();
    }

    async loadFolders() {
      try {
        const data = await API.get('/api/documents/folders/list');
        this.folders = data.folders || [];
      } catch { this.folders = []; }
      const box = this.container.querySelector('#doc-folders');
      if (!box) return;
      box.innerHTML = '';
      const all = UI.el('<button class="chip">All documents</button>');
      const root = UI.el('<button class="chip">📁 No folder</button>');
      all.classList.toggle('active', this.activeFolder === null);
      root.classList.toggle('active', this.activeFolder === 0);
      all.onclick = () => { this.activeFolder = null; this.load(); this.loadFolders(); };
      root.onclick = () => { this.activeFolder = 0; this.load(); this.loadFolders(); };
      box.appendChild(all);
      box.appendChild(root);
      for (const f of this.folders) {
        const chip = UI.el(`<button class="chip">📁 ${UI.esc(f.name)}</button>`);
        chip.classList.toggle('active', this.activeFolder === f.id);
        chip.onclick = () => { this.activeFolder = f.id; this.load(); this.loadFolders(); };
        box.appendChild(chip);
        if (this.canManage) {
          const rm = UI.el(`<span style="cursor:pointer;color:var(--danger)" title="Delete folder">✕</span>`);
          rm.onclick = async (e) => { e.stopPropagation(); await this.deleteFolder(f.id); };
          chip.appendChild(rm);
        }
      }
      if (this.canManage) {
        const add = UI.el('<button class="btn ghost sm">＋ Folder</button>');
        add.onclick = () => this.newFolder();
        box.appendChild(add);
      }
    }

    renderList() {
      const list = this.container.querySelector('#doc-list');
      if (!list) return;
      if (!this.documents.length) {
        list.innerHTML = `<div class="empty-state"><div class="big">📄</div>No documents here yet.</div>`;
        return;
      }
      list.innerHTML = '';
      for (const d of this.documents) {
        const ic = fileIcon(d.name);
        const canDelete = this.canManage && (d.uploaded_by === (API.getUser() || {}).id || ['super_admin', 'admin'].includes((API.getUser() || {}).role));
        const item = UI.el(`<div class="doc-item">
          <div class="file-ic ${ic.cls}">${ic.ic}</div>
          <div style="min-width:0">
            <div class="doc-name">${UI.esc(d.name)}</div>
            <div class="doc-meta">${UI.esc(d.mime_type || '')} · ${UI.fmtSize(d.size)} · ${UI.timeAgo(d.created_at)} · by ${UI.esc(d.uploader_name || 'Unknown')}</div>
          </div>
          <div class="doc-actions">
            <button class="btn secondary sm" data-preview>👁 Preview</button>
            <button class="btn secondary sm" data-download>⬇ Download</button>
            ${this.canManage ? `<button class="btn secondary sm" data-share>🔗 Share</button>` : ''}
            ${this.canManage ? `<button class="btn secondary sm" data-rename>✏️</button>` : ''}
            ${canDelete ? `<button class="btn danger sm" data-delete>🗑</button>` : ''}
          </div>
        </div>`);
        item.querySelector('[data-download]').onclick = () => DocumentsView.downloadDoc(d.id, d.name);
        item.querySelector('[data-preview]').onclick = () => DocumentsView.previewDoc(d);
        if (item.querySelector('[data-share]')) item.querySelector('[data-share]').onclick = () => this.openShare(d);
        if (item.querySelector('[data-rename]')) item.querySelector('[data-rename]').onclick = () => this.openRename(d);
        if (item.querySelector('[data-delete]')) item.querySelector('[data-delete]').onclick = () => this.deleteDoc(d);
        list.appendChild(item);
      }
    }

    static async downloadDoc(id, name) {
      try {
        UI.toast('Preparing download…', 'info');
        const res = await API.raw(`/api/documents/${id}/download`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name || 'document';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } catch (e) { UI.toast(e.message, 'error'); }
    }

    static async previewDoc(doc) {
      try {
        const res = await API.raw(`/api/documents/${doc.id}/preview`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return UI.toast(data.error || 'This file cannot be previewed.', 'warning');
        }
        const ct = res.headers.get('content-type') || '';
        let inner;
        if (ct.includes('application/json')) {
          // Office documents come back as extracted text.
          const data = await res.json();
          inner = `<pre style="white-space:pre-wrap;max-height:70vh;overflow:auto;background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:14px">${UI.esc(data.text || '')}</pre>
                   <p class="doc-meta">Text preview of ${UI.esc(doc.name)} — formatting may differ from the original.</p>`;
        } else {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const isPdf = (doc.mime_type || '').includes('pdf');
          const isImage = (doc.mime_type || '').startsWith('image/');
          if (isPdf) inner = `<iframe src="${url}" style="width:100%;height:70vh;border:none;border-radius:8px"></iframe>`;
          else if (isImage) inner = `<img src="${url}" style="max-width:100%;border-radius:8px">`;
          else inner = `<pre style="white-space:pre-wrap;max-height:70vh;overflow:auto">${UI.esc(await blob.text())}</pre>`;
        }
        const modal = UI.openModal({
          title: UI.esc(doc.name),
          wide: true,
          body: inner + `<p style="margin:10px 0 0"><button class="btn" id="dl-in-modal">⬇ Download</button></p>`,
        });
        modal.backdrop.querySelector('#dl-in-modal').onclick = () => DocumentsView.downloadDoc(doc.id, doc.name);
      } catch (e) { UI.toast(e.message, 'error'); }
    }

    async openUpload() {
      let modal;
      modal = UI.openModal({
        title: 'Upload document',
        body: `
          <label class="field">File <span class="req">*</span><input type="file" id="up-file"></label>
          <label class="field">Description<textarea id="up-desc" placeholder="What is this document about?"></textarea></label>
          <label class="field">Share with
            <select id="up-share"><option value="">Only me</option></select>
          </label>`,
        foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Upload</button>`,
      });
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();

      const shareSel = modal.backdrop.querySelector('#up-share');
      // load share options
      try {
        const ref = await API.get('/api/settings/classes-reference');
        if (ref.classes.length) {
          for (const c of ref.classes) {
            shareSel.appendChild(UI.el(`<option value='{"targetType":"class","targetId":${c.id}}'>Whole class — ${UI.esc(c.name)} ${UI.esc(c.stream)}</option>`));
          }
        }
        const roles = [['student', 'All students'], ['teacher', 'All teachers'], ['parent', 'All parents'], ['admin', 'All admins'], ['all', 'Everyone in the school']];
        for (const [role, label] of roles) {
          shareSel.appendChild(UI.el(`<option value='{"targetType":"role","targetId":"${role}"}'>${label}</option>`));
        }
      } catch {}

      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        const file = modal.backdrop.querySelector('#up-file').files[0];
        if (!file) return UI.toast('Choose a file first.', 'error');
        const maxMB = 15;
        if (file.size > maxMB * 1024 * 1024) return UI.toast(`File is too large. Maximum is ${maxMB} MB.`, 'error');
        const form = new FormData();
        form.append('file', file);
        const desc = modal.backdrop.querySelector('#up-desc').value.trim();
        if (desc) form.append('description', desc);
        const shareVal = shareSel.value;
        if (shareVal) form.append('share', shareVal);
        try {
          await API.upload('/api/documents', form);
          UI.toast('Document uploaded and shared.', 'success');
          modal.close();
          await this.load();
          await this.loadFolders();
        } catch (e) { UI.toast(e.message, 'error'); }
      };
    }

    async openShare(doc) {
      let modal;
      modal = UI.openModal({
        title: `Share — ${UI.esc(doc.name)}`,
        body: `
          <label class="field">Share with
            <select id="share-target"></select></label>
          <div id="share-current"></div>`,
        foot: `<button class="btn secondary" data-close>Close</button><button class="btn" data-save>Share</button>`,
      });
      modal.backdrop.querySelector('[data-close]').onclick = () => modal.close();
      const sel = modal.backdrop.querySelector('#share-target');
      try {
        const ref = await API.get('/api/settings/classes-reference');
        for (const c of ref.classes) sel.appendChild(UI.el(`<option value='{"targetType":"class","targetId":${c.id}}'>Class — ${UI.esc(c.name)} ${UI.esc(c.stream)}</option>`));
        const roles = [['student', 'All students'], ['teacher', 'All teachers'], ['parent', 'All parents'], ['admin', 'All admins'], ['all', 'Everyone']];
        for (const [r, l] of roles) sel.appendChild(UI.el(`<option value='{"targetType":"role","targetId":"${r}"}'>${l}</option>`));
        for (const p of ref.parents) sel.appendChild(UI.el(`<option value='{"targetType":"user","targetId":${p.id}}'>Parent — ${UI.esc(p.full_name)}</option>`));
        for (const s of ref.students) sel.appendChild(UI.el(`<option value='{"targetType":"user","targetId":${s.id}}'>Student — ${UI.esc(s.full_name)}</option>`));
      } catch {}

      const renderCurrent = () => {
        const box = modal.backdrop.querySelector('#share-current');
        const access = doc.access || [];
        if (!access.length) { box.innerHTML = '<p class="doc-meta">Only the uploader can access this document.</p>'; return; }
        const label = (a) => {
          if (a.target_type === 'all') return 'Everyone';
          if (a.target_type === 'role') return 'All ' + a.target_id + 's';
          if (a.target_type === 'class') return 'Class #' + a.target_id;
          return 'User #' + a.target_id;
        };
        box.innerHTML = '<h4 style="margin-top:12px">Current access</h4>';
        for (const a of access) {
          if (a.target_type === 'user' && String(a.target_id) === String(doc.uploaded_by)) continue;
          const row = UI.el(`<div class="list-row"><span class="k">${UI.esc(label(a))}</span><button class="btn ghost sm danger" data-rm>Remove</button></div>`);
          row.querySelector('[data-rm]').onclick = async () => {
            try { await API.del(`/api/documents/${doc.id}/access`, { targetType: a.target_type, targetId: a.target_id }); UI.toast('Access removed.', 'success'); renderCurrent(); }
            catch (e) { UI.toast(e.message, 'error'); }
          };
          box.appendChild(row);
        }
      };
      renderCurrent();

      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        if (!sel.value) return;
        try {
          const t = JSON.parse(sel.value);
          await API.post(`/api/documents/${doc.id}/share`, t);
          UI.toast('Document shared.', 'success');
          doc.access.push({ target_type: t.targetType, target_id: t.targetId });
          renderCurrent();
        } catch (e) { UI.toast(e.message, 'error'); }
      };
    }

    async openRename(doc) {
      let modal;
      modal = UI.openModal({
        title: 'Rename document',
        body: `<label class="field">Name<input id="rn-name" value="${UI.esc(doc.name)}"></label>
               <label class="field">Description<textarea id="rn-desc">${UI.esc(doc.description || '')}</textarea></label>`,
        foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Save</button>`,
      });
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        try {
          await API.put(`/api/documents/${doc.id}`, {
            name: modal.backdrop.querySelector('#rn-name').value.trim(),
            description: modal.backdrop.querySelector('#rn-desc').value.trim(),
          });
          UI.toast('Document updated.', 'success');
          modal.close();
          await this.load();
        } catch (e) { UI.toast(e.message, 'error'); }
      };
    }

    async deleteDoc(doc) {
      const ok = await UI.confirmDialog(`Delete "${doc.name}"? This cannot be undone.`, { title: 'Delete document', confirmText: 'Delete' });
      if (!ok) return;
      try {
        await API.del(`/api/documents/${doc.id}`);
        UI.toast('Document deleted.', 'success');
        await this.load();
      } catch (e) { UI.toast(e.message, 'error'); }
    }

    async newFolder() {
      let modal;
      modal = UI.openModal({
        title: 'New folder',
        body: '<label class="field">Folder name<input id="folder-name"></label>',
        foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Create</button>`,
      });
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        const name = modal.backdrop.querySelector('#folder-name').value.trim();
        if (!name) return;
        try { await API.post('/api/documents/folders', { name }); UI.toast('Folder created.', 'success'); modal.close(); await this.loadFolders(); }
        catch (e) { UI.toast(e.message, 'error'); }
      };
    }

    async deleteFolder(folder) {
      const ok = await UI.confirmDialog(`Delete folder "${folder.name}"? Documents inside will move to the root.`, { title: 'Delete folder', confirmText: 'Delete' });
      if (!ok) return;
      try { await API.del(`/api/documents/folders/${folder.id}`); UI.toast('Folder deleted.', 'success'); await this.loadFolders(); await this.load(); }
      catch (e) { UI.toast(e.message, 'error'); }
    }
  }

  window.DocumentsView = DocumentsView;
})();
