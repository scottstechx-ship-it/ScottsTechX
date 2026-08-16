/**
 * /api/messages & /api/messages/conversations — the messaging engine.
 *
 * One-to-one, class and group chats. Read receipts, unread counters,
 * timestamps, attachments, search. All permission checks happen here.
 */
const express = require('express');
const router = express.Router();
const { all, get, run, tx } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { cleanString, asInt } = require('../middleware/validate');
const { log } = require('../services/audit');
const { notify, notifyMany } = require('../services/notify');
const {
  canMessageUser,
  canCreateConversationType,
  isParticipant,
  classConversationUserIds,
  classIdsForTeacherUserId,
  classIdForStudentUserId,
  teachersForClass,
  classTeacherUserId,
  classIdsForParentUserId,
  studentUserIdsForClass,
} = require('../services/permissions');

let io = null;
function setIO(s) { io = s; }

function emitToConversation(convId, event, payload) {
  if (!io) return;
  io.to(`conversation:${convId}`).emit(event, payload);
}

/** User summary used in conversation lists. */
function userBrief(id) {
  return get('SELECT id, full_name, role, profile_picture FROM users WHERE id = ?', [id]) || { id, full_name: 'Unknown' };
}

/** Build the conversation list for a user with last message + unread counts. */
function conversationsForUser(userId, includeArchived = false) {
  const archivedSql = includeArchived ? '' : 'AND cp.archived = 0';
  return all(
    `SELECT c.id, c.type, c.title, c.class_id, c.created_at,
            cp.archived, cp.muted,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
            (SELECT COUNT(*) FROM messages m
              WHERE m.conversation_id = c.id AND m.sender_id != ?
                AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)
            ) AS unread_count,
            (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
            (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_at,
            (SELECT u.full_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_sender_name
     FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id
     WHERE cp.user_id = ? ${archivedSql}
     ORDER BY COALESCE(last_message_at, c.created_at) DESC`,
    [userId, userId, userId]
  );
}

/** Participants of a conversation (excluding a given user). */
function participantsFor(convId, excludeUserId = null) {
  let rows;
  if (excludeUserId) {
    rows = all(
      `SELECT u.id, u.full_name, u.role, u.profile_picture, u.status FROM conversation_participants cp
       JOIN users u ON u.id = cp.user_id WHERE cp.conversation_id = ? AND cp.user_id != ?`,
      [convId, excludeUserId]
    );
  } else {
    rows = all(
      `SELECT u.id, u.full_name, u.role, u.profile_picture, u.status FROM conversation_participants cp
       JOIN users u ON u.id = cp.user_id WHERE cp.conversation_id = ?`, [convId]
    );
  }
  return rows;
}

/** GET /api/messages/conversations */
router.get('/conversations', authenticate, (req, res) => {
  const includeArchived = req.query.includeArchived === '1';
  const conversations = conversationsForUser(req.user.id, includeArchived);
  for (const c of conversations) {
    if (c.type === 'direct') {
      const others = participantsFor(c.id, req.user.id);
      c.title = others[0] ? others[0].full_name : c.title;
      c.avatar = others[0] ? others[0].profile_picture : null;
      c.participants = others;
    } else {
      const participants = participantsFor(c.id, req.user.id);
      c.participants = participants.slice(0, 8); // cap payload for large groups
      c.memberCount = participants.length;
      if (c.type === 'class' && c.class_id) {
        const cls = get('SELECT name, stream FROM classes WHERE id = ?', [c.class_id]);
        c.title = cls ? `${cls.name} ${cls.stream}` : (c.title || 'Class Chat');
      }
      if (c.type === 'broadcast') c.broadcast = true;
    }
  }
  res.json({ conversations });
});

