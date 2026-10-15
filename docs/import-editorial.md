# Importing editorial content

These commands write data. Rehearse on an **isolated restored database/storage pair**
with the candidate custom PocketBase binary, all matching migrations and existing
Likes hooks. Disable external effects and concurrent editorial writes. A stock
PocketBase binary is insufficient. Never use a production tunnel to bypass the
loopback restriction. Production execution requires the
[rollout runbook](content-cutover-readiness.md) and separate approval.

## Catalogue and editorial imports

From the frontend repository root, against the isolated running backend:

```sh
export PUBLISHING_POCKETBASE_URL=http://127.0.0.1:8090
# Supply a temporary local superuser token privately in PUBLISHING_IMPORT_TOKEN.
node scripts/import-catalogue.mjs
node scripts/import-editorial.mjs
unset PUBLISHING_IMPORT_TOKEN
```

Both accept literal loopback HTTP only (`127.0.0.1` or `[::1]`). Do not commit tokens,
put them in tickets/logs, or reuse them for builds.

- Catalogue: 36 releases / 138 tracks with stable slugs/categories and metadata.
  Local art is read from Git; remote originals are captured only from allowlisted
  HTTPS Bandcamp/Apple hosts, without redirects, with size/type/pixel/decode checks.
  Original bytes are uploaded; failures have no remote-image fallback. Verify
  availability, attribution and source integrity during the actual rehearsal.
- Editorial: seven software projects / ten images, one blog article and
  `settings/site`, from `src/data/software-projects.ts`, the existing blog source
  and `src/data/site-settings.json`.
- New records default to drafts. Optional `--publish` publishes **only newly
  imported records**, never previously imported drafts. Editorial uploads are
  created privately first, then their saved filename mapping is patched before
  optional publication. Catalogue publication happens in the initial record create.

### Collisions and reconciliation

These are additive importers, not upserts or repair tools. Catalogue import skips
slugs present in working releases **or retained snapshots**. Editorial import checks
both working `(kind, slug)` and the superuser-only retained identity inventory,
including withdrawals and deleted working records. An invalid/unavailable inventory
aborts. Checks are not a cross-request lock: prevent concurrent writers.

A skip is **not evidence of matching content**. Inventory every skip, including the
existing Watery Grave record, and compare working state, latest retained publication,
tracks, media and metadata with the intended source. Resolve differences explicitly
on the restored copy; obtain an approved reconciliation plan before live execution.
Do not delete records/snapshots or recreate identities to bypass collisions:
recreating a retained identity with Published off can withdraw it.

Imports are not catalogue-wide atomic. A failure can leave earlier records intact;
editorial failure can also leave an incomplete private draft. Inspect records/files
before retrying, especially after a lost response. Reruns skip collisions; they do
not repair drafts or publish them. Review and save those records deliberately.

## Preserve existing published Likes

Migrations do not implicitly snapshot existing Likes. On the migrated, isolated
restored copy, with the service stopped and no other writers:

```sh
/path/to/custom-pocketbase editorial-seed-likes --dir /isolated/pb_data \
  --migrationsDir /path/to/pb_migrations --hooksDir /path/to/pb_hooks
```

This explicitly copies currently published Likes and media atomically; missing or
invalid originals abort. Reruns skip identities with any retained revision, including
withdrawals. It does not rewrite working records or publish drafts. Compare existing
published IDs, named memberships and file checksums before/after; verify static
routes, withdrawal and offline media. Unseeded published Likes make build reads fail
closed, and their deletion is rejected until seeding preserves their publication.
See the [backend contract](../pocketbase/server/editorial/README.md).

## Authoring data and assets

- Releases: native `tracks` JSON entries use
  `{title, track_num, duration?, audio_url?}`; numbering must be consecutive and
  duration nonnegative. Empty/omitted tracks are supported. Keep existing MP3 paths;
  full builds accept local `/audio/...mp3` references, not external audio providers.
  Categories use stable IDs from `settings/site` (initially `graham-van-pelt`,
  `miracle-fortress`, `think-about-life`, `other-credits`).
