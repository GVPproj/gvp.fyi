# PocketBase backend

Custom **PocketBase 0.40.4**, shared with other consumers. The website uses static
publishing; retained Likes APIs serve shared consumers. See [API contracts](contracts.md).

## Build and local setup

Requires **Go 1.27+** (toolchain auto-download supported). From `pocketbase/server`:

```sh
go test -race ./...
go build -trimpath -o /tmp/pocketbase-likes .
/tmp/pocketbase-likes serve --http=127.0.0.1:8090 \
  --dir=/tmp/gvp-pocketbase-dev/pb_data \
  --hooksDir=../pb_hooks --migrationsDir=../pb_migrations
```

Use a disposable local data path, never production. Repository migrations support
local fixtures, not replacement of shared production history. Provision identities
privately; no credentials are seeded.

The executable registers JS hooks/migrations, migration CLI, static files, Likes
preview/duplicate routes, release/editorial publishing and `editorial-seed-likes`.
Hooks/migrations are **not embedded**. Upstream self-update is deliberately absent:
it would erase the extension. Pending migrations run at startup; `migrate up` is
also registered. Dashboard schema automigration and hook watching default off;
explicit `--automigrate` / `--hooksWatch` are for development.

## Dashboard publishing

Edit through PocketBase `/_/`. Visitors receive static Netlify pages and copied
media; the published site works with PocketBase offline. There is no website
login/editor.

### Workflow

1. Open `publishing_releases` (music), `editorial_entries` (software), or
   `likes_items` / `likes_collections` (Likes). New items start unpublished.
2. Edit and Save. **Published on + Save publishes all saved edits** into an immutable
   revision. Turn Published off before saving private changes.
3. To withdraw, turn Published off and Save. **Deleting a working record does not
   withdraw retained publication.** Unpublish and successfully deploy before deleting.
4. Manually deploy in Netlify and check the result. **Save is not deployment.**
   Failed builds leave the last good deployment intact.

Slugs and editorial kinds are immutable. Snapshot/build collections are internal;
never delete snapshots to remove content. There is no automatic snapshot/media
pruning. Old deployments, caches and downloads can retain previously public content.

Named collection names have no draft toggle: rename/delete updates retained public
memberships without publishing private item edits. Membership edits become public
on that item's Published Save.

### Content and assets

- Release `tracks` JSON: `{title, track_num, duration?, audio_url?}`. Number from 1
  consecutively; duration is nonnegative seconds. MP3s stay in `public/audio/`;
  reference existing `/audio/...mp3` URLs. Upload artwork separately.
- Software `data` retains role/team/tooling/gallery fields. Numeric `order` sorts
  ascending, then slug. Use `screenshotAlt` and gallery descriptions for accessibility.