/** GET /api/messages/conversations/:id — full thread with read status. */
router.get('/conversations/:id', authenticate, (req, res) => {
  const convId = asInt(req.params.id);
  const conv = get('SELECT * FROM conversations WHERE id = ?', [convId]);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  if (!isParticipant(req.user.id, convId)) {
    return res.status(403).json({ error: 'You do not have access to this conversation.' });
  }

  const messages = all(
    `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.attachment_id, m.created_at, m.edited,
            u.full_name AS sender_name, u.role AS sender_role,
            d.name AS attachment_name, d.mime_type AS attachment_mime, d.size AS attachment_size,
            (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?) AS is_read_by_me
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     LEFT JOIN documents d ON d.id = m.attachment_id
     WHERE m.conversation_id = ?
     ORDER BY m.id ASC LIMIT 500`, [req.user.id, convId]
  );

  res.json({ conversation: conv, messages });
});

/** GET /api/messages/search?q= */
router.get('/search', authenticate, (req, res) => {
  const q = cleanString(req.query.q, 200);
  if (!q) return res.json({ messages: [] });
  const messages = all(
    `SELECT m.id, m.content, m.created_at, c.id AS conversation_id, c.type AS conversation_type,
            u.full_name AS sender_name,
            CASE WHEN c.type = 'direct' THEN
              (SELECT u2.full_name FROM conversation_participants cp2
               JOIN users u2 ON u2.id = cp2.user_id
               WHERE cp2.conversation_id = c.id AND cp2.user_id != ? LIMIT 1)
            ELSE c.title END AS conversation_title
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
     JOIN users u ON u.id = m.sender_id
     WHERE m.content LIKE ?
     ORDER BY m.created_at DESC LIMIT 100`,
    [req.user.id, req.user.id, `%${q}%`]
  );
  res.json({ messages });
});

/** GET /api/messages/unread-count */
router.get('/unread-count', authenticate, (req, res) => {
  const row = get(
    `SELECT COUNT(*) AS unread FROM messages m
     JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
     WHERE m.sender_id != ?
       AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)`,
    [req.user.id, req.user.id, req.user.id]
  );
  res.json({ unread: row ? row.unread : 0 });
});

/**
 * POST /api/messages/conversations
 * body: { type: 'direct'|'class'|'group', participantIds?, classId?, title? }
 */