- `editorial_entries`: immutable `kind` + `slug`, editable JSON object `data`,
  protected multi-file `assets`, boolean `published`.
- Software `data` preserves nested role/team/tooling/gallery fields and dimensions;
  numeric `order` sorts ascending, then slug. `screenshotAlt` and gallery descriptions
  are editorial. The record slug wins over `data.slug`.
- Blog `data` is `{title, markdown}`. Raw HTML/MDX execution is disabled. A standalone
  `<!-- demo:face -->` paragraph inserts the fixed demo at most once; markers in
  code fences stay text. Preserve article slugs, attribution and displayed code.
- Settings use slug `site`; `src/data/site-settings.json` is the complete shape:
  identity/title/description/home label, sections, ordered navigation/categories,
  plain-text placeholders. Labels do not rename routes. A published settings record
  is required for full builds.

`data.assetNames` maps original basenames to PocketBase's actual saved upload
filenames. The importer saves it after uploads are renamed. Keep aliases when
replacing files; replace **one file per Save**. Multiple replacements need
unambiguous original-name matches or an explicit final mapping; ambiguous aliases
reject Save rather than publish broken references. Direct saved filenames work but
require manual reference maintenance.

Software source paths and blog image/local-download references must resolve through
this mapping or actual retained filenames. Upload article images for offline use;
external HTTP(S) reading links remain links. Full builds verify/materialize snapshot
assets and do not fall back to Git images or public PocketBase file URLs. Missing
referenced assets fail the build. See [authoring workflow](dashboard-publishing.md).

## Single-release tools (only if specifically needed)

`node scripts/import-release.mjs` uses the same loopback URL/token variables to create
only a private Watery Grave draft, with five JSON tracks and artwork. It refuses
any matching working or retained slug, rather than skipping/adopting it. It does not
publish. Prefer the catalogue importer for all-content rehearsal.

The offline Go tool is also pinned to that one release. It never installs migrations,
starts a server, loads application hooks, publishes or creates credentials:

```sh
(cd pocketbase/server && go test ./cmd/import-release)
(cd pocketbase/server && go build -o /tmp/gvp-import-release ./cmd/import-release)
jq '.[-1]' src/data/releases/miracle-fortress.json > /tmp/watery-grave-release.json
/tmp/gvp-import-release --dir /absolute/existing/pb_data \
  --release /tmp/watery-grave-release.json \
  --artwork /absolute/path/to/watery-grave.jpg
```

Use a binary built for the target OS/architecture. The data directory must already
contain a compatible nonempty `data.db` and migrated release/snapshot collections
with JSON tracks, locked rules and protected artwork. S3 storage is refused.
Inputs are pinned: one approved JSON object, exact metadata and five MP3 references;
audio is not fetched/uploaded. The artwork path is supplied independently.

Before this offline write, take and verify a paired database/storage checkpoint,
stop **all** instances/writers, disable restarts/deploys and keep exclusive maintenance
through verification. Run as the service filesystem owner; inputs must stay stable.
The command acquires no deployment-wide lock and Bootstrap performs housekeeping.
Any matching release/snapshot causes refusal. Database transaction atomicity does
not imply crash-safe filesystem atomicity. Failure prints only `Import failed.`;
inspect the offline copy, never delete collisions to retry. If interrupted or storage
is uncertain, restore the paired backup under maintenance. After success verify
`published=false`, five ordered tracks, local artwork, unchanged snapshots and
unrelated/auth records before resuming service. Publication is separate.

## Rehearsal checks

```sh
(cd pocketbase/server && go build -o /tmp/gvp-content-pocketbase .)
POCKETBASE_BINARY=/tmp/gvp-content-pocketbase RUN_CATALOGUE_CAPTURE=true \
  node --test tests/catalogue-rehearsal.test.js
POCKETBASE_BINARY=/tmp/gvp-content-pocketbase \
  node --test tests/editorial-pocketbase.test.js
pnpm check
```

Run build/browser suites serially, without dev servers sharing the checkout's
Astro/Netlify generated directories. Local fixtures and repository import checks
are not production-data recovery, live inventory or owner acceptance evidence.
