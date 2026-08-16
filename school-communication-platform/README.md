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

## Run
1. Copy `.env.example` to `.env` and set a strong `JWT_SECRET` for production.
2. Install dependencies: `npm install`
3. Start: `npm start`
4. Open `http://localhost:4000/`

The server serves both the public website and the dashboards, so the frontend and backend use the same origin by default.
