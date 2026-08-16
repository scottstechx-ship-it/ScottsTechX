/**
 * Security middleware:
 * - secure HTTP headers (CSP, nosniff, frame options, referrer policy)
 * - CORS with an explicit allow-list (never '*' in production)
 * - simple in-memory rate limiting (per IP)
 */
const env = require('../config/env');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // remote school media (Netlify archive) + stock fallbacks
      "img-src 'self' data: blob: https://kalibz-international.netlify.app https://images.unsplash.com https://picsum.photos https://*.picsum.photos",
      "media-src 'self' blob: https://kalibz-international.netlify.app",
      // Google Fonts + Font Awesome (cdnjs)
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
      "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      // three.js (cdnjs), analytics & ads used by the public site
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://www.googletagmanager.com https://pagead2.googlesyndication.com",
      "connect-src 'self' ws: wss: https://www.googletagmanager.com https://*.google-analytics.com https://pagead2.googlesyndication.com",
      "frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com",
      "object-src 'none'",
      "frame-ancestors 'self'",
    ].join('; ')
  );
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  // JWT is sent in the Authorization header (not cookies) -> CSRF surface is minimal.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}

/**
 * A request is same-origin when the Origin header matches the request Host
 * (browsers send Origin even for same-origin POST/PUT/DELETE).
 */
function isSameOrigin(origin, host) {
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function corsHandler(req, res, next) {
  const origin = req.headers.origin;
  const allowed = env.ALLOWED_ORIGINS;
  const sameOrigin = !origin || isSameOrigin(origin, req.headers.host);
  const isAllowed = allowed.includes(origin) || allowed.includes('*');

  if (sameOrigin || isAllowed) {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'false');
  } else if (origin) {
    // Block cross-origin requests from unknown origins.
    return res.status(403).json({ error: 'Origin not allowed by CORS policy.' });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

/** Minimal sliding-window rate limiter keyed by IP (+ optional key). */
function rateLimit({ windowMs, max, label = 'requests', message }) {
  const hits = new Map();
  const safeMax = Math.max(1, max);
  return (req, res, next) => {
    const key = (req.ip || 'unknown') + '|' + label + '|' + (req.user ? req.user.id : '');
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, resetAt: now + windowMs };
    if (entry.resetAt < now) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }
    entry.count += 1;
    hits.set(key, entry);
    // basic cleanup so the map does not grow forever
    if (hits.size > 50000) {
      for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
    }
    if (entry.count > safeMax) {
      return res.status(429).json({
        error: message || `Too many ${label}. Please slow down and try again later.`,
      });
    }
    next();
  };
}

module.exports = { securityHeaders, corsHandler, rateLimit, isSameOrigin };
