# Editorial publishing backend

Local implementation for #21. Ship the custom binary, all migrations and existing
Likes JS hooks together. No deployment or production write is implied.

## Exact build contract

Authenticate an ordinary `publishing_builds` record with PocketBase password auth;
send its token in `Authorization`. Anonymous callers, Likes owners and superusers
receive 403. Responses use `Cache-Control: no-store` and `Vary: Authorization`.

`GET /api/publishing/content` returns a JSON **array**, sorted by kind/slug, with
exactly the latest revision for each retained identity:

```json
[{
  "revision": "pocketbaseRecordId",
  "kind": "software",
  "slug": "tipbox",
  "state": "published",
  "data": {"title": "Tipbox"},
  "assets": [{
    "name": "screenshot_sourcepbhash.png",
    "path": "/api/publishing/content-assets/pocketbaseRecordId/screenshot_retainedpbhash.png",
    "sha256": "64-lowercase-hex-digits"
  }]
}]
```

Kinds: `software`, `blog`, `settings`, `like`. Releases remain on their separate
publishing API. `data` is an object; `assets` is always an array. Withdrawal has the
same six fields, `state: "unpublished"`, `data: {}`, `assets: []`. Clients must apply
withdrawals, not mistake them for absent/unavailable content. Empty result is `[]`.
Draft-only identities never appear. Malformed/internal failures fail the entire
request, not individual rows. Unseeded existing published Likes also fail closed.

**Asset name means the source record's saved PocketBase filename**, including its
PB suffix, not the original browser upload name. Importers must read back uploaded
`assets` and map their JSON references to those saved names. That name remains
unchanged when a snapshot is copied during a collection rename; the retained file
has its own storage filename. Always use the supplied `path` and verify `sha256`;
never derive a path from `name`. The authenticated asset route serves only files
actually attached to that exact revision. Older revision files remain available
following edits, withdrawal and working-record deletion.

## Import collision inventory

`GET /api/publishing/editorial-identities` is **superuser-only** (anonymous,
owner and build identities receive 403). It returns a sorted array of `{kind, slug}`
for retained software/blog/settings identities, including withdrawals and identities
whose working records were deleted. It exposes no payload, revision, state or media;
responses use `Cache-Control: no-store` and `Vary: Authorization`.

The loopback importer reads this inventory before creating any draft and skips
retained collisions as well as existing working records. An unavailable/invalid
inventory aborts the import. Run against an isolated instance without concurrent
editorial writes; this preflight is not a cross-request locking protocol.

## Dashboard records and validation

`editorial_entries`: kind select, slug, data JSON, protected multi-file assets,
Published boolean (false by default). Native dashboard JSON editing is intentional.
Kind/slug are immutable after creation and unique together; slug is 1–100 lowercase
ASCII letters/digits with single hyphen separators. Different kinds may share a slug.
Data must be a JSON object, at most 256 KiB; domain-specific shapes/rendering safety
remain the consumer's responsibility (no executable MDX or trusted HTML contract).

Software `data.assetNames` maps stable original names to saved PB filenames.
After native upload processing, Save validates every supplied alias and repairs
replacement mappings before snapshotting. Exactly one removed file and one added
file can be paired even if the new upload has an entirely different name. Multiple
replacements can be matched by exact original upload names (alias keys); any
remaining single pair is inferred. Ambiguous or unresolved aliases reject Save with
a validation error: replace one file per Save or explicitly supply the final mapping.
No ordering-based matching is used. Unmapped new uploads may be referenced by actual
saved filenames; absent `assetNames` is allowed, including the importer's initial
draft before its mapping Save.

Corrected JSON is persisted directly in the existing transaction, without recursive
model Saves. Snapshot creation sees the corrected aliases. Failed validation or
publication rolls back working data and uploads; old retained files remain readable.

