## ⚠️DISCLAIMER:
## 📦 Template Origin

This project was originally bootstrapped from the **MagicHands Project System**.

- **Template repository:** https://github.com/selasithegoat/magichands-project-system.git
- **Template branch:** MASTER
- **Template version at fork:** cc83f0f373e147701ccdf57884a6943d33a95185
- **Template integration date:** 2026-02-09

The template is used as a **reference upstream**. This repository evolves independently.

## 🔧 Project-Specific Customizations

This repository contains significant customizations beyond the base template, including:

- Assistant Lead support across all project flows
- Dual Lead notification logic
- Enhanced History views (Completed / Finished / Delivered separation)
- Dashboard stat recalculations
- Production sub-department normalization
- UI and workflow refinements across admin and client portals

Because of these changes, **upstream template updates are not merged automatically**.

## ⬆️ Template Upgrade Strategy

The template repository is tracked as a Git **upstream remote**.

### To check for template updates
```bash
git fetch upstream
git log HEAD..upstream/master --oneline


# MagicHands Project System

Multi‑portal job/project management system with a **Client Portal** and **Admin Portal** backed by a Node/Express + MongoDB API. Designed for production workflows, departmental engagement, project updates, notifications, and file uploads.

## Features
- Client portal: dashboard, project list, history, engaged projects, profile, and notifications.
- Admin portal: dashboards, project details, team management, and client overview.
- Project creation wizards (standard and quote workflows).
- Departmental engagement + acknowledgements (including production sub‑departments).
- Real‑time refresh via polling/realtime hooks.
- File uploads served from a configurable uploads directory.
- Notifications with in‑app toasts and a notification center.

## Tech Stack
- Frontend: React + Vite (Admin and Client apps)
- Backend: Node.js + Express
- Database: MongoDB (Mongoose)
- Auth: JWT + HttpOnly cookies
- File uploads: Multer

## Repository Structure
- `client/` — Client portal (Vite + React)
- `admin/` — Admin portal (Vite + React)
- `server/` — Express API, MongoDB models, auth, notifications
- `scripts/` — Helper scripts

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

# Uploads
UPLOAD_DIR=C:/magichands-uploads
UPLOAD_MAX_MB=50

# Cookies
NODE_ENV=development
COOKIE_SECURE=false
COOKIE_SAMESITE=lax

# Email (optional)
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-pass
```

### LAN Hostnames (Optional)
If you use subdomains locally, map them in your hosts file:
- `magichandsproject.lan`
- `admin.magichandsproject.lan`

Then set `ADMIN_HOST` and `CLIENT_HOST` to match.

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
```

## Run (Development)
Open three terminals:

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

Default ports:
- API: `http://localhost:5000`
- Client: `http://localhost:5173`
- Admin: `http://localhost:3000`

Both frontends proxy `/api` (and `/uploads` for client) to the API server.

## Build for Production
```bash
# Build client
cd client
npm run build

# Build admin
cd ../admin
npm run build
```

Then run the API server (it serves both dist folders when present):
```bash
cd ../server
node src/server.js
```

## Create an Admin User (Optional)
There is a helper script in `server/createAdmin.js`:
```bash
cd server
node createAdmin.js
```
This creates a default admin user (check the script for credentials) and updates the role if the user already exists.

## Uploads
- Uploads are stored in `UPLOAD_DIR` (default: `magichands-uploads` folder outside the repo).
- Served at `http://<host>:<port>/uploads`.

## Scripts
**Server**
- `npm run watch` — Start API with nodemon

**Client/Admin**
- `npm run dev` — Vite dev server
- `npm run build` — Production build
- `npm run preview` — Preview build

## Notes
- The client portal shows engaged projects based on engaged sub‑departments.
- Notifications are delivered in‑app and polled from `/api/notifications`.
- Project history filters are based on the project delivery date (fallback to order/created date).

## License
GNU AGPL-3.0. See `LICENSE`.
