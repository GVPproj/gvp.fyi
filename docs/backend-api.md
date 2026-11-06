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
- Software also has a validated Git content collection staged for migration (see
  below). Production software rendering and both publishing integrations still
  use the CMS in this ticket; the Git entries are not a fallback.

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

## Repeatable software export

`scripts/export-software.mjs` exports published software snapshots using the same
restricted build identity and endpoints as the integrations. It reads the three
server-only `PUBLISHING_*` variables above from the environment or local `.env`;
never supply superuser credentials. With these configured, run:

```sh
# Initial migration only, when src/content/software does not exist:
pnpm export:software

# Repeat into a NEW directory for comparison with the checked-in entries:
pnpm export:software /tmp/software-export-review
```

The destination must not exist: rerunning cannot overwrite hand-authored MDX.
The script ignores Likes, legacy settings and withdrawal tombstones, resolves
CMS upload aliases, verifies each downloaded original against its SHA-256 digest,
and stages the whole export before moving it into place. No resized variants,
credentials or tokens are saved. Failed exports remove the staging directory.

Each project lives at `src/content/software/<slug>/index.mdx` with original
screenshots and gallery images in its adjacent `assets/` directory. Frontmatter
is formatted as JSON (valid YAML) to preserve nested CMS values losslessly.
Editorial fields are retained, including alt text, dimensions, ordering, tooling,
links, role, team, gallery and tagline. Only image paths are relocated to local
assets; the transport-only `assetNames` map and redundant CMS `slug` are omitted.
The entry path supplies its identity. Compare a repeat export before copying
changes, preserving any authored body content.

The `software` collection in `src/content.config.ts` requires `title`,
`description` (the index-card summary), `category`, integer `order`, `tooling`, a
local `screenshot`, and at least one HTTP(S) project link (`url` for the website
or `repo` for the repository). Category IDs must exist in the production Git
site settings, `src/config/site-settings.json`; unknown IDs fail at collection
load. Role, team, gallery and tagline remain optional structured frontmatter.
Astro resolves local images as build inputs and catches missing image files.

For layouts beyond the shared structured fields, compose Markdown/MDX in the
entry body instead of extending a CMS schema. Tipbox demonstrates an MDX figure
using Astro's `Image` component and a local original image. This body is not
rendered by the current CMS-backed pages; the publishing cutover is separate work.
After editing entries, run `pnpm check`, `pnpm build` (requires publishing
configuration), and `node --test tests/software-collection.test.js` (offline).

## Testing boundary

Frontend tests exercise rendering, response validation, build failures and static
media delivery using local HTTP fixtures. They must run without backend source,
migrations or a PocketBase executable. Backend tests own authentication rules,
publication state transitions, draft isolation, migrations and persistence.
Keep fixture responses aligned with the canonical backend contract; mocks alone
cannot establish backend compatibility. Backend-owned end-to-end checks may test
an explicitly supplied frontend checkout as an additional integration check.
