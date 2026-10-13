# Release publishing tracer contract (local only)

Requires custom v0.40.4 server plus `1782086400_publishing.js`. No production cutover or storage-setting change. The tracer is **Watery Grave EP**, the last entry of `src/data/releases/miracle-fortress.json`, slug `watery-grave-ep`. Its original is `public/images/music-releases/watery-grave.jpg` (JPEG, 300×283); preserve all five existing MP3 URLs and `display_date`.

All normal record CRUD is superuser/dashboard-only (rules locked), including import. No credentials are seeded.

- `publishing_releases`: unique `slug` (only `watery-grave-ep` currently publishes), required `title`, `artist`, `release_date` (text, preserves original); `about` (text, may be empty); optional `display_date` (text, preserved verbatim), `url` (text), `streaming` (JSON), protected single `artwork` (JPEG, PNG or WebP, max 10 MiB). `publish` boolean is a command: tick and Save **after saving tracks/artwork** to publish; server resets it to false. Ordinary Save never publishes. Import leaves publish false.
- `publishing_tracks`: required `release` relation, `title`, positive integer `track_num`; optional `duration` JSON number (seconds) and `audio_url` text. Unique `(release, track_num)`; API sort `track_num`. Preserve original strings/URLs verbatim. Track edits never publish by themselves.
- `publishing_builds`: auth collection, email/password (minimum 12 chars), provisioning/management locked to superusers. Standard `POST /api/collections/publishing_builds/auth-with-password` returns build token.
- Internal `publishing_snapshots`: immutable server-created release JSON and independently retained protected artwork. No normal API writes, including superusers. No ordinary build collection access.

Build token only: `GET /api/publishing/releases/watery-grave-ep` -> `{revision:string, release:{slug,title,artist,release_date,display_date?,about,tracks:[{title,track_num,duration?,audio_url?}],url?,streaming?}, artwork:{path,width,height,sha256}}`. 404 before first publication. `artwork.path` is same-origin `/api/publishing/artwork/<revision>`; download with the same Authorization token, never a remote URL. Revision-pinned originals remain downloadable after subsequent publications, working artwork replacement, or working-record deletion. Responses are no-store. Superusers, Likes owners, anonymous requests are not build identities.

Publication captures ordered tracks and release metadata transactionally; artwork is validated JPEG, PNG or WebP and copied byte-for-byte into snapshot-owned storage. Failed publication leaves the prior revision intact. Snapshots are retained indefinitely in this tracer; unpublish/removal workflow and garbage collection are not implemented here. Deleting a working record is not unpublishing. Dashboard administration uses existing authenticated `/_/` and standard APIs, not a new website editor.

## Local verification

```sh
(cd pocketbase/server && go build -trimpath -o /tmp/gvp-publishing-pocketbase .)
POCKETBASE_BINARY=/tmp/gvp-publishing-pocketbase node --test tests/publishing-pocketbase.test.js
(cd pocketbase/server && go test -race ./...)
```

The HTTP suite requires the real custom binary (skips explicitly when `POCKETBASE_BINARY` is unset). It creates disposable loopback databases and temporary identities, uses the original repository JPEG and five MP3 URLs, and verifies the dashboard's standard record API, Publish/Save isolation, failed-publication rollback, JPEG/PNG/WebP dimensions and retained bytes, restart persistence, snapshot immutability, and build/owner/anonymous access restrictions. The separate `tests/publishing-workflow-browser.test.js` exercises actual dashboard editing/upload/Publish. These tests do not exercise S3, production, deployment hooks, crash recovery, or backup restoration. See [rehearsal workflow and build verification](../docs/release-publishing.md). File retention uses PocketBase-managed separate snapshot files, not references to working-record storage. A process/disk failure still requires the existing storage reconciliation procedure; database transactions do not make object storage transactional.
