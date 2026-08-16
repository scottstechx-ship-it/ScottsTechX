/**
 * Socket.IO realtime layer.
 * - users join their own room (user:<id>) to receive notifications
 * - participants join conversation rooms (conversation:<id>) to receive messages live
 * - clients authenticate with their JWT (auth.token)
 * - graceful fallback: the frontend also polls every 15s if the socket drops
 */
const jwt = require('jsonwebtoken');
const env = require('./config/env');
const { get, all } = require('./database/db');
const { isSameOrigin } = require('./middleware/security');

function attachSocket(server) {
  const { Server } = require('socket.io');
  const io = new Server(server, {
    // CORS is governed by the engine 'headers' hook + io.use below so that
    // same-origin connections (including dev/preview hosts) always work and
    // cross-origin connections are restricted to ALLOWED_ORIGINS.
    cors: { origin: false },
  });

  // Add CORS headers only for explicitly allowed cross-origin clients.
  io.engine.on('headers', (headers, req) => {
    const origin = req.headers.origin;
    if (!origin) return;
    if (env.ALLOWED_ORIGINS.includes(origin) || env.ALLOWED_ORIGINS.includes('*')) {
      headers['Access-Control-Allow-Origin'] = origin;
    }
  });

  io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;
    if (origin && !env.ALLOWED_ORIGINS.includes(origin) && !env.ALLOWED_ORIGINS.includes('*')
        && !isSameOrigin(origin, socket.handshake.headers.host)) {
      return next(new Error('Origin not allowed'));
    }
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = jwt.verify(token, env.JWT_SECRET);
      const user = get('SELECT id, full_name, role, status FROM users WHERE id = ?', [payload.sub]);
      if (!user || user.status !== 'active') return next(new Error('Account not active'));
      socket.user = user;
      next();
    } catch (e) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const uid = socket.user.id;
    socket.join(`user:${uid}`);

    // Join all conversations the user participates in so messages arrive live.
    const convs = all(
      `SELECT conversation_id FROM conversation_participants WHERE user_id = ?`, [uid]
    );
    for (const c of convs) socket.join(`conversation:${c.conversation_id}`);

    socket.on('conversation:join', (convId) => {
      const ok = get('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [convId, uid]);
      if (ok) socket.join(`conversation:${convId}`);
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

module.exports = { attachSocket };
