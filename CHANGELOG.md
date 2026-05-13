# Changelog

All notable changes to this system should be documented here.

This project follows Semantic Versioning: `MAJOR.MINOR.PATCH`.

## [Unreleased]

## [3.2.1] - 2026-05-13

- Fixed inactivity session handling so active users are not logged out before the configured timeout.

## [3.2.0] - 2026-05-11

- Added undo controls for multi-requirement quote requirements validation before quote submission.
- Added an undo action for completed quote cost validation.
- Fixed quote Project Details approvals so quotes beyond Scope Approval show the correct workflow stage.
- Improved performance across client and admin by lazy-loading chat, deferring notification sounds, loading global comments only on demand, and generating project PDFs only when downloaded.
- Reduced background traffic by preferring realtime SSE and pausing fallback polling while realtime connections are healthy.
- Replaced full project-list summary fetches with purpose-built summary/count endpoints where available.
- Reduced heavy renders in project detail countdowns, history, billing documents, and ongoing project lists.
- Fixed upload preview Blob URL cleanup to prevent memory leaks.
- Stabilized route wrapper components so protected route trees do not remount on every app render.
- Trimmed client startup weight by limiting Inter font assets to Latin weights and removing the global Buffer polyfill.

## [3.1.0] - 2026-05-08

- Added filtering to the EOD updates page for easier review of submitted updates.
- Added a downloadable Admin Group Project brief with grouped project details, lead sections, mockup images, and reference file snippets.
- Added client mockup intake handling in Admin Project Details, including workflow controls for uploaded client mockups.
- Made billing document metadata editable from the billing documents workflow.
- Fixed order revisions so mockup uploads are included in revision handling and notification emails.
- Fixed engaged actions so Graphics users can act on projects assigned to their own department.
- Fixed Department Updates table inputs so the spacebar can be used normally while typing.
- Improved brief overview formatting in exported group briefs and scope emails by preserving typed line-by-line structure.

## [3.0.0] - 2026-04-30

- Added billing documents

## [2.9.1] - 2026-04-29

- Expanded chat reactions so users can react with any single emoji from the emoji picker.
- Reduced and repositioned chat reaction and composer emoji controls, including an icon-only composer emoji button before send.
- Added admin portal emoji picker dependencies so the shared chat dock reaction and emoji picker UI is available there.

## [2.9.0] - 2026-04-28

- Added a library-backed emoji picker and Twemoji rendering for chat messages and reactions.
- Updated the chat emoji picker to stay open until outside click and follow the global app theme.
- Added direct-chat typing indicators and sender-side read receipts.

## [2.8.3] - 2026-04-27

- Fixed the project route choice modal to label the lead detail option as "Lead Project" instead of "Admin Project".

## [2.8.2] - 2026-04-27

- Fixed the unread comments modal to mark comments as read through the shared bulk read endpoint, avoiding 404 errors on deployed builds.

## [2.8.1] - 2026-04-27

- Fixed the unread comments modal so comments leave the list immediately after being opened and marked read.

## [2.8.0] - 2026-04-27

- Added project-scoped comment threads with replies for authorized project users.
- Added comment access from Project Details, Front Desk Order Actions, and Engaged Actions.
- Moved Front Desk and Engaged action comments into their sidebars for persistent project context.
- Added project-scoped user mentions in comments with mention notifications.
- Added a global comments FAB with project/comment context and deep links back to comment threads.
- Added admin project detail routing so admins can open project comments from the admin portal.
- Changed the comments FAB to show only unread comments from other users.
- Added comment edit/delete controls for authors and admins.
- Added comment notifications and realtime refresh support.

## [2.7.1] - 2026-04-27

- Blocked project completion until full payment, authorization, or P.O. is verified.
- Added a completion billing guard for invoice-only and part-payment-only states.

## [2.7.0] - 2026-04-27

- Added optional reference orders to Front Desk order intake and revision.
- Added reference order search by order number, client, and project name.
- Added clickable reference order cards for project detail and engaged department views.
- Added reference access so engaged users can open linked projects for context.

## [2.6.0] - 2026-04-27

- Added a shared app version source in `VERSION`.
- Added major-version nicknames in `VERSION_NICKNAMES.json`.
- Added `GET /api/system/version` for runtime version metadata.
- Added client-side version displays for the app badge and post-login splash.
- Moved the version badge into the main header as the rightmost action.
- Added versioning workflow notes.

## [2.5.8] - 2026-04-27

- Baseline version before formal release tracking was introduced.
