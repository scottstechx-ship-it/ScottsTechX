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
  // Only send HSTS over HTTPS — sending it from plain http://localhost during
  // development would pin localhost to https in the developer's browser.
  if (env.NODE_ENV === 'production' || req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // real school media: the school's YouTube stills (i.ytimg.com), the
      // national schools directory profile photo (schoolnet.africa) and
      // TikTok's media CDN for the school's own videos.
      "img-src 'self' data: blob: https://i.ytimg.com https://img.youtube.com https://schoolnet.africa https://schoolnetuganda.com https://*.tiktokcdn.com https://*.tiktokcdn-us.com https://p16-sign-va.tiktokcdn.com",
      "media-src 'self' blob: https://*.tiktokcdn.com https://*.tiktokcdn-us.com https://v16-webapp.tiktok.com https://v19-webapp.tiktok.com https://v16m-default.akamaized.net https://v16-webapp-prime.tiktok.com",
      // Google Fonts + Font Awesome (cdnjs)
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      // the only third-party scripts left are analytics & ads; the decorative
      // three.js CDN library was removed from every page, so cdnjs is not
      // allowed to execute code here any more.
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://pagead2.googlesyndication.com",
      "connect-src 'self' ws: wss: https://www.googletagmanager.com https://*.google-analytics.com https://pagead2.googlesyndication.com",
      "frame-src 'self' blob: https://www.google.com https://maps.google.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.youtube.com https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; ')
  );
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  // Nothing in the product uses the device sensors, so deny them outright and
  // leave only the features the media players genuinely need.
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), fullscreen=(self "https://www.youtube.com")'
  );
  // JWT is sent in the Authorization header (not cookies) -> CSRF surface is minimal.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}

/** Host values that can only mean "the request came through a local proxy". */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

function hostMatches(origin, host) {
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

/**
 * A request is same-origin when the Origin header matches the request Host
 * (browsers send Origin even for same-origin POST/PUT/DELETE).
 *
 * Behind a reverse proxy that rewrites Host to the loopback address (the
 * preview/Render deployment does), the browser still sends the public Origin,
 * so a matching X-Forwarded-Host is accepted as well - but only when the
 * direct Host is itself a loopback address, i.e. the request demonstrably
 * arrived through a local proxy. Direct requests keep the strict check.
 */
function isSameOrigin(origin, host, forwardedHost) {
  if (hostMatches(origin, host)) return true;
  if (!LOOPBACK_HOST.test(String(host || ''))) return false;
  const fwd = String(forwardedHost || '').split(',')[0].trim();
  return !!fwd && hostMatches(origin, fwd);
}

function isPublicIntake(req) {
  if (req.method !== 'POST' && req.method !== 'OPTIONS') return false;
  // The API is mounted at /api, not under an extra base path.
  const url = String(req.originalUrl || req.url || '').split('?')[0];
  return /^\/api\/website\/(admissions|contact)\/?$/.test(url);
}

function corsHandler(req, res, next) {
  const origin = req.headers.origin;
  const allowed = env.ALLOWED_ORIGINS;
  // A reverse proxy can rewrite Host so it no longer matches the browser's
  // Origin, which used to reject the admission and contact form posts with
  // 403 while the page itself still loaded. The browser sets Sec-Fetch-Site;
  // a cross-site page cannot claim same-origin. Some browsers and privacy
  // tools omit Sec-Fetch-Site entirely — the public forms must still be
  // accepted, because they do not act as a signed-in person.
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  const browserSameSite = fetchSite === 'same-origin' || fetchSite === 'same-site';
  const publicIntake = isPublicIntake(req);
  const sameOrigin = !origin || browserSameSite || publicIntake || isSameOrigin(origin, req.headers.host, req.headers['x-forwarded-host']);
  const isAllowed = allowed.includes(origin) || allowed.includes('*');

  if (sameOrigin || isAllowed) {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
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
