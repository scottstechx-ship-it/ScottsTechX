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

## Requirements
- **Node.js 22.13 or newer** (the app uses the built-in `node:sqlite` driver as a
  fallback and `officeparser` 8 for document previews).
- Optional: a C++ toolchain if you want the native `better-sqlite3` binding;
  without it the server automatically falls back to `node:sqlite`.

## Bulk import formats
Student / teacher / fee imports accept **CSV** and **Excel `.xlsx`** files.
CSV is read with a built-in RFC 4180 parser (quoted commas, `""` escapes,
UTF-8 BOM, `,` `;` or tab delimiters) and `.xlsx` with `read-excel-file`; real
Excel date cells arrive as `YYYY-MM-DD`. Legacy `.xls` (Excel 97–2003) is not
supported — Excel's *Save As → Excel Workbook (.xlsx)* or CSV is required. The
rejected `xlsx` package (unfixed prototype-pollution and ReDoS advisories) is no
longer a dependency.

## Run
1. Copy `.env.example` to `.env` and set a strong `JWT_SECRET` for production.
2. Install dependencies: `npm install`
3. Start: `npm start`
4. Open `http://localhost:4000/`

The server serves both the public website and the dashboards, so the frontend and backend use the same origin by default.

## Tests
`npm test` runs the API, frontend-smoke and page-asset suites (no running server
needed). The remaining suites talk to a server on `http://localhost:4000`:

| Command | What it proves |
| --- | --- |
| `npm test` | API behaviour (57 tests), frontend smoke, every page resolves its assets, no markup/CSS defects anywhere |
| `npm run test:ui` | dashboard dialogs, editors and validation behave (no unhandled errors), delete flows, every link/button/form is wired |
| `npm run test:deep` | every view of all 10 dashboards boots and renders, then the same views are re-rendered at 390px and 1280px and checked for layout defects (unwrapped/unlabelled tables, duplicate ids, unnamed icon buttons, missing alt text) |
| `node tests/_audit.js <role> [width]` | clicks every control in every view as that role at 1280px and 390px and reports errors, unhandled rejections and buttons that do nothing. `<role>` is a partial match: `super-admin`, `admin`, `teacher`, `student`, `parent`. A role that matches nothing exits with code 2 instead of reporting a vacuous pass |
