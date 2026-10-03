# Ticket 07 backend: repeated URL lookup

## Owner API

`POST /api/likes/duplicates`, JSON body `{"url":"https://example.com/article"}`.
Send the ordinary PocketBase record token in `Authorization`, just as for preview.
Only `likes_owners` record `likesowner00001` is authorized. Anonymous callers,
other owner records, other auth collections and **superusers** receive **403**,
before body validation or collection scanning. This intentionally matches preview.

Success: **200**, `{"items":[/* full matching likes_items records */]}`.
No matches is `{"items":[]}`, never `null`. Includes published items and drafts,
all item types, and multiple independent items with the same URL. Records retain
their original fields (including ID, collection metadata, commentary, memberships,
asset filename and provenance); this is not a preview projection or expanded
relations response. Protected file access still uses the existing file-token API.
Responses carry `Cache-Control: no-store`, including failures.

Invalid JSON/URL receives **400** with a generic message. Exactly one JSON object,
no unknown properties; `url` must be a nonempty HTTP(S) URL with a hostname and
without credentials. Embedded whitespace/control characters, backslashes, invalid
URL escapes recognized by Go's URL parser, and invalid ports are rejected. Ports
0–65535 are allowed: unlike preview this endpoint never connects to the URL.
Request body is capped at 64 KiB to accommodate JSON escaping; trimmed URL is
capped at 8192 bytes. Storage errors fail the request rather than returning partial
matches. Missing/invalid URLs in old records are skipped.

## Conservative comparison policy

The same comparison function is applied to the request URL and each stored URL:

- Trim surrounding whitespace.
- Compare scheme and hostname case-insensitively.
- Treat explicit default ports as absent: HTTP 80, HTTPS 443 (including zero-padded
  spellings of those default ports).
- Treat an empty path as `/`, including before a query or fragment.
- Preserve HTTP versus HTTPS, nondefault ports, hostname differences such as `www`,
  path case, non-root trailing slash, query order, tracking parameters, fragments,
  and percent encodings (including hex-letter case). Empty `?` and `#` delimiters
  remain meaningful. No query parsing, sorting, decoding or stripping occurs.

Implementation uses Go `net/url` for validation/authority parsing, but retains the
**original path/query/fragment suffix**, not a decoded and reserialized version.
No redirect following, canonical-tag lookup, DNS, HTTP fetching or writes occur.
No URL uniqueness constraint, migration, index or stored canonical key is added.
Lookup is advisory: deliberately saving another item remains legal.

### Existing client WHATWG normalization

`src/lib/likes.js` already saves `webURL(value)`, which returns JavaScript
`new URL(value).href` for HTTP(S) URLs without credentials. The caller must pass
**that same serialized value** to duplicate lookup, not an independently normalized
or raw form. The frontend's `api.duplicates` and `api.save` both use `webURL`.

WHATWG serialization happens *before* this backend policy. It can collapse dot
segments (also encoded dot segments), normalize IDNs/IPv4/IPv6 spellings, encode
literal spaces/Unicode, and interpret backslashes. For example, the existing save
turns `https://example.com/a/../b` into `https://example.com/b`; lookup must send
`https://example.com/b` too. Those original distinctions are already lost on save.
The backend is deliberately **not a WHATWG implementation**: direct raw API input
with `/a/../b` does not match `/b`, and raw embedded spaces/backslashes are rejected.
It does not retroactively WHATWG-normalize legacy URLs or rewrite records. Thus
conservatism applies to the serialized URLs actually saved/submitted; percent
encodings and meaningful suffix distinctions still present there are preserved.
Legacy URLs stored outside the normal client can conservatively fail to match a
WHATWG-normalized equivalent. This is preferable to silently merging distinct items.

## Scan and concurrency

Suitable for this small personal site: scan `likes_items` in ascending ID order,
using keyset pages of at most 200 records, with cancellation checks between pages.
Continue through all pages; there is **no match-count cutoff** or public pagination
parameter. Only matching records accumulate in the response. Response size therefore
grows with the complete match set. This is not a snapshot transaction: concurrent
saves/edits can race with lookup. It does not reserve a URL or guarantee uniqueness.
Public record rules/endpoints are unchanged; private lookup results must never be
placed in public caches or rendered to unauthenticated visitors.

## Rollout

**A newly built custom PocketBase binary is required.** Copying JS hooks or shipping
only the frontend does not install this Go route; older/stock binaries return 404.
`pocketbase/server/main.go` registers it alongside preview.

```sh
cd pocketbase/server
go test ./...
go test -race ./...
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o /tmp/pocketbase-likes .
```

Follow `server/README.md` deployment instructions: back up/rehearse first, deploy
this binary as `/pb/pocketbase`, retain the full existing `pb_hooks` and
`pb_migrations`, preserve mounted `pb_data`, and restart the process. No new schema
migration is needed. Verify owner lookup returns both a published item and a draft;
verify anonymous/non-owner/superuser requests return 403. Deploy the backend before
enabling the client duplicate prompt. This change itself does not deploy anything.

Go integration tests use real PocketBase tokens and temporary databases at the
owner API seam. They cover forbidden identities, full published/draft matches,
empty results, invalid input, conservative URL distinctions, 340 matches across
multiple pages, and a loopback HTTP fixture that must receive zero requests.
Frontend regression tests cover reuse through the existing editor, adding named
collection memberships, explicit Save another with native field validation, paste
and submit prompts, lookup failures, and clearing stale/private results. The
lookup runs only for new items with a URL; uploads or text without a URL and
updates to existing items use their ordinary save flow.
