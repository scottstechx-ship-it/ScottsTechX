# School Communication Platform — REST API Reference

Base URL: `{API_BASE_URL}/api`  (configurable, see `.env.example` → `API_BASE_URL`)

All endpoints (except `/auth/login` and `/health`) require:

```
Authorization: Bearer <JWT>
```

Every response is JSON. Errors use the shape:

```json
{ "error": "Human-readable message" }
```

HTTP status codes: `200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`,
`403 Forbidden`, `404 Not Found`, `409 Conflict`, `413 Payload Too Large`, `429 Too Many Requests`, `500 Server Error`.

---

## Authentication — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | public | `{username, password}` → `{token, user}` (blocks unverified/pending/rejected parents; `mustChangePassword` tells the UI to force a password change) |
| POST | `/auth/register` | public | parent self-registration `{fullName, email, phone?, password, address?}` → pending approval + email verification link |
| POST | `/auth/verify-email` | public | `{token}` — verify the parent's email |
| POST | `/auth/resend-verification` | public | `{email}` — resend the verification link |
| POST | `/auth/set-password` | any user | `{newPassword}` — set a personal password (clears `mustChangePassword`) |
| POST | `/auth/logout` | any user | records logout in audit log |
| GET | `/auth/me` | any user | current user + role profile (class, children, classes…) |
| PUT | `/auth/change-password` | any user | `{currentPassword, newPassword}` |
| PUT | `/auth/profile` | any user | `{fullName, phone, email}` |
| POST | `/auth/forgot-password` | public | `{email}` → sends reset link (dev: also returns `devLink`) |
| POST | `/auth/reset-password` | public | `{token, newPassword}` — set a new password with a reset link |
| POST | `/auth/profile-picture` | any user | multipart `file` (image, ≤2MB) — upload avatar |
| GET | `/users/:id/avatar` | any user | authenticated avatar image |

Self-service password reset flow: `/forgot-password.html` → email link → `/reset-password.html?token=…`.
Without SMTP configured the link is returned in the response **in development only** (never in production).

## Users — `/api/users`  (super admin; admins read-only)

| Method | Endpoint | Required role | Description |
|---|---|---|---|
| GET | `/users?search=&role=&status=` | super_admin, admin | list users |
| POST | `/users` | super_admin | create user `{fullName, username, password, role, email?, phone?}` |
| GET | `/users/:id` | super_admin, admin | one user |
| PUT | `/users/:id` | super_admin | edit `{fullName, email, phone, role?, status?}` |
| DELETE | `/users/:id` | super_admin, admin | permanently delete a user (admins cannot delete admin/super admin accounts) |
| POST | `/users/:id/reset-password` | super_admin, admin | `{newPassword}` (admins cannot reset admin/super admin passwords) |

## Students — `/api/students`  (admins manage; teachers see their own classes only)

| Method | Endpoint | Required role | Description |
|---|---|---|---|
| GET | `/students?search=&classId=&status=` | super_admin, admin, teacher | list students |
| POST | `/students` | super_admin, admin | create `{fullName, studentCode, classId?, username?, password?, parentName?, …}` — when username/password are omitted a **login code** is generated from the student ID plus the school default password, and the student must change it on first login (credentials returned in the response) |
| GET | `/students/:id` | super_admin, admin, teacher | one student |
| PUT | `/students/:id` | super_admin, admin | edit student |
| DELETE | `/students/:id` | super_admin, admin | delete student (+ account) |
| PUT | `/students/:id/status` | super_admin, admin | `{status: active\|inactive\|suspended}` |
| POST | `/students/:id/link-parent` | super_admin, admin | `{parentId, relationship?}` |

## Teachers — `/api/teachers`  (admins manage)

| Method | Endpoint | Required role | Description |
|---|---|---|---|
| GET | `/teachers?search=&status=` | super_admin, admin | list teachers (with classes & subjects) |
| POST | `/teachers` | super_admin, admin | create `{fullName, staffCode?, subjects[], classIds[], username?, password?, …}` — missing staff code / username / password are **auto-generated** (staff code `TCH-YYYY-NNN`, login code from it, school default password) and returned in the response; the teacher must change the password on first login |
| GET | `/teachers/:id` | super_admin, admin | one teacher |
| PUT | `/teachers/:id` | super_admin, admin | edit teacher + class assignments |
| DELETE | `/teachers/:id` | super_admin, admin | delete teacher (+ account) |
| PUT | `/teachers/:id/status` | super_admin, admin | `{status}` |

