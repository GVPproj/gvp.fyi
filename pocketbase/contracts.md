# Backend contracts

Custom **PocketBase 0.40.4**. [Setup, operations and dashboard workflow](README.md).
The website consumes static release/editorial snapshots; retained Likes record,
preview and duplicate APIs serve shared consumers.

## Publishing authentication

Superusers provision/manage ordinary `publishing_builds` auth records with private
email/password (minimum 12 characters); no credentials are seeded. Authenticate via
`POST /api/collections/publishing_builds/auth-with-password`; send the token in
`Authorization`. Release/content/media endpoints reject anonymous callers, Likes
owners and superusers with **403**. Responses use `Cache-Control: no-store` and
`Vary: Authorization`. Build identities have no ordinary collection access.

## Release publishing

### Working records

`publishing_releases` CRUD, including imports, is superuser/dashboard-only (rules locked):

- Unique immutable `slug`: required, max 100 characters.
- Required `title`, `artist`: max 500 each; `release_date`: text, max 100, preserve
  original string. Optional `about`, `url`: max 10000 each; `display_date`: max 500,
  preserved verbatim; `streaming`: JSON, max 20000 bytes.
- `category`: `graham-van-pelt`, `miracle-fortress`, `think-about-life`, `other-credits`.
  Required to publish, except legacy `watery-grave-ep` defaults to `miracle-fortress`.
- Optional `credit`, `display_title`, `youtube_video_id`: max 5000 each; `album_id`,
  `art_id`, `player_height`: nonnegative integers. Empty text/zero numeric metadata
  are omitted from snapshots.
- Protected single `artwork`: JPEG/PNG/WebP, max **10 MiB**. Publication decodes it,
  bounds dimensions to 4096 each and 16 million pixels total, and retains original
  bytes plus SHA-256 in independent snapshot storage.
- `tracks`: native JSON, max 500000 bytes; omitted/null/empty means no tracks. Rows
  allow only `title` (nonblank, max 500), `track_num` (consecutive integers from 1),
  optional nonnegative numeric `duration` (seconds) and string `audio_url`. Preserve
  order and original audio URL strings; publication neither uploads nor fetches audio.
- `published`: persistent boolean, default false. **Every Save while true publishes
  the full saved record**, including tracks/artwork. Failure rolls back Save, leaving
  the prior revision intact.

