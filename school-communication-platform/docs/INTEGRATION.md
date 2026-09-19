# Connecting the School Platform to Your Existing School Website

This document explains exactly how to attach the dashboards/API to a website
you already run, without rebuilding it.

```
 EXISTING SCHOOL WEBSITE  ──── login / link ────►  SCHOOL PLATFORM API
   (your site, unchanged)                            /api  +  Socket.IO
                                                          │
                                          ┌───────────────┼───────────────┐
                                          ▼               ▼               ▼
                                      DATABASE      FILE STORAGE    NOTIFICATIONS
                                          │
                              ┌───────────┼───────┬───────┬───────┐
                              ▼           ▼       ▼       ▼       ▼
                          SUPER ADMIN  ADMIN  TEACHER  STUDENT  PARENT
```

## 1. Decide where the platform lives

| Option | Frontend | API | Notes |
|---|---|---|---|
| **A. Same server** (default) | served by the API on `/` | same origin | simplest; CORS not even needed |
| **B. Separate hosts** | static host / your website | `api.myschool.com` | use `ALLOWED_ORIGINS` + `API_BASE_URL` |
| **C. Embedded in your site** | iframe/redirect to `/student`, `/parent`, … | same as B | pass the token to keep the session |

## 2. One identity per person

Every person has exactly **one** row in `users` with a `role`
(`super_admin | admin | teacher | student | parent`). If your website already
has a user database, keep the platform's `username`/`email` **in sync** with
yours so the same person maps to the same account everywhere.

Practical options:

- **Manual linking (start here):** admins create the platform accounts
  (Users / Students / Teachers / Parents screens) and hand out usernames.
- **Server-side auto-provisioning:** when a person registers/logs in on your
  site, call `POST /api/auth/login` with their platform credentials, or add a
  small trusted endpoint in `backend/routes/auth.routes.js` that mints a JWT
  (`signToken`) for a verified `user.id` — no frontend change needed.
- **SSO later:** because auth is JWT, a future SSO provider only needs to
  issue platform JWTs after its own verification. The dashboards never talk
  to the SSO provider directly.

## 3. Point the frontend at the API

`frontend/js/config.js` resolves `API_BASE_URL` in this order:

1. `window.__API_BASE_URL__` set in the HTML **before** the scripts
2. `?api=https://api.myschool.com` query string
3. `localStorage["api_base_url"]`
4. the page's own origin

Example for option B — in every dashboard HTML:

```html
<script>window.__API_BASE_URL__ = 'https://api.myschool.com';</script>
<script src="js/config.js"></script>
```

The Socket.IO client uses the same base URL; if it cannot connect, every view
falls back to polling the REST API every 15 seconds, so nothing breaks.

## 4. CORS

In the API server's `.env`:

```
ALLOWED_ORIGINS=https://myschool.com,https://portal.myschool.com
```

Only these origins may call the API from a browser. Same-origin requests are
always allowed. Never use `*` in production.

## 5. Embedding dashboards inside your existing pages

Simplest robust approach — an iframe:

```html
<iframe src="https://portal.myschool.com/student/index.html?api=https://api.myschool.com"
        style="width:100%;height:90vh;border:0"></iframe>
```

For seamless (no re-login) embedding, after your site authenticates the user,
exchange the identity for a token server-side and inject it into the iframe
page (e.g. `frontend/js/api.js` already reads `localStorage["scp_token"]`;
set it via `?token=` support — a 3-line addition to `api.js`).

## 6. Reusing UI components on your own pages

`frontend/js/components/` are plain browser classes tied only to the API:

- `messaging.js` → `new MessagingView({ container, canCompose })`
- `documents.js` → `new DocumentsView({ container, canUpload, canManage })`
- `announcements.js` → `new AnnouncementsView({ container, canPost })`

Load `config.js`, `api.js`, `ui.js` and the component, log the user in
(`POST /api/auth/login`, store the token), and the component works on any page.

## 7. Going live checklist

- [ ] `JWT_SECRET` set to a long random string
- [ ] `SEED_DEMO_DATA=0`
- [ ] `ALLOWED_ORIGINS` lists only your domains
- [ ] First super admin created and password changed
- [ ] HTTPS in front of the API (Socket.IO needs `wss://` in production)
- [ ] Reverse proxy forwards `Upgrade`/`Connection` headers (see README)

## 8. Scaling notes

- Default storage is SQLite (zero config, perfect up to thousands of users).
- The schema (`backend/database/schema.sql`) is plain relational SQL — migrate
  to PostgreSQL/MySQL by swapping the data layer; all queries already use
  prepared statements.
- File storage is a local directory; for scale, replace `UPLOAD_DIR` writes
  with S3-compatible storage (keep the `documents.storage_path` column).
- Rate limits, JWT expiry and session length are all environment-configurable.