## Parents — `/api/parents`

| Method | Endpoint | Required role | Description |
|---|---|---|---|
| GET | `/parents/profile` | parent | own parent profile |
| GET | `/parents/children` | parent | linked children with class + class teacher |
| GET | `/parents/children/:id` | parent | one child (must be linked) |
| GET | `/parents/contacts` | parent | who this parent may contact, grouped by child |
| GET | `/parents/documents?search=&classId=` | parent | documents shared with parent / children's classes |
| GET | `/parents/announcements` | parent | announcements for the parent |
| GET | `/parents/notifications` | parent | own notifications |
| PUT | `/parents/notifications/:id/read` | parent | mark read |
| GET | `/parents` | super_admin, admin | list parents (with children) |
| POST | `/parents` | super_admin, admin | create parent + account + child links |
| GET | `/parents/pending` | super_admin, admin | registrations awaiting approval |
| POST | `/parents/:id/approve` | super_admin, admin | approve a self-registered parent (unlocks login) |
| POST | `/parents/:id/reject` | super_admin, admin | reject a registration (blocks login) |
| GET | `/parents/:id` | super_admin, admin | one parent |
| PUT | `/parents/:id` | super_admin, admin | edit parent + child links |
| DELETE | `/parents/:id` | super_admin, admin | delete parent |

## Classes — `/api/classes`

| Method | Endpoint | Required role | Description |
|---|---|---|---|
| GET | `/classes?academicYear=` | all | list (teachers see own; students see their class) |
| POST | `/classes` | super_admin, admin | `{name, stream, classTeacherId?, academicYear}` |
| GET | `/classes/:id` | all (scoped) | class detail with teachers + students |
| PUT | `/classes/:id` | super_admin, admin | edit class |
| DELETE | `/classes/:id` | super_admin, admin | delete class |
| GET | `/classes/:id/students` | scoped | student list |

## Messaging — `/api/messages`  (all roles, backend-enforced contact rules)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/messages/conversations` | list conversations with last message, unread count |
| GET | `/messages/conversations/:id` | full thread with read status |
| GET | `/messages/search?q=` | search messages in my conversations |
| GET | `/messages/unread-count` | total unread messages |
| POST | `/messages/conversations` | create/get `{type: direct, participantId}` · `{type: class, classId}` · `{type: group, participantIds[], title}` · `{type: broadcast, role: teacher\|student\|parent\|admin}` (admins only — opens/returns a role-wide conversation) |
| POST | `/messages` | send `{conversationId, content?, attachmentId?}` |
| PUT | `/messages/conversations/:id/read` | mark whole conversation read |
| PUT | `/messages/:messageId/read` | mark one message read |
| DELETE | `/messages/:id` | delete own message (or super admin) |
| GET | `/messages/me/contacts` | who may the current user message (composer data) |

## Documents — `/api/documents`  (authenticated access only — no public file URLs)

| Method | Endpoint | Required role | Description |
|---|---|---|---|
| GET | `/documents?search=&folderId=&uploadedBy=` | all | list documents I can access |
| POST | `/documents` | all | upload (multipart `file`, `description`, `share` JSON array of `{targetType, targetId}`) |
| GET | `/documents/:id` | all (scoped) | metadata + access list |
| GET | `/documents/:id/download` | all (scoped) | authenticated file download |
| GET | `/documents/:id/preview` | all (scoped) | inline preview: images/PDF/text stream inline; DOCX/XLSX/PPTX/ODF are text-extracted and returned as JSON `{type:"office", text}` |
| PUT | `/documents/:id` | uploader / admins | rename / description / folder |
| DELETE | `/documents/:id` | uploader / admins | delete document + file |
| POST | `/documents/:id/share` | uploader / admins | `{targetType: user\|role\|class\|all, targetId}` |
| DELETE | `/documents/:id/access` | uploader / admins | remove one grant |
| GET | `/documents/folders/list` | all | my folders |
| POST | `/documents/folders` | all | `{name, parentId?}` |
| PUT | `/documents/folders/:id` | owner | rename |
| DELETE | `/documents/folders/:id` | owner | delete folder |

