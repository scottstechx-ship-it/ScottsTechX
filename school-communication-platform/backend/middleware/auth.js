/**
 * Authentication & authorization middleware.
 *
 * Two accepted credential styles:
 *   1. an HttpOnly session cookie (browser — see services/sessions.js), and
 *   2. `Authorization: Bearer <jwt>` (tests, scripts, native clients).
 *
 * Whichever is used, `req.user` is the live database row, so deactivated
 * accounts lose access immediately instead of at token expiry.
 *
 * Role-based access control: requireRole(...roles)
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { get } = require('../database/db');
const sessions = require('../services/sessions');

const ROLES = ['super_admin', 'admin', 'teacher', 'student', 'parent'];
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
};

const USER_COLUMNS =
  'id, full_name, email, phone, username, role, profile_picture, status, last_login, created_at';

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

function loadUser(id) {
  return get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
}

/** Express middleware: resolve the current user from cookie or bearer token. */
function authenticate(req, res, next) {
  // 1. session cookie (preferred for browsers)
  const cookieToken = sessions.cookieValue(req, sessions.COOKIE_NAME);
  if (cookieToken) {
    const resolved = sessions.resolveSession(cookieToken);
    if (!resolved) {
      sessions.clearSessionCookies(res);
      return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    }
    // Keep the browser cookie alive for as long as the person is actually here.
    if (resolved.refreshCookie) {
      sessions.setSessionCookies(res, {
        token: cookieToken,
        csrfToken: resolved.session.csrf_token,
        maxAge: resolved.maxAge,
      }, req);
    }
    req.user = resolved.user;
    req.session = resolved.session;
    req.authMethod = 'cookie';
    return next();
  }

  // 2. bearer token (API clients / automated tests)
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const user = loadUser(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Account no longer exists. Please log in again.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Your account is not active. Contact the administrator.' });
    }
    req.user = user;
    req.token = token;
    req.authMethod = 'bearer';
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

/**
 * Optional authentication: populates req.user when credentials are present
 * but never rejects the request (used where anonymous access is allowed).
 */
function optionalAuth(req, _res, next) {
  try {
    const cookieToken = sessions.cookieValue(req, sessions.COOKIE_NAME);
    if (cookieToken) {
      const resolved = sessions.resolveSession(cookieToken);
      if (resolved) {
        req.user = resolved.user;
        req.session = resolved.session;
        req.authMethod = 'cookie';
      }
      return next();
    }
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      const payload = jwt.verify(header.slice(7), env.JWT_SECRET);
      const user = loadUser(payload.sub);
      if (user && user.status === 'active') {
        req.user = user;
        req.token = header.slice(7);
        req.authMethod = 'bearer';
      }
    }
  } catch { /* anonymous request */ }
  next();
}

/**
 * CSRF guard for cookie-authenticated requests (double-submit cookie).
 * Bearer-token requests are unaffected: they carry no ambient credentials.
 */
function csrfProtection(req, res, next) {
  const method = (req.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();

  // Only cookie sessions need CSRF protection.
  const cookieToken = sessions.cookieValue(req, sessions.COOKIE_NAME);
  if (!cookieToken) return next();

  const resolved = sessions.resolveSession(cookieToken, { touch: false });
  if (!resolved) return next(); // authenticate() will reject with 401

  const supplied = req.headers[sessions.CSRF_HEADER] || req.headers['csrf-token'];
  if (!supplied || !sessions.safeEqual(supplied, resolved.session.csrf_token)) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token. Reload the page and try again.' });
  }
  return next();
}

/** Role-based access control. Usage: router.get('/', authenticate, requireRole('super_admin'), handler) */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

/** Require super_admin OR admin. */
const requireStaffAdmin = requireRole('super_admin', 'admin');

module.exports = {
  authenticate,
  optionalAuth,
  csrfProtection,
  requireRole,
  requireStaffAdmin,
  signToken,
  ROLES,
  ROLE_LABELS,
};
