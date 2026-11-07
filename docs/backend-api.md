# Frontend API boundary

The [backend repository](https://github.com/GVPproj/pocketbase-fly-starter) is the
source of truth for PocketBase server code, hooks, migrations, API contracts,
authoring operations and deployment. See its [API contracts](https://github.com/GVPproj/pocketbase-fly-starter/blob/main/docs/website/contracts.md)
and [authoring and operations guide](https://github.com/GVPproj/pocketbase-fly-starter/blob/main/docs/website/README.md).
No sibling checkout is required here.

## Frontend responsibilities

- `src/integrations/published-release.mjs` fetches current published `music_items`
  and artwork; `src/integrations/published-content.mjs` fetches current published
  Likes collection items, named-collection memberships/names and media. Neither
  path reads publication snapshots. The backend still supports those interfaces
  for unmigrated consumers; this cutover does not delete their history.
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
- Software, blog MDX, site settings, presentation and interaction behavior are
  Git-owned. Software index and detail pages render the validated content
  collection, not CMS snapshots or a checked-in CMS fallback. Astro's asset
  pipeline emits original software images and responsive WebP variants into the
  static output; Netlify's image CDN is disabled so media works independently of
  the backend and CDN.

## API surface consumed here

| Endpoint | Purpose |
| --- | --- |
| `POST /api/collections/publishing_builds/auth-with-password` | Restricted build authentication |
| `GET /api/publishing/current/music` | Current published music items |
| `GET /api/publishing/current/music-assets/{id}/{file}` | Integrity-checked current artwork |
| `GET /api/publishing/current/likes` | Current published Likes with current named collections |
| `GET /api/publishing/current/likes-assets/{id}/{file}` | Integrity-checked current Likes media |

This is a consumer overview, not a second authoritative API specification.
Changes to the backend contract must preserve compatibility or be coordinated
with the frontend; deploy required backend support before its frontend consumer.
The lists contain only published working records; absence removes an item from the
next output, rather than requiring withdrawal tombstones. Media paths are scoped to
that record's current published file, and SHA-256 checks protect acquisition. The
Likes projection excludes private preview/provenance fields. Build identities gain
no ordinary collection access.

Saving a published item in PocketBase makes its saved edits eligible for the next
build; **Save is not deployment**. Unpublishing or deleting an item removes it on the
next successful deployment whose build observes that change. Group renames,
membership edits and deleted named collections also follow current records; deleting
a named collection does not delete its items or expose drafts. Deploy Netlify
manually to publish the new static output.

Content reflects acquisition time, not one atomic site-wide instant. An edit after
acquisition may wait until the following build. If media disappears or changes
between metadata acquisition and download, the build fails: retry after the edit
settles. No editing lock or permanent revision store is used on this path. Auth,
fetch and validation failures are not empty catalogues. Previously deployed static
pages and media remain untouched by failed builds or backend unavailability.

## Current-record cutover (#28–29)

Complete the software export/retirement chain (#24–26) before rollout. In the backend
repository, make a recoverable, matching code/database/storage backup, then rehearse
the forward `music_items` rename in an isolated restore with outbound side effects
blocked. The migration preserves IDs and uploads; it does not recreate music records
or change Likes identities. Keep the backup through verification.

Deploy backend support **before** this frontend. Verify restricted direct-read auth,
published-only records/media and legacy snapshot compatibility, then run the
backend-owned integration suite with this checkout explicitly supplied. Build into
a fresh output directory and promote only after success. Do not deploy candidate
frontend code against a backend lacking these routes: there is deliberately no
snapshot fallback. Production deployment requires separate owner approval.

For recovery, restore the previous frontend deployment first; the new backend still
serves its snapshot APIs. A fresh build of the old snapshot consumer can include
retained publications whose working records were deleted: verify its output before
promotion rather than assuming current-record deletion semantics. If backend
recovery is necessary, restore the paired pre-migration database/storage and
matching old code together, never downgrade code against a renamed schema or
partially restore uploads. See the backend rollout guide
for the authoritative procedure. No production deletion is authorized by this work.

## Software authoring

Software is Git-owned, with no publishing backend source or export command. Each
project lives at `src/content/software/<slug>/index.mdx` with original screenshots
and gallery images in its adjacent `assets/` directory. The entry path supplies
its identity. Commit entries and their local images together.

The `software` collection in `src/content.config.ts` requires `title`,
`description` (the index-card summary), `category`, integer `order`, `tooling`, a
local `screenshot`, and at least one HTTP(S) project link (`url` for the website
or `repo` for the repository). Category IDs must exist in the production Git
site settings, `src/config/site-settings.json`; unknown IDs fail at collection
load. Role, team, gallery and tagline remain optional structured frontmatter.
Astro resolves local images as build inputs and catches missing image files.

For layouts beyond the shared structured fields, compose Markdown/MDX in the
entry body instead of extending a CMS schema. Tipbox demonstrates an MDX figure
using Astro's `Image` component and a local original image. This demonstration
body remains unrendered by the shared software pages to preserve the existing
visible content; those pages render the structured frontmatter.
After editing entries, run `pnpm check`, `pnpm build` (requires publishing
configuration), and `node --test tests/software-collection.test.js` (offline).

## Software cutover sequencing

The collection-backed software pages must be deployed and verified first (#25).
For #26, back up and rehearse the backend changes, then deploy the backend's
software withdrawal/removal and Likes-only content endpoint before deploying this
stricter frontend consumer. The previously deployed frontend tolerates that smaller
response, so the backend-first rollout does not break its builds. Frontend builds
do not unpublish software or delete backend data; those are backend operations.

## Testing boundary

Frontend tests exercise rendering, response validation, build failures and static
media delivery using local HTTP fixtures. They must run without backend source,
migrations or a PocketBase executable. Backend tests own authentication rules,
publication state transitions, draft isolation, migrations and persistence.
Keep fixture responses aligned with the canonical backend contract; mocks alone
cannot establish backend compatibility. Backend-owned end-to-end checks may test
an explicitly supplied frontend checkout as an additional integration check.