router.post('/conversations', authenticate, (req, res) => {
  const type = cleanString(req.body.type, 10);
  if (!['direct', 'class', 'group', 'broadcast', 'channel'].includes(type)) {
    return res.status(400).json({ error: 'type must be direct, class, group, broadcast or channel.' });
  }
  if (!canCreateConversationType(req.user, type)) {
    return res.status(403).json({ error: 'You do not have permission to create this type of conversation.' });
  }

  if (type === 'direct') {
    const otherId = asInt(req.body.participantId || (req.body.participantIds && req.body.participantIds[0]));
    if (!otherId || otherId === req.user.id) {
      return res.status(400).json({ error: 'Select another user to message.' });
    }
    const other = get('SELECT id, full_name, role, status FROM users WHERE id = ?', [otherId]);
    if (!other) return res.status(404).json({ error: 'The selected user does not exist.' });
    if (!canMessageUser(req.user, other)) {
      return res.status(403).json({ error: 'You are not permitted to message this person.' });
    }

    // Reuse an existing direct conversation if present.
    const existing = get(
      `SELECT c.id FROM conversations c
       JOIN conversation_participants a ON a.conversation_id = c.id AND a.user_id = ?
       JOIN conversation_participants b ON b.conversation_id = c.id AND b.user_id = ?
       WHERE c.type = 'direct'
         AND (SELECT COUNT(*) FROM conversation_participants cp WHERE cp.conversation_id = c.id) = 2`,
      [req.user.id, otherId]
    );
    if (existing) return res.json({ conversation: get('SELECT * FROM conversations WHERE id = ?', [existing.id]), created: false });

    const convId = tx(() => {
      const info = run('INSERT INTO conversations (type, title, created_by) VALUES (\'direct\', ?, ?)', [other.full_name, req.user.id]);
      run('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [info.lastInsertRowid, req.user.id]);
      run('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [info.lastInsertRowid, otherId]);
      return info.lastInsertRowid;
    });
    log(req.user, 'MESSAGE_STARTED', `Started a conversation with ${other.full_name}`, req.ip);
    return res.status(201).json({ conversation: get('SELECT * FROM conversations WHERE id = ?', [convId]), created: true });
  }

  if (type === 'class') {
    const classId = asInt(req.body.classId);
    const cls = get('SELECT id, name, stream FROM classes WHERE id = ?', [classId]);
    if (!cls) return res.status(404).json({ error: 'Class not found.' });
    if (req.user.role === 'teacher' && !classIdsForTeacherUserId(req.user.id).includes(classId)) {
      return res.status(403).json({ error: 'You can only create chats for your own classes.' });
    }
    const existing = get('SELECT id FROM conversations WHERE type = \'class\' AND class_id = ?', [classId]);
    if (existing) return res.json({ conversation: get('SELECT * FROM conversations WHERE id = ?', [existing.id]), created: false });

    const memberIds = classConversationUserIds(classId);
    const convId = tx(() => {
      const info = run('INSERT INTO conversations (type, title, class_id, created_by) VALUES (\'class\', ?, ?, ?)',
        [`${cls.name} ${cls.stream}`, classId, req.user.id]);
      for (const uid of memberIds) {
        run('INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [info.lastInsertRowid, uid]);
      }
      return info.lastInsertRowid;
    });
    log(req.user, 'CLASS_CHAT_CREATED', `Created class chat for ${cls.name} ${cls.stream}`, req.ip);
    return res.status(201).json({ conversation: get('SELECT * FROM conversations WHERE id = ?', [convId]), created: true });
  }

  if (type === 'channel') {
    // Announcement channel: admins create, anyone may subscribe, only the
    // creator and admins post. Good for school-wide announcements.
    if (!['super_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only administrators can create announcement channels.' });
    }
    const title = cleanString(req.body.title, 120);
    if (!title) return res.status(400).json({ error: 'Channel title is required.' });
    const existing = get('SELECT id FROM conversations WHERE type = \'channel\' AND lower(title) = lower(?)', [title]);
    if (existing) return res.json({ conversation: get('SELECT * FROM conversations WHERE id = ?', [existing.id]), created: false });
    const convId = tx(() => {
      const info = run('INSERT INTO conversations (type, title, created_by) VALUES (\'channel\', ?, ?)', [title, req.user.id]);
      run('INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [info.lastInsertRowid, req.user.id]);
      return info.lastInsertRowid;
    });
    log(req.user, 'CHANNEL_CREATED', `Created announcement channel "${title}"`, req.ip);
    return res.status(201).json({ conversation: get('SELECT * FROM conversations WHERE id = ?', [convId]), created: true });
  }

  if (type === 'broadcast') {
    // Send to an entire role: all teachers / all students / all parents / all admins.
    // Only super admins and admins may broadcast. (Teachers use class chats instead.)
    if (!['super_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only administrators can broadcast to a whole group.' });
    }
    const role = cleanString(req.body.role, 20);
    if (!['teacher', 'student', 'parent', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role must be teacher, student, parent or admin.' });
    }
    const roleMembers = all('SELECT id FROM users WHERE role = ? AND status = \'active\'', [role]).map((r) => r.id);
    // Admins can always participate in broadcasts, as can the creator.
    const staffAdmins = all("SELECT id FROM users WHERE role IN ('admin','super_admin') AND status = 'active'").map((r) => r.id);
    const members = [...new Set([...roleMembers, ...staffAdmins, req.user.id])];
    if (!members.length) {
      return res.status(400).json({ error: 'There are no active users in that group yet.' });
    }
    const title = 'All ' + role.replace('_', ' ') + 's';
    const existing = get('SELECT id FROM conversations WHERE type = \'broadcast\' AND title = ?', [title]);
    if (existing) {
      return res.json({ conversation: get('SELECT * FROM conversations WHERE id = ?', [existing.id]), created: false });
    }
    const convId = tx(() => {
      const info = run('INSERT INTO conversations (type, title, created_by) VALUES (\'broadcast\', ?, ?)', [title, req.user.id]);
      for (const uid of members) {
        run('INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [info.lastInsertRowid, uid]);
      }
      return info.lastInsertRowid;
    });
    log(req.user, 'BROADCAST_CREATED', `Opened broadcast conversation "${title}"`, req.ip);
    return res.status(201).json({ conversation: get('SELECT * FROM conversations WHERE id = ?', [convId]), created: true });
  }

  // group
  const ids = (req.body.participantIds || []).map(asInt).filter((x) => x && x !== req.user.id);
  if (ids.length < 1) return res.status(400).json({ error: 'Select at least one participant.' });
  const title = cleanString(req.body.title, 120) || 'Group Chat';
  for (const uid of ids) {
    const u = get('SELECT * FROM users WHERE id = ?', [uid]);
    if (!u) return res.status(404).json({ error: 'A selected user does not exist.' });
    if (!canMessageUser(req.user, u)) {
      return res.status(403).json({ error: `You are not permitted to message ${u.full_name}.` });
    }
  }
  const convId = tx(() => {
    const info = run('INSERT INTO conversations (type, title, created_by) VALUES (\'group\', ?, ?)', [title, req.user.id]);
    run('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [info.lastInsertRowid, req.user.id]);
    for (const uid of [...new Set(ids)]) {
      run('INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [info.lastInsertRowid, uid]);
    }
    return info.lastInsertRowid;
  });
  log(req.user, 'GROUP_CREATED', `Created group chat "${title}"`, req.ip);
  return res.status(201).json({ conversation: get('SELECT * FROM conversations WHERE id = ?', [convId]), created: true });
});

/**
 * POST /api/messages — send a message.
 * body: { conversationId, content?, attachmentId? }
 */
router.post('/', authenticate, (req, res) => {
  const convId = asInt(req.body.conversationId);
  const content = cleanString(req.body.content, 4000);
  const attachmentId = asInt(req.body.attachmentId);

  if (!convId) return res.status(400).json({ error: 'conversationId is required.' });
  if (!content && !attachmentId) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }
  const conv = get('SELECT * FROM conversations WHERE id = ?', [convId]);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  if (!isParticipant(req.user.id, convId)) {
    return res.status(403).json({ error: 'You do not have access to this conversation.' });
  }
  // Channels: only the creator and admins may post.
  if (conv.type === 'channel' && req.user.id !== conv.created_by && !['super_admin', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only the channel owner and administrators can post here.' });
  }
  if (attachmentId) {
    const doc = get('SELECT * FROM documents WHERE id = ?', [attachmentId]);
    if (!doc) return res.status(404).json({ error: 'Attachment not found.' });
    if (doc.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only attach your own documents.' });
    }
  }

  // Insert the message AND — when it carries an attachment — grant every
  // participant of the conversation access to that document, so the people or
  // group the file was sent to can download/preview it.
  const info = tx(() => {
    const row = run(
      'INSERT INTO messages (conversation_id, sender_id, content, attachment_id) VALUES (?, ?, ?, ?)',
      [convId, req.user.id, content, attachmentId || null]
    );
    if (attachmentId) {
      const participantIds = all(
        'SELECT user_id FROM conversation_participants WHERE conversation_id = ?',
        [convId]
      ).map((r) => r.user_id);
      for (const uid of participantIds) {
        run('INSERT OR IGNORE INTO document_access (document_id, target_type, target_id) VALUES (?, ?, ?)',
          [attachmentId, 'user', String(uid)]);
      }
    }
    return row;
  });
  const message = get(
    `SELECT m.*, u.full_name AS sender_name, u.role AS sender_role,
            d.name AS attachment_name, d.mime_type AS attachment_mime, d.size AS attachment_size, d.id AS attachment_id
     FROM messages m JOIN users u ON u.id = m.sender_id
     LEFT JOIN documents d ON d.id = m.attachment_id
     WHERE m.id = ?`, [info.lastInsertRowid]
  );

  // Notify other participants + socket events (skip users who muted the conversation).
  const others = all(
    `SELECT cp.user_id FROM conversation_participants cp
     WHERE cp.conversation_id = ? AND cp.user_id != ? AND cp.muted = 0`,
    [convId, req.user.id]
  ).map((r) => r.user_id);
  notifyMany(others, 'message', `${req.user.full_name} sent you a message`,
    content || 'Sent an attachment', '/messages');

  emitToConversation(convId, 'message:new', { message, conversationId: convId });
  if (io) for (const uid of others) io.to(`user:${uid}`).emit('message', { conversationId: convId, message });

  res.status(201).json({ message });
});

function linkForRole(conv) {
  return '/messages';
}

/** PUT /api/messages/conversations/:id/read — mark all messages read. */
router.put('/conversations/:id/read', authenticate, (req, res) => {
  const convId = asInt(req.params.id);
  if (!isParticipant(req.user.id, convId)) {
    return res.status(403).json({ error: 'You do not have access to this conversation.' });
  }
  tx(() => {
    const unread = all(
      `SELECT m.id FROM messages m WHERE m.conversation_id = ? AND m.sender_id != ?
         AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?)`,
      [convId, req.user.id, req.user.id]
    );
    for (const m of unread) {
      run('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)', [m.id, req.user.id]);
    }
  });
  res.json({ message: 'Conversation marked as read.' });
});

/** PUT /api/messages/:messageId/read — mark a single message read. */
router.put('/:messageId/read', authenticate, (req, res) => {
  const messageId = asInt(req.params.messageId);
  const m = get('SELECT conversation_id FROM messages WHERE id = ?', [messageId]);
  if (!m) return res.status(404).json({ error: 'Message not found.' });
  if (!isParticipant(req.user.id, m.conversation_id)) {
    return res.status(403).json({ error: 'You do not have access to this conversation.' });
  }
  run('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)', [messageId, req.user.id]);
  res.json({ message: 'Message marked as read.' });
});

/** DELETE /api/messages/:id — sender or super admin may delete. */
router.delete('/:id', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  const m = get('SELECT * FROM messages WHERE id = ?', [id]);
  if (!m) return res.status(404).json({ error: 'Message not found.' });
  if (m.sender_id !== req.user.id && !['super_admin', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'You can only delete your own messages.' });
  }
  run('DELETE FROM messages WHERE id = ?', [id]);
  log(req.user, 'MESSAGE_DELETED', `Deleted a message (id ${id})`, req.ip);
  emitToConversation(m.conversation_id, 'message:deleted', { id, conversationId: m.conversation_id });
  res.json({ message: 'Message deleted.' });
});

/**
 * GET /api/me/contacts — who can I message? (used by the "new message" UI)
 * Returns roles/groups/classes the current user may contact.
 */
router.get('/me/contacts', authenticate, (req, res) => {
  const u = req.user;
  const contacts = { groups: [], individuals: [] };

  if (u.role === 'super_admin' || u.role === 'admin') {
    contacts.individuals = all(
      `SELECT id, full_name, role FROM users
       WHERE id != ? AND status = 'active' AND role IN ('admin','teacher','student','parent')
       ORDER BY full_name LIMIT 500`, [u.id]
    );
    contacts.groups.push(
      { type: 'role', key: 'teacher', label: 'All Teachers', description: 'Broadcast to every teacher' },
      { type: 'role', key: 'student', label: 'All Students', description: 'Broadcast to every student' },
      { type: 'role', key: 'parent', label: 'All Parents', description: 'Broadcast to every parent' },
      { type: 'role', key: 'admin', label: 'All Admins', description: 'Broadcast to every admin' }
    );
    const classes = all('SELECT id, name, stream FROM classes ORDER BY name, stream');
    for (const c of classes) {
      contacts.groups.push({ type: 'class', key: c.id, label: `${c.name} ${c.stream}`, description: `Class ${c.name} ${c.stream}` });
    }
  }

  if (u.role === 'teacher') {
    contacts.individuals = all(
      `SELECT DISTINCT u.id, u.full_name, u.role FROM users u
       WHERE u.id != ? AND u.status = 'active' AND u.role IN ('admin','teacher')
       ORDER BY u.full_name`, [u.id]
    );
    const myClassIds = classIdsForTeacherUserId(u.id);
    for (const cid of myClassIds) {
      const c = get('SELECT id, name, stream FROM classes WHERE id = ?', [cid]);
      if (!c) continue;
      contacts.groups.push({ type: 'class', key: c.id, label: `${c.name} ${c.stream}`, description: 'Message the whole class' });
      const students = studentUserIdsForClass(cid);
      for (const sid of students) {
        const s = userBrief(sid);
        contacts.individuals.push({ id: sid, full_name: s.full_name, role: 'student', classLabel: `${c.name} ${c.stream}` });
      }
      const parents = require('./parents.routes');
      const pIds = require('../services/permissions').parentUserIdsForClass(cid);
      for (const pid of pIds) {
        const p = userBrief(pid);
        contacts.individuals.push({ id: pid, full_name: p.full_name, role: 'parent', classLabel: `Parent in ${c.name} ${c.stream}` });
      }
    }
  }

  if (u.role === 'student') {
    const cid = classIdForStudentUserId(u.id);
    contacts.individuals = all(
      `SELECT DISTINCT u.id, u.full_name, u.role FROM users u
       WHERE u.id != ? AND u.status = 'active' AND u.role = 'admin'`, [u.id]
    );
    if (cid) {
      for (const t of teachersForClass(cid)) {
        if (t.userId) {
          const tb = userBrief(t.userId);
          contacts.individuals.push({ id: t.userId, full_name: tb.full_name, role: 'teacher', classLabel: 'My teacher' });
        }
      }
      const c = get('SELECT id, name, stream FROM classes WHERE id = ?', [cid]);
      if (c) contacts.groups.push({ type: 'class', key: c.id, label: `${c.name} ${c.stream}`, description: 'My class group chat' });
    }
  }

  if (u.role === 'parent') {
    const pClassIds = classIdsForParentUserId(u.id);
    contacts.individuals = all(
      `SELECT DISTINCT u.id, u.full_name, u.role FROM users u
       WHERE u.id != ? AND u.status = 'active' AND u.role = 'admin'`, [u.id]
    );
    const children = all(
      `SELECT s.id, s.full_name, s.class_id, c.name AS class_name, c.stream FROM parent_students ps
       JOIN students s ON s.id = ps.student_id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE ps.parent_id = (SELECT id FROM parents WHERE user_id = ?)`, [u.id]
    );
    for (const child of children) {
      if (!child.class_id) continue;
      for (const t of teachersForClass(child.class_id)) {
        if (!t.userId) continue;
        const tb = userBrief(t.userId);
        contacts.individuals.push({
          id: t.userId, full_name: tb.full_name, role: 'teacher',
          childLabel: child.full_name, classLabel: `${child.class_name || ''} ${child.stream || ''}`,
        });
      }
      const ctu = classTeacherUserId(child.class_id);
      if (ctu) {
        const tb = userBrief(ctu);
        contacts.individuals.push({
          id: ctu, full_name: tb.full_name, role: 'teacher',
          childLabel: child.full_name, classLabel: `${child.class_name || ''} ${child.stream || ''} (Class Teacher)`,
        });
      }
    }
  }

  // de-duplicate individuals by id
  const seen = new Set();
  contacts.individuals = contacts.individuals.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });

  res.json({ contacts });
});

module.exports = router;
module.exports.setIO = setIO;

// ---------------------------------------------------------------------------
// Conversation controls: archive, mute, channels, message edit
// ---------------------------------------------------------------------------

/** PUT /api/messages/conversations/:id/archive — archive/unarchive. body: {archived} */
router.put('/conversations/:id/archive', authenticate, (req, res) => {
  const convId = asInt(req.params.id);
  if (!isParticipant(req.user.id, convId)) {
    return res.status(403).json({ error: 'You do not have access to this conversation.' });
  }
  const archived = req.body.archived === undefined ? 1 : (req.body.archived ? 1 : 0);
  run('UPDATE conversation_participants SET archived = ? WHERE conversation_id = ? AND user_id = ?', [archived, convId, req.user.id]);
  res.json({ message: archived ? 'Conversation archived.' : 'Conversation restored.' });
});

/** PUT /api/messages/conversations/:id/mute — mute/unmute. body: {muted} */
router.put('/conversations/:id/mute', authenticate, (req, res) => {
  const convId = asInt(req.params.id);
  if (!isParticipant(req.user.id, convId)) {
    return res.status(403).json({ error: 'You do not have access to this conversation.' });
  }
  const muted = req.body.muted === undefined ? 1 : (req.body.muted ? 1 : 0);
  run('UPDATE conversation_participants SET muted = ? WHERE conversation_id = ? AND user_id = ?', [muted, convId, req.user.id]);
  res.json({ message: muted ? 'Conversation muted.' : 'Conversation unmuted.' });
});

/** PUT /api/messages/:messageId — edit your own message. body: {content} */
router.put('/:messageId', authenticate, (req, res) => {
  const messageId = asInt(req.params.messageId);
  const m = get('SELECT * FROM messages WHERE id = ?', [messageId]);
  if (!m) return res.status(404).json({ error: 'Message not found.' });
  if (m.sender_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own messages.' });
  }
  const content = cleanString(req.body.content, 4000);
  if (!content) return res.status(400).json({ error: 'Message cannot be empty.' });
  run('UPDATE messages SET content = ?, edited = 1, updated_at = ? WHERE id = ?', [content, new Date().toISOString(), messageId]);
  const updated = get(
    `SELECT m.*, u.full_name AS sender_name, u.role AS sender_role,
            d.name AS attachment_name, d.mime_type AS attachment_mime, d.size AS attachment_size, d.id AS attachment_id
     FROM messages m JOIN users u ON u.id = m.sender_id
     LEFT JOIN documents d ON d.id = m.attachment_id WHERE m.id = ?`, [messageId]
  );
  emitToConversation(m.conversation_id, 'message:edited', { message: updated, conversationId: m.conversation_id });
  res.json({ message: 'Message updated.', data: updated });
});

/** GET /api/messages/channels — announcement channels + my subscription state. */
router.get('/channels', authenticate, (req, res) => {
  const channels = all(
    `SELECT c.id, c.title, c.created_at, u.full_name AS creator_name,
            (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id AND cp.user_id = ?) AS subscribed,
            (SELECT COUNT(*) FROM conversation_participants cp WHERE cp.conversation_id = c.id) AS subscriber_count,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS post_count
     FROM conversations c LEFT JOIN users u ON u.id = c.created_by
     WHERE c.type = 'channel' ORDER BY c.created_at DESC`, [req.user.id]
  ).map((c) => ({ ...c, subscribed: !!c.subscribed }));
  res.json({ channels });
});

/** POST /api/messages/channels/:id/subscribe — join a channel. */
router.post('/channels/:id/subscribe', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  const c = get('SELECT * FROM conversations WHERE id = ? AND type = \'channel\'', [id]);
  if (!c) return res.status(404).json({ error: 'Channel not found.' });
  run('INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [id, req.user.id]);
  res.json({ message: 'You joined the channel.' });
});

/** POST /api/messages/channels/:id/unsubscribe — leave a channel. */
router.post('/channels/:id/unsubscribe', authenticate, (req, res) => {
  const id = asInt(req.params.id);
  const c = get('SELECT * FROM conversations WHERE id = ? AND type = \'channel\'', [id]);
  if (!c) return res.status(404).json({ error: 'Channel not found.' });
  if (c.created_by === req.user.id) {
    return res.status(400).json({ error: 'As the channel owner you cannot leave it.' });
  }
  run('DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [id, req.user.id]);
  res.json({ message: 'You left the channel.' });
});
