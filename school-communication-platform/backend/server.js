/**
 * SCHOOL COMMUNICATION PLATFORM — API server entry point.
 *
 * Serves:
 *   /api/*        the REST API
 *   /socket.io/*  realtime messaging
 *   /             the frontend dashboards (static) — optional; the frontend can
 *                 also be hosted separately and pointed at this API via
 *                 frontend/js/config.js (API_BASE_URL).
 */
require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const env = require('./config/env');
const { db } = require('./database/db');

// ---- database init + optional demo seed ---------------------------------
const seed = require('./database/seed');
seed.ensureSeeded();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

const { securityHeaders, corsHandler, rateLimit } = require('./middleware/security');

app.use(securityHeaders);
app.use(corsHandler);
// gzip/brotli-style compression: HTML/CSS/JS/JSON shrink 60-80% -> much
// faster loads, especially on mobile data.
app.use(require('compression')());
app.use(express.json({ limit: '2mb' }));

// General API rate limit
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: env.RATE_LIMIT_PER_MINUTE,
  label: 'requests',
  message: 'Too many requests. Please try again shortly.',
}));

// ---- routes --------------------------------------------------------------
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/students', require('./routes/students.routes'));
app.use('/api/teachers', require('./routes/teachers.routes'));
app.use('/api/parents', require('./routes/parents.routes'));
app.use('/api/classes', require('./routes/classes.routes'));
app.use('/api/messages', require('./routes/messages.routes'));
app.use('/api/documents', require('./routes/documents.routes'));
app.use('/api/announcements', require('./routes/announcements.routes'));
app.use('/api/notifications', require('./routes/notifications.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/logs', require('./routes/logs.routes'));
app.use('/api/stats', require('./routes/stats.routes'));
app.use('/api/subjects', require('./routes/subjects.routes'));
app.use('/api/attendance', require('./routes/attendance.routes'));
app.use('/api/assignments', require('./routes/assignments.routes'));
app.use('/api/exams', require('./routes/exams.routes'));
app.use('/api/timetable', require('./routes/timetable.routes'));
app.use('/api/fees', require('./routes/fees.routes'));
app.use('/api/imports', require('./routes/imports.routes'));
app.use('/api/website', require('./routes/website.routes'));

// ---- health --------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), uptime: process.uptime() });
});

// ---- static frontend (optional — can be hosted separately) ---------------
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir, {
  extensions: ['html'],
  index: 'index.html',
  // cache static assets in the browser: instant repeat visits.
  // HTML stays revalidated so content updates appear immediately.
  setHeaders(res, filePath) {
    if (/\.(css|js|png|jpe?g|webp|gif|ico|svg|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));
// The public website (frontend/index.html) is served at '/' by the static handler.

// ---- API docs (rendered HTML) -------------------------------------------
app.use('/docs', express.static(path.join(__dirname, '..', 'docs')));
app.get('/docs', (req, res) => res.redirect('/docs/api.html'));

// ---- SEO conveniences ------------------------------------------------------
// Accept the sitemap with or without the .xml extension (Search Console
// submissions and humans both get the right file either way).
app.get(['/sitemap', '/sitemap.txt', '/sitemaps.xml'], (req, res) => res.redirect(301, '/sitemap.xml'));

// ---- 404 & error handlers -------------------------------------------------
app.use((req, res) => {
  // APIs get JSON; page visits get a friendly HTML 404 that links home.
  if (req.path.startsWith('/api/') || (req.headers.accept || '').includes('application/json')) {
    return res.status(404).json({ error: 'Endpoint not found.' });
  }
  res.status(404).send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found — Kalinabiri SS</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#060d1f;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}
a{color:#38bdf8;font-weight:700;text-decoration:none;border:1px solid rgba(56,189,248,.4);padding:10px 22px;border-radius:999px;display:inline-block;margin-top:18px}
h1{font-size:3.4rem;margin-bottom:4px}p{color:#94a3b8}</style></head>
<body><div><h1>404</h1><p>That page doesn't exist or has moved.</p><a href="/">← Back to the school website</a></div></body></html>`);
});

app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: 'Something went wrong. Please try again.',
  });
});

// ---- http + socket.io ------------------------------------------------------
const server = http.createServer(app);
const { attachSocket } = require('./socket');
const io = attachSocket(server);
require('./services/notify').setIO(io);
require('./routes/messages.routes').setIO(io);
require('./routes/website.routes').setIO(io);

// ---- scheduled jobs --------------------------------------------------------
// Assignment deadline reminders (twice a day): students who haven't submitted
// are reminded when an assignment is due within 48 hours. notifyOnce prevents spam.
function deadlineReminders() {
  try {
    const { all: qAll, get: qGet } = require('./database/db');
    const { notifyOnce } = require('./services/notify');
    const due = qAll(
      `SELECT a.id, a.title, a.class_id, a.due_date FROM assignments a
       WHERE a.status = 'active' AND a.due_date IS NOT NULL
         AND a.due_date <= date('now', '+2 days') AND a.due_date >= date('now')`
    );
    for (const a of due) {
      const students = qAll(
        `SELECT s.user_id FROM students s WHERE s.class_id = ? AND s.status = 'active' AND s.user_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM assignment_submissions sub WHERE sub.assignment_id = ? AND sub.student_id = s.id)`,
        [a.class_id, a.id]
      );
      for (const s of students) {
        notifyOnce(s.user_id, 'assignment', `Reminder: "${a.title}" due ${a.due_date}`,
          'Submit before the deadline to avoid missing marks.', '/assignments');
      }
    }
  } catch (e) { /* reminders must never crash the server */ }
}
deadlineReminders();
setInterval(deadlineReminders, 12 * 60 * 60 * 1000);

// Auto-cleanup expired documents & announcements (hourly)
const { startCleanupInterval } = require('./services/cleanup');
startCleanupInterval(60 * 60 * 1000);

server.listen(env.PORT, '0.0.0.0', () => {
  console.log(`==============================================`);
  console.log(` School Communication Platform`);
  console.log(` API:      ${env.API_BASE_URL}/api`);
  console.log(` Frontend: ${env.FRONTEND_URL}`);
  console.log(` Database: ${env.DATABASE_PATH}`);
  console.log(` Socket.IO realtime enabled`);
  console.log(`==============================================`);
});

process.on('SIGINT', () => { try { db.close(); } catch {} process.exit(0); });
process.on('SIGTERM', () => { try { db.close(); } catch {} process.exit(0); });

module.exports = { app, server };
