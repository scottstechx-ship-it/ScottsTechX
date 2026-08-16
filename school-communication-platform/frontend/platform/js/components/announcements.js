/**
 * Announcements component — read/unread list with an optional composer
 * for admins and teachers.
 */
(function () {
  const API = window.API;
  const UI = window.UI;

  class AnnouncementsView {
    constructor({ container, canPost = false, teacherMode = false }) {
      this.container = container;
      this.canPost = canPost;
      this.teacherMode = teacherMode;
    }

    async render() {
      this.container.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
          <h2 style="margin:0;flex:1">Announcements</h2>
          ${this.canPost ? '<button class="btn" id="ann-new">📢 New announcement</button>' : ''}
        </div>
        <div id="ann-list"></div>`;

      if (this.canPost) this.container.querySelector('#ann-new').onclick = () => this.compose();
      await this.load();
    }

    async load() {
      try {
        const data = await API.get('/api/announcements');
        const list = this.container.querySelector('#ann-list');
        if (!list) return;
        const items = data.announcements || [];
        if (!items.length) {
          list.innerHTML = `<div class="empty-state"><div class="big">📢</div>No announcements yet.</div>`;
        } else {
          list.innerHTML = '';
          for (const a of items) list.appendChild(this.item(a));
        }
        window.__setNavBadge && window.__setNavBadge('announcements', data.unread || 0);
      } catch (e) { UI.toast(e.message, 'error'); }
    }

    item(a) {
      const important = !!a.important;
      const item = UI.el(`<div class="ann-item ${a.is_read ? '' : 'unread'} ${important ? 'important' : ''}">
        <div class="ann-title">
          ${important ? '<span class="badge red">IMPORTANT</span>' : ''}
          <span>${UI.esc(a.title)}</span>
        </div>
        <div class="ann-meta">${important ? '🏷 ' : ''}${UI.esc(a.sender_name || 'School')} · ${UI.fmtDate(a.created_at)} · ${UI.timeAgo(a.created_at)}
          ${this.canPost ? `<button class="btn ghost sm" data-edit style="margin-left:8px">✏️ Edit</button><button class="btn ghost sm" data-del>Delete</button>` : ''}
        </div>
        <div class="ann-body">${UI.esc(a.content)}</div>
      </div>`);
      if (!a.is_read) {
        item.addEventListener('click', async () => {
          try { await API.put(`/api/announcements/${a.id}/read`); item.classList.remove('unread'); this.load(); } catch {}
        });
      }
      const del = item.querySelector('[data-del]');
      if (del) del.onclick = async (e) => {
        e.stopPropagation();
        const ok = await UI.confirmDialog(`Delete announcement "${a.title}"?`, { title: 'Delete announcement', confirmText: 'Delete' });
        if (!ok) return;
        try { await API.del(`/api/announcements/${a.id}`); UI.toast('Announcement deleted.', 'success'); this.load(); }
        catch (err) { UI.toast(err.message, 'error'); }
      };
      const edit = item.querySelector('[data-edit]');
      if (edit) edit.onclick = (e) => {
        e.stopPropagation();
        this.edit(a);
      };
      return item;
    }

    async compose() {
      const options = await this.targetOptions();
      let modal;
      modal = UI.openModal({
        title: 'New announcement',
        wide: true,
        body: `
          <label class="field">Title <span class="req">*</span><input id="ann-title" maxlength="200"></label>
          <label class="field">Message <span class="req">*</span><textarea id="ann-content" rows="5"></textarea></label>
          <label class="field">Target audience
            <select id="ann-target">${options}</select></label>
          <label class="field" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="ann-important" style="width:auto;margin:0"> Mark as important</label>`,
        foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-send>Publish</button>`,
      });
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-send]').onclick = async () => {
        const title = modal.backdrop.querySelector('#ann-title').value.trim();
        const content = modal.backdrop.querySelector('#ann-content').value.trim();
        if (!title || !content) return UI.toast('Title and message are required.', 'error');
        const sel = modal.backdrop.querySelector('#ann-target');
        const parsed = JSON.parse(sel.value);
        const important = modal.backdrop.querySelector('#ann-important').checked;
        try {
          await API.post('/api/announcements', {
            title, content,
            targetType: parsed.targetType,
            targetValue: parsed.targetValue,
            important,
          });
          UI.toast('Announcement published.', 'success');
          modal.close();
          await this.load();
        } catch (e) { UI.toast(e.message, 'error'); }
      };
    }

    /** Edit an existing announcement (sender or admin — the API enforces it). */
    async edit(a) {
      const options = await this.targetOptions();
      const targetVal = a.target_value || '';
      const targetType = a.target_type || 'all';
      let modal;
      modal = UI.openModal({
        title: 'Edit announcement',
        wide: true,
        body: `
          <label class="field">Title <span class="req">*</span><input id="ann-title" maxlength="200" value="${UI.esc(a.title)}"></label>
          <label class="field">Message <span class="req">*</span><textarea id="ann-content" rows="5">${UI.esc(a.content)}</textarea></label>
          <label class="field">Target audience <select id="ann-target">${options}</select></label>
          <label class="field" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="ann-important" style="width:auto;margin:0" ${a.important ? 'checked' : ''}> Mark as important</label>`,
        foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Save changes</button>`,
      });
      const sel = modal.backdrop.querySelector('#ann-target');
      // preselect the current target
      for (const opt of sel.options) {
        try {
          const v = JSON.parse(opt.value);
          if (v.targetType === targetType && String(v.targetValue || '') === String(targetVal)) opt.selected = true;
        } catch {}
      }
      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      modal.backdrop.querySelector('[data-save]').onclick = async () => {
        const title = modal.backdrop.querySelector('#ann-title').value.trim();
        const content = modal.backdrop.querySelector('#ann-content').value.trim();
        if (!title || !content) return UI.toast('Title and message are required.', 'error');
        const parsed = JSON.parse(sel.value);
        try {
          await API.put(`/api/announcements/${a.id}`, {
            title,
            content,
            important: modal.backdrop.querySelector('#ann-important').checked,
            targetType: parsed.targetType,
            targetValue: parsed.targetValue,
          });
          UI.toast('Announcement updated.', 'success');
          modal.close();
          await this.load();
        } catch (e) { UI.toast(e.message, 'error'); }
      };
    }

    async targetOptions() {
      let classes = [];
      try {
        // teachers may only announce to their own classes — the API enforces it too
        classes = this.teacherMode
          ? (await API.get('/api/classes')).classes || []
          : (await API.get('/api/settings/classes-reference')).classes || [];
      } catch {}
      const opts = [];
      if (!this.teacherMode) {
        opts.push(
          '<option value=\'{"targetType":"all","targetValue":""}\'>Everyone (whole school)</option>',
          '<option value=\'{"targetType":"role","targetValue":"student"}\'>All students</option>',
          '<option value=\'{"targetType":"role","targetValue":"parent"}\'>All parents</option>',
          '<option value=\'{"targetType":"role","targetValue":"teacher"}\'>All teachers</option>',
          '<option value=\'{"targetType":"staff","targetValue":""}\'>All staff (teachers + admins)</option>'
        );
      } else {
        opts.push('<option value="">Select a class…</option>');
      }
      for (const c of classes) {
        opts.push(`<option value='{"targetType":"class","targetValue":${c.id}}'>Class — ${UI.esc(c.name)} ${UI.esc(c.stream)}</option>`);
        opts.push(`<option value='{"targetType":"parents_of_class","targetValue":${c.id}}'>Parents of ${UI.esc(c.name)} ${UI.esc(c.stream)}</option>`);
      }
      return opts.join('');
    }
  }

  window.AnnouncementsView = AnnouncementsView;
})();