Off + Save stays private; first transition off appends a withdrawal without requiring
complete artwork/tracks. Repeated off Saves do not repeat withdrawals; a new unpublished
slug creates no revision. Recreating a deleted, still-published slug with Published off
explicitly withdraws it. Deleting working records is **not unpublishing**: retained
publication/media survive. Follow the [withdrawal workflow](README.md#workflow).

### Build identity and API

Uses [publishing authentication](#publishing-authentication):

- `GET /api/publishing/releases`: latest snapshot for every retained slug, including
  withdrawals; JSON array, `[]` if none, no ordering guarantee.
- `GET /api/publishing/releases/{slug}`: latest snapshot; 404 before first publication.
- `GET /api/publishing/artwork/{revision}`: revision-pinned retained original with the
  same build token. Use supplied same-origin path, never a remote URL.

Published payload (optional release metadata omitted):

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

Withdrawal: HTTP 200, `{"revision":"recordId","slug":"release-slug","state":"unpublished"}`,
no artwork. Frontend uses the authoritative catalogue, not legacy per-slug build mode.
Auth/fetch/validation failures must fail builds, never masquerade as withdrawal.
Publishing credentials are required for development/builds; no repository fallback.

Internal `publishing_snapshots` contain immutable server-created JSON and independent
protected artwork. Normal API writes are rejected even for superusers. Revision-pinned
media survives publication, withdrawal, replacement and working-record deletion.
Retention is indefinite; no garbage collection. See [storage recovery](README.md#storage-reconciliation),
[release migrations](README.md#release-migrations) and [verification](README.md#verification).

## Editorial publishing

### Exact build contract

Uses [publishing authentication](#publishing-authentication).
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

Kinds: `software`, `blog`, `settings`, `like`; releases use their separate API.
The website ignores legacy `settings` snapshots and their assets; site settings live in Git.
`data` is an object; `assets` always an array. Withdrawal has the same six fields,
`state: "unpublished"`, `data: {}`, `assets: []`. Apply withdrawals; they are not
absent/unavailable content. Empty result is `[]`; draft-only identities never appear.
Malformed/internal failures fail the whole request, not individual rows. Unseeded
existing published Likes also fail closed.

**Asset name is the source record's saved PB filename**, including its suffix, not
browser upload name. Importers must read back uploaded `assets` and map JSON references
to saved names. Names remain unchanged when snapshots are copied during collection
rename; retained files have their own storage filenames. Use supplied `path`, verify
`sha256`, never derive paths from `name`. Authenticated asset routes serve only files
attached to that exact revision; older files survive edits, withdrawal and working deletion.

### Import collision inventory

`GET /api/publishing/editorial-identities` is **superuser-only**; anonymous, owner and
build identities get 403. Returns sorted `{kind, slug}` array for retained software/
blog/settings identities, including withdrawals and deleted working records. Exposes
no payload, revision, state or media. Uses `Cache-Control: no-store`, `Vary: Authorization`.

### Dashboard records and validation

`editorial_entries`: kind select, slug, data JSON, protected multi-file assets,
Published boolean (default false). Native dashboard JSON editing is intentional.
Kind/slug are immutable and unique together. Slug: 1–100 lowercase ASCII letters/digits
with single hyphen separators; different kinds may share it. Data: JSON object, max
256 KiB. Domain shapes/rendering safety belong to consumers; no executable MDX or
trusted HTML contract.

Software `data.assetNames` maps stable original names to saved PB filenames. After
native upload processing, Save validates every supplied alias and repairs replacements
before snapshotting. One removed/added file can pair even with entirely different
names. Multiple replacements match exact original upload names (alias keys); any
remaining single pair is inferred. Ambiguous/unresolved aliases reject Save: replace
one file per Save or supply final mapping. No ordering-based matching. Unmapped new
uploads may use actual saved filenames. Missing `assetNames` is allowed, including
an importer's initial draft before mapping Save.

Corrected JSON persists directly in the existing transaction, without recursive model
Saves; snapshots see corrected aliases. Failed validation/publication rolls back working
data/uploads; retained old files remain readable.

Maximum 32 files, 10 MiB each, 64 MiB total per publication. JPEG/PNG/GIF/WebP/PDF
only; publication checks extension against sniffed bytes plus native validation.
Sniffing is not malware scanning or full image/PDF decoding. No remote fetching,
audio or SVG uploads. Missing files abort publication and working Save.

Published + Save creates immutable revision/independent retained copies in one DB
transaction. Off + Save withdraws previously published identities; later draft Saves
do not publish changes. Deletion retains publication/media. Recreating kind/slug
with Published off permits withdrawal without reconstructing deleted files.
Snapshot records cannot be listed/viewed/mutated or downloaded via general record/file
APIs, even by superusers; internal model updates/deletes are also rejected. Trusted
DB administrators can bypass guards. No pruning is implemented.

### Likes and named collections

Published Likes Saves create kind `like`, slug equal to original item ID. `data` contains
only `id`, `title`, `url`, `description`, `commentary`, `type`, `body`, `attribution`,
`created`, `updated`, `asset` (source filename or empty string), and
`collections: [{"id":"...","name":"..."}]` sorted by ID. Preview provenance and
unknown/raw imported fields are excluded. Existing Likes JS validation still applies.

Membership changes become eligible on Published item Save. Names appear only through
published memberships; no separate draft-only group list. Group rename/delete refreshes
affected **latest published snapshot data**, copying retained files, never reading
private working edits; deleted working items remain coherent. Group deletion removes
retained memberships. Names have no draft toggle: renaming publicly referenced groups
is an intentional published edit. Legacy record API visibility remains unchanged.

[Explicit legacy seeding](README.md#seeding-a-legacy-database) is required: no migration
backfill. Unseeded published legacy item deletion is rejected until seeding retains its
publication/media. The model guard checks persisted state in the deletion transaction,
including internal `App.Delete`. Draft deletion and pre-editorial schema behavior are
unchanged; seeded working deletion preserves retained publication/media.

## Likes API

### Records, authorization and ordering

- Application mutations require auth collection `likes_owners`, record `likesowner00001`.
  Other identities cannot mutate Likes; public owner signup/management is locked.
  Provision administratively with private email/password of at least 12 characters;
  never put superuser credentials in website code. Superuser writes still undergo
  runtime content validation; preview/duplicate endpoints reject superusers.
- Anonymous/nonowner item list/view excludes drafts. New records default to draft.
  Optional commentary is independent of description.
- Sort `-created`, not `-updated`, for newest-saved order; editing/publication does not
  change saved order. DELETE is permanent, no trash; clients confirm. Returning to
  draft cannot recall downloaded/cached public content.
- Use ordinary record POST/PATCH/DELETE; omitted PATCH fields retain values. Validation
  failures are atomic with PB field errors such as `data.asset`/`data.body`. Text is
  untrusted literal text: use text APIs, never `innerHTML`.

### Named collections

- `likes_collections`: public list/view; required `name`, max 100 characters.
  Create/update/delete requires designated ordinary owner.
- `likes_items.collections`: optional multi-relation, max 1000 memberships,
  `cascadeDelete: false`. Empty is valid. Deleting a named collection removes its
  references, never items or other memberships.
- Named collections are public even with drafts; membership never overrides item
  access. Reverse expansion excludes drafts for anonymous/nonowners.
- Share/store record ID, not mutable name. Verified 0.40.4 query:
  `filter=collections.id ?= "COLLECTION_ID"`, `sort=-created`; URL-encode parameters.
  Explicit `.id` is necessary: bare `collections ?= "COLLECTION_ID"` returned no
  matches locally. All omits filter, includes ungrouped published items. Deleted
  collection view returns 404; its item filter returns an empty list.

### Links, images and PDFs

- `likes_items.asset`: one protected file, filename **string** (empty if absent),
  max **10 MiB = 10,485,760 bytes** inclusive.
- JPEG `.jpg`/`.jpeg`, PNG `.png`, GIF `.gif`, WebP `.webp`, PDF `.pdf` only. Extension
  must agree with PB-sniffed MIME; request Content-Type is untrusted. Uppercase
  extensions accepted/stored lowercase. Use `asset.endsWith('.pdf')`; no asset type field.
- Sniffing is not malware scanning/full decoding. Reject SVG/HTML, unsupported/missing
  extensions and mismatches. Corrupt images may fall back to originals instead of thumbnails.
- Empty `type`: title required (max 500), plus URL or asset, even for superuser
  writes/removals. URL optional with asset; nonempty URL must be HTTP(S), no credentials,
  max 8192 characters. Description/commentary retain attribution/descriptive text.
- POST/PATCH native multipart FormData with asset/metadata in **one request**; never
  manually set multipart Content-Type. Multiple multipart assets rejected. Existing
  filenames can only be retained on their own record; cross-record references rejected.
  Identical uploads on separate records are independent files.
- Omit asset to retain, upload to replace, `asset: ''` to remove (retain/provide URL
  for non-text item). DELETE removes record permanently. Normal actionable field
  errors include `data.asset`/`data.url`.
- Published originals/configured `400x400` thumbnails are anonymous. Square preset
  crops; use originals with CSS containment to preserve proportions.
- Draft originals **and thumbnails** obey view rule: designated owner or superuser.
  Browser URLs: POST `/api/files/token` with owner auth; append short-lived `?token=...`.
  Other users' tokens do not grant access. Publication changes affect existing URLs
  and generated thumbnails. Never log tokens, send to analytics or persist as item data.
- Never add CDN/service-worker/proxy caching bypassing draft authorization.
  [Storage lifecycle/recovery](README.md#storage-reconciliation) covers cleanup and faults.

### Quotes and notes

- Optional single-select `type`: `quote` or `note`; empty preserves link/upload
  behavior, without backfill/rewrites.
- `body`: plain text, max 100000 characters; non-whitespace required on create/update
  for quotes/notes, including superuser writes.
- `attribution`: optional plain text, max 1000. `title`: optional, max 500.
- `url`: optional; nonempty HTTP(S), no credentials, max 8192 characters. Save never fetches it.
- `asset`: forbidden, including uploads/retained files on conversion. Explicitly remove
  existing asset in same Save when converting to text; native cleanup retires it.
- Ordinary JSON POST/PATCH suffices. Access, memberships, saved timestamps and file
  restrictions are unchanged. Body/attribution are literal text, not HTML/sanitized markup.

### Preview HTTP contract

`POST /api/likes/preview`, ordinary record token in `Authorization`. Only
`likes_owners` / `likesowner00001` admitted; all others, including superusers, get
**403 before network requests**. Request: `{"url":"https://example.com/article"}`.
Success **200**, `Cache-Control: no-store`:

```json
{
  "sourceURL": "https://example.com/article",
  "finalURL": "https://example.com/article",
  "fetchedAt": "2026-10-02T12:00:00Z",
  "title": "Example",
  "description": "Summary",
  "image": null,
  "warning": ""
}
```

Image, when present: `{sourceURL, finalURL, name, type, base64}`. Raw standard base64,
**not** data URL; name `preview.jpg`, `.png`, `.gif` or `.webp`. Type comes from decoded
bytes, not upstream header/filename. Relative image URLs resolve against final page
URL; HTML `<base>` ignored. Metadata priority: Open Graph, Twitter, then HTML title/
description. Title/description are untrusted plain text bounded to 300/2000 characters;
never render via `innerHTML`.

Missing metadata succeeds empty with warning. Image failure preserves text with generic
warning. **400**: invalid JSON/URL (8 KiB request, 4096-byte URL caps); **422**: page
retrieval failure; **429**: rate/concurrency rejection. Generic `{message}` errors never
reflect upstream bodies or resolver/dial errors. Manual save is independent of fetch.
No writes, temporary uploads, staged files, archived/full-page HTML or script execution.
The website edits through dashboard, not preview.

### Preview security and resource policy

- HTTP/HTTPS only, no credentials/IPv6 zones, standard scheme ports (80/443). Normal
  TLS certificate/hostname verification.
- Each new connection resolves DNS, validates **all** answers; any non-public answer
  fails closed. TCP dials checked literal IP; original hostname remains Host/TLS SNI.
  No proxy, environment bypass, cookie jar, inherited auth headers, connection reuse
  or secondary hostname lookup.
- Conservative IPv4/IPv6 special-range exclusions; IPv6 restricted to 2000::/3 minus
  special-use/documentation/transition prefixes. Mixed public/private answers rejected.
  Redirect validation/fresh DNS checks apply equally to pages/images.
- Max 4 redirects per resource; shared 12-second page/image network deadline; 4-second
  TCP/TLS/header deadlines; 32 KiB headers, 1 MiB page, 5 MiB image. Reject compressed
  responses rather than decompress. Pages must be status 200 and `text/html`.
- JPEG/PNG/GIF/WebP only. Decode config first: max 4096 each dimension, 8 million pixels;
  then decode to validate, return original bytes. No SVG/PDF/HTML images. Animated
  decoding validates first frame, preserves bounded original bytes. CPU decode/parse
  is size-bounded, not preemptible by network deadline.
- Six admitted owner attempts per fixed minute; two simultaneous requests including
  image download/validation. Invalid owner attempts count, unauthorized users do not.
  Process-local, reset on restart: single instance or shared limiter before scaling.
- `Network` resolver/dialer injection is Go testing seam only. Production zero value
  uses real DNS/pinned TCP; no bypass flags/env. Egress firewall is defense in depth;
  maintain special-use policy as registries evolve.

### Preview adoption and provenance

Consumers adopt image bytes as `File` in normal multipart asset Save; preview alone
creates no durable storage. Hooks/storage own validation/cleanup.
`previewProvenance`: **64 KiB-bounded JSON**:

- `fetched`: requested/final source URLs, timestamp, fetched title/description, optional
  image source/final URLs, filename/MIME. No image bytes/page HTML.
- `overrides`: owner title/description/image choices versus latest fetched values;
  effective content remains `title`, `description`, `asset`.
- `assetSource`: adopted image attribution independent of latest fetch: image source/
  final URLs, filename, MIME, timestamp, final page URL. Null for manual uploads or
  absent/unknown fetched sources. Refetch/image failure must not erase retained image
  attribution; replacement/removal updates/clears it.

Owner-editable attribution, not signed attestation; visibility follows item. Never put
secret source URLs in published items. Preview image limits (5 MiB plus decoded
bounds) differ from 10 MiB uploads.

### Repeated URL lookup

`POST /api/likes/duplicates`, JSON `{"url":"https://example.com/article"}`, ordinary
record token in `Authorization`. Only `likes_owners` / `likesowner00001`; anonymous,
other owner records/auth collections and superusers get **403 before validation/scanning**.

**200**: `{"items":[/* full matching likes_items records */]}`; no matches `{"items":[]}`,
never null. Includes drafts/published, all types and independent items sharing URL.
Original fields include ID, collection metadata, commentary, memberships, asset filename,
provenance; no preview projection/expanded relations. Protected files still need file
tokens. All responses, errors included, use `Cache-Control: no-store`.

Invalid JSON/URL: **400**, generic message. Exactly one JSON object, no unknown properties.
Nonempty HTTP(S) URL with hostname/no credentials. Reject embedded whitespace/control
characters, backslashes, invalid escapes recognized by Go parser and invalid ports.
Ports **0–65535** allowed (unlike preview, never connects). Body max **64 KiB** to allow
JSON escaping; trimmed URL max **8192 bytes**. Storage errors fail whole request;
missing/invalid old record URLs skipped.

#### Conservative comparison policy

Same function for request/stored URLs:

- Trim surrounding whitespace; compare scheme/hostname case-insensitively.
- Explicit default HTTP 80/HTTPS 443 ports absent, including zero-padded spellings.
- Empty path becomes `/`, including before query/fragment.
- Preserve HTTP versus HTTPS, nondefault ports, hostname differences (`www`), path
  case, non-root trailing slash, query order, tracking parameters, fragments and percent
  encodings **including hex-letter case**. Empty `?`/`#` delimiters matter. Never parse,
  sort, decode or strip query.

Go `net/url` validates/parses authority; comparison retains **original path/query/fragment
suffix**, not decoded/reserialized form. No redirects, canonical tags, DNS, fetching or
writes. No URL uniqueness constraint, migration, index or stored canonical key. Lookup
is advisory; deliberately saving another item is legal.

#### Scan, concurrency and client use

Ascending ID keyset pages of at most **200 records**, cancellation between pages,
no match cutoff/public pagination. Only matches accumulate; response grows with full
match set. Small-site scan is **not a snapshot transaction**: concurrent edits/Saves
can race. No reservations/uniqueness guarantee. Never publicly cache private results
or render them to unauthenticated visitors.
