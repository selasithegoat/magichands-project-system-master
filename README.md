# MagicHands Project System

Multi-portal job/project management system with Client, Admin, Inventory, and Operations Wallboard portals backed by a Node/Express + MongoDB API. Designed for production workflows, departmental engagement, billing, inventory, project updates, notifications, chat, and file uploads.

## Disclaimer

## Template Origin

This project was originally bootstrapped from the MagicHands Project System template.

- Template repository: <https://github.com/selasithegoat/magichands-project-system.git>
- Template branch: `MASTER`
- Template version at fork: `cc83f0f373e147701ccdf57884a6943d33a95185`
- Template integration date: `2026-02-09`

The template is used as a reference upstream. This repository evolves independently.

## Project-Specific Customizations

This repository contains significant customizations beyond the base template, including:

- Assistant Lead support across all project flows
- Dual Lead notification logic
- Enhanced History views (Completed / Finished / Delivered separation)
- Dashboard stat recalculations
- Production sub-department normalization
- Quote, mockup, billing, comments, chat, and reminder workflows
- Inventory management and operations wallboard portals
- Runtime version metadata and release nicknames
- UI, workflow, and performance refinements across all portals

Because of these changes, upstream template updates are not merged automatically.

## Template Upgrade Strategy

The template repository is tracked as a Git upstream remote.

### Check for template updates

```bash
git fetch upstream
git log HEAD..upstream/master --oneline
```

## Features

### Client Portal

- Dashboard, next actions, ongoing projects, history, profile, activity, help, and engaged project workflows.
- Standard order intake, quote intake, pending assignments, front desk orders, order actions, and order revisions.
- Quote lifecycle support including requirement validation, cost validation, mockup/sample/bid tracking, undo controls, and quote-to-order conversion.
- Project details with updates, comments, mentions, reminders, delivery countdowns, challenges, mockups, billing guards, SMS prompts, and on-demand PDF downloads.
- Billing documents, receipts, waybills, invoice conversion, and editable billing metadata.
- Chat dock, notification center, global unread comments access, realtime refresh, and adaptive polling fallback.

### Admin Portal

- Admin dashboard, project management, cancelled orders, order groups, client overview, team management, and analytics.
- Shared front desk order management, quote intake, order actions, and billing document workflows.
- Admin project details with mockup intake/review controls, approval/reset actions, comments, updates, stage bottleneck alerts, and grouped project brief exports.
- Realtime notifications, chat, SMS prompts, and protected admin-only access for Administration users.

### Inventory Portal

- Inventory dashboard, inventory categories, inventory records, price list, stock transactions, client items, suppliers, purchase orders, reports, and settings.
- Role-gated access for approved inventory users, global search, quick actions, notification dropdown, dark/light appearance, and table density preferences.
- Inventory reports and exports backed by `/api/inventory` endpoints.

### Operations Wallboard

- Full-screen manager wallboard for live operations, authenticated for admin users.
- Rotating deck views for overview, risk, flow, team capacity, SLA/forecast, and handoff snapshots.
- Realtime refresh with a timed fallback, swipe controls, fullscreen mode, and critical alert handling.

### Backend/API

- Express + MongoDB API for projects, updates, auth, notifications, reminders, meetings, realtime SSE, chat, digests, ops wallboard, portal navigation, inventory, billing, help, and system version metadata.
- Configurable upload directory and upload limits with protected upload access.
- Runtime app version metadata from `VERSION`, optional major-version nicknames from `VERSION_NICKNAMES.json`, and `GET /api/system/version`.

## Latest Updates

- Improved performance across client and admin by lazy-loading chat, deferring notification sounds, loading global comments only on demand, and generating project PDFs only when downloaded.
- Reduced background traffic by preferring realtime SSE and pausing fallback polling while realtime connections are healthy.
- Replaced full project-list summary fetches with purpose-built summary/count endpoints where available.
- Reduced heavy renders in project detail countdowns, history, billing documents, and ongoing project lists.
- Fixed upload preview Blob URL cleanup to prevent memory leaks.
- Stabilized route wrapper components so protected route trees do not remount on every app render.
- Trimmed client startup weight by limiting Inter font assets to Latin weights and removing the global Buffer polyfill.
- Added quote validation undo controls and fixed quote approval stage display beyond Scope Approval.

## Tech Stack

- Frontend: React + Vite (Client, Admin, Inventory, and Ops Wallboard apps)
- Backend: Node.js + Express
- Database: MongoDB (Mongoose)
- Auth: JWT + HttpOnly cookies
- File uploads: Multer
- Realtime: Server-Sent Events with adaptive polling fallback

## Repository Structure

- `client/` - Client portal (Vite + React)
- `admin/` - Admin portal (Vite + React)
- `opsportal/` - Operations wallboard portal (Vite + React)
- `inventoryportal/` - Inventory portal (Vite + React)
- `server/` - Express API, MongoDB models, auth, notifications
- `scripts/` - Helper scripts

## Prerequisites

- Node.js (LTS recommended)
- npm
- MongoDB (local or hosted)

## Environment Variables

Create `server/.env` with the following keys:

