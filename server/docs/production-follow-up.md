# Production follow-up and delivery revisions

Open **Production follow-up** in the Client or Admin portal. Production completion buttons in the engaged project pages open the same workflow. Delivery calendar changes for orders also open it. Quote deadlines retain their existing workflow.

## Production targets and ownership

The delivery deadline remains the customer commitment. A separate production finish target subtracts quality control, photography, packaging, transport and contingency from that deadline in working hours.

Initial allowances are 2, 1, 2, 2 and 2 hours respectively. Photography defaults to zero unless that department is engaged. The project Lead, assistant Lead, Front Desk or Admin can adjust allowances and record a reason. Set an allowance to zero for an activity that does not apply. The default calendar is Monday–Friday, 08:00–17:00, Africa/Accra; working days, shifts and holiday dates are configurable per project. These are scheduling targets, not capacity forecasts.

There is one accountable confirmation per production department, collecting that department's item scopes. The engagement acknowledgement supplies the initial owner. Where there is no acknowledgement, management assigns an eligible owner. Production trainees cannot own or complete these assignments. A project's Lead uses the explicit verification action instead of recording a normal departmental completion on their own project.

For sequential production, set the hours needed by subsequent production departments on the assignment. Its target moves earlier by that allowance. Parallel departments can use zero. A scope change or a new production cycle invalidates the affected old confirmation.

Owners can complete work, record an estimate, or report a blocker. Management can reassign, review an estimate, or verify completion on behalf with a reason. Estimates and reviewed extensions preserve the calculated target and its lateness history. After all confirmations, existing sample-approval, batch-production and meeting checks run before advancement to quality control. If a check remains outstanding, the Lead sees the reason and can retry after resolving it.

## Persistent follow-up

The backend checks active orders every minute, including when all browsers are closed. Notifications follow the project working calendar; the Lead's missed-deadline dialog appears at the first browser refresh after the delivery deadline, including on login.

- Owners receive reminders from 30 working minutes before their target and during the final 30 minutes of their shift. Unresolved reminders repeat every 30 working minutes.
- Blocked or unassigned work needs Lead intervention immediately. Work one working hour overdue escalates to the Leads; after two working hours it also alerts Admin.
- A missed delivery deadline while production is incomplete creates one required revision request. The Lead can submit it or snooze for 30 working minutes. Reading notifications does not resolve any work or request.
- Submitted requests repeat hourly to the assigned reviewer, or to Front Desk/Admin while unclaimed. Assignment reminders continue independently.
- Once this missed-delivery workflow has started, subsequent missed revised deadlines recur until delivery, even if production has since finished.

Production reminders pause on hold. Holds do not automatically extend a delivery commitment. Delivered, closed, cancelled and superseded records are excluded from scheduling. Existing requests and history are retained.

## Delivery revision rules

1. The Lead submits the delay reason, remaining production hours and suggested delivery date/time. Front Desk and Admin are the only request-review recipients. Management can also raise a proactive request before a miss.
2. A Front Desk user or Admin takes responsibility for review. A project Lead cannot review their own request, even when also an Admin. Admin can take over a request assigned to another reviewer.
3. The reviewer records the client contact, method, time, conversation summary and informed/accepted outcome for the exact proposal. Unreachable or rejected outcomes do not authorize a change. This is an accountable communication record; offline conversations are not independently verified or automatically sent by this feature.
4. The reviewer applies the communicated date. Any change to the proposal clears its communication confirmation and requires fresh communication. The proposed deadline must still be in the future when applied.
5. Applying the date atomically stores the new deadline and complete revision history, recalculates production targets, and alerts the Leads and assigned production owners. A new missed deadline creates the next numbered request.

Existing order date-editing routes are guarded on the server, including document saves and ordinary query updates. Initial order creation is unchanged. Existing orders with a missing date use a revision request to establish their delivery commitment. General project responses exclude the embedded workflow; owners see only relevant production work, while management sees requests and communication history.

Updates use a revision and project snapshot comparison so concurrent reviewers cannot apply a request twice or overwrite a newer workflow state. The scheduler groups notifications per project, recipient and notification type. ActivityLog retains actions beyond the bounded recent-activity preview.

## Verification

From `server/`:

```text
npm test
npm run test:production
```

The integration suite launches a separate MongoDB process on a temporary local port and never connects to the application's database. Set `MONGOD_TEST_BINARY` when MongoDB is installed elsewhere. Integration tests report a skip if the binary is unavailable.

From the repository root:

```text
node scripts/test-production-follow-up-ui.cjs
```

The browser smoke test uses an installed Chromium browser with an isolated profile, a local HTTP fixture and mocked workflow responses. Set `BROWSER_TEST_BINARY` to use another executable. Screenshots are saved under `client/node_modules/.cache/production-follow-up-smoke/`.

Build both portals after changes. Restart the backend through the normal application process manager to start the scheduler; no migration script is required. Existing active orders are initialized on the first scheduler sweep, so legacy overdue orders will immediately enter this workflow when the updated backend starts.
