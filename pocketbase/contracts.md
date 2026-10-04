# Likes API contracts

These describe the coordinated local implementation targeting **PocketBase 0.40.4**,
not verified production availability. Backend additions 02–07 remain pending; see
[deployment/recovery](README.md) for exact migration/hook/binary dependencies.
The [server README](server/README.md) owns the preview HTTP and network-security policy.

## Records, authorization and ordering

- Application mutations require both auth collection `likes_owners` and record
  `likesowner00001`. Other authenticated identities cannot mutate Likes. Public owner
  signup/management is locked. Administrative superuser writes still undergo runtime
  content validation; custom preview/duplicate endpoints explicitly reject superusers.
- Anonymous/nonowner item list/view excludes drafts. New saves publish by default
  unless explicitly saved as drafts. Optional commentary is independent of description.
- Sort by `-created`, not `-updated`, for newest-saved order. Editing/publication does
  not change saved order. DELETE is permanent with no trash; clients confirm deletion.
  Returning to draft cannot recall downloaded or cached public content.
- Use ordinary record POST/PATCH/DELETE. Omitted PATCH fields retain values; validation
  failures are atomic with PocketBase field errors such as `data.asset`/`data.body`.
  Text is untrusted literal text: render with text APIs, never `innerHTML`.

## Named collections

- `likes_collections`: public list/view; required `name`, maximum 100 characters.
  Create/update/delete requires the designated ordinary owner identity.
- `likes_items.collections`: optional multi-relation, up to 1000 memberships,
  `cascadeDelete: false`. Empty memberships are valid. Deleting a named collection
  removes its references, never items or their other memberships.
- Named collections are public even if they contain drafts. Membership never overrides
  item access rules; reverse expansion also excludes drafts for anonymous/nonowners.
- Store/share the **record ID**, not the mutable name. Verified 0.40.4 item query:
  `filter=collections.id ?= "COLLECTION_ID"` with `sort=-created`; URL-encode parameters.
  Use explicit `.id` traversal: bare `collections ?= "COLLECTION_ID"` returned no
  matches in local testing. All omits this filter and includes ungrouped published
  items. A deleted collection view returns 404 and its item filter returns an empty list.

## Links, images and PDFs

- `likes_items.asset`: one protected file, returned as a filename **string** (empty
  string if absent), maximum **10 MiB = 10,485,760 bytes** inclusive.
- JPEG `.jpg`/`.jpeg`, PNG `.png`, GIF `.gif`, WebP `.webp`, PDF `.pdf` only. Extension
  and PocketBase-sniffed MIME must agree; request Content-Type is not trusted.
  Uppercase extensions are accepted and stored lowercase. Use `asset.endsWith('.pdf')`;
  there is no separate asset type field.
- Sniffing identifies formats; it is not malware scanning or full document decoding.
  Reject SVG/HTML, unsupported/missing extensions and format mismatches. Corrupt images
  may fall back to originals instead of generating thumbnails.
- With empty item `type`, title is required (maximum 500 characters), and a URL or
  asset is required, even for superuser writes/removals. URL is optional with an asset.
  Nonempty URLs retain HTTP(S), no-credentials validation and the 8192-character bound.
  Description/commentary retain attribution/descriptive text.
- POST/PATCH native multipart FormData with asset and metadata in the **same request**;
  do not manually set multipart Content-Type. More than one multipart asset is rejected.
  Existing filenames may only be retained on their own record; cross-record references
  are rejected. Identical uploads on different records remain independent files.
- Omit `asset` to retain it, upload to replace, send `asset: ''` to remove (retain/provide
  a URL for a non-text item). DELETE permanently removes the record. Errors include
  actionable normal PocketBase field errors, including `data.asset`/`data.url`.
- Published originals and configured `400x400` thumbnails are anonymously accessible.
  The square preset crops; use originals with CSS containment to preserve proportions.
- Draft originals **and thumbnails** follow the record view rule: designated owner or
  administrative superuser only. For browser URLs, POST `/api/files/token` with owner
  authorization and append its short-lived token as `?token=...`. Other users' tokens
  do not grant access. Publication changes apply to existing URLs and generated thumbnails.
  Never log tokens, send them to analytics or persist them as item data.
