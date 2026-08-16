/**
 * Realtime client — Socket.IO with automatic polling fallback.
 * The frontend never depends on the socket: if it cannot connect, the
 * components poll the REST API instead.
 */
(function () {
  const BASE = window.APP_CONFIG.API_BASE_URL;

  const listeners = {};   // event -> [callbacks]
  let socket = null;
  let connected = false;
  let pollingTimer = null;

  function on(event, cb) {
    (listeners[event] = listeners[event] || []).push(cb);
    return () => {
      listeners[event] = (listeners[event] || []).filter((f) => f !== cb);
    };
  }

  function emitLocal(event, payload) {
    (listeners[event] || []).forEach((cb) => { try { cb(payload); } catch (e) {} });
  }

  function start() {
    // polling fallback
    const poll = () => emitLocal('poll', {});
    if (!pollingTimer) {
      pollingTimer = setInterval(poll, window.APP_CONFIG.POLL_INTERVAL_MS || 15000);
      emitLocal('poll', {});
    }

    if (typeof window.io !== 'function') return; // socket client not loaded
    if (socket) return;

    const token = window.API.getToken();
    if (!token) return;

    try {
      socket = window.io(BASE, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 3,
        timeout: 6000,
      });

      socket.on('connect', () => {
        connected = true;
        emitLocal('realtime', { connected: true });
      });

      socket.on('disconnect', () => {
        connected = false;
        emitLocal('realtime', { connected: false });
      });

      socket.on('message:new', (data) => emitLocal('message:new', data));
      socket.on('message', (data) => emitLocal('message:new', data));
      socket.on('message:deleted', (data) => emitLocal('message:deleted', data));
      socket.on('notification', (data) => emitLocal('notification', data));
      socket.on('connect_error', () => { /* fall back to polling */ });
    } catch (e) { /* polling fallback remains active */ }
  }

  function joinConversation(convId) {
    if (socket && connected) socket.emit('conversation:join', convId);
  }

  window.Realtime = { on, start, joinConversation, get connected() { return connected; } };
})();