```env
# Required
MONGO_URI=mongodb://localhost:27017/magichands
JWT_SECRET=replace-with-a-strong-secret

# Optional
PORT=5000
HOST=0.0.0.0
ADMIN_HOST=admin.magichandsproject.lan
CLIENT_HOST=magichandsproject.lan
OPS_HOST=ops.magichandsproject.lan
INVENTORY_HOST=inventory.magichandsproject.lan

# Smart email notification links (LAN/mobile fallback)
CLIENT_PORTAL_FALLBACK_URL=http://192.168.100.203
EMAIL_LINK_BASE_URL=http://192.168.100.203:5000
NOTIFICATION_CENTER_PATH=/

# Uploads
UPLOAD_DIR=C:/magichands-uploads
# Shared upload limit for backend handling and frontend upload messaging
UPLOAD_MAX_MB=200

# Cookies
NODE_ENV=development
COOKIE_SECURE=false
COOKIE_SAMESITE=lax

# Email (optional)
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-pass
ORDER_CREATION_NOTIFICATION_EMAIL=ops@example.com
```

## LAN Hostnames (Optional)

If you use subdomains locally, map them in your hosts file.

- `magichandsproject.lan`
- `admin.magichandsproject.lan`
- `ops.magichandsproject.lan`
- `inventory.magichandsproject.lan`

Then set `CLIENT_HOST`, `ADMIN_HOST`, `OPS_HOST`, and `INVENTORY_HOST` to match.

## Router-Agnostic LAN Access (No DNS)

If the main router/DNS is down or you are on a different router, you can still
access the system using the server IP address. The API serves the portals at
path prefixes in addition to subdomains:

- Client: `http://<server-ip>/`
- Admin: `http://<server-ip>/admin`
- Ops wallboard: `http://<server-ip>/ops`
- Inventory: `http://<server-ip>/inventory`

This avoids any dependency on `.lan` hostnames and works on any LAN that can
reach the server IP.

## Install

```bash
# Server
cd server
npm install

# Client
cd ../client
npm install

# Admin
cd ../admin
npm install

# Ops wallboard
cd ../opsportal
npm install

# Inventory
cd ../inventoryportal
npm install
```

## Run (Development)

Open five terminals.

```bash
# 1) API server
cd server
npm run watch
```

```bash
# 2) Client portal
cd client
npm run dev -- --host
```

```bash
# 3) Admin portal
cd admin
npm run dev
```

```bash
# 4) Ops wallboard portal
cd opsportal
npm run dev
```

```bash
# 5) Inventory portal
cd ../inventoryportal
npm run dev
```

Default ports:

- API: `http://localhost:5000`
- Client: `http://localhost:5173`
- Admin: `http://localhost:3000`
- Ops wallboard: `http://localhost:3002`
- Inventory: `http://localhost:3003`

All frontends proxy `/api` (and `/uploads` for client) to the API server.

## Build for Production

```bash
# Build client
cd client
npm run build

# Build admin
cd ../admin
npm run build

# Build ops wallboard
cd ../opsportal
npm run build
```

```bash
# Build inventory portal
cd ../inventoryportal
npm run build
```

Then run the API server (it serves the portal dist folders when present).

```bash
cd ../server
node src/server.js
```

## Staging (No-Interrupt Updates)

Use a staging instance on a separate port + database so you can test changes
without disrupting the live system.

1. Create a staging env file:

```bash
cp server/.env.staging.example server/.env.staging
```

Update `PORT`, `MONGO_URI`, and the IPs/hosts inside `server/.env.staging`.

2. Build staging bundles:

```bash
cd client
npm run build:staging

cd ../admin
npm run build:staging

cd ../opsportal
npm run build:staging

cd ../inventoryportal
npm run build:staging
```

3. Start the staging API (PowerShell):

```powershell
$env:DOTENV_FILE = ".env.staging"
node src/server.js
```

Staging URLs (example for port `8080`):

- Client: `http://<server-ip>:8080/`
- Admin: `http://<server-ip>:8080/admin`
- Ops wallboard: `http://<server-ip>:8080/ops`
- Inventory: `http://<server-ip>:8080/inventory`

## Promote to Production

When staging looks good:

1. Build production bundles (`npm run build` in each portal).
2. Restart the main API server on the production port (e.g., `80`).

## Create an Admin User (Optional)

There is a helper script in `server/createAdmin.js`.

```bash
cd server
node createAdmin.js
```

This creates a default admin user (check the script for credentials) and updates the role if the user already exists.

## Uploads

- Uploads are stored in `UPLOAD_DIR` (default: `magichands-uploads` folder outside the repo).
- Served at `http://<host>:<port>/uploads`.

## Scripts

### Server

- `npm run watch`: Start API with nodemon

### Frontend Portals

- `npm run dev`: Vite dev server
- `npm run build`: Production build
- `npm run preview`: Preview build

These script names are available in `client/`, `admin/`, `inventoryportal/`, and `opsportal/`.

## Versioning

- The displayed app version is read from the root `VERSION` file.
- The server package version should stay aligned with `VERSION` because the API falls back to `server/package.json` if `VERSION` is unavailable.
- Major-version nicknames live in `VERSION_NICKNAMES.json`.
- Runtime version metadata is available from `GET /api/system/version` for authenticated users.
- Frontend package versions are private build package versions and are not the user-facing app version.

### Security

- `powershell -ExecutionPolicy Bypass -File .\scripts\secret-scan.ps1`: Run secret scan (uses `gitleaks` if installed, else regex fallback)
- `powershell -ExecutionPolicy Bypass -File .\scripts\secret-scan.ps1 -SkipHistory`: Faster scan without git history diff checks

## Notes

- The client portal shows engaged projects based on engaged sub-departments.
- Notifications are delivered in-app through realtime SSE with polling as a fallback.
- Project history filters are based on the project delivery date (fallback to order/created date).
- Large or optional UI surfaces such as chat, comments, notification sounds, and project PDF generation are intentionally deferred until needed.

## License

GNU AGPL-3.0. See `LICENSE`.