Maximum 32 files, 10 MiB each, 64 MiB total per publication. JPEG/PNG/GIF/WebP/PDF
only; publication checks extension against sniffed bytes as well as native file
validation. Sniffing is not malware scanning/full image or PDF decoding. No remote
fetching, audio or SVG uploads. Missing files abort publication and the working Save.

Published + Save creates an immutable revision and independent retained file copies
in one DB transaction. Off + Save emits a withdrawal if the identity was published;
subsequent draft Saves do not publish changes. Deleting working records retains
publication and media. Recreating an editorial kind/slug with Published off permits
explicit withdrawal without reconstructing deleted files. Snapshot records cannot
be listed/viewed/mutated or downloaded through the general record/file APIs, even
as a superuser. Internal model updates/deletes are also rejected. Trusted database
administrators can of course bypass application guards; no pruning is implemented.

## Likes and named collections

Published Likes Saves create kind `like`, slug equal to the original item ID.
`data` includes only `id`, `title`, `url`, `description`, `commentary`, `type`, `body`,
`attribution`, `created`, `updated`, `asset` (source filename or empty string), and
`collections: [{"id":"...","name":"..."}]` sorted by ID. Preview provenance and
unknown/raw imported fields are excluded. Existing Likes JS validation still applies.

Membership changes become eligible on Published item Save. Names are included only
through published memberships; no separate list of draft-only groups is exported.
A group rename/delete refreshes affected **latest published snapshot data**, copying
its retained files, never reading private working item edits. Deleted working items
remain coherent too. Group deletion removes that group from retained memberships.
A group name itself has no draft toggle: renaming a publicly referenced group is an
intentional published edit. This privacy policy describes the new build API; legacy
Likes record API visibility rules are deliberately unchanged pending frontend cutover.
The old website editor's default-publish behavior is not changed by this package.

## Explicit migration rehearsal

No Likes records or files are implicitly backfilled by migration. Before cutover:

1. Take a paired database/storage/code backup; restore it to an isolated local path.
2. Build the custom binary and apply its migrations against **that restored copy**.
3. Run `./pocketbase editorial-seed-likes --dir /isolated/pb_data` (provide the matching
   `--migrationsDir` and `--hooksDir` if not siblings of the data directory).
4. Compare all existing published item IDs, memberships, media checksums and build
   results. Exercise withdrawal and offline static delivery before approving rollout.

The seed command copies currently published Likes only, atomically; any missing or
invalid original aborts. Reruns skip any identity with a revision, including explicit
withdrawals. It neither rewrites working records nor republishes drafts. This is a
write command, not a dry run; never point it at production without separate approval.
Until all existing published Likes are seeded, content reads fail rather than silently
omit them. Deleting an unseeded published legacy item is rejected until explicit
seeding retains its publication/media. The model-level guard checks persisted state
in the deletion transaction, including internal `App.Delete` calls. Draft deletion
and pre-editorial schema behavior are unchanged; seeded working deletion preserves
retained publication/media.

## Verification

`cd pocketbase/server && go test ./... && go test -race ./editorial`

The editorial test applies the actual JS migrations/hooks to an isolated real
PocketBase DB and filesystem. It covers default drafts, identity/object validation,
publication/file retention, withdrawal, deletion/recreation, auth (including rejection
of superuser build access), snapshot API immutability, failed publication rollback,
explicit/idempotent seeding, Likes allowlisting, membership, draft-only group privacy,
collection rename/delete with retained assets after working-item deletion, and the
unseeded-published deletion guard (including rejected-deletion file preservation,
seeded deletion, draft deletion and pre-editorial schema compatibility).

`POCKETBASE_BINARY=/path/to/custom/server node --test tests/editorial-pocketbase.test.js`
exercises the actual HTTP importer, retained published/withdrawn collisions, restricted
identity inventory, differently named replacement bytes through frontend preparation
and materialization, multi-file name matching, ambiguous/invalid alias rejection,
working-file rollback and old snapshot asset retention.
