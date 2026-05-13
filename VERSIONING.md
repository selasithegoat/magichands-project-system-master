# Versioning

The system version lives in the root `VERSION` file. Keep it in Semantic
Versioning format:

```text
MAJOR.MINOR.PATCH
```

Use the numbers this way:

- `PATCH`: bug fixes only, for example `2.5.9`.
- `MINOR`: new backward-compatible features, for example `2.6.0`.
- `MAJOR`: breaking workflow, API, or data changes, for example `3.0.0`.

Version nicknames live in `VERSION_NICKNAMES.json`. Add or update entries by
exact, minor, or major version. Exact entries take priority, then minor, then
major:

```json
{
  "2": "Andromeda",
  "3": "Andromeda 2.0",
  "3.2": "Andromeda 2.2",
  "3.2.1": "Andromeda 2.2 Patch 1"
}
```

## Release Workflow

1. Update `VERSION`.
2. Move the relevant notes from `CHANGELOG.md` `Unreleased` into a dated
   release section.
3. Commit the release.
4. Tag the commit:

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
```

5. Push the commit and tag:

```bash
git push origin main
git push origin vX.Y.Z
```

## Runtime Metadata

The backend exposes this endpoint to authenticated users:

```http
GET /api/system/version
```

The response includes the app version, commit, branch, environment, and server
start time. It also includes the best matching version nickname when one exists.
Deployment tools can override metadata with these environment variables:

- `APP_VERSION`
- `APP_COMMIT`
- `APP_BRANCH`
- `APP_BUILT_AT`
- `APP_VERSION_NICKNAME`

If those are not set, the server falls back to `VERSION`, then
`server/package.json`.