Share targets: `{targetType:"class", targetId:3}` shares with the class students,
its teachers and the parents of those students; `{targetType:"role", targetId:"teacher"}`,
`{targetType:"user", targetId:12}`, `{targetType:"all"}`.

## Announcements — `/api/announcements`

| Method | Endpoint | Required role | Description |
|---|---|---|---|
| GET | `/announcements` | all | announcements visible to me + unread count |
| POST | `/announcements` | super_admin, admin, teacher | `{title, content, targetType, targetValue?, important?}` (teachers: own classes only) |
| PUT | `/announcements/:id/read` | all (scoped) | mark read |
| PUT | `/announcements/:id` | sender / admins | edit |
| DELETE | `/announcements/:id` | sender / admins | delete |

Targets: `all`, `role` (student/parent/teacher/admin), `class`, `parents_of_class`,
`staff`, `students` (ids), `users` (ids).

## Notifications — `/api/notifications`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/notifications?limit=` | my notifications |
| GET | `/notifications/unread-count` | unread count |
| PUT | `/notifications/:id/read` | mark one read |
| PUT | `/notifications/read-all` | mark all read |
| DELETE | `/notifications/:id` | remove one |

## Settings — `/api/settings`

| Method | Endpoint | Required role | Description |
|---|---|---|---|
| GET | `/settings/public` | any user | school info + permissions + notifications (no secrets) |
| GET | `/settings/all` | super_admin, admin | full configuration |
| PUT | `/settings/school` | super_admin | school name, contacts, address, years, streams, departments |
| PUT | `/settings/permissions` | super_admin | messaging permission switches |
| PUT | `/settings/notifications` | super_admin | notification preferences (`newMessage`, `newDocument`, `newAnnouncement`, `importantNotices`, `accountChanges`, `emailOn: none\|important\|all`) — enforced by the backend |
| PUT | `/settings/security` | super_admin | strong passwords etc. |
| GET | `/settings/classes-reference` | staff | classes/teachers/students/parents for dropdowns |
| GET | `/settings/logo` | **public** | serve the school logo image (404 when unset) |
| POST | `/settings/logo` | super_admin, admin | upload/replace the logo (multipart `file`, PNG/JPG/WEBP/GIF ≤ 2 MB) |
| DELETE | `/settings/logo` | super_admin, admin | remove the school logo |
| POST | `/settings/backup` | super_admin | download JSON backup of all tables |
| GET | `/settings/status` | super_admin, admin | server/database/upload/CORS status |

## Logs — `/api/logs`

| Method | Endpoint | Required role | Description |
|---|---|---|---|
| GET | `/logs?search=&action=&userId=` | super_admin | audit log (login, uploads, deletes, password resets…) |
| GET | `/logs/me` | any user | my own activity |
| GET | `/logs/actions` | super_admin | distinct action types |

## Statistics — `/api/stats`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/stats/overview` | role-appropriate dashboard data (counts, recent activity, recent docs/announcements) |

## Academic — attendance, assignments, exams, timetable, subjects

