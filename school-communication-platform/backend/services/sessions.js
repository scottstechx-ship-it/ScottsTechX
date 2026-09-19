/**
 * Server-side sessions.
 *
 * Why this exists: the browser used to keep the JWT in localStorage, which
 * means any XSS (a single unescaped message body, a malicious upload served
 * back as HTML) could steal a token that stays valid for hours and cannot be
 * revoked. Sessions instead live in the database:
 *
 *   - the browser only ever holds an opaque, HttpOnly, SameSite cookie
 *   - logging out / changing a password really invalidates the session
 *   - every session is visible in the audit log and can be revoked remotely
 *   - idle and absolute expiry are enforced on the server
 *
 * Requests that carry an `Authorization: Bearer <jwt>` header (tests, scripts,
 * native clients) keep working exactly as before.
 */
const crypto = require('crypto');
const env = require('../config/env');
const { get, run, all } = require('../database/db');

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'scp_session';
const CSRF_COOKIE_NAME = COOKIE_NAME + '_csrf';
const CSRF_HEADER = 'x-csrf-token';

const ABSOLUTE_HOURS = parseInt(process.env.SESSION_TTL_HOURS || '12', 10) || 12;
const IDLE_HOURS = parseInt(process.env.SESSION_IDLE_HOURS || '12', 10) || 12;

