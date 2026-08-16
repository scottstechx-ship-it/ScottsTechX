/**
 * Authentication & authorization middleware.
 * - JWT verification (Authorization: Bearer <token>)
 * - Role-based access control: requireRole(...roles)
 * - Helpers to attach the current user to requests.
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { get } = require('../database/db');

const ROLES = ['super_admin', 'admin', 'teacher', 'student', 'parent'];
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
};

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

/** Express middleware: verify the Bearer token and load the user. */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const user = get(
      'SELECT id, full_name, email, phone, username, role, profile_picture, status, last_login, created_at FROM users WHERE id = ?',
      [payload.sub]
    );
    if (!user) {
      return res.status(401).json({ error: 'Account no longer exists. Please log in again.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Your account is not active. Contact the administrator.' });
    }
    req.user = user;
    req.token = token;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
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

module.exports = { authenticate, requireRole, requireStaffAdmin, signToken, ROLES, ROLE_LABELS };
