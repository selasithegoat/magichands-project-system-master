# Live Updates implementation guide

The code for this feature is in the repository. The page groups projects by `projectLeadId` only. `assistantLeadId` is shown on the project card and does not create a second listing.

## Stage 1: Read the source data

- `Project` supplies the main lead, assistant lead, current stage, hold state, and cancellation state.
- `ProjectUpdate` supplies the latest posted note, its author, and its posting time.
- Project `MaterialRequest` records supply Inventory request and item statuses.
- The page keeps these three kinds of status separate. A project note has no status field.

No database migration or new collection is needed. The API groups only current project versions, so older revisions do not appear as duplicate projects.

## Stage 2: API

`server/src/controllers/liveUpdatesController.js` contains the read logic. `server/src/routes/adminRoutes.js` registers these admin only routes:

```text
GET /api/admin/live-updates/leads
GET /api/admin/live-updates/leads/:leadId/projects
```

The first route returns lead profiles with active and total project counts, open request counts, and projects flagged for attention. A project is flagged when it is on hold or has an open High or Urgent material request. The second route returns all current projects whose `projectLeadId` equals the selected lead. It reads the latest project update and project material requests in bulk.

## Stage 3: Admin page

`admin/src/pages/LiveUpdates/LiveUpdates.jsx` and `LiveUpdates.css` contain the page. `admin/src/App.jsx` adds `/live-updates`; `admin/src/config/adminNavigation.js` and `admin/src/components/Sidebar/Sidebar.jsx` add the navigation item.

The page opens on lead profiles with attention counts first. Selecting a lead shows priority projects first, with the latest note, stage, and Inventory request status visible on each card. Expanding a project shows full details and item fulfillment or purchase status. The page refreshes on relevant realtime events, once per minute, on tab focus, or when the user presses **Refresh now**.

## Stage 4: Verify locally and in staging

From the repository root in PowerShell:

```powershell
Set-Location server
node --test src/controllers/liveUpdatesController.test.js
node --check src/controllers/liveUpdatesController.js
Set-Location ../admin
npx.cmd eslint src/pages/LiveUpdates/LiveUpdates.jsx src/App.jsx src/components/Sidebar/Sidebar.jsx src/config/adminNavigation.js
npm.cmd run build:staging
```

The staging API must use `server/.env.staging` with a separate MongoDB database and `ADMIN_DIST_DIR` pointing to `admin/dist-staging`. Restart the staging API using the existing process manager so it loads the new route. For a manual staging session, run:

```powershell
Set-Location server
$env:DOTENV_FILE = ".env.staging"
node src/server.js
```

For a preview instance, set `BACKGROUND_SCHEDULERS_ENABLED=false` in `server/.env.staging` so scheduled reports and reminders do not run while the demo server is open.

The repeatable demo seed is `server/scripts/seed-staging-live-updates.js`. It works only with the `STG-` project fixtures in a database whose name contains `staging`. It adds synthetic notes and requests without creating stock transactions:

```powershell
Set-Location server
node scripts/seed-staging-live-updates.js           # Preview the target projects
node scripts/seed-staging-live-updates.js --apply   # Add demo records once
node scripts/seed-staging-live-updates.js --undo    # Remove only those demo records
```

Open the staging admin portal and check:

1. An admin can open **Live Updates**; a non admin cannot call either API endpoint.
2. A project with a main lead and an assistant appears only under the main lead. The assistant's name is visible on that project.
3. A new project update appears with the correct author and posting time.
4. A request status change in Inventory appears with its own status change time; item fulfillment and purchase status remain visible.
5. Projects without notes or requests show clear empty states. Completed and cancelled projects remain available under **All projects**.
6. Another user's change refreshes the page; Refresh now and the timed refresh also work.

## Stage 5: Production promotion

After staging review and approval, promote the same source revision. Build the admin production bundle with `npm.cmd run build` in `admin`, deploy the server and admin bundle using the normal release process, and restart only the production API process. Confirm the production admin page and one representative project after deployment.
