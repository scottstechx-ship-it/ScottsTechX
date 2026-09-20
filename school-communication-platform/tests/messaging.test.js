/**
 * MESSAGING REGRESSION TESTS — the chat as a person actually uses it.
 *
 * Runs the REAL MessagingView against the REAL API in jsdom: open a thread,
 * send, edit, delete, search, mute, archive, attach a file, browse channels —
 * at desktop width and at phone width (thread/back behaviour).
 *
 * Also covers the display bugs a screenshot check misses: day separators
 * computed in the wrong timezone, attachment-only previews rendering blank,
 * and icons assigned to buttons as literal "<svg…>" text.
 *
 * Run: node tests/messaging.test.js      (requires the server on :4000)
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Fixed timezone so the day-separator assertions mean the same thing anywhere:
// the app stores UTC ('YYYY-MM-DD HH:MM:SS') and must group by LOCAL day.
process.env.TZ = 'Africa/Nairobi';   // UTC+3

const BASE = 'http://localhost:4000';
const ROOT = path.join(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok ${name}`);
  else { failures++; console.log(`  x ${name}${detail ? ' — ' + detail : ''}`); }
}

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login ${username}: ${JSON.stringify(data)}`);
  const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map((c) => c.split(';')[0]);
  const token = data.token || (data.data && data.data.token);
  const csrfToken = data.csrfToken || (data.data && data.data.csrfToken);
  return { cookies, token, csrfToken };
}

/** Authenticated JSON call straight to the API (test setup / assertions). */
async function api(creds, url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('cookie', creds.cookies.join('; '));
  if (creds.csrfToken) headers.set('x-csrf-token', creds.csrfToken);   // cookie sessions need it
  if (creds.token) headers.set('authorization', `Bearer ${creds.token}`);
  const res = await fetch(`${BASE}${url}`, { ...options, headers });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

/** Boot a dashboard in jsdom and open its Messages view. */
async function bootMessaging({ username, password, dir, width = 1280 }) {
  const creds = await login(username, password);
  const html = fs.readFileSync(path.join(ROOT, 'frontend', dir, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: `${BASE}/${dir}/`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const cookieHeader = creds.cookies.join('; ');
  for (const c of creds.cookies) { try { window.document.cookie = c; } catch { /* httpOnly */ } }
  const rawFetch = globalThis.fetch;
  window.fetch = (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (cookieHeader && !headers.has('cookie')) headers.set('cookie', cookieHeader);
    return rawFetch(input, { ...init, headers });
  };
  window.FormData = globalThis.FormData;
  window.Blob = globalThis.Blob;
  window.File = globalThis.File;
  window.Headers = globalThis.Headers;
  window.URL = globalThis.URL;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.confirm = () => true;
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: width < 700 ? 780 : 900, configurable: true });

  const errors = [];
  dom.virtualConsole.on('jsdomError', (e) => errors.push(e.message || String(e)));
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  window.addEventListener('unhandledrejection', (e) => errors.push('unhandled rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason))));

  const files = ['js/config.js', 'js/icons.js', 'js/api.js', 'js/theme.js', 'js/ui.js', 'js/socket-client.js',
    'js/components/messaging.js', 'js/components/documents.js', `${dir}/app.js`];
  for (const rel of files) {
    const full = path.join(ROOT, 'frontend', rel);
    if (!fs.existsSync(full)) continue;
    try { window.eval(fs.readFileSync(full, 'utf8')); } catch (e) { errors.push(`eval ${rel}: ${e.message}`); }
  }
  await wait(1500);
  window.__navHandler('messages');
  await wait(1800);
  return { window, errors, creds };
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

(async () => {
  const teacher = await login('teacher1', 'Teacher@123');

  // Deterministic fixtures: a direct conversation with an admin, found through
  // the same contacts endpoint the "New message" dialog uses.
  const contacts = (await api(teacher, '/api/messages/me/contacts')).data.contacts;
  const someone = contacts.individuals.find((p) => p.role === 'admin') || contacts.individuals[0];
  const made = await api(teacher, '/api/messages/conversations', {
    method: 'POST', body: JSON.stringify({ type: 'direct', participantId: someone.id }),
  });
  const convId = made.data.conversation.id;

  console.log('\n== teacher: open a conversation and send ==');
  {
    const { window, errors } = await bootMessaging({ username: 'teacher1', password: 'Teacher@123', dir: 'platform/teacher' });
    const doc = window.document;

    check('messages view renders', !!doc.querySelector('#msg-layout'));
    const item = doc.querySelector(`.conv-item[data-cid="${convId}"]`);
    check('conversation appears in the list', !!item, `looked for data-cid=${convId}`);

    if (item) {
      item.click();
      await wait(1600);
      const thread = doc.querySelector('#msg-thread');
      check('thread opens with a composer', !!thread.querySelector('#msg-input'));
      check('message list is present', !!thread.querySelector('#thread-msgs'));

      // send
      const input = thread.querySelector('#msg-input');
      const text = 'Hello from the messaging test ' + Date.now();
      input.value = text;
      const before = errors.length;
      thread.querySelector('#send-btn').click();
      await wait(2200);
      const bubbles = [...thread.querySelectorAll('.msg-bubble')];
      check('sent message appears in the thread', bubbles.some((b) => clean(b.textContent).includes(text)), `${bubbles.length} bubbles`);
      check('composer is cleared after sending', input.value === '');
      check('no leftover "sending…" bubble', !thread.querySelector('.msg-bubble.pending'));
      check('sending raises no error', errors.length === before, errors.slice(before).slice(0, 2).join(' | '));

      const daySep = thread.querySelector('.day-sep span');
      check('a day separator is shown', !!daySep, daySep ? daySep.textContent : 'none');
      check('today\'s messages are grouped under "Today"', !!daySep && /Today/.test(daySep.textContent), daySep ? daySep.textContent : 'none');

      // edit
      const bubble = bubbles.find((b) => clean(b.textContent).includes(text));
      const editBtn = bubble && bubble.querySelector('[data-edit]');
      check('own message offers Edit', !!editBtn);
      if (editBtn) {
        const beforeEdit = errors.length;
        editBtn.click();
        await wait(500);
        const modal = [...doc.querySelectorAll('.modal-backdrop')].pop();
        check('edit dialog opens', !!modal && !!modal.querySelector('#edit-msg'));
        if (modal) {
          modal.querySelector('#edit-msg').value = text + ' (edited)';
          modal.querySelector('[data-save]').click();
          await wait(1800);
          check('edited text is saved', clean(doc.querySelector('#thread-msgs').textContent).includes(text + ' (edited)'));
          check('edited message is marked as edited', /\(edited\)/.test(clean(doc.querySelector('#thread-msgs').textContent)));
          check('editing raises no error', errors.length === beforeEdit, errors.slice(beforeEdit).slice(0, 2).join(' | '));
          doc.querySelectorAll('.modal-backdrop .close-x').forEach((x) => x.click());
          await wait(300);
        }
      }
    }
    window.close();
  }

  console.log('\n== teacher: delete, mute, archive ==');
  {
    const { window, errors } = await bootMessaging({ username: 'teacher1', password: 'Teacher@123', dir: 'platform/teacher' });
    const doc = window.document;
    doc.querySelector(`.conv-item[data-cid="${convId}"]`).click();
    await wait(1600);
    const thread = doc.querySelector('#msg-thread');
    const input = thread.querySelector('#msg-input');

    // a throwaway message to delete
    const doomed = 'delete me ' + Date.now();
    input.value = doomed;
    thread.querySelector('#send-btn').click();
    await wait(2000);
    const bubble = [...thread.querySelectorAll('.msg-bubble')].find((b) => clean(b.textContent).includes(doomed));
    check('message to delete is present', !!bubble);
    const delBtn = bubble && bubble.querySelector('[data-del]');
    check('own message offers Delete', !!delBtn);
    if (delBtn) {
      delBtn.click();
      await wait(500);
      const modal = [...doc.querySelectorAll('.modal-backdrop')].pop();
      const yes = modal && modal.querySelector('[data-yes]');
      check('delete asks for confirmation', !!yes);
      if (yes) {
        yes.click();
        await wait(1800);
        check('deleted message is gone from the thread', !clean(doc.querySelector('#thread-msgs').textContent).includes(doomed));
      }
    }

    // mute: the button must still be an icon AFTER the toggle (it used to be
    // replaced with literal "<svg …>" text)
    const mute = thread.querySelector('#mute-btn');
    check('thread offers Mute', !!mute);
    if (mute) {
      const before = errors.length;
      mute.click();
      await wait(1400);
      check('mute button keeps its icon', !!mute.querySelector('svg'), `innerHTML: ${mute.innerHTML.slice(0, 60)}`);
      check('mute button is not literal markup text', !mute.textContent.includes('<svg'));
      check('mute toggles without error', errors.length === before, errors.slice(before).slice(0, 2).join(' | '));
      mute.click();                          // back to unmuted
      await wait(1200);
    }

    // archive: hides the conversation and clears the thread
    const archive = thread.querySelector('#archive-btn');
    check('thread offers Archive', !!archive);
    if (archive) {
      archive.click();
      await wait(400);
      const modal = [...doc.querySelectorAll('.modal-backdrop')].pop();
      const yes = modal && modal.querySelector('[data-yes]');
      if (yes) yes.click();
      await wait(1800);
      check('archived conversation leaves the list', !doc.querySelector(`.conv-item[data-cid="${convId}"]`));
      check('archiving clears the open thread', !doc.querySelector('#msg-input'));
      // restore for the next run
      await api(teacher, `/api/messages/conversations/${convId}/archive`, { method: 'PUT', body: JSON.stringify({ archived: false }) });
    }
    window.close();
  }

  console.log('\n== teacher: search ==');
  {
    const { window, errors } = await bootMessaging({ username: 'teacher1', password: 'Teacher@123', dir: 'platform/teacher' });
    const doc = window.document;
    const marker = 'searchable' + Date.now();
    await api(teacher, '/api/messages', { method: 'POST', body: JSON.stringify({ conversationId: convId, content: marker }) });

    const box = doc.querySelector('#msg-search');
    check('search box is present', !!box);
    if (box) {
      const before = errors.length;
      box.value = marker;
      box.dispatchEvent(new window.Event('input', { bubbles: true }));
      await wait(1600);
      const list = doc.querySelector('#conv-list');
      check('search finds the message', clean(list.textContent).includes('result'), clean(list.textContent).slice(0, 80));
      box.value = '';
      box.dispatchEvent(new window.Event('input', { bubbles: true }));
      await wait(1500);
      check('clearing the search restores the conversation list', !!doc.querySelector(`.conv-item[data-cid="${convId}"]`));
      check('searching raises no error', errors.length === before, errors.slice(before).slice(0, 2).join(' | '));
    }
    window.close();
  }

  console.log('\n== unread badges ==');
  {
    // an admin writes to the teacher; the teacher's dashboard must show the
    // count on the Messages tab (the fetched counts used to reach nobody)
    const admin = await login('admin', 'Admin@123');
    await api(admin, '/api/messages', { method: 'POST', body: JSON.stringify({ conversationId: convId, content: 'badge check ' + Date.now() }) });

    const { window, errors } = await bootMessaging({ username: 'teacher1', password: 'Teacher@123', dir: 'platform/teacher' });
    const doc = window.document;
    await window.UI.refreshUnreadCounts();
    await wait(400);
    const badge = doc.querySelector('[data-nav-badge="messages"]');
    check('the Messages tab carries an unread badge', !!badge && badge.style.display !== 'none', badge ? `display=${badge.style.display} text=${badge.textContent}` : 'no badge node');
    check('the badge shows a real count', !!badge && Number(badge.textContent) > 0, badge ? badge.textContent : '');
    check('badge refresh raises no error', errors.length === 0, errors.slice(0, 2).join(' | '));

    // reading a notification must lower its badge too (same wiring)
    const notifBadge = doc.querySelector('[data-nav-badge="notifications"]');
    const before = notifBadge && notifBadge.style.display !== 'none' ? Number(notifBadge.textContent) : 0;
    if (before > 0) {
      window.__navHandler('notifications');
      await wait(1500);
      const item = doc.querySelector('#nt-list .notif-item');
      check('the notifications view lists the unread item', !!item);
      if (item) {
        item.click();
        await wait(1200);
        const after = Number(notifBadge.textContent) || 0;
        check('reading a notification lowers its badge', after === before - 1 || notifBadge.style.display === 'none',
          `before=${before} after=${after} display=${notifBadge.style.display}`);
      }
    }
    window.close();
  }

  console.log('\n== teacher: attachments ==');
  {
    // upload a document as the teacher, then send it as an attachment-only message
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('Hello attachment')], { type: 'text/plain' }), 'note.txt');
    form.append('name', 'note.txt');
    const upload = await fetch(`${BASE}/api/documents`, {
      method: 'POST',
      headers: {
        cookie: teacher.cookies.join('; '),
        'x-csrf-token': teacher.csrfToken,
        authorization: `Bearer ${teacher.token}`,
      },
      body: form,
    });
    const up = await upload.json();
    const docId = up.document && up.document.id;
    check('test document uploaded', !!docId, JSON.stringify(up).slice(0, 120));
    if (docId) {
      await api(teacher, '/api/messages', { method: 'POST', body: JSON.stringify({ conversationId: convId, attachmentId: docId }) });
      const convs = (await api(teacher, '/api/messages/conversations')).data.conversations;
      const mine = convs.find((c) => c.id === convId);
      const { window } = await bootMessaging({ username: 'teacher1', password: 'Teacher@123', dir: 'platform/teacher' });
      const item = window.document.querySelector(`.conv-item[data-cid="${convId}"]`);
      const preview = item ? clean(item.querySelector('.preview').textContent) : '';
      check('attachment-only message shows a preview, not a blank row',
        !/^[^:]*:?\s*$/.test(preview) && /attachment|note\.txt/i.test(preview),
        `preview: "${preview}"`);
      check('API also reports the last message as an attachment', !!mine && !!mine.last_attachment_name, JSON.stringify(mine && mine.last_message));
      if (item) {
        item.click();
        await wait(1600);
        const attach = window.document.querySelector('#thread-msgs .attach');
        check('attachment renders in the thread', !!attach, 'no .attach element');
      }
      window.close();
    }
  }

  console.log('\n== super admin: channels ==');
  {
    // the owner of this channel is the super admin, so the dialog must NOT
    // offer them a "Leave" button (the API refuses it)
    const sa = await login('superadmin', 'SuperAdmin@123');
    await api(sa, '/api/messages/conversations', { method: 'POST', body: JSON.stringify({ type: 'channel', title: 'Test Announcements' }) });
    const { window, errors } = await bootMessaging({ username: 'superadmin', password: 'SuperAdmin@123', dir: 'platform/super-admin' });
    const doc = window.document;
    const btn = doc.querySelector('#channels-btn');
    check('channels button is present for admins', !!btn);
    if (btn) {
      const before = errors.length;
      btn.click();
      await wait(1500);
      const modal = [...doc.querySelectorAll('.modal-backdrop')].pop();
      check('channels dialog opens', !!modal && !!modal.querySelector('#channels-list'));
      const rows = modal ? [...modal.querySelectorAll('#channels-list .doc-item')] : [];
      check('channels list renders', rows.length > 0, `${rows.length} rows`);
      const ownRows = rows.filter((r) => /Owner/.test(clean(r.textContent)));
      const ownRow = ownRows[0];
      check('the channels you own are labelled "Owner"', ownRows.length > 0, `${rows.length} rows, ${ownRows.length} owned`);
      check('the owner is not offered a Leave button', !!ownRow && !ownRow.querySelector('[data-leave]'),
        ownRow ? clean(ownRow.textContent).slice(0, 90) : 'no owned row');
      check('channels dialog raises no error', errors.length === before, errors.slice(before).slice(0, 2).join(' | '));
      doc.querySelectorAll('.modal-backdrop .close-x').forEach((x) => x.click());
    }
    window.close();
  }

  console.log('\n== teacher: announcement channel is read-only ==');
  {
    const channels = (await api(teacher, '/api/messages/channels')).data.channels;
    const ch = channels.find((c) => c.title === 'Test Announcements');
    check('the test channel exists', !!ch);
    if (ch) {
      await api(teacher, `/api/messages/channels/${ch.id}/subscribe`, { method: 'POST' });
      const { window, errors } = await bootMessaging({ username: 'teacher1', password: 'Teacher@123', dir: 'platform/teacher' });
      const doc = window.document;
      const item = doc.querySelector(`.conv-item[data-cid="${ch.id}"]`);
      check('a subscribed channel appears in the conversation list', !!item);
      if (item) {
        const before = errors.length;
        item.click();
        await wait(1600);
        const thread = doc.querySelector('#msg-thread');
        check('a channel the teacher cannot post in has no dead composer', !thread.querySelector('#msg-input'));
        check('the thread explains who can post', /only the channel owner and administrators can post/i.test(clean(thread.textContent)),
          clean(thread.textContent).slice(0, 120));
        check('opening a read-only channel raises no error', errors.length === before, errors.slice(before).slice(0, 2).join(' | '));
      }
      window.close();
    }
  }

  console.log('\n== phone width: thread, back button, nav ==');
  {
    const { window, errors } = await bootMessaging({ username: 'teacher1', password: 'Teacher@123', dir: 'platform/teacher', width: 390 });
    const doc = window.document;
    const layout = doc.querySelector('#msg-layout');
    check('phone layout starts on the conversation list', !layout.classList.contains('thread-open'));

    // the phone's own bottom nav must carry the unread count as well
    await window.UI.refreshUnreadCounts();
    await wait(400);
    const bnBadge = doc.querySelector('[data-bn-badge="messages"]');
    check('the phone bottom nav shows the unread badge', !!bnBadge && bnBadge.style.display !== 'none',
      bnBadge ? `display=${bnBadge.style.display} text=${bnBadge.textContent}` : 'no badge node');

    const item = doc.querySelector(`.conv-item[data-cid="${convId}"]`);
    check('conversation list is usable on a phone', !!item);
    if (item) {
      item.click();
      await wait(1600);
      check('opening a chat switches to the thread view', layout.classList.contains('thread-open'));
      check('the phone shows a Back button in the thread', !!doc.querySelector('#back-btn'));
      doc.querySelector('#back-btn').click();
      await wait(300);
      check('Back returns to the conversation list', !layout.classList.contains('thread-open'));

      // opening again then leaving the view must clear the chat state
      item.click();
      await wait(1200);
      check('the phone hides the bottom nav while chatting', doc.body.classList.contains('chat-open'));
      window.__navHandler('home');
      await wait(1200);
      check('leaving the messages view clears the chat mode', !doc.body.classList.contains('chat-open'));
      check('phone chat raises no error', errors.length === 0, errors.slice(0, 2).join(' | '));
    }
    window.close();
  }

  console.log('\n== units: day grouping uses the local calendar ==');
  {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<div></div>', { url: BASE, runScripts: 'outside-only' });
    const w = dom.window;
    for (const rel of ['js/config.js', 'js/api.js', 'js/icons.js', 'js/ui.js', 'js/components/messaging.js']) {
      const full = path.join(ROOT, 'frontend', rel);
      if (fs.existsSync(full)) w.eval(fs.readFileSync(full, 'utf8'));
    }
    const view = Object.create(w.MessagingView.prototype);
    if (typeof view.dayKey === 'function') {
      // 22:30 UTC on the 20th is 01:30 on the 21st in Nairobi (UTC+3)
      check('a late-evening UTC message is grouped with the local day', view.dayKey('2026-09-20 22:30:00') === '2026-09-21',
        `got ${view.dayKey('2026-09-20 22:30:00')}`);
      check('an early-morning UTC message stays on its local day', view.dayKey('2026-09-21 05:00:00') === '2026-09-21',
        `got ${view.dayKey('2026-09-21 05:00:00')}`);
    } else {
      check('day grouping is computed from a local-day helper', false, 'MessagingView.dayKey missing');
    }
    if (typeof view.dayKey === 'function' && typeof view.dayLabel === 'function') {
      check('dayLabel labels today as "Today"', view.dayLabel(view.dayKey(new Date().toISOString())) === 'Today', view.dayLabel(view.dayKey(new Date().toISOString())));
    }
    w.close();
  }

  console.log(failures === 0
    ? '\nOK MESSAGING WORKS (send, edit, delete, search, attachments, channels, mobile)'
    : `\nFAIL ${failures} messaging check(s)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('harness', e); process.exit(1); });
