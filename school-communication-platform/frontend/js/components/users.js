/**
 * UsersView — user management list for Super Admin and Admin.
 * Admin can create/edit/delete users but never Super Admin or other admins
 * (the backend enforces this too). Every action is wired to the API.
 */
(function () {
  const API = window.API;
  const UI = window.UI;
  const me = () => API.getUser();

  const UsersView = {
    async render(container) {
      container.innerHTML = `
        <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div class="search-input" style="flex:1;min-width:160px"><input id="uv-search" placeholder="Search users…"></div>
          <select id="uv-role" style="width:auto"><option value="">All roles</option><option>super_admin</option><option>admin</option><option>teacher</option><option>student</option><option>parent</option></select>
          <select id="uv-status" style="width:auto"><option value="">All statuses</option><option>active</option><option>inactive</option><option>suspended</option></select>
          <button class="btn" id="uv-add">＋ Create user</button>
        </div>
        <div class="card table-responsive"><div id="uv-list"></div></div>`;

      const box = container;
      box.querySelector('#uv-add').onclick = () => userModal(null, () => load());

      const load = async () => {
        const params = new URLSearchParams();
        const q = box.querySelector('#uv-search').value.trim();
        if (q) params.set('search', q);
        if (box.querySelector('#uv-role').value) params.set('role', box.querySelector('#uv-role').value);
        if (box.querySelector('#uv-status').value) params.set('status', box.querySelector('#uv-status').value);
        try {
          const data = await API.get('/api/users?' + params.toString());
          const list = box.querySelector('#uv-list');
          const users = data.users || [];
          if (!users.length) { list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="big"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>No users found.</div>'; return; }
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
                <button aria-label="Edit" title="Edit" class="btn secondary sm" data-edit="${u.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                <button aria-label="Reset password" title="Reset password" class="btn secondary sm" data-pass="${u.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3"/><path d="m16 6 3 3"/><path d="m19 3 3 3"/></svg></button>
                <button aria-label="Delete" title="Delete" class="btn danger sm" data-del="${u.id}"><svg class="ie" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.12em" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
              </div></td>`;
            tbody.appendChild(tr);
            tr.querySelector('[data-edit]').onclick = () => userModal(u, () => load());
            tr.querySelector('[data-pass]').onclick = () => resetPasswordModal(u);
            tr.querySelector('[data-del]').onclick = async () => {
              const ok = await UI.confirmDialog(`Delete user ${UI.esc(u.full_name)} (${UI.esc(u.username)})? This permanently removes their account.`, { title: 'Delete user', confirmText: 'Delete' });
              if (!ok) return;
              try { await API.del(`/api/users/${u.id}`); UI.toast('User deleted.', 'success'); load(); } catch (e) { UI.toast(e.message, 'error'); }
            };
          });
        } catch (e) { UI.toast(e.message, 'error'); }
      };
      box.querySelector('#uv-search').oninput = UI.debounce(load, 300);
      box.querySelector('#uv-role').onchange = load;
      box.querySelector('#uv-status').onchange = load;
      await load();
    },
  };

  function userModal(u, onSave) {
    const isEdit = !!u;
    const current = me();
    // admins may not assign the super_admin role
    const roles = current.role === 'super_admin' ? ['super_admin', 'admin', 'teacher', 'student', 'parent'] : ['teacher', 'student', 'parent'];
    let modal;
    modal = UI.openModal({
      title: isEdit ? 'Edit user' : 'Create user',
      body: `<div class="form-row">
        <label class="field">Full name <span class="req">*</span><input id="uv-name" value="${isEdit ? UI.esc(u.full_name) : ''}"></label>
        <label class="field">Username <span class="req">*</span><input id="uv-username" value="${isEdit ? UI.esc(u.username) : ''}" ${isEdit ? 'disabled' : ''}></label>
      </div>
      <div class="form-row">
        <label class="field">Email<input id="uv-email" value="${isEdit ? UI.esc(u.email || '') : ''}"></label>
        <label class="field">Phone<input id="uv-phone" value="${isEdit ? UI.esc(u.phone || '') : ''}"></label>
      </div>
      <div class="form-row">
        <label class="field">Role<select id="uv-role2">${roles.map((r) => `<option ${isEdit && u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
        <label class="field">Status<select id="uv-status2">${['active', 'inactive', 'suspended'].map((s) => `<option ${isEdit && u.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      </div>
      ${!isEdit ? '<label class="field">Password <span class="req">*</span><input type="password" id="uv-pass" placeholder="min 8 chars, letter + number"></label>' : ''}`,
      foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>${isEdit ? 'Save' : 'Create'}</button>`,
    });
    modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
    modal.backdrop.querySelector('[data-save]').onclick = async () => {
      const body = {
        fullName: modal.backdrop.querySelector('#uv-name').value.trim(),
        email: modal.backdrop.querySelector('#uv-email').value.trim(),
        phone: modal.backdrop.querySelector('#uv-phone').value.trim(),
        role: modal.backdrop.querySelector('#uv-role2').value,
        status: modal.backdrop.querySelector('#uv-status2').value,
      };
      if (!isEdit) {
        body.username = modal.backdrop.querySelector('#uv-username').value.trim();
        body.password = modal.backdrop.querySelector('#uv-pass').value;
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
      body: '<label class="field">New password <span class="req">*</span><input type="password" id="uv-rp" placeholder="min 8 chars, letter + number"></label>',
      foot: `<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Reset password</button>`,
    });
    modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
    modal.backdrop.querySelector('[data-save]').onclick = async () => {
      try {
        await API.post(`/api/users/${u.id}/reset-password`, { newPassword: modal.backdrop.querySelector('#uv-rp').value });
        UI.toast('Password reset.', 'success');
        modal.close();
      } catch (e) { UI.toast(e.message, 'error'); }
    };
  }

  function roleBadge(role) {
    const colors = { super_admin: 'purple', admin: 'amber', teacher: 'blue', student: 'green', parent: 'gray' };
    return `<span class="badge ${colors[role] || 'gray'}">${UI.esc(role.replace('_', ' '))}</span>`;
  }
  function statusBadge(status) {
    const map = { active: 'green', inactive: 'amber', suspended: 'red' };
    return `<span class="badge ${map[status] || 'gray'}">${UI.esc(status)}</span>`;
  }

  window.UsersView = UsersView;
})();
