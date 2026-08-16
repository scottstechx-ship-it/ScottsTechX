/**
 * Messaging component — chat interface shared by all dashboards.
 * Conversation list on the left, thread on the right. Full-screen on mobile.
 */
(function () {
  const API = window.API;
  const UI = window.UI;

  class MessagingView {
    constructor({ container, canCompose = true, allowClassChat = true, allowAttachments = true }) {
      this.container = container;
      this.canCompose = canCompose;
      this.allowClassChat = allowClassChat;
      this.allowAttachments = allowAttachments;
      this.conversations = [];
      this.activeConvId = null;
      this.pollTimer = null;
      this.offRealtime = null;
      this.contacts = null;
    }

    destroy() {
      if (this.pollTimer) clearInterval(this.pollTimer);
      (this.unsubs || []).forEach((u) => { try { u(); } catch {} });
      this.unsubs = [];
    }

    async render() {
      this.container.innerHTML = `
        <div class="msg-layout" id="msg-layout">
          <div class="msg-list">
            <div class="msg-list-head">
              <h3 style="margin:0;flex:1">Messages</h3>
              ${this.canCompose ? '<button class="btn secondary sm" id="channels-btn" title="Announcement channels">📢</button>' : ''}
              ${this.canCompose ? '<button class="btn sm" id="new-msg">＋ New</button>' : ''}
            </div>
            <div class="search-input" style="padding:8px 12px 2px"><input id="msg-search" placeholder="Search messages…"></div>
            <div id="conv-list"></div>
          </div>
          <div class="msg-thread" id="msg-thread">
            <div class="empty-state" style="margin:auto">
              <div class="big">💬</div>
              <p>Select a conversation to read and reply.<br>New messages appear here in real time.</p>
            </div>
          </div>
        </div>`;

      if (this.canCompose) {
        this.container.querySelector('#new-msg').onclick = () => this.openComposer();
        this.container.querySelector('#channels-btn').onclick = () => this.openChannels();
      }

      // message search
      const search = this.container.querySelector('#msg-search');
      let searchTimer = null;
      search.oninput = () => {
        clearTimeout(searchTimer);
        const q = search.value.trim();
        searchTimer = setTimeout(() => (q ? this.searchMessages(q) : this.loadConversations({ quiet: true })), 350);
      };

      this.unsubs = this.unsubs || [];
      this.unsubs.push(window.Realtime.on('message:new', (data) => {
        if (data && data.conversationId === this.activeConvId) {
          this.loadThread(this.activeConvId, { quiet: true });
        }
        this.loadConversations({ quiet: true });
      }));
      this.unsubs.push(window.Realtime.on('message:deleted', (data) => {
        if (data && data.conversationId === this.activeConvId) {
          this.loadThread(this.activeConvId, { quiet: true });
        }
      }));
      this.unsubs.push(window.Realtime.on('poll', () => {
        this.loadConversations({ quiet: true });
        if (this.activeConvId) this.loadThread(this.activeConvId, { quiet: true });
      }));

      await this.loadConversations();
    }

    async loadConversations({ quiet = false } = {}) {
      try {
        const data = await API.get('/api/messages/conversations');
        this.conversations = data.conversations || [];
      } catch (e) {
        if (!quiet) UI.toast(e.message, 'error');
        return;
      }
      const list = this.container.querySelector('#conv-list');
      if (!list) return;
      if (!this.conversations.length) {
        list.innerHTML = `<div class="empty-state"><div class="big">💬</div>No conversations yet.<br>${this.canCompose ? 'Start one with the ＋ button.' : ''}</div>`;
      } else {
        list.innerHTML = '';
        for (const c of this.conversations) {
          list.appendChild(this.convItem(c));
        }
      }
      this.updateUnreadBadges();
    }

    convItem(c) {
      const unread = c.unread_count || 0;
      const name = UI.esc(c.title || 'Conversation');
      const preview = c.last_message ? (c.last_sender_name ? c.last_sender_name + ': ' : '') + c.last_message : 'No messages yet';
      const time = UI.timeAgo(c.last_message_at || c.created_at);
      const icon = c.type === 'class' ? '🏫' : c.type === 'group' ? '👥' : null;
      const item = UI.el(`<div class="conv-item ${this.activeConvId === c.id ? 'active' : ''}" data-cid="${c.id}">
        <div class="avatar">${icon ? UI.esc(icon) : UI.esc(UI.initials(name))}</div>
        <div class="body">
          <div class="name"><span>${icon ? icon + ' ' : ''}${name}</span><span class="time">${UI.esc(time)}</span></div>
          <div class="preview"><span>${UI.esc(preview)}</span><span class="unread ${unread ? '' : 'hidden'}">${unread > 99 ? '99+' : unread}</span></div>
        </div>
      </div>`);
      item.onclick = () => this.select(c.id);
      return item;
    }

    async select(convId) {
      this.activeConvId = convId;
      window.Realtime.joinConversation(convId);
      // mobile: switch to thread view
      const layout = this.container.querySelector('#msg-layout');
      if (window.innerWidth <= 768) layout.classList.add('thread-open');
      await this.loadThread(convId);
      this.loadConversations({ quiet: true });
    }

    async loadThread(convId, { quiet = false } = {}) {
      let data;
      try {
        data = await API.get(`/api/messages/conversations/${convId}`);
      } catch (e) {
        if (!quiet) UI.toast(e.message, 'error');
        return;
      }
      const thread = this.container.querySelector('#msg-thread');
      if (!thread) return;
      const conv = data.conversation;
      const msgs = data.messages || [];
      const title = conv.type === 'class'
        ? (conv.title || 'Class chat')
        : (msgs[0] ? '' : '');
      // title for direct = other participant name (already set on server)
      const head = UI.el(`<div class="thread-head">
        <button class="back" id="back-btn">←</button>
        <div>
          <strong>${UI.esc(conv.title || 'Conversation')}</strong>
          <div style="font-size:12px;color:var(--muted)">${msgs.length} message${msgs.length === 1 ? '' : 's'}${conv.type === 'channel' ? ' · announcement channel' : ''}</div>
        </div>
        <div class="spacer"></div>
        ${conv.type === 'class' ? '<span class="badge blue">Class chat</span>' : ''}
        ${conv.type === 'broadcast' ? '<span class="badge amber">Broadcast</span>' : ''}
        ${conv.type === 'channel' && conv.created_by === API.getUser().id ? '<span class="badge green">Owner</span>' : ''}
        ${conv.type !== 'channel' ? `
          <button class="btn secondary sm" id="mute-btn" title="Mute / unmute notifications">${conv.muted ? '🔕' : '🔔'}</button>
          <button class="btn secondary sm" id="archive-btn" title="Archive / restore">📦</button>` : ''}
      </div>`);
      const body = UI.el('<div class="thread-messages" id="thread-msgs"></div>');
      for (const m of msgs) body.appendChild(this.msgBubble(m, conv));
      body.scrollTop = body.scrollHeight;

      const composer = UI.el(`<div class="composer">
        ${this.allowAttachments ? '<button class="btn secondary" id="attach-btn" title="Attach a file">📎</button>' : ''}
        <textarea id="msg-input" placeholder="Type a message…" rows="1"></textarea>
        <button class="btn" id="send-btn">Send ➤</button>
      </div>`);
      thread.innerHTML = '';
      thread.appendChild(head);
      thread.appendChild(body);
      thread.appendChild(composer);

      head.querySelector('#back-btn').onclick = () => {
        this.container.querySelector('#msg-layout').classList.remove('thread-open');
      };
      if (conv.type !== 'channel') {
        head.querySelector('#mute-btn').onclick = async () => {
          const muted = !conv.muted;
          try { await API.put(`/api/messages/conversations/${convId}/mute`, { muted }); UI.toast(muted ? 'Conversation muted.' : 'Conversation unmuted.', 'success'); conv.muted = muted; this.loadThread(convId, { quiet: true }); }
          catch (e) { UI.toast(e.message, 'error'); }
        };
        head.querySelector('#archive-btn').onclick = async () => {
          const ok = await UI.confirmDialog(conv.archived ? 'Restore this conversation?' : 'Archive this conversation? It will be hidden from your list (recoverable).', { title: 'Archive', confirmText: conv.archived ? 'Restore' : 'Archive', danger: false });
          if (!ok) return;
          try { await API.put(`/api/messages/conversations/${convId}/archive`, { archived: !conv.archived }); UI.toast('Done.', 'success'); this.loadConversations({ quiet: true }); this.renderEmptyThread(); }
          catch (e) { UI.toast(e.message, 'error'); }
        };
      }

      const input = composer.querySelector('#msg-input');
      const send = () => this.sendMessage(input.value);
      composer.querySelector('#send-btn').onclick = send;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
      if (this.allowAttachments) {
        composer.querySelector('#attach-btn').onclick = () => this.attachFile(convId);
      }

      // mark as read
      try { await API.put(`/api/messages/conversations/${convId}/read`); } catch {}
      window.UI.refreshUnreadCounts();
    }

    msgBubble(m, conv) {
      const me = API.getUser();
      const mine = m.sender_id === me.id;
      // You can delete your own messages; admins & super admins can delete any.
      const canDelete = mine || ['super_admin', 'admin'].includes(me.role);
      const attach = m.attachment_id ? `
        <div class="attach" data-doc="${m.attachment_id}" title="Download ${UI.esc(m.attachment_name || '')}">
          <span>📄</span><span><strong>${UI.esc(m.attachment_name || 'Attachment')}</strong><br><small>${UI.esc(m.attachment_mime || '')} · ${UI.fmtSize(m.attachment_size)} · ⬇ click to download</small></span>
        </div>` : '';
      const bubble = UI.el(`<div class="msg-bubble ${mine ? 'mine' : 'theirs'}">
        ${attach}
        <div class="msg-content">${UI.esc(m.content || '')}${m.edited ? ' <small class="meta" style="opacity:.6">(edited)</small>' : ''}</div>
        <div class="meta"><span>${mine ? 'You' : UI.esc(m.sender_name)}</span><span>${UI.fmtTime(m.created_at)}</span>${mine ? '<span>✓✓</span>' : ''}
          ${mine && !m.attachment_id ? `<button class="msg-del" title="Edit message" data-edit="${m.id}">✏️</button>` : ''}
          ${canDelete ? `<button class="msg-del" title="Delete message" data-del="${m.id}">🗑</button>` : ''}</div>
      </div>`);
      const at = bubble.querySelector('.attach');
      if (at) at.onclick = () => window.DocumentsView && window.DocumentsView.downloadDoc(Number(at.dataset.doc));
      const del = bubble.querySelector('.msg-del[data-del]');
      if (del) del.onclick = async (e) => {
        e.stopPropagation();
        const ok = await UI.confirmDialog('Delete this message?', { title: 'Delete message', confirmText: 'Delete' });
        if (!ok) return;
        try {
          await API.del(`/api/messages/${m.id}`);
          UI.toast('Message deleted.', 'success');
          await this.loadThread(this.activeConvId, { quiet: true });
          this.loadConversations({ quiet: true });
        } catch (err) { UI.toast(err.message, 'error'); }
      };
      const edit = bubble.querySelector('.msg-del[data-edit]');
      if (edit) edit.onclick = async (e) => {
        e.stopPropagation();
        const current = m.content || '';
        const modal = UI.openModal({
          title: 'Edit message',
          body: '<label class="field">Message<textarea id="edit-msg" rows="3">' + UI.esc(current) + '</textarea></label>',
          foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Save</button>',
        });
        modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
        modal.backdrop.querySelector('[data-save]').onclick = async () => {
          const content = modal.backdrop.querySelector('#edit-msg').value.trim();
          if (!content) return UI.toast('Message cannot be empty.', 'error');
          try { await API.put(`/api/messages/${m.id}`, { content }); UI.toast('Message updated.', 'success'); modal.close(); await this.loadThread(this.activeConvId, { quiet: true }); }
          catch (err) { UI.toast(err.message, 'error'); }
        };
      };
      return bubble;
    }

    /** Show an empty thread (used after archiving the open conversation). */
    renderEmptyThread() {
      const thread = this.container.querySelector('#msg-thread');
      if (!thread) return;
      thread.innerHTML = `<div class="empty-state" style="margin:auto">
        <div class="big">💬</div><p>Select a conversation to read and reply.</p></div>`;
      this.activeConvId = null;
    }

    /** Announcement channels browser (subscribe / create). */
    async openChannels() {
      let channels = [];
      try { channels = (await API.get('/api/messages/channels')).channels || []; } catch (e) { return UI.toast(e.message, 'error'); }
      const me = API.getUser();
      let modal;
      modal = UI.openModal({
        title: '📢 Announcement channels',
        wide: true,
        body: `<p class="doc-meta">Channels broadcast school announcements. Subscribe to receive them in your messages.</p>
               <div id="channels-list"></div>
               ${['admin', 'super_admin'].includes(me.role) ? '<button class="btn" id="channel-create" style="margin-top:10px">＋ Create channel</button>' : ''}`,
        foot: '<button class="btn" data-close>Close</button>',
      });
      modal.backdrop.querySelector('[data-close]').onclick = () => modal.close();

      const list = modal.backdrop.querySelector('#channels-list');
      const renderChannels = () => {
        list.innerHTML = '';
        if (!channels.length) { list.innerHTML = '<div class="doc-meta">No channels yet.</div>'; return; }
        for (const c of channels) {
          const row = UI.el(`<div class="doc-item">
            <div style="flex:1;min-width:0">
              <div class="doc-name">📢 ${UI.esc(c.title)}</div>
              <div class="doc-meta">${c.subscriber_count} subscriber${c.subscriber_count === 1 ? '' : 's'} · ${c.post_count} post${c.post_count === 1 ? '' : 's'} · by ${UI.esc(c.creator_name || 'Admin')}</div>
            </div>
            ${c.subscribed
              ? `<button class="btn secondary sm" data-leave="${c.id}">Leave</button>`
              : `<button class="btn sm" data-join="${c.id}">Subscribe</button>`}
          </div>`);
          row.querySelector('[data-join]')?.addEventListener('click', async () => {
            try { await API.post(`/api/messages/channels/${c.id}/subscribe`); UI.toast('Subscribed.', 'success'); c.subscribed = true; renderChannels(); this.loadConversations({ quiet: true }); }
            catch (e) { UI.toast(e.message, 'error'); }
          });
          row.querySelector('[data-leave]')?.addEventListener('click', async () => {
            try { await API.post(`/api/messages/channels/${c.id}/unsubscribe`); UI.toast('Left the channel.', 'success'); c.subscribed = false; renderChannels(); this.loadConversations({ quiet: true }); }
            catch (e) { UI.toast(e.message, 'error'); }
          });
          list.appendChild(row);
        }
      };
      renderChannels();

      const create = modal.backdrop.querySelector('#channel-create');
      if (create) create.onclick = async () => {
        const inner = UI.openModal({
          title: 'Create announcement channel',
          body: '<label class="field">Channel title<input id="ch-title" placeholder="e.g. School News" maxlength="120"></label>',
          foot: '<button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-save>Create</button>',
        });
        inner.backdrop.querySelector('[data-cancel]').onclick = () => inner.close();
        inner.backdrop.querySelector('[data-save]').onclick = async () => {
          const title = inner.backdrop.querySelector('#ch-title').value.trim();
          if (!title) return UI.toast('Enter a channel title.', 'error');
          try {
            const r = await API.post('/api/messages/conversations', { type: 'channel', title });
            UI.toast('Channel created.', 'success');
            inner.close();
            await this.loadConversations({ quiet: true });
            this.select(r.conversation.id);
            modal.close();
          } catch (e) { UI.toast(e.message, 'error'); }
        };
      };
    }

    /** Search my messages and show results in the conversation list. */
    async searchMessages(q) {
      let results;
      try {
        results = (await API.get('/api/messages/search?q=' + encodeURIComponent(q))).messages || [];
      } catch (e) { UI.toast(e.message, 'error'); return; }
      const list = this.container.querySelector('#conv-list');
      if (!list) return;
      if (!results.length) {
        list.innerHTML = `<div class="empty-state" style="padding:26px"><div class="big">🔍</div>No messages match "${UI.esc(q)}"</div>`;
        return;
      }
      list.innerHTML = `<div style="padding:8px 14px;font-size:12px;color:var(--muted);font-weight:700">${results.length} result${results.length === 1 ? '' : 's'} for "${UI.esc(q)}"</div>`;
      for (const r of results) {
        const item = UI.el(`<div class="conv-item" data-cid="${r.conversation_id}">
          <div class="avatar">💬</div>
          <div class="body">
            <div class="name"><span>${UI.esc(r.conversation_title || 'Conversation')}</span><span class="time">${UI.fmtTime(r.created_at)}</span></div>
            <div class="preview"><span>${UI.esc(r.sender_name)}: ${UI.esc(r.content)}</span></div>
          </div>
        </div>`);
        item.onclick = async () => {
          this.container.querySelector('#msg-search').value = '';
          await this.loadConversations({ quiet: true });
          this.select(r.conversation_id);
        };
        list.appendChild(item);
      }
    }

    async sendMessage(text) {
      const input = this.container.querySelector('#msg-input');
      const content = (text || '').trim();
      if (!content || !this.activeConvId) return;
      input.value = '';
      try {
        await API.post('/api/messages', { conversationId: this.activeConvId, content });
        await this.loadThread(this.activeConvId, { quiet: true });
        this.loadConversations({ quiet: true });
      } catch (e) { UI.toast(e.message, 'error'); input.value = content; }
    }

    async attachFile(convId) {
      const input = UI.el('<input type="file" hidden>');
      document.body.appendChild(input);
      input.click();
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        const maxMB = 15;
        if (file.size > maxMB * 1024 * 1024) return UI.toast(`File is too large. Maximum is ${maxMB} MB.`, 'error');
        const form = new FormData();
        form.append('file', file);
        try {
          const up = await API.upload('/api/documents', form);
          await API.post('/api/messages', { conversationId: convId, attachmentId: up.document.id });
          UI.toast('Attachment sent.', 'success');
          await this.loadThread(convId, { quiet: true });
        } catch (e) { UI.toast(e.message, 'error'); }
      };
    }

    async openComposer() {
      if (!this.contacts) {
        try { this.contacts = (await API.get('/api/messages/me/contacts')).contacts; }
        catch (e) { return UI.toast(e.message, 'error'); }
      }
      const contacts = this.contacts;

      let groupsHtml = '';
      if (contacts.groups && contacts.groups.length) {
        groupsHtml = `<label class="field">Send to a group
          <select id="compose-group"><option value="">— Choose a group —</option>
          ${contacts.groups.map((g) => `<option value="${UI.esc(JSON.stringify(g))}">${UI.esc(g.label)}${g.description ? ' (' + UI.esc(g.description) + ')' : ''}</option>`).join('')}
          </select></label>`;
      }

      let individualsHtml = '';
      if (contacts.individuals && contacts.individuals.length) {
        individualsHtml = `<label class="field">Search people
          <input id="compose-search" placeholder="Type a name…"></label>
          <div id="compose-people" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:9px;margin-bottom:10px"></div>`;
      }

      const modal = UI.openModal({
        title: 'New message',
        wide: true,
        body: `
          <p style="margin-top:0">${groupsHtml ? 'You can message a whole group or a single person.' : 'Choose who to message.'}</p>
          ${groupsHtml}
          ${individualsHtml}`,
        foot: `<button class="btn secondary" data-cancel>Cancel</button>`,
      });

      modal.backdrop.querySelector('[data-cancel]').onclick = () => modal.close();
      const searchBox = modal.backdrop.querySelector('#compose-search');
      const peopleBox = modal.backdrop.querySelector('#compose-people');

      const renderPeople = (filter) => {
        const f = (filter || '').toLowerCase();
        const list = contacts.individuals.filter((p) => !f || (p.full_name || '').toLowerCase().includes(f) || (p.childLabel || '').toLowerCase().includes(f));
        if (!list.length) { peopleBox.innerHTML = '<div class="empty-state" style="padding:16px">No matches</div>'; return; }
        peopleBox.innerHTML = '';
        for (const p of list.slice(0, 50)) {
          const row = UI.el(`<div class="conv-item" style="border:none">
            <div class="avatar">${UI.esc(UI.initials(p.full_name))}</div>
            <div class="body">
              <div class="name">${UI.esc(p.full_name)} ${p.role === 'teacher' && p.classLabel ? `<span class="badge blue">${UI.esc(p.classLabel)}</span>` : ''}</div>
              <div class="preview">${p.role ? UI.esc(p.role.replace('_', ' ')) : ''}${p.childLabel ? ' · Parent of ' + UI.esc(p.childLabel) : ''}</div>
            </div>
          </div>`);
          row.onclick = async () => {
            modal.close();
            try {
              const r = await API.post('/api/messages/conversations', { type: 'direct', participantId: p.id });
              await this.loadConversations();
              this.select(r.conversation.id);
            } catch (e) { UI.toast(e.message, 'error'); }
          };
          peopleBox.appendChild(row);
        }
      };
      if (searchBox) {
        searchBox.oninput = () => renderPeople(searchBox.value);
        renderPeople('');
      }

      const groupSel = modal.backdrop.querySelector('#compose-group');
      if (groupSel) {
        groupSel.onchange = async () => {
          if (!groupSel.value) return;
          let g;
          try { g = JSON.parse(groupSel.value); } catch { return; }
          modal.close();
          try {
            let r;
            if (g.type === 'class') {
              r = await API.post('/api/messages/conversations', { type: 'class', classId: g.key });
            } else if (g.type === 'role') {
              // Broadcast to a whole role (admins/super admins only — the API enforces it).
              r = await API.post('/api/messages/conversations', { type: 'broadcast', role: g.key });
              UI.toast(`Broadcast conversation "${r.conversation.title}" opened.`, 'success');
            }
            await this.loadConversations();
            this.select(r.conversation.id);
          } catch (e) { UI.toast(e.message, 'error'); }
        };
      }
    }

    updateUnreadBadges() {
      const total = this.conversations.reduce((s, c) => s + (c.unread_count || 0), 0);
      window.__setNavBadge && window.__setNavBadge('messages', total);
    }

    /** Open (or reuse) a direct conversation with a user and show it. */
    async openDirect(userId) {
      if (!userId) return;
      try {
        const r = await API.post('/api/messages/conversations', { type: 'direct', participantId: userId });
        await this.loadConversations({ quiet: true });
        await this.select(r.conversation.id);
      } catch (e) { UI.toast(e.message, 'error'); }
    }
  }

  window.MessagingView = MessagingView;
})();
