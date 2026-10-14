# All-content implementation — #21

## Status

Implemented locally, **not deployed or cut over**. The live backend and Netlify
configuration remain unchanged. See [fresh operational inspection](content-cutover-readiness.md)
for the actual deployed revisions, security/recovery gates and rollback procedure.
The owner approved editorial scope and manual Likes editing; preview acquisition
and duplicate warnings are not requirements for the dashboard replacement.

## Content and editing

- `publishing_releases`: all 36 releases, 138 ordered track entries, categories,
  credits, display overrides, streaming/Bandcamp/YouTube metadata and protected art.
  Slugs remain stable. Tracks use the existing native JSON field.
- `editorial_entries`: seven software projects (including all Tipbox team/gallery
  content), one blog article, and `settings/site`. Kind/slug are stable; `data` is
  editable JSON, `assets` are protected uploads. See [import/schema instructions](import-editorial.md).
- `likes_items` and `likes_collections`: existing native fields, file uploads and
  memberships; manual editing. Existing IDs are public route keys. Named collection
  renames refresh retained published memberships without leaking private item edits.
- Blog prose is safe Markdown; `<!-- demo:face -->` renders the fixed code-owned
  demo. No executable dashboard MDX or arbitrary HTML.
- Site settings own navigation, identity/description, section/category labels and
  order, plus placeholder copy. Layouts, interactions, SVG/design assets, instrument
  sounds and UI messages remain in code. Release MP3s keep their existing Git URLs.

New records default to drafts. **Published + Save** captures an immutable eligible
revision and independent media copies. Off + Save withdraws. Working deletion does
not withdraw or destroy a retained publication. Unpublish first when removal is
intended. Saving is not deployment; manually deploy Netlify afterward.

## Full-content switch

After the backend, imports, security/recovery checks and dashboard trial pass, set
server-only `PUBLISHING_POCKETBASE_URL`, `PUBLISHING_BUILD_EMAIL` and
`PUBLISHING_BUILD_PASSWORD` for a restricted `publishing_builds` identity, plus
`PUBLISHING_CONTENT=true` in the existing Netlify build environment. Never use
superuser credentials or public-prefixed secret variables.

Full mode reads only retained eligible revisions, validates responses and media
hashes, and emits local originals/downloads plus responsive image variants. Missing
configuration, failed reads or corrupt files fail the build. No repository content
fallback is used in full mode. Explicit withdrawals omit routes. Likes overview and
item routes are prerendered; query-based historical collection links select the
corresponding static section, with native anchor navigation/CSS filtering and a no-JS fallback.

In full mode `/login` and `/likes/manage` redirect to `/likes`, owner controls are
not rendered, and session/management scripts are not initialized. Legacy code and
shared backend endpoints remain available for pre-cutover operation/rollback;
physical removal awaits replacement acceptance and dependency audit. Unsetting the
switch is not a general content rollback after dashboard edits.

## Migration and verification

Importers are additive and loopback-only: [catalogue](release-catalogue.md),
[other editorial](import-editorial.md). They do not overwrite existing records.
Both default to drafts; `--publish` is explicit. The existing Watery Grave draft
must be reconciled deliberately, not overwritten/skipped without inspection.
Existing published Likes require the explicit `editorial-seed-likes` command on
an isolated restored copy first; see [backend contract](../pocketbase/server/editorial/README.md).
Unseeded published Likes cause build reads to fail closed. Deleting an existing
published Like before seeding is also rejected: seed explicitly first so deletion
cannot remove the only copy of its publication/media or bypass the build check.
The guard checks persisted state transactionally; draft deletion and pre-editorial
schema behavior are unchanged. After seeding, working deletion preserves the
retained publication and media.

Fresh local rehearsal used the actual custom PocketBase, actual repository content
and actual remote artwork capture: **36 releases / 138 tracks, seven software
projects / ten images, one article and site settings** imported and published in
an isolated temporary database, then built through Astro. All 36 release routes,
seven software routes and the blog demo were checked. This is not a fresh
production-data rehearsal and does not establish live Likes inventory or MFA.

Real native-dashboard verification also passed for software JSON editing,
Published Save, one-file image replacement and a quote edit/publication. File alias
repair is transactional; ambiguous multi-file replacements reject Save rather than
publishing broken references. Importers now check retained identities before draft
creation, so reimporting deleted working records cannot accidentally withdraw them.

Reproduce the opt-in network/import/build rehearsal:

```sh
(cd pocketbase/server && go build -o /tmp/gvp-content-pocketbase .)
POCKETBASE_BINARY=/tmp/gvp-content-pocketbase RUN_CATALOGUE_CAPTURE=true \
  node --test tests/catalogue-rehearsal.test.js
POCKETBASE_BINARY=/tmp/gvp-content-pocketbase \
  node --test tests/editorial-pocketbase.test.js
```

`pnpm test` serializes test files because actual Astro/Netlify builds share the
adapter's `.netlify` workspace. Run independently launched build suites serially
as well. No source catalogue, original media, cloud resource or credential was
deleted. Backend runtime/migrations were synchronized additively into the sibling
backend checkout without deploying it or replacing its unrelated dirty work.

Additional verification: `pnpm check` has zero errors; the ordinary pre-cutover
build succeeds; Go race suites pass in both source and sibling backend checkouts.
The new generic publishing fixture deliberately excludes the sibling's already-
applied pre-v0.40 migration history when constructing an empty test database; this
does not substitute for a restored-real-data upgrade rehearsal. The broad browser/
Node run reproduced the four ambient failures documented in #17. Its newly exposed
migration-collision, retained-file expectation, release-validation and navigation
regressions were corrected and rerun individually; do not describe that initial
broad run as green. Final release/upgrade/native-dashboard suite: 20 passed,
zero skipped. The static Likes browser check passed with the snapshot backend
stopped and no browser API requests.

The legacy recovery browser test also exposed an intermittent early-submit race,
reproduced on archived unchanged HEAD `d3d32f6`: submitting before login scripts
initialize causes a native POST instead of an auth API call. Its test now waits for
navigation load and verifies the auth API was reached (eight repeated targeted
runs and the full six-test session suite passed). This isolates the recovery test;
it does not fix that pre-existing legacy UI edge case. Full-content mode redirects
those owner routes instead of rendering a login form.