| Method | Endpoint | Required role | Description |
|---|---|---|---|
| GET | `/attendance?classId=&date=&studentId=&month=` | all (scoped) | attendance records |
| POST | `/attendance` | admin, teacher | mark a class day `{classId, date, records:[{studentId,status,note?}]}` |
| PUT | `/attendance/:id` | admin, teacher | correct a record |
| DELETE | `/attendance/:id` | admin, teacher | delete a record |
| GET | `/attendance/summary/student/:id` | scoped | percentages + recent absences |
| GET | `/assignments?classId=&search=` | all (scoped) | assignments (students see their class; parents their children's classes) |
| POST | `/assignments` | admin, teacher | create `{title, classId, subject?, dueDate?, description?}` |
| GET | `/assignments/:id` | scoped | detail + submissions (staff) / my submission (student) |
| PUT | `/assignments/:id` | admin, teacher | edit (incl. archive) |
| DELETE | `/assignments/:id` | admin, teacher | delete |
| POST | `/assignments/:id/submit` | student | submit `{content?, attachmentId?}` |
| PUT | `/assignments/:id/grade/:submissionId` | admin, teacher | grade `{grade?, comment?, released?}` (grades hidden until released) |
| POST | `/assignments/:id/publish` | admin, teacher | release all grades to the class |
| GET | `/exams?classId=&search=` | all (scoped) | exams (students/parents see published/completed only) |
| POST | `/exams` | admin, teacher | create (draft) |
| GET | `/exams/:id` | scoped | detail + results (staff), my result (student), children's results only (parent) |
| PUT | `/exams/:id` | admin, teacher | edit / change status |
| DELETE | `/exams/:id` | admin, teacher | delete |
| PUT | `/exams/:id/results` | admin, teacher | enter marks `{results:[{studentId,marks,grade?,comments?}]}` → exam becomes "completed" |
| POST | `/exams/:id/publish` | **admin only** | publish results to students (teachers cannot) |
| GET | `/timetable?classId=&teacherId=&day=` | all (scoped) | timetable entries |
| POST | `/timetable` | admin | add entry (conflict-checked: class, teacher, room) |
| PUT | `/timetable/:id` | admin | edit (conflict-checked) |
| DELETE | `/timetable/:id` | admin | delete |
| GET | `/subjects` | all | subject list |
| POST | `/subjects` | admin | create |
| PUT | `/subjects/:id` | admin | edit |
| DELETE | `/subjects/:id` | admin | delete |

## Fees — `/api/fees`

| Method | Endpoint | Required role | Description |
|---|---|---|---|
| GET | `/fees/structures` | admin | fee structures |
| POST | `/fees/structures` | admin | create (+ optional auto-assign) |
| PUT | `/fees/structures/:id` | admin | edit |
| DELETE | `/fees/structures/:id` | admin | delete |
| POST | `/fees/assign` | admin | assign a structure to students |
| GET | `/fees/student/:studentId` | parent/student (own), admin | fees + payments + balance |
| POST | `/fees/student/:studentId/pay` | admin | record a payment (returns receipt no.) |
| GET | `/fees/report` | admin | due/paid/balance report |
| GET | `/fees/student/:studentId/receipt/:paymentId` | parent/admin | payment receipt |

## Imports — `/api/imports` (bulk student import, admin)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/imports/upload` | multipart CSV/XLSX → `{importId, headers, sample, total}` |
| POST | `/imports/validate` | `{importId, mapping}` → per-row validation + summary |
| POST | `/imports/preview` | `{importId, mapping}` → first rows for review |
| POST | `/imports/import` | `{importId, mapping}` → transactional import + counts/failures + **generated credentials** (every imported student gets a login code = username, a default password, and `mustChangePassword` on first login) |
| GET | `/imports` | import history |
| GET | `/imports/:id/credentials.csv` | download the login codes (username + default password) for an import |
| GET | `/imports/template.csv` | downloadable starter template |
| GET | `/imports/:id/report.csv` | downloadable error report |

Mappings: `{fullName|firstName+lastName, studentCode, className, stream, gender,
dateOfBirth, parentName, parentPhone, parentEmail, address, enrollmentDate,
username, password}`. Dates are normalised (incl. Excel serial dates); first
occurrence of a duplicate ID wins; nothing is written before the admin confirms.

## System

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | uptime + status |

---

## Realtime (Socket.IO)

Namespace: root. Auth via `auth.token` (JWT) on connection.

| Event | Direction | Payload |
|---|---|---|
| `message:new` | server → client | `{conversationId, message}` |
| `message:deleted` | server → client | `{id, conversationId}` |
| `notification` | server → client | `{id, type, title, body, link}` |
| `conversation:join` | client → server | `{conversationId}` |

If Socket.IO is unavailable the frontend automatically falls back to polling
the REST endpoints every 15 seconds (configurable).