- Blog posts are Git-owned MDX in `src/content/blog/`; PocketBase does not accept,
  publish or retain blog entries. See [blog authoring](../README.md#blog).
- `data.assetNames` maps original basenames to PocketBase's saved upload filenames.
  Replace **one file per Save** for unambiguous reference repair. Multiple replacements
  require matching original names or an explicit mapping. Images/local downloads
  must resolve to uploaded assets; missing references fail the build. External
  reading links remain links.
- Site identity, navigation, categories and placeholders come from
  `src/config/site-settings.json`, not legacy CMS settings records. Layout,
  interaction, instrument sounds and behavior-related copy also stay in Git.

Original uploads stay in `pb_data/storage` on Fly. Development and builds require
`PUBLISHING_POCKETBASE_URL`, `PUBLISHING_BUILD_EMAIL` and
`PUBLISHING_BUILD_PASSWORD`, with no repository fallback for CMS-owned music,
software or Likes. The local MDX blog is an independent source, not a fallback.
Likes uses this loader in development too. Use a restricted `publishing_builds` identity, **never
superuser credentials or public-prefixed secrets**. Field details:
[releases](contracts.md#release-publishing), [editorial](contracts.md#editorial-publishing),
[Likes](contracts.md#likes-api).

## Deployment

Production lives in sibling `../pocketbase-fly-starter`.
**Pushing to its `main` deploys production.** Frontend `main` deploys through Netlify.
Deployment requires owner approval; deploy backend before frontend changes needing it.

Ship the custom executable, full existing migration history and all runtime hooks,
including other consumers' hooks. A stock binary cannot replace custom routes.
Never replay applied migrations or replace shared history with local-fixture history.
Preserve `/pb/pb_data`, local originals in `storage`, settings and shared consumers.
Rehearse migrations and serve startup on an isolated restored copy with outbound
side effects blocked. Verify owner access, denied nonowner writes, draft/media
isolation and publication/withdrawal. Keep single-instance topology (preview limits
are process-local) and `NETLIFY_BUILD_HOOK` unset (manual deployment).

For the production Linux amd64 image, from `pocketbase/server`:

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o /tmp/pocketbase-likes .
```

Install as `/pb/pocketbase`. After backup, rehearsal and approval, run:

```sh
/pb/pocketbase serve --http=0.0.0.0:8090 \
  --dir=/pb/pb_data --hooksDir=/pb/pb_hooks \
  --migrationsDir=/pb/pb_migrations --publicDir=/pb/pb_public
```

### Release migrations

Ship complete history, including `1782086400_publishing.js`,
`1782172800_release_unpublish.js`, `1782259200_release_toggle.js` and
`1782345600_release_catalogue.js`. The toggle migration initializes Published from
latest public state, copies ordered track rows to JSON and removes the old track
collection transactionally, without publishing private edits or changing retained
snapshots/media. Catalogue migration adds metadata without republishing. A later
Save of a migrated published record intentionally publishes its working edits.
Rehearse on fresh isolated data; never rewrite history or use destructive down migrations.

### Blog removal migration

Ship `1782518400_remove_blog.js` with the updated backend before deploying the
frontend. It removes `blog` from the editorial kind select and permanently deletes
all blog working records, every retained blog revision (including withdrawals and
revisions whose working record was deleted), and their uploaded files. Software,
settings, Likes and music are unchanged. Historical migrations remain in place;
do not edit or replay them.

Take a paired database/storage/code backup and rehearse on an isolated restored
copy before approving deployment. Verify blog records and files are gone and other
content still publishes. Rollback requires restoring that backup with matching
code; the migration has no destructive down path. Old static deployments, caches
and backups are not erased by this migration.

### Seeding a legacy database

Migrations do not backfill Likes records/files. For pre-editorial databases:

1. Take a paired database/storage/code backup; restore to an isolated local path.
2. Build the custom binary and apply migrations against **that restored copy**.
3. Run `./pocketbase editorial-seed-likes --dir /isolated/pb_data`, providing matching
   `--migrationsDir` and `--hooksDir` if not siblings of the data directory.
4. Compare published item IDs, memberships, media checksums and build results;
   exercise withdrawal and offline static delivery before approving rollout.

This is a **write command, not a dry run**; production needs separate approval.
It atomically copies currently published Likes; any missing/invalid original aborts.
Reruns skip identities with any revision, including withdrawals. It never rewrites
working records or republishes drafts. Until all existing published Likes are seeded,
content reads fail closed and deletion of unseeded published legacy items is rejected;
see [Likes snapshots](contracts.md#likes-and-named-collections).

## Backup and recovery

No scheduled backup or verified recurring recovery service is maintained here.
Existing AWS backup resources are not managed here; deleting local scaffolding
is not decommissioning them.

Before production changes, capture **complete `pb_data`, including storage**, plus
matching executable/image, hooks, migrations and deployment configuration. Stop
PocketBase before directory copies; copying running SQLite is not a consistent
checkpoint. Keep credentials, backups and settings-encryption keys outside Git.
Private historical checkpoints under `~/.local/share/gvp-pocketbase-recovery/` are
not current backups. Verify integrity and isolated restoration before use.

For rollback, stop writes and restore matching **data and code together**, accounting
for writes since the checkpoint. Never run an old binary against an upgraded database
or use destructive down migrations as recovery. Built-in restore restarts the current
executable; it does not downgrade it. Allow at least twice the restored backup size
in free space. See [upstream backup/restore guidance](https://pocketbase.io/docs/going-to-production/).

Superuser sign-in uses password plus email OTP MFA. If delivery fails, retain any
working dashboard session and obtain owner approval for recovery. Do not disable
MFA, recreate credentials or modify running SQLite as routine troubleshooting.

## Storage reconciliation

PocketBase saves uploads with records and cleans failed/replaced/deleted files.
Snapshots retain independent copies indefinitely, except those explicitly removed
by the blog removal migration. Database transactions do not make
filesystem operations crash-proof. A disconnect after commit does not undo Save:
refresh before retrying.

After disk/permission/process faults, stop writes, back up, repair the fault and
reconcile all collection file fields against `pb_data/storage`. Preserve referenced
originals/thumbnails; quarantine only confirmed unreferenced paths before reviewed
deletion. Never use age-only cleanup or delete shared storage roots.

## Verification

From repository root (build first as above):

```sh
POCKETBASE_BINARY=/tmp/pocketbase-likes node --test tests/pocketbase.test.js
POCKETBASE_BINARY=/tmp/pocketbase-likes pnpm test
pnpm check
pnpm build
(cd pocketbase/server && go test ./... && go test -race ./editorial)
POCKETBASE_BINARY=/tmp/pocketbase-likes node --test tests/editorial-pocketbase.test.js
```

Release and upgrade checks, also from repository root:

```sh
(cd pocketbase/server && go test -race ./... && go build -trimpath -o /tmp/gvp-pocketbase .)
POCKETBASE_BINARY=/tmp/gvp-pocketbase node --test --test-concurrency=1 tests/publishing-pocketbase.test.js tests/publishing-build.test.js
OLD_POCKETBASE_BINARY=/path/to/pre-toggle-custom-server POCKETBASE_BINARY=/tmp/gvp-pocketbase node --test tests/publishing-upgrade.test.js tests/publishing-migration-failure.test.js
POCKETBASE_BINARY=/tmp/gvp-pocketbase PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium node --test tests/publishing-workflow-browser.test.js
```

HTTP tests need Node native fetch/FormData and `python3`; binary-dependent suites
skip without `POCKETBASE_BINARY`. Supply Chromium and the pre-toggle custom binary
for their respective checks. **Skipped required checks are not passes.** Tests use
disposable loopback databases/filesystems, HTTP publishing fixtures and controlled
DNS/TCP, not production credentials/writes or arbitrary internet pages. Preview Go
tests exercise exported Fetcher/API seams with real PB tokens; editor/asset access
remain integration seams. Tests do not establish live-data migration, deployment or
crash-recovery safety. Physical cleanup requires file inventories, not URL 404s alone.
