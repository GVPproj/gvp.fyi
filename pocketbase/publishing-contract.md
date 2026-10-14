# Release publishing tracer contract

**Implemented #9 LOCAL contract — not deployed.** Requires the
custom v0.40.4 server and forward migration `1782259200_release_toggle.js` after
`1782086400_publishing.js` and `1782172800_release_unpublish.js`. The recorded existing-Fly trial at backend
commit `9183a9a` still uses the OLD separate Publish/Unpublish commands and track
collection; see [trial status](../docs/dashboard-publishing.md#existing-fly-development-trial).
No deployment or fresh live inspection occurred in this session. No public-site cutover or storage-setting change. The tracer is **Watery Grave EP**, the last entry of `src/data/releases/miracle-fortress.json`, slug `watery-grave-ep`. Its original is `public/images/music-releases/watery-grave.jpg` (JPEG, 300×283); preserve all five existing MP3 URLs and `display_date`.

All normal record CRUD is superuser/dashboard-only (rules locked), including import. No credentials are seeded.

- `publishing_releases`: unique `slug` (only `watery-grave-ep` currently publishes), required `title`, `artist`, `release_date` (text, preserves original); `about` (text, may be empty); optional `display_date` (text, preserved verbatim), `url` (text), `streaming` (JSON), protected single `artwork` (JPEG, PNG or WebP, max 10 MiB). `published` is a persistent boolean, default false, labeled **Published**. Every Save with it true publishes the full saved record; it does not reset. Save with it false stays private; the first transition off creates an explicit withdrawal, without requiring complete working tracks/artwork. Repeated off Saves do not create repeated withdrawals; new unpublished slugs create no public revision. Recreating a deleted, still-published slug with Published off withdraws its retained publication without requiring artwork/tracks to be reconstructed.
- `publishing_releases.tracks`: native JSON array on the same release record, accepted by the owner. Each entry has `title`, positive consecutive integer `track_num`, optional `duration` number (seconds) and `audio_url` string. Preserve ordering and original strings/URLs verbatim. No separate track editing collection or custom editor in the new workflow.
- `publishing_builds`: auth collection, email/password (minimum 12 chars), provisioning/management locked to superusers. Standard `POST /api/collections/publishing_builds/auth-with-password` returns build token.
- Internal `publishing_snapshots`: immutable server-created release JSON and independently retained protected artwork. No normal API writes, including superusers. No ordinary build collection access.

Build token only: `GET /api/publishing/releases/watery-grave-ep` -> `{revision:string, release:{slug,title,artist,release_date,display_date?,about,tracks:[{title,track_num,duration?,audio_url?}],url?,streaming?}, artwork:{path,width,height,sha256}}`. Explicit withdrawal returns HTTP 200 with `{revision:string, slug:"watery-grave-ep", state:"unpublished"}` instead. This is the only signal that authorizes a build to omit the release; 404 before first publication and all fetch/authentication failures still fail the build. A withdrawal revision has no artwork. `artwork.path` is same-origin `/api/publishing/artwork/<revision>`; download with the same Authorization token, never a remote URL. Revision-pinned originals remain downloadable after subsequent publications, working artwork replacement, or working-record deletion. Responses are no-store. Superusers, Likes owners, anonymous requests are not build identities.

Every Save with `published=true` captures the full JSON tracks and release metadata transactionally; artwork is validated JPEG, PNG or WebP and copied byte-for-byte into snapshot-owned storage. Failed publication leaves the prior revision intact. Snapshots, including withdrawal revisions, are retained indefinitely; garbage collection is not implemented. The first transition to `published=false` appends a withdrawal revision transactionally, without deleting retained artwork. Save while off stays private; turning Published on and saving creates a fresh visible revision. Deleting a working record is not unpublishing: the latest publication or withdrawal and retained media remain unchanged. To remove public content, turn Published off and Save before deleting its working record, then deploy successfully. Never delete internal snapshots to remove public content. Public removal occurs only after a successful Netlify deployment; caches, old deploys and downloaded copies may outlive it. Dashboard administration uses existing authenticated `/_/` and standard APIs, not a new website editor.

## Native dashboard and migration requirements

Pin `publishing_releases` in the native sidebar. Edit metadata, JSON tracks, artwork
and Published on one record. Internal `publishing_builds` and
`publishing_snapshots` remain visible but are not routine owner tasks; there is no
promise to hide them. Save does not trigger deployment; manually deploy in Netlify.

The forward migration preserves the latest public state (including a withdrawal
or no publication) without capturing or publishing working edits. It initializes
the persistent toggle from that state, copies existing ordered track rows into the
working release's JSON, replaces the old command fields, and removes
`publishing_tracks` transactionally. Local upgrade fixtures verify unchanged
snapshots and retained media for drafts, published records with private edits, and
withdrawn records. A subsequent Save of a migrated published record intentionally
publishes its working edits under the new contract. Still rehearse on a fresh
private live-data copy and retain paired code/data recovery material before deployment. Do not rewrite historical migrations or use destructive down
migrations as rollback.

## Local verification

The API, loopback importer, and old-to-new migration fixture tests pass locally.
These results establish fixture behavior, not live-data rehearsal or deployment.

```sh
(cd pocketbase/server && go build -trimpath -o /tmp/gvp-publishing-pocketbase .)
POCKETBASE_BINARY=/tmp/gvp-publishing-pocketbase node --test tests/publishing-pocketbase.test.js tests/publishing-import.test.js
# Preserve/build the pre-change binary before upgrading; never point this at live data.
OLD_POCKETBASE_BINARY=/path/to/pre-toggle-pocketbase POCKETBASE_BINARY=/tmp/gvp-publishing-pocketbase node --test tests/publishing-upgrade.test.js
(cd pocketbase/server && go test -race ./...)
```

The HTTP suite requires the real custom binary (skips explicitly when `POCKETBASE_BINARY` is unset). It creates disposable loopback databases and temporary identities, uses the original repository JPEG and five MP3 URLs, and verifies one-record JSON-track Save, persistent Published state, withdrawal/republication, invalid-publication rollback, artwork replacement/deletion retention, restart persistence, snapshot immutability, and restricted build access. The upgrade suite additionally requires `OLD_POCKETBASE_BINARY`. The separate `tests/publishing-workflow-browser.test.js` exercises actual dashboard JSON editing, upload, Save, withdrawal and republication with a keyboard-operated Published toggle. These tests do not exercise S3, production, deployment hooks, crash recovery, or backup restoration. See [rehearsal workflow and build verification](../docs/release-publishing.md). File retention uses PocketBase-managed separate snapshot files, not references to working-record storage. A process/disk failure still requires the existing storage reconciliation procedure; database transactions do not make object storage transactional.
