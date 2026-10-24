# Frontend API boundary

The [backend repository](https://github.com/GVPproj/pocketbase-fly-starter) is the
source of truth for PocketBase server code, hooks, migrations, API contracts,
authoring operations and deployment. See its [API contracts](https://github.com/GVPproj/pocketbase-fly-starter/blob/main/docs/website/contracts.md)
and [authoring and operations guide](https://github.com/GVPproj/pocketbase-fly-starter/blob/main/docs/website/README.md).
No sibling checkout is required here.

## Frontend responsibilities

- `src/integrations/published-release.mjs` fetches published music releases and
  artwork; `src/integrations/published-content.mjs` fetches published software and
  Likes collection items and their assets.
- Both authenticate with a restricted `publishing_builds` identity using
  `PUBLISHING_POCKETBASE_URL`, `PUBLISHING_BUILD_EMAIL` and
  `PUBLISHING_BUILD_PASSWORD`. These are server-only variables: never use public
  prefixes or superuser credentials.
- Fetching happens when Astro starts development or a build, not in visitors'
  browsers. The integrations validate responses and asset integrity, produce
  public projections for rendering, and copy media into the static output.
- Missing configuration, invalid responses or unavailable required assets fail
  the build. No checked-in CMS fallback is used. Failed deployments leave the
  previous successful deployment intact; published static pages do not require
  a running backend.
- Blog MDX, site settings, presentation and interaction behavior remain Git-owned.

## API surface consumed here

| Endpoint | Purpose |
| --- | --- |
| `POST /api/collections/publishing_builds/auth-with-password` | Restricted build authentication |
| `GET /api/publishing/releases` | Published release snapshots and withdrawal tombstones |
| `GET /api/publishing/artwork/{revision}` | Integrity-checked release artwork |
| `GET /api/publishing/content` | Software and Likes snapshots and withdrawals |
| `GET /api/publishing/content-assets/{revision}/{file}` | Integrity-checked content assets |

This is a consumer overview, not a second authoritative API specification.
Changes to the backend contract must preserve compatibility or be coordinated
with the frontend; deploy required backend support before its frontend consumer.
Saving a published item in PocketBase does not deploy the website: deploy Netlify
manually to publish the new static output.

## Testing boundary

Frontend tests exercise rendering, response validation, build failures and static
media delivery using local HTTP fixtures. They must run without backend source,
migrations or a PocketBase executable. Backend tests own authentication rules,
publication state transitions, draft isolation, migrations and persistence.
Keep fixture responses aligned with the canonical backend contract; mocks alone
cannot establish backend compatibility. Backend-owned end-to-end checks may test
an explicitly supplied frontend checkout as an additional integration check.
