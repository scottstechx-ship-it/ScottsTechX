# Kalinabiri Secondary School — Unified Website + School Platform

This build merges the public Kalinabiri SS website with the connected school communication platform.

## Architecture
- `/` — public school website
- `/dashboard-access.html` — separate portal gateway
- `/platform/login.html` — secure role-aware login
- `/platform/super-admin/` — Super Admin dashboard
- `/platform/admin/` — Admin dashboard
- `/platform/teacher/` — Teacher dashboard
- `/platform/student/` — Student dashboard
- `/platform/parent/` — Parent dashboard
- `/api/*` — REST API
- `/socket.io/*` — realtime messaging

Legacy dashboard URLs remain as compatibility redirects to the secure portal gateway.

## Responsive UX
The dashboard layer now includes mobile sidebar behavior, responsive grids/tables/modals, touch-friendly controls, animated reveal states, focus-visible accessibility, reduced-motion support, and same-origin Socket.IO loading for deployment.

## Where the data lives (and how it stays)
Everything the school edits — users, messages, news, gallery, documents, fees,
settings — is stored in **one folder**:

```
<DATA_DIR>/school.db      the SQLite database (every row)
<DATA_DIR>/uploads        every uploaded file (documents, photos, logo)
<DATA_DIR>/backups        rolling snapshots
```

`DATA_DIR` is resolved at boot:

1. `DATABASE_PATH` / `UPLOAD_DIR` set explicitly → used verbatim.
2. `DATA_DIR` set explicitly → `<DATA_DIR>/{school.db,uploads}`.
3. A writable mount at `/var/data`, `/data` or `/mnt/data` → used, and an older
   in-repo database + uploads are carried across **once**, automatically.
4. Otherwise → `backend/data` inside the project (and the historical
   `backend/uploads` folder is kept if it already exists).

An existing database is **never** re-seeded or overwritten, so every change
survives restarts and redeploys — provided the folder itself survives. On a
host with an ephemeral filesystem (e.g. a free-tier dyno) the source tree is
replaced on deploy, so attach a volume and set `DATA_DIR` to it. The server
prints the resolved location and warns at startup when the data folder is
inside the source tree.

### Backups
Snapshots are real, self-contained SQLite files made with `VACUUM INTO` while
the server keeps running.

```bash
npm run backup            # take a snapshot now
npm run backup:list       # show them
npm run restore -- <file> # restore one (the current DB is kept aside first)
```

By default a snapshot is taken on startup and every `BACKUP_EVERY_HOURS`
(default 6), keeping the newest `BACKUP_KEEP` (default 14). Set
`AUTO_BACKUP=false` to turn the job off. Admins can also trigger one from
`POST /api/settings/backup/snapshot`, and `GET /api/settings/status` reports
the storage root, whether it is persistent, and the latest snapshot.

## Run
1. Copy `.env.example` to `.env` and set a strong `JWT_SECRET` for production.
2. Install dependencies: `npm install`
3. Start: `npm start`
4. Open `http://localhost:4000/`

The server serves both the public website and the dashboards, so the frontend and backend use the same origin by default.

## Tests
```bash
npm test          # API + messaging UI + storage/persistence + smoke + pages + public pages
npm run test:messages   # the chat UI driven end-to-end in jsdom
npm run test:storage    # restart the server and prove the edits are still there
npm run test:public     # the public website, rendered with its scripts
npm run test:deep       # every view in every dashboard
```
