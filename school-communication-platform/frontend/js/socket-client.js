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
  let everConnected = false;
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
    // polling fallback. It only runs while the tab is visible: a dashboard left
    // open overnight on a phone should not hammer the server (or the battery)
    // for screens nobody is looking at.
    const poll = () => { if (!document.hidden) emitLocal('poll', {}); };
    if (!pollingTimer) {
      pollingTimer = setInterval(poll, window.APP_CONFIG.POLL_INTERVAL_MS || 15000);
      if (!document.hidden) emitLocal('poll', {});
    }

    if (typeof window.io !== 'function') return; // socket client not loaded
    if (socket) return;

    // The session cookie is sent automatically (withCredentials) — no token is
    // ever exposed to JavaScript, so nothing here can be stolen by XSS. The
    // readable CSRF cookie is only a cheap "is anybody signed in?" hint: if it
    // is missing but the page already loaded a user, still connect, because a
    // silently dead realtime channel is worse than one rejected handshake.
    if (!window.API.hasSessionCookie() && !window.API.getUser()) return;

    try {
      socket = window.io(BASE, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        // Phones lose signal constantly (tunnels, lifts, dead spots) and a
        // school's connection can drop for minutes. Giving up after three
        // tries meant the dashboard stayed silent for the rest of the day, so
        // the client keeps trying with a capped backoff and recreates the
        // connection outright if the transport ever gives up for good.
        reconnectionAttempts: Infinity,
        reconnectionDelay: 700,
        reconnectionDelayMax: 8000,
        randomizationFactor: 0.5,
        timeout: 8000,
      });

      // 'connect' fires on the first connection AND after every reconnect, so
      // a dashboard that came back must refresh (anything that happened while
      // the link was down is still unseen). The reconnect bookkeeping lives on
      // the manager (socket.io), which is where those events are actually
      // emitted — watching them on the socket meant nothing ever fired.
      socket.on('connect', () => {
        const cameBack = everConnected && !connected;
        connected = true;
        everConnected = true;
        emitLocal('realtime', { connected: true, reconnected: cameBack });
        if (cameBack) emitLocal('poll', {});
      });

      socket.on('disconnect', (reason) => {
        connected = false;
        emitLocal('realtime', { connected: false, reason });
      });

      const manager = socket.io;
      if (manager && typeof manager.on === 'function') {
        manager.on('reconnect', (attempt) => {
          emitLocal('realtime', { connected: true, reconnected: true, attempt });
          emitLocal('poll', {});
        });
        manager.on('reconnect_attempt', () => {
          if (navigator.onLine === false && window.NetStatus) window.NetStatus.offline();
        });
        manager.on('reconnect_failed', () => {
          emitLocal('realtime', { connected: false, exhausted: true });
          socket = null;                 // rebuild rather than stay dead for good
          setTimeout(() => { if (!socket) { try { start(); } catch { /* keep polling */ } } }, 800);
        });
      }

      socket.on('message:new', (data) => emitLocal('message:new', data));
      socket.on('message', (data) => emitLocal('message:new', data));
      socket.on('message:deleted', (data) => emitLocal('message:deleted', data));
      socket.on('notification', (data) => emitLocal('notification', data));
      // public-website intake: the office inboxes refresh the moment a message
      // or an admission application arrives
      socket.on('contact:new', (data) => emitLocal('contact:new', data));
      socket.on('admission:new', (data) => emitLocal('admission:new', data));
      socket.on('connect_error', () => {
        connected = false;
        // the REST API is still the source of truth; polling covers this window
      });
    } catch (e) { /* polling fallback remains active */ }
  }

  /** Ask for an immediate refresh (used when a phone regains signal). */
  function refreshNow() { emitLocal('poll', {}); }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    emitLocal('poll', {});           // the tab is back: show what changed
    if (socket && !connected) socket.connect();
  });

  window.addEventListener('online', () => {
    if (socket && !connected) socket.connect();
    refreshNow();
  });

  function joinConversation(convId) {
    if (socket && connected) socket.emit('conversation:join', convId);
  }

  window.Realtime = { on, start, joinConversation, refreshNow, get connected() { return connected; }, get socket() { return socket; } };
})();