- Do not add CDN/service-worker/proxy caching that bypasses draft authorization.
  See [storage lifecycle and reconciliation](README.md#storage-reconciliation) for
  incomplete requests, post-commit disconnects, cleanup failures and recovery.

## Quotes and notes

- `likes_items.type`: optional single select `quote` or `note`; empty string preserves
  link/upload behavior, with no backfill or record rewrite.
- `body`: plain text, maximum 100000 characters; non-whitespace content required on
  create/update for quotes/notes, including superuser writes.
- `attribution`: optional plain text, maximum 1000 characters.
- `title`: optional for quotes/notes; maximum 500 characters remains.
- `url`: optional; nonempty sources retain HTTP(S), no-credentials validation and the
  8192-character bound. Saving a source does not fetch it.
- `asset`: forbidden for quotes/notes, including uploads or retained files during type
  conversion. Explicitly remove an existing asset in the same save when converting to
  text; native cleanup retires the file.
- JSON through ordinary record POST/PATCH suffices for text saves. Access, memberships,
  saved timestamps and file restrictions are unchanged. Body/attribution are literal
  text, not HTML or sanitized markup.

## Preview adoption and provenance

`POST /api/likes/preview` uses the designated owner's record token; see the
[full request/response, error and security contract](server/README.md#frontend-contract).
Fetching never writes records, stages uploads, returns/archives full page HTML or
executes scripts. Manual saving remains independent of fetch success.

The editor reviews/overrides metadata and locally held image bytes, then submits the
adopted image as a `File` in the normal atomic multipart asset save. This uses the same
protected FileField/publication/cleanup lifecycle, not remote hotlinks, a staging
collection or asynchronous record mutations. Cancelling creates no durable storage.
Explicit edits and existing metadata survive late responses. Ignore responses for a
changed URL, cancelled/switched editor, signed-out session or already-started save.

`previewProvenance` is a **64 KiB-bounded JSON field**:

- `fetched`: requested/final source URLs, fetch timestamp, fetched title/description,
  optional image source/final URLs, filename and MIME type. No image bytes or page HTML.
- `overrides`: flags distinguishing owner title/description/image choices from latest
  fetched values. Effective content stays in `title`, `description` and `asset`.
- `assetSource`: attribution for the **adopted image**, independent of latest fetch:
  image source/final URLs, filename, MIME type, fetch timestamp and final page URL.
  Null for manual uploads or absent/unknown fetched sources. Refetch/image failure must
  not erase attribution for a retained image; replacement/removal updates/clears it.

Provenance is owner-editable attribution, not signed attestation. It has the item's
publication visibility: never put secret source URLs in published items. Preview image
limits (5 MiB, decoded dimension/pixel bounds) differ from the 10 MiB upload limit.

## Repeated URL lookup

### Owner API

`POST /api/likes/duplicates`, JSON `{"url":"https://example.com/article"}`.
Send the ordinary PocketBase record token in `Authorization`. Only `likes_owners`
record `likesowner00001` is authorized. Anonymous callers, other owner records, other
auth collections and **superusers** get **403 before body validation or scanning**.

Success **200**: `{"items":[/* full matching likes_items records */]}`.
No matches is `{"items":[]}`, never `null`. Includes drafts/published items, all types,
and independent items sharing a URL. Records retain original fields including ID,
collection metadata, commentary, memberships, asset filename and provenance; this is
not a preview projection or expanded-relations response. Protected files still need
the existing file-token API. All responses, including errors, use `Cache-Control: no-store`.

Invalid JSON/URL returns **400**, generic message. Exactly one JSON object, no unknown
properties; `url` must be nonempty HTTP(S), with hostname and no credentials. Reject
embedded whitespace/control characters, backslashes, invalid URL escapes recognized
by Go's parser and invalid ports. Ports **0–65535** are allowed: unlike preview, this
endpoint never connects. Request body cap: **64 KiB** (allows JSON escaping); trimmed
URL cap: **8192 bytes**. Storage errors fail the whole request, not partial matches.
Missing/invalid URLs in old records are skipped.

### Conservative comparison policy

Apply the same function to request and stored URLs:

- Trim surrounding whitespace.
- Compare scheme and hostname case-insensitively.
- Treat explicit default ports as absent: HTTP 80, HTTPS 443, including zero-padded
  spellings of these defaults.
- Treat empty path as `/`, including before query or fragment.
- Preserve HTTP versus HTTPS, nondefault ports, hostname differences such as `www`,
  path case, non-root trailing slash, query order, tracking parameters, fragments and
  percent encodings **including hex-letter case**. Empty `?` and `#` delimiters remain
  meaningful. No query parsing, sorting, decoding or stripping.

Go `net/url` validates/parses authority, but comparison retains the **original
path/query/fragment suffix**, not a decoded/reserialized version. No redirects,
canonical-tag lookup, DNS, fetching or writes occur. No URL uniqueness constraint,
migration, index or stored canonical key is added. Lookup is advisory; saving another
item deliberately remains legal.

### Client WHATWG normalization

`src/lib/likes.js` saves `webURL(value)`: JavaScript `new URL(value).href` for HTTP(S)
without credentials. Pass **that same serialized value** to lookup, not a raw or
independently normalized form. Both frontend `api.duplicates` and `api.save` use `webURL`.

WHATWG serialization precedes backend comparison: it can collapse dot segments
(including encoded ones), normalize IDNs/IPv4/IPv6 spellings, encode literal spaces/
Unicode and interpret backslashes. Existing save turns `https://example.com/a/../b`
into `https://example.com/b`; lookup must send the latter too. Those original
distinctions are already lost on save.

The backend is deliberately **not a WHATWG implementation**: raw API `/a/../b` does
not match `/b`; raw embedded spaces/backslashes are rejected. It neither retroactively
WHATWG-normalizes legacy URLs nor rewrites records. Conservatism applies to serialized
URLs actually saved/submitted; remaining percent encodings and meaningful suffix
distinctions are preserved. Legacy URLs saved outside the client can conservatively
fail to match a WHATWG-normalized equivalent; this is preferable to silent merging.

### Scan, concurrency and client use

Scan `likes_items` in ascending ID order with keyset pages of at most **200 records**,
cancellation checks between pages, and no match-count cutoff or public pagination
parameter. Only matching records accumulate; response size grows with the complete
match set. This small-site scan is **not a snapshot transaction**: concurrent edits/
saves can race. It neither reserves URLs nor guarantees uniqueness.

Public endpoints/rules are unchanged. Never cache private results publicly or render
them to unauthenticated visitors; clear stale/private results on session/editor changes.
The client checks only new items with URLs. Updates and uploads/text without URLs use
normal save flow. Reuse uses the existing editor/memberships; explicit Save another
retains native field validation. A newly built custom binary is required before
exposing the prompt; copying JS hooks/frontend alone does not install this route.
