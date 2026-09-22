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

## Import Center (the guided order)
Everything the school already keeps in spreadsheets goes in through one screen,
**Admin Dashboard → Import Center**, in the order that keeps the data connected:

| Step | Brings in | What it links automatically |
| --- | --- | --- |
| 1 Timetable | the master timetable | creates the classes and subjects, and links each teacher to the class + subject they teach (clashes are found before anything is saved) |
| 2 Teachers | staff list | logins (username = staff ID), subjects created, teachers linked to every class named |
| 3 Students | class lists | logins, put into their classes (created if missing), guardians in the file become parent accounts linked to the child |
| 4 Parents & guardians | guardian list | logins, each guardian linked to the children named (student IDs or names) |
| 5 Attendance | one row per student per day | upserts by student + date, so re-importing a corrected day never duplicates |
| 6 Fees | fee structures | billed to the class named, or to one student, or the whole school |
| 7 Payments | receipts | matched to the student, receipts deduplicated |
| 8 Report cards | marks per subject, or PDF report cards | report cards with totals, averages and class positions, plus the same marks in **Exams & Results**. PDF cards are matched by file name — download the PDF format first |

Every step shows a **preview first** ("nothing has been saved yet") and only then
imports, and the preview is produced by the same code that does the import, so it
cannot promise something the import will not do. Re-importing a file is safe:
records are matched, not duplicated, and a corrected timetable updates the
existing lesson instead of creating a second one. New logins are shown once with
their passwords, and can be downloaded as CSV.

`Import Center → Download all templates` gives a zip with a starter CSV per step
plus a README explaining the order.

## Report cards
**Admin Dashboard → Report Cards** is the end-of-term job:

* download the **PDF format** (one card per child, already named with the student
  ID). Fill it, or replace each file with the school's own PDF and keep the file
  name, then upload the zip;
* upload the cards themselves — **PDF, Word, JPG/PNG scans**, one file or a whole
  **zip** (the file name should carry the student ID or the child's name), or
  import a spreadsheet of marks in the Import Center;
* files whose name matches no child are parked and can be matched by hand;
* every child is listed with their report card and their fee balance;
* **children who have cleared their fees are ticked automatically** — children who
  still owe are shown with the amount owing and must be ticked deliberately
  (the server enforces the same rule), and a note can go with the delivery;
* sending delivers an in-platform alert to each child's guardians, plus email when
  the school has it configured, and stamps the card as sent.

Parents see released report cards under **Report Cards**, students under
**Results**; a card that has not been released (or belongs to another family)
cannot be downloaded.

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
   Or, on the machine that will run the school: `npm run setup -- --url https://the-school-address`
2. Install dependencies: `npm install` (the setup command does this)
3. Start: `npm start`
4. Open `http://localhost:4000/`

The server serves both the public website and the dashboards, so the frontend and backend use the same origin by default.

## Tests
`npm test` runs the API, frontend-smoke and page-asset suites (no running server
needed). The remaining suites talk to a server on `http://localhost:4000`:

| Command | What it proves |
| --- | --- |
| `npm test` | API behaviour (57 tests), frontend smoke, every page resolves its assets, no markup/CSS defects anywhere |
| `npm run test:ui` | dashboard dialogs, editors and validation behave (no unhandled errors), messaging works end to end (send, edit, delete, search, attachments, channels, phone thread + back, unread badges), delete flows, every link/button/form is wired |
| `npm run test:deep` | every view of all 10 dashboards boots and renders, then the same views are re-rendered at 390px and 1280px and checked for layout defects (unwrapped/unlabelled tables, duplicate ids, unnamed icon buttons, missing alt text) |
| `node tests/imports.test.js` | the guided import pipeline end to end (guide, templates, starter pack, dry runs save nothing, every kind imports and re-imports without duplicating), report cards as PDF and as a zip (matching, unmatched files, the fee gate, parent access), and the Import Center + Report Cards screens rendered in jsdom — the test removes the records it created |
| `node tests/_audit.js <role> [width]` | clicks every control in every view as that role at 1280px and 390px and reports errors, unhandled rejections and buttons that do nothing. `<role>` is a partial match: `super-admin`, `admin`, `teacher`, `student`, `parent`. A role that matches nothing exits with code 2 instead of reporting a vacuous pass |

## Licence
This system is proprietary. Copyright (c) 2026 ScottsTechX Enterprise (U) Ltd.
If it is sold to you, you have the rights in `LICENSE` after you pay the full amount.
You may not resell, publish, or give away the source.
