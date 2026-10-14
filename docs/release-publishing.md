# One-release publishing rehearsal (#7)

**Historical Fly development trial:** the owner approved deploying the OLD backend slice
to the existing app. Watery Grave was imported as a private dashboard draft; see
[deployment status and limits](dashboard-publishing.md#existing-fly-development-trial).
The instructions below remain the disposable local rehearsal. Do not point the
loopback-only importer at Fly or reuse test credentials. Netlify remains unchanged.

This is an **isolated tracer bullet**, not a production cutover. The workflow below
records the implemented, component-tested #9 local change for **Watery Grave EP**,
pending real-data rehearsal, deployment and owner acceptance. It supersedes the separate-command workflow in the historical
[Save/Publish decisions](publishing-decisions.md); that document is not updated here.
The recorded live trial still uses the OLD separate Publish/Unpublish commands and
`publishing_tracks`. No deployment or fresh live inspection occurred in this session.
All other releases retain their checked-in source. The existing public route
`/music-releases/watery-grave-ep` and all five `/audio/watery-grave/*.mp3` URLs remain
unchanged. No S3 resources, storage settings, production records, Netlify credentials,
or Likes behavior are changed.

## Local backend and import

The runtime and migration `1782259200_release_toggle.js` are synced in source and
backend. The Go importer CLI has been copied into source and aligned with the
backend; see [offline importer](import-release.md). The HTTP importer below also
uses the current JSON-track schema.

Use the pinned custom PocketBase 0.40.4 executable with the repository's full
migration/hook directories. See [backend contract](../pocketbase/publishing-contract.md)
for schema and authorization details. A stock executable is insufficient: the
custom executable implements publication and the published-read endpoints.

Run only against a fresh disposable loopback backend, with production outbound effects
and storage disabled. Never point a rehearsal at a shared `pb_data` directory. Existing
[backup/rollback requirements](../pocketbase/README.md#backup-and-rollback-safety) remain
mandatory for any later deployment.

`scripts/import-release.mjs` exports `importRelease({endpoint, token})` and can also run
as a CLI. It reads the existing catalogue and JPEG and atomically creates one private
release with five ordered JSON tracks and artwork. It **does not publish**. CLI configuration:

- `PUBLISHING_POCKETBASE_URL`: isolated `http://127.0.0.1:<port>` (or IPv6 loopback).
- `PUBLISHING_IMPORT_TOKEN`: temporary local administrative token, supplied privately
  through the process environment; never commit, paste into tickets, or reuse for builds.

```sh
node scripts/import-release.mjs
```

The importer rejects non-loopback targets and any existing `watery-grave-ep` working record or retained snapshot.
It never adopts/overwrites records. It is intentionally additive, not an upsert:
a repeated import fails safely. Metadata, JSON tracks and artwork are submitted in
one record create, not a sequence of separate track writes. If a response is lost,
inspect the disposable backend before retrying; there is no automatic destructive
cleanup. Publication requires a complete ordered release, and the build additionally
checks the five existing MP3 references.

## Dashboard workflow

1. Sign into the isolated PocketBase `/_/` dashboard as its temporary superuser.
   Production administrative MFA/security verification remains a separate rollout gate.
2. Pin `publishing_releases` in the native dashboard sidebar and open the release.
   New records start unpublished (`published=false`).
3. Edit metadata, artwork and the `tracks` JSON array on this **one record**. The
   owner accepted native JSON editing, not a separate track collection or custom
   track editor. Preserve unique consecutive `track_num` values and existing MP3 URLs.
4. Set the persistent **Published** toggle and Save. Every Save with
   `published=true` captures the full metadata, JSON tracks and independently retained
   artwork as one coherent immutable snapshot. The toggle stays on; subsequent Saves
   publish saved edits too. Native Save of an unchanged record makes no request and
   creates no new revision. Turn it off before saving edits that must remain private.
5. Manually deploy in Netlify after saving the intended publication state. Saving
   makes a revision eligible; it does not itself deploy the site.

`publishing_builds` and `publishing_snapshots` remain visible internal collections,
not owner editing tasks. Do not edit them during routine publishing; native sidebar
pinning is the navigation aid, not a promise to hide internal collections.

This uses supported dashboard record editing, not a fictional custom button. Publication
makes a snapshot eligible for a build; it does **not** trigger a Netlify build or claim
successful deployment. The owner-approved first-milestone workflow is manual Netlify
deployment after dashboard Save, using Netlify's existing status UI, without custom
status machinery.

### Unpublish, republish and delete

To remove the release, turn **Published** off and Save. The first transition off
appends an explicit withdrawal revision; it does not require complete working
artwork/tracks. Saves while already off remain private and do not append repeated
withdrawals. A new unpublished slug does not create a public revision. Recreating
a deleted, still-published slug with Published off withdraws its retained publication
without requiring the old artwork/tracks to be reconstructed.

The next successful build omits the release from the overview and generated detail
routes; no missing-record/error response is treated as permission to remove content.
Save while off keeps it withdrawn. To restore it, complete the working content,
turn Published on and Save, then deploy. Existing MP3 files/URLs stay in the repo
and are not removed by withdrawal.

Deleting a working record does **not** unpublish it or delete published artwork.
Turn Published off and Save before deleting if removal is intended. Deletion
retains the latest public snapshot or withdrawal and its media; it is not a
withdrawal command. Snapshots and their own artwork copies are
retained without automatic pruning, including for a build already pinned to an older
revision.

After saving the intended Published state, manually deploy in Netlify and check its deployment
result. A failed fetch/build leaves the last good public deployment unchanged.
Removal latency includes the build queue, successful deployment and cache lifetime;
old deployments, caches and downloaded copies may remain. Local tests do not prove
production Netlify deployment or cache behavior.

## Opt-in Astro source and static media

Create a dedicated temporary `publishing_builds` email/password identity administratively
on the isolated backend. This identity cannot read working records, manage identities,
write records, or use ordinary snapshot collection/file APIs. It can only read published
snapshots and their retained artwork through the custom endpoints.

Set these **server-only** environment variables for `pnpm build` (or local `pnpm dev`):

- `PUBLISHING_POCKETBASE_URL`: backend origin; HTTPS required except literal loopback.
- `PUBLISHING_BUILD_EMAIL` and `PUBLISHING_BUILD_PASSWORD`: dedicated published-read identity.

No `PUBLIC_` variables or superuser credentials are used for this path. With all three
unset, the site retains its existing checked-in catalogue. Partial configuration,
authentication errors, no published snapshot, invalid metadata, missing/changed MP3
references, failed downloads, bad image dimensions, or checksum mismatches fail the build;
there is no fallback to stale local data after opting in. Restart dev to read a newer
snapshot; one process/build intentionally pins one revision.

The build authenticates once, reads one complete snapshot, downloads only its revision-pinned
same-origin `/api/publishing/` artwork, verifies SHA-256 and decoded dimensions, and
materializes responsive WebP files under `/published-releases/` in the build output.
Redirects and arbitrary remote image origins/paths are rejected. Credentials and private
payloads never enter the public projection or error logs. Images are generated locally,
not by a runtime Netlify image transform fetching PocketBase. No broader Astro
`remotePatterns` permission is needed. Detail images use intrinsic aspect ratio, responsive
`srcset`/`sizes`, descriptive alt text and eager loading; overview thumbnails remain lazy.

Public HTML and generated artwork work with PocketBase offline. Existing Likes routes
remain dynamic and are **not** converted by this slice. Original public image URLs remain
in place; no historical media URL is removed. MP3s retain native controls and
`preload="none"`. Normal successful-deployment/cache removal delay still applies, and
already downloaded files cannot be recalled.

## Local verification and remaining rehearsal

Verified local results for the new implementation:

- Full publishing suite: **17 passed, no skips**, including Chromium dashboard and offline-output checks.
- Includes importer retained-snapshot collision refusal, draft-file privacy, upload rollback and migration-refusal recovery.
- Source and backend Go race suites: passed.
- Backend Python publishing smoke: 1 passed; build-hook suite: 8 passed.

Upgrade fixtures cover migration-refusal atomic rollback and draft,
published-with-private-edits and withdrawn states: latest snapshots/media survive,
working edits are not published, ordered tracks are copied into release JSON and
the track collection is removed transactionally. This is fixture proof, not a fresh
live/private-data rehearsal. Paired code/data recovery and real-data rehearsal remain
required before deployment. No new deployment, owner trial or frontend cutover is claimed.

```sh
(cd pocketbase/server && go build -trimpath -o /tmp/gvp-publishing-pocketbase .)
POCKETBASE_BINARY=/tmp/gvp-publishing-pocketbase node --test tests/publishing-pocketbase.test.js tests/publishing-import.test.js
# OLD_POCKETBASE_BINARY must be a pre-change custom build; POCKETBASE_BINARY is the new build.
OLD_POCKETBASE_BINARY=/path/to/pre-change-pocketbase POCKETBASE_BINARY=/tmp/gvp-publishing-pocketbase node --test tests/publishing-upgrade.test.js tests/publishing-migration-failure.test.js
POCKETBASE_BINARY=/tmp/gvp-publishing-pocketbase PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium node --test tests/publishing-build.test.js tests/publishing-workflow-browser.test.js
pnpm check
```

Current toggle/JSON-track tests use disposable loopback databases and random credentials,
standard administrative save/upload requests, a real dashboard browser, restricted build
authentication, and the actual Astro/Netlify adapter build. They cover private Saves,
published edits, first-off withdrawal, republish, retained artwork and working deletion,
static route removal and fail-closed build responses. Generated-output scans check secrets/private content;
mobile/desktop browser checks load deployed artwork after the fixture backend stops.
They do not establish production Netlify deployment behavior or owner visual acceptance
(#21/#14). Tests explicitly skip executable-dependent checks when executables are absent.

Measured with the checked-in 300×283 JPEG and Sharp 0.35.5, WebP quality 80:

| Asset | Bytes |
| --- | ---: |
| Original JPEG | 36,927 |
| Full-width 300px WebP | 22,528 |
| 160px WebP | 8,712 |

Do not enable this source in production yet. #21 supersedes the S3 migration gates:
keep local PocketBase storage and verify capacity, off-host recovery/restore, #18
administrative security, shared consumers, concrete deployment approval and owner
acceptance. No S3 provisioning is required. See [the current plan](dashboard-publishing.md). Reverting the opt-in configuration restores the local source for this isolated
slice; it is not a destructive database rollback or a production data-recovery procedure.
