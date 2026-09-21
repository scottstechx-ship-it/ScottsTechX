/**
 * WEBSITE CONTENT MANAGEMENT — shared dashboard component.
 *   AdmissionsView : admission applications inbox (admin + super admin)
 *   GalleryManager : public website gallery      (super admin)
 *   NewsManager    : public website news + expiry (admin + super admin)
 */
(function () {
  const API = window.API;
  const UI = window.UI;

  const esc = (s) => UI.esc(s == null ? '' : String(s));
  const fmtDT = (s) => { try { return new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString(); } catch { return s || ''; } };

  /* ============================================================
   * ADMISSIONS INBOX
   * ============================================================ */
  const AdmissionsView = {
    async render(box) {
      if (AdmissionsView._off) { AdmissionsView._off(); AdmissionsView._off = null; }
      box.innerHTML = `
        <div class="card" style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div>
              <h3 style="margin:0"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg> Admission Applications</h3>
              <div class="doc-meta">Submitted from the public website — updates arrive live.</div>
            </div>
            <select id="adm-filter" class="input" style="max-width:180px">
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="reviewing">Reviewing</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
        <div id="adm-list"></div>`;

      const listBox = box.querySelector('#adm-list');
      const filter = box.querySelector('#adm-filter');

      const badge = (s) => {
        const map = { new: 'blue', reviewing: 'amber', accepted: 'green', rejected: 'red' };
        return `<span class="badge ${map[s] || 'gray'}">${esc(s)}</span>`;
      };

      async function load() {
        listBox.innerHTML = '<div class="card"><div class="skeleton" style="height:80px"></div></div>';
        let apps = [];
        try {
          const q = filter.value ? `?status=${filter.value}` : '';
          apps = (await API.get('/api/website/admissions' + q)).applications || [];
        } catch (e) { listBox.innerHTML = `<div class="card"><div class="doc-meta">${esc(e.message)}</div></div>`; return; }
        if (!apps.length) {
          listBox.innerHTML = '<div class="card" style="text-align:center;padding:36px"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg> No applications' + (filter.value ? ' with this status' : ' yet') + '</h3><div class="doc-meta">New submissions from the website appear here instantly.</div></div>';
          return;
        }
        listBox.innerHTML = '';
        for (const a of apps) {
          const card = UI.el(`<div class="card" style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
              <div style="min-width:0">
                <div class="doc-name" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${esc(a.full_name)} ${badge(a.status)}</div>
                <div class="doc-meta">Applying for <b>${esc(a.applying_for)}</b>${a.program ? ' · ' + esc(a.program) : ''}${a.combination ? ' · ' + esc(a.combination) : ''}</div>
                <div class="doc-meta">Parent: ${esc(a.parent_name)} · ${esc(a.parent_phone)}${a.parent_email ? ' · ' + esc(a.parent_email) : ''}</div>
                <div class="doc-meta">Submitted ${esc(fmtDT(a.created_at))}${a.prev_school ? ' · Previous school: ' + esc(a.prev_school) : ''}</div>
                ${a.motivation ? `<div class="doc-meta" style="margin-top:6px;white-space:pre-wrap">"${esc(a.motivation)}"</div>` : ''}
                ${a.note ? `<div class="doc-meta" style="margin-top:6px"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> Note: ${esc(a.note)}</div>` : ''}
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn secondary sm" data-status="reviewing"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg> Reviewing</button>
                <button class="btn sm" data-status="accepted" style="background:#16a34a"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> Accept</button>
                <button class="btn secondary sm" data-status="rejected"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg> Reject</button>
                <button class="btn secondary sm" data-note><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> Note</button>
                <button aria-label="Delete" title="Delete" class="btn secondary sm" data-del style="color:#dc2626"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
              </div>
            </div>
          </div>`);
          card.querySelectorAll('[data-status]').forEach((b) => {
            b.onclick = async () => {
              try { await API.put(`/api/website/admissions/${a.id}`, { status: b.dataset.status }); UI.toast('Application updated.', 'success'); load(); }
              catch (e) { UI.toast(e.message, 'error'); }
            };
          });
          card.querySelector('[data-note]').onclick = async () => {
            const note = prompt('Add a note to this application:', a.note || '');
            if (note === null) return;
            try { await API.put(`/api/website/admissions/${a.id}`, { note }); UI.toast('Note saved.', 'success'); load(); }
            catch (e) { UI.toast(e.message, 'error'); }
          };
          card.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Delete the application from ${a.full_name}? This cannot be undone.`, { title: 'Delete application', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/website/admissions/${a.id}`); UI.toast('Application deleted.', 'success'); load(); }
            catch (e) { UI.toast(e.message, 'error'); }
          };
          listBox.appendChild(card);
        }
      }

      filter.onchange = load;
      // realtime: refresh the moment an application arrives. Use the public
      // Realtime API — reaching into Realtime.socket only works while the socket
      // happens to be connected, so the inbox used to sit still on the polling
      // fallback until the view was reopened.
      AdmissionsView._off = window.Realtime && window.Realtime.on('admission:new', () => {
        UI.toast('New admission application received!', 'info');
        load();
      });
      load();
    },
  };

  /* ============================================================
   * GALLERY MANAGER (super admin)
   * ============================================================ */
  const GalleryManager = {
    async render(box) {
      box.innerHTML = `
        <div class="card" style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div>
              <h3 style="margin:0"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg> Website Gallery</h3>
              <div class="doc-meta">These pictures appear on the public home page and gallery page. Delete anything here and it disappears from the website instantly.</div>
            </div>
            <button class="btn" id="g-add">+ Add image</button>
          </div>
        </div>
        <div id="g-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px"></div>`;

      const grid = box.querySelector('#g-grid');

      async function load() {
        grid.innerHTML = '<div class="card"><div class="skeleton" style="height:120px"></div></div>';
        let items = [];
        try {
          const data = await API.get('/api/website/gallery');
          items = data.items || data.images || [];
        }
        catch (e) { grid.innerHTML = `<div class="card"><div class="doc-meta">${esc(e.message)}</div></div>`; return; }
        if (!items.length) {
          grid.innerHTML = '<div class="card" style="grid-column:1/-1;text-align:center;padding:36px"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg> Gallery is empty</h3><div class="doc-meta">Add images or videos — they appear on the public website instantly.</div></div>';
          return;
        }
        grid.innerHTML = '';
        for (const im of items) {
          const isVideo = im.media_type === 'video';
          const preview = isVideo
            ? `<div style="position:relative"><video src="${esc(im.src)}" preload="metadata" muted class="video-thumb"></video>
                 <div style="position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;color:#fff"><svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/></svg></div></div>`
            : `<img src="${esc(im.src)}" alt="${esc(im.title || 'Gallery item')}" class="video-thumb" onerror="this.style.opacity=.25">`;
          const card = UI.el(`<div class="card" style="padding:0;overflow:hidden">
            ${preview}
            <div style="padding:12px">
              <div class="doc-name" style="font-size:14px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">${esc(im.title)} <span class="badge ${isVideo ? 'amber' : 'blue'}">${isVideo ? '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> video' : '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg> image'}</span></div>
              <div class="doc-meta">${esc(im.category || '')}${im.caption ? ' · ' + esc(im.caption) : ''}</div>
              <div style="display:flex;gap:6px;margin-top:10px">
                <button class="btn secondary sm" data-edit><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> Edit</button>
                <button class="btn secondary sm" data-del style="color:#dc2626"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> Delete</button>
              </div>
            </div>
          </div>`);
          card.querySelector('[data-edit]').onclick = () => openForm(im);
          card.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Remove "${im.title}" from the website? It disappears from the home page and gallery page immediately.`, { title: `Delete ${isVideo ? 'video' : 'image'}`, confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/website/gallery/${im.id}`); UI.toast(`${isVideo ? 'Video' : 'Image'} removed from the website.`, 'success'); load(); }
            catch (e) { UI.toast(e.message, 'error'); }
          };
          grid.appendChild(card);
        }
      }

      function openForm(im, videoMode = false) {
        const isEdit = !!im;
        const isVideo = isEdit ? im.media_type === 'video' : videoMode;
        const accept = isVideo ? 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.mkv' : 'image/*';
        const kind = isVideo ? 'video' : 'image';
        const modal = UI.openModal({
          title: isEdit ? `Edit gallery ${kind}` : `Add gallery ${kind}`,
          body: `
            <label class="field">Title <span class="req">*</span><input id="gi-title" value="${isEdit ? esc(im.title) : ''}" maxlength="150"></label>
            <label class="field">Caption<input id="gi-caption" value="${isEdit ? esc(im.caption || '') : ''}" maxlength="300"></label>
            <div class="form-row">
              <label class="field">Category<input id="gi-cat" value="${isEdit ? esc(im.category || 'general') : 'general'}" maxlength="40"></label>
              <label class="field">Sort order<input id="gi-sort" type="number" value="${isEdit ? im.sort_order || 0 : 0}"></label>
            </div>
            <label class="field">Upload ${kind} ${isEdit ? '(leave empty to keep the current one)' : ''}<input id="gi-file" type="file" accept="${accept}"></label>
            ${isVideo ? '<div class="doc-meta" style="margin:2px 0 8px">MP4 recommended · maximum 15 MB</div>' : ''}
            <div class="doc-meta" style="margin:4px 0 8px">…or use a ${kind} URL instead:</div>
            <label class="field">${kind.charAt(0).toUpperCase() + kind.slice(1)} URL<input id="gi-url" placeholder="https://…" value="${isEdit && im.url ? esc(im.url) : ''}"></label>`,
          foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>${isEdit ? 'Save changes' : 'Add to gallery'}</button>`,
        });
        modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
        modal.backdrop.querySelector('[data-save]').onclick = async () => {
          const q = (s) => modal.backdrop.querySelector(s);
          const form = new FormData();
          form.append('title', q('#gi-title').value.trim());
          form.append('caption', q('#gi-caption').value.trim());
          form.append('category', q('#gi-cat').value.trim());
          form.append('sortOrder', q('#gi-sort').value || '0');
          const file = q('#gi-file').files[0];
          if (file) form.append('file', file);
          const url = q('#gi-url').value.trim();
          if (url) form.append('url', url);
          try {
            if (isEdit) await API.uploadPut(`/api/website/gallery/${im.id}`, form);
            else await API.upload('/api/website/gallery', form);
            UI.toast('Gallery updated — live on the website now.', 'success');
            modal.close(); load();
          } catch (e) { UI.toast(e.message, 'error'); }
        };
      }

      box.querySelector('#g-add').onclick = () => openForm(null, false);
      load();
    },
  };

  /* ============================================================
   * NEWS MANAGER (admin + super admin) — with expiry dates
   * ============================================================ */
  const NewsManager = {
    async render(box) {
      box.innerHTML = `
        <div class="card" style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div>
              <h3 style="margin:0"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M4 4h11a1 1 0 0 1 1 1v15H5a1 1 0 0 1-1-1V4z"/><path d="M16 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3"/><path d="M7 8h5"/><path d="M7 12h5"/><path d="M7 16h3"/></svg> Website News</h3>
              <div class="doc-meta">Posts appear on the public news page. Expired posts hide automatically.</div>
            </div>
            <button class="btn" id="n-add">+ New post</button>
          </div>
        </div>
        <div id="n-list"></div>`;

      const listBox = box.querySelector('#n-list');

      async function load() {
        listBox.innerHTML = '<div class="card"><div class="skeleton" style="height:80px"></div></div>';
        let posts = [];
        try { posts = (await API.get('/api/website/news/manage')).news || []; }
        catch (e) { listBox.innerHTML = `<div class="card"><div class="doc-meta">${esc(e.message)}</div></div>`; return; }
        if (!posts.length) {
          listBox.innerHTML = '<div class="card" style="text-align:center;padding:36px"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M4 4h11a1 1 0 0 1 1 1v15H5a1 1 0 0 1-1-1V4z"/><path d="M16 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3"/><path d="M7 8h5"/><path d="M7 12h5"/><path d="M7 16h3"/></svg> No news posts yet</h3><div class="doc-meta">Write your first post — it goes live on the website instantly.</div></div>';
          return;
        }
        listBox.innerHTML = '';
        for (const n of posts) {
          const state = !n.published ? '<span class="badge gray">draft</span>'
            : n.expired ? '<span class="badge red">expired</span>'
            : '<span class="badge green">live</span>';
          const card = UI.el(`<div class="card" style="margin-bottom:12px">
            <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
              ${n.image ? `<img src="${esc(n.image)}" alt="" style="width:110px;height:74px;object-fit:cover;border-radius:10px;flex:none" onerror="this.remove()">` : ''}
              <div style="flex:1;min-width:220px">
                <div class="doc-name" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${esc(n.title)} ${state}</div>
                <div class="doc-meta" style="margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(n.body)}</div>
                <div class="doc-meta" style="margin-top:4px">Posted ${esc(fmtDT(n.created_at))}${n.expires_at ? ' · Expires ' + esc(n.expires_at) : ' · Never expires'}</div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn secondary sm" data-edit><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> Edit</button>
                <button class="btn secondary sm" data-toggle>${n.published ? '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg> Unpublish' : '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg> Publish'}</button>
                <button aria-label="Delete" title="Delete" class="btn secondary sm" data-del style="color:#dc2626"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
              </div>
            </div>
          </div>`);
          card.querySelector('[data-edit]').onclick = () => openForm(n);
          card.querySelector('[data-toggle]').onclick = async () => {
            try { await API.put(`/api/website/news/${n.id}`, { published: !n.published }); UI.toast(n.published ? 'Post hidden from the website.' : 'Post is live!', 'success'); load(); }
            catch (e) { UI.toast(e.message, 'error'); }
          };
          card.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Delete the news post "${n.title}"?`, { title: 'Delete news post', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/website/news/${n.id}`); UI.toast('News post deleted.', 'success'); load(); }
            catch (e) { UI.toast(e.message, 'error'); }
          };
          listBox.appendChild(card);
        }
      }

      function openForm(n) {
        const isEdit = !!n;
        const expVal = isEdit && n.expires_at ? String(n.expires_at).slice(0, 10) : '';
        const modal = UI.openModal({
          title: isEdit ? 'Edit news post' : 'New news post',
          body: `
            <label class="field">Title <span class="req">*</span><input id="np-title" value="${isEdit ? esc(n.title) : ''}" maxlength="200"></label>
            <label class="field">Story <span class="req">*</span><textarea id="np-body" rows="6" maxlength="8000">${isEdit ? esc(n.body) : ''}</textarea></label>
            <div class="form-row">
              <label class="field">Expiry date (optional)<input id="np-exp" type="date" value="${expVal}"></label>
              <label class="field" style="display:flex;align-items:center;gap:8px;margin-top:22px">
                <input id="np-pub" type="checkbox" ${!isEdit || n.published ? 'checked' : ''} style="width:auto"> Published
              </label>
            </div>
            <div class="doc-meta" style="margin-bottom:8px">After the expiry date the post disappears from the website automatically. Leave empty to keep it forever.</div>
            <label class="field">Image (optional)<input id="np-file" type="file" accept="image/*"></label>
            <label class="field">…or image URL<input id="np-url" placeholder="https://…" value="${isEdit && n.image_url ? esc(n.image_url) : ''}"></label>`,
          foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>${isEdit ? 'Save changes' : 'Publish post'}</button>`,
        });
        modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
        modal.backdrop.querySelector('[data-save]').onclick = async () => {
          const q = (s) => modal.backdrop.querySelector(s);
          const form = new FormData();
          form.append('title', q('#np-title').value.trim());
          form.append('body', q('#np-body').value.trim());
          form.append('published', q('#np-pub').checked ? 'true' : 'false');
          const exp = q('#np-exp').value;
          form.append('expiresAt', exp ? exp + ' 23:59:59' : '');
          const file = q('#np-file').files[0];
          if (file) form.append('file', file);
          const url = q('#np-url').value.trim();
          if (url) form.append('imageUrl', url);
          try {
            if (isEdit) await API.uploadPut(`/api/website/news/${n.id}`, form);
            else await API.upload('/api/website/news', form);
            UI.toast('News saved — the website is updated.', 'success');
            modal.close(); load();
          } catch (e) { UI.toast(e.message, 'error'); }
        };
      }

      box.querySelector('#n-add').onclick = () => openForm(null);
      load();
    },
  };

  /* ============================================================
   * CONTACT MESSAGES INBOX (admin + super admin)
   * ============================================================ */
  const ContactInbox = {
    async render(box) {
      if (ContactInbox._off) { ContactInbox._off(); ContactInbox._off = null; }
      box.innerHTML = `
        <div class="card" style="margin-bottom:16px">
          <h3 style="margin:0"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg> Website Messages</h3>
          <div class="doc-meta">Messages sent from the public contact form.</div>
        </div>
        <div id="cm-list"></div>`;
      const listBox = box.querySelector('#cm-list');
      const badge = (s) => `<span class="badge ${s === 'new' ? 'blue' : s === 'replied' ? 'green' : 'gray'}">${esc(s)}</span>`;
      async function load() {
        listBox.innerHTML = '<div class="card"><div class="skeleton" style="height:70px"></div></div>';
        let msgs = [];
        try { msgs = (await API.get('/api/website/contact')).messages || []; }
        catch (e) { listBox.innerHTML = `<div class="card"><div class="doc-meta">${esc(e.message)}</div></div>`; return; }
        if (!msgs.length) { listBox.innerHTML = '<div class="card" style="text-align:center;padding:36px"><h3><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg> No messages yet</h3><div class="doc-meta">Messages from the website contact form appear here.</div></div>'; return; }
        listBox.innerHTML = '';
        for (const m of msgs) {
          const card = UI.el(`<div class="card" style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
              <div style="min-width:0;flex:1">
                <div class="doc-name" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${esc(m.name)} ${badge(m.status)}</div>
                <div class="doc-meta">${m.email ? esc(m.email) + ' · ' : ''}${esc(fmtDT(m.created_at))}${m.subject ? ' · ' + esc(m.subject) : ''}</div>
                <div class="doc-meta" style="margin-top:6px;white-space:pre-wrap">${esc(m.message)}</div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${m.email ? `<a class="btn secondary sm" href="mailto:${esc(m.email)}?subject=Re: ${esc(m.subject || 'Your message to the school')}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg> Reply</a>` : ''}
                <button class="btn secondary sm" data-read>${m.status === 'new' ? '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> Mark read' : '<svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> Mark replied'}</button>
                <button aria-label="Delete" title="Delete" class="btn secondary sm" data-del style="color:#dc2626"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
              </div>
            </div>
          </div>`);
          card.querySelector('[data-read]').onclick = async () => {
            try { await API.put(`/api/website/contact/${m.id}`, { status: m.status === 'new' ? 'read' : 'replied' }); load(); }
            catch (e) { UI.toast(e.message, 'error'); }
          };
          card.querySelector('[data-del]').onclick = async () => {
            const ok = await UI.confirmDialog(`Delete the message from ${m.name}?`, { title: 'Delete message', confirmText: 'Delete' });
            if (!ok) return;
            try { await API.del(`/api/website/contact/${m.id}`); UI.toast('Message deleted.', 'success'); load(); }
            catch (e) { UI.toast(e.message, 'error'); }
          };
          listBox.appendChild(card);
        }
      }
      ContactInbox._off = window.Realtime && window.Realtime.on('contact:new', () => {
        UI.toast('New website message!', 'info');
        load();
      });
      load();
    },
  };

  // Guarded like the academics views: a failed inbox shows why and offers a retry.
  window.Website = window.UI.guardViews({ AdmissionsView, GalleryManager, NewsManager, ContactInbox });
})();
