# Release publishing contract

Contract for the locally committed, **not deployed** whole-catalogue candidate on
custom PocketBase **0.40.4**. See [dashboard authoring](../docs/dashboard-publishing.md),
[imports](../docs/import-editorial.md) and [rollout safety](README.md).
Editorial content and Likes snapshots use the [editorial API](server/editorial/README.md).

## Working records

Normal CRUD is superuser/dashboard-only (rules locked), including import. No
credentials are seeded.

`publishing_releases`:

- Unique `slug` (required, max 100 characters), immutable after creation.
- Required `title` and `artist` (max 500 each), `release_date` (text, max 100;
  preserve the original string). Optional `about` and `url` (max 10000 each),
  `display_date` (max 500, preserved verbatim), `streaming` JSON (max 20000 bytes).
- `category`: `graham-van-pelt`, `miracle-fortress`, `think-about-life` or
  `other-credits`; required to publish, except legacy `watery-grave-ep` defaults to
  `miracle-fortress`.
- Optional `credit`, `display_title`, `youtube_video_id` (max 5000 each), and
  nonnegative integer `album_id`, `art_id`, `player_height`. Empty text and zero
  numeric metadata are omitted from snapshots.
- Protected single `artwork`: JPEG, PNG or WebP, max **10 MiB**. Publication decodes
  it, limits each dimension to 4096 and total pixels to 16 million, then retains
  the original bytes and SHA-256 in independent snapshot storage.
- Native `tracks` JSON (max 500000 bytes): omitted/null/empty means no tracks.
  Each row permits only `title` (nonblank, max 500 characters), `track_num`
  (consecutive integers starting at 1), optional nonnegative numeric `duration`
  in seconds and string `audio_url`. Preserve order and original audio URL strings;
  audio is not uploaded or fetched by publication.
- Persistent `published` boolean, default false. **Every Save while true publishes
  the full saved record**, including tracks and artwork. A failed publication rolls
  back the Save and leaves the prior revision intact.

Off + Save stays private; the first transition off appends a withdrawal without
requiring complete artwork/tracks. Repeated off Saves do not create repeated
withdrawals. A new unpublished slug creates no public revision. Recreating a deleted,
still-published slug with Published off explicitly withdraws its retained publication.

Deleting a working record is **not unpublishing**: publication and retained media
remain. To remove public content, turn Published off, Save, then deploy successfully
before deleting the working record. Never delete internal snapshots to remove content.
Save does not trigger deployment; manually deploy in Netlify. Old deploys, caches and
downloaded copies may outlive removal.

## Build identity and API

`publishing_builds` is an ordinary auth collection with email/password (minimum
12 characters); superusers provision/manage it. Authenticate with standard
`POST /api/collections/publishing_builds/auth-with-password` and send the returned
token in `Authorization`. Anonymous callers, Likes owners and superusers receive
403. Responses use `Cache-Control: no-store` and `Vary: Authorization`.

- `GET /api/publishing/releases`: JSON array containing the latest snapshot for
  every retained slug, including withdrawals; `[]` if none. No ordering guarantee.
- `GET /api/publishing/releases/{slug}`: latest snapshot, or 404 before first publication.
- `GET /api/publishing/artwork/{revision}`: revision-pinned retained original using
  the same build token. Use the supplied same-origin path, never a remote URL.

A published payload has this shape (optional release metadata omitted here):

```json
{
  "revision": "recordId",
  "release": {
    "slug": "release-slug",
    "title": "Title",
    "artist": "Artist",
    "release_date": "2026",
    "about": "",
    "category": "graham-van-pelt",
    "tracks": []
  },
  "artwork": {
    "path": "/api/publishing/artwork/recordId",
    "width": 300,
    "height": 283,
    "sha256": "64-lowercase-hex-digits"
  }
}
```

Explicit withdrawal is HTTP 200 with
`{"revision":"recordId","slug":"release-slug","state":"unpublished"}`;
there is no artwork. Only this signal authorizes removal in per-slug builds.
Authentication, fetch, validation and unexpected missing-record failures must fail
the build, not masquerade as withdrawal. `PUBLISHING_CONTENT=true` selects the
frontend's authoritative full-content build without repository fallback.

Internal `publishing_snapshots` hold immutable server-created JSON and separate
protected artwork copies. Normal API writes are rejected even for superusers;
build identities have no ordinary collection access. Revision-pinned media survives
later publication, withdrawal, artwork replacement and working-record deletion.
Snapshots are retained indefinitely; garbage collection is not implemented. Database
transactions do not make filesystem operations crash-proof; use the
[storage recovery procedure](README.md#storage-reconciliation) after disk/process faults.

## Migration and verification

Ship the complete migration history and custom runtime, including
`1782086400_publishing.js`, `1782172800_release_unpublish.js`,
`1782259200_release_toggle.js` and `1782345600_release_catalogue.js`.
The toggle migration initializes Published from the latest public state, copies
ordered track rows to JSON, and removes the old track collection transactionally,
without publishing private working edits or changing retained snapshots/media.
The catalogue migration adds metadata without republishing. A later Save of a
migrated published record intentionally publishes its working edits. Rehearse on
fresh isolated data; do not rewrite history or use destructive down migrations.

From the repository root:

```sh
(cd pocketbase/server && go test -race ./... && go build -trimpath -o /tmp/gvp-pocketbase .)
POCKETBASE_BINARY=/tmp/gvp-pocketbase node --test tests/publishing-pocketbase.test.js tests/publishing-import.test.js tests/publishing-build.test.js
OLD_POCKETBASE_BINARY=/path/to/pre-toggle-custom-server POCKETBASE_BINARY=/tmp/gvp-pocketbase node --test tests/publishing-upgrade.test.js tests/publishing-migration-failure.test.js
POCKETBASE_BINARY=/tmp/gvp-pocketbase PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium node --test tests/publishing-workflow-browser.test.js
```

These are disposable local fixtures, not production/restore acceptance. Required
binary/browser checks must not be counted as passed when skipped.
