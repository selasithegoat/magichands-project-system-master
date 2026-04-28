# Changelog

All notable changes to this system should be documented here.

This project follows Semantic Versioning: `MAJOR.MINOR.PATCH`.

## [Unreleased]

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