/** Read a cookie value off a request without pulling in a dependency. */
function cookieValue(req, name) {
  const header = req.headers && req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Create a session for a user and return the tokens the caller must hand to
 * the browser (cookie value + CSRF token).
 */
function issueSession(userId, req, { remember = false } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  const ttlHours = remember
    ? Math.min(ABSOLUTE_HOURS * 14, 24 * 30) // "remember me" caps at 30 days
    : ABSOLUTE_HOURS;
  const expiresAt = nowIso(ttlHours * 3600 * 1000);

  run(
    `INSERT INTO sessions (user_id, token_hash, csrf_token, ip, user_agent, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      hashToken(token),
      csrfToken,
      req ? req.ip : null,
      req && req.headers ? String(req.headers['user-agent'] || '').slice(0, 300) : null,
      nowIso(),
      nowIso(),
      expiresAt,
    ]
  );

  return { token, csrfToken, expiresAt, maxAge: ttlHours * 3600 };
}

function cookieOptions(maxAgeSeconds, req) {
  const secure =
    process.env.COOKIE_SECURE === 'true' ||
    (process.env.COOKIE_SECURE !== 'false' && (env.NODE_ENV === 'production' || (req && req.secure)));
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  };
}

/** Attach the session cookie + readable CSRF cookie to a response. */
function setSessionCookies(res, session, req) {
  const opts = cookieOptions(session.maxAge, req);
  const existing = res.getHeader('Set-Cookie');
  const cookies = [
    serializeCookie(COOKIE_NAME, session.token, opts),
    // The CSRF cookie is deliberately readable by JS: the frontend echoes it
    // back in a header (double-submit), which a cross-site page cannot do.
    serializeCookie(CSRF_COOKIE_NAME, session.csrfToken, { ...opts, httpOnly: false }),
  ];
  if (existing) {
    const list = Array.isArray(existing) ? existing : [existing];
    res.setHeader('Set-Cookie', [...list, ...cookies]);
  } else {
    res.setHeader('Set-Cookie', cookies);
  }
}

function clearSessionCookies(res) {
  const base = { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/' };
  res.setHeader('Set-Cookie', [
    serializeCookie(COOKIE_NAME, '', { ...base, maxAge: 0 }),
    serializeCookie(CSRF_COOKIE_NAME, '', { ...base, httpOnly: false, maxAge: 0 }),
  ]);
}

function serializeCookie(name, value, opts = {}) {
  let out = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge !== undefined) out += `; Max-Age=${Math.max(0, Math.floor(opts.maxAge / 1000 || opts.maxAge))}`;
  if (opts.path) out += `; Path=${opts.path}`;
  if (opts.httpOnly) out += '; HttpOnly';
  if (opts.secure) out += '; Secure';
  if (opts.sameSite) out += `; SameSite=${opts.sameSite === 'lax' ? 'Lax' : opts.sameSite === 'none' ? 'None' : 'Strict'}`;
  return out;
}

/**
 * Resolve a session cookie to a live user, or null.
 * Updates last_seen at most once a minute to keep writes cheap.
 */
function resolveSession(token) {
  if (!token) return null;
  const row = get('SELECT * FROM sessions WHERE token_hash = ? AND revoked = 0', [hashToken(token)]);
  if (!row) return null;

  const now = Date.now();
  if (new Date(row.expires_at).getTime() < now) return null;
  const lastSeen = new Date(row.last_seen_at || row.created_at).getTime();
  if (Number.isFinite(lastSeen) && now - lastSeen > IDLE_HOURS * 3600 * 1000) {
    revokeSession(token);
    return null;
  }

  const user = get(
    'SELECT id, full_name, email, phone, username, role, profile_picture, status, last_login, created_at FROM users WHERE id = ?',
    [row.user_id]
  );
  if (!user || user.status !== 'active') return null;

  if (now - lastSeen > 60 * 1000) {
    run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [nowIso(), row.id]);
  }
  return { user, session: row };
}

function revokeSession(token) {
  if (!token) return;
  run('UPDATE sessions SET revoked = 1 WHERE token_hash = ?', [hashToken(token)]);
}

/** Invalidate every session for a user (password change/reset, deactivation). */
function revokeAllForUser(userId, exceptToken) {
  if (exceptToken) {
    run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND token_hash != ? AND revoked = 0', [
      userId,
      hashToken(exceptToken),
    ]);
  } else {
    run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0', [userId]);
  }
}

function purgeExpired() {
  try {
    const cutoff = nowIso(-24 * 3600 * 1000);
    run('DELETE FROM sessions WHERE revoked = 1 AND last_seen_at < ?', [cutoff]);
    run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]);
    run('DELETE FROM login_attempts WHERE last_at < ?', [nowIso(-24 * 3600 * 1000)]);
  } catch { /* housekeeping must never break a request */ }
}

// ---------------------------------------------------------------------------
// Brute-force protection
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = Math.max(3, env.LOGIN_RATE_LIMIT_PER_15MIN || 20);
const LOCK_MINUTES = parseInt(process.env.LOGIN_LOCK_MINUTES || '15', 10) || 15;

function lockKey(identifier, ip) {
  return `${String(identifier || '').toLowerCase()}|${String(ip || '')}`;
}

/** How many minutes are left on a lockout (0 = not locked). */
function lockoutRemaining(identifier, ip) {
  try {
    const row = get('SELECT * FROM login_attempts WHERE ident = ? AND ip = ?', [
      String(identifier || '').toLowerCase(),
      String(ip || ''),
    ]);
    if (!row || !row.locked_until) return 0;
    const until = new Date(row.locked_until).getTime();
    const left = until - Date.now();
    if (left <= 0) {
      run('UPDATE login_attempts SET attempts = 0, locked_until = NULL WHERE id = ?', [row.id]);
      return 0;
    }
    return Math.ceil(left / 60000);
  } catch {
    return 0;
  }
}

function recordFailedLogin(identifier, ip) {
  try {
    const ident = String(identifier || '').toLowerCase();
    const row = get('SELECT * FROM login_attempts WHERE ident = ? AND ip = ?', [ident, String(ip || '')]);
    if (!row) {
      run('INSERT INTO login_attempts (ident, ip, attempts, first_at, last_at) VALUES (?, ?, 1, ?, ?)', [
        ident, String(ip || ''), nowIso(), nowIso(),
      ]);
      return { attempts: 1, locked: false };
    }
    const attempts = row.attempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    run('UPDATE login_attempts SET attempts = ?, last_at = ?, locked_until = ? WHERE id = ?', [
      attempts,
      nowIso(),
      locked ? nowIso(LOCK_MINUTES * 60 * 1000) : null,
      row.id,
    ]);
    return { attempts, locked, minutes: LOCK_MINUTES };
  } catch {
    return { attempts: 1, locked: false };
  }
}

function clearFailedLogins(identifier, ip) {
  try {
    run('DELETE FROM login_attempts WHERE ident = ? AND ip = ?', [
      String(identifier || '').toLowerCase(),
      String(ip || ''),
    ]);
  } catch { /* ignore */ }
}

/** Active sessions for a user (for a "devices" list, admin tooling, audits). */
function listSessions(userId) {
  return all(
    `SELECT id, ip, user_agent, created_at, last_seen_at, expires_at FROM sessions
     WHERE user_id = ? AND revoked = 0 AND expires_at > ? ORDER BY last_seen_at DESC`,
    [userId, nowIso()]
  );
}

module.exports = {
  COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER,
  issueSession,
  setSessionCookies,
  clearSessionCookies,
  resolveSession,
  revokeSession,
  revokeAllForUser,
  purgeExpired,
  cookieValue,
  safeEqual,
  lockoutRemaining,
  recordFailedLogin,
  clearFailedLogins,
  listSessions,
  MAX_ATTEMPTS,
  LOCK_MINUTES,
};
