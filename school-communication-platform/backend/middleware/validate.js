/**
 * Input validation & sanitization helpers.
 * Central place for the small validators used across routes.
 */

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

function isPhone(v) {
  return typeof v === 'string' && /^[+0-9()\-\s]{7,20}$/.test(v.trim());
}

function isUsername(v) {
  return typeof v === 'string' && /^[a-zA-Z0-9_.]{3,32}$/.test(v);
}

/** Validate a password. Returns an error string or null. */
function passwordError(pw, { strong = true } = {}) {
  if (typeof pw !== 'string' || pw.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (pw.length > 128) return 'Password is too long.';
  if (strong) {
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
      return 'Password must contain at least one letter and one number.';
    }
  }
  return null;
}

/** Trim common fields on an object in place (defensive against junk input). */
function cleanString(v, max = 5000) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  return s.length > max ? s.slice(0, max) : s;
}

function asInt(v, def = null) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function asBool(v, def = false) {
  if (v === undefined || v === null) return def;
  if (typeof v === 'boolean') return v;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

/** Returns { error } if invalid, otherwise { value }. */
function requireFields(body, fields) {
  for (const f of fields) {
    const v = body[f];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      return { error: `Field "${f}" is required.` };
    }
  }
  return { value: true };
}

module.exports = { isEmail, isPhone, isUsername, passwordError, cleanString, asInt, asBool, requireFields };
