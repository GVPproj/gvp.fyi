# Custom PocketBase server

Pinned to **PocketBase v0.40.4**; requires **Go 1.27+** (Go toolchain auto-download
is supported). Registers JS hooks/migrations, migration CLI, static files,
[Likes previews](#frontend-contract), [duplicate lookup](../contracts.md#repeated-url-lookup),
[release publishing](../publishing-contract.md), [editorial publishing](editorial/README.md)
and explicit `editorial-seed-likes`.

See [deployment and recovery safety](../README.md). Existing hooks/migrations are
**not embedded**; ship the full backend directories, including other consumers'
hooks. Upstream self-update is deliberately absent because it would erase this
extension.

## Build and local setup

From this directory:

```sh
go test -race ./...
go build -trimpath -o /tmp/pocketbase-likes .
```

For a disposable local instance, from this directory (never use a production data path):

```sh
/tmp/pocketbase-likes serve --http=127.0.0.1:8090 \
  --dir=/tmp/gvp-pocketbase-dev/pb_data \
  --hooksDir=../pb_hooks --migrationsDir=../pb_migrations
```

This repository's migrations support local fixtures; do not substitute them for
shared production history. Provision identities privately; no credentials are seeded.

Production is deployed from sibling `../pocketbase-fly-starter`; **pushes to its
`main` deploy production**. For its Linux amd64 image, build with
`CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o /tmp/pocketbase-likes .`
and use the result as `/pb/pocketbase`. Preserve the mounted `/pb/pb_data`, settings,
configuration and full hooks/migration history. After backup, rehearsal and approval,
the production command is:

```sh
/pb/pocketbase serve --http=0.0.0.0:8090 \
  --dir=/pb/pb_data --hooksDir=/pb/pb_hooks \
  --migrationsDir=/pb/pb_migrations --publicDir=/pb/pb_public
```

Pending migrations run at startup as usual; the `migrate up` command is also registered. Dashboard schema automigration and hook watching default off; use `--automigrate` or `--hooksWatch` explicitly for development. Do not point a stock binary at this deployment expecting the preview route to exist.

Repository integration verification (from repo root):

```sh
POCKETBASE_BINARY=/tmp/pocketbase-likes node --test tests/pocketbase.test.js
```

Or run `POCKETBASE_BINARY=/tmp/pocketbase-likes pnpm test`, then `pnpm check` and
`pnpm build`. HTTP tests need Node native fetch/FormData and `python3`; without
`POCKETBASE_BINARY` they skip. Supply `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for browser
checks and the pre-toggle custom binary for upgrade tests as described in the
[release contract](../publishing-contract.md#migration-and-verification).

Tests use disposable loopback databases and controlled network fixtures, not
production credentials/writes. They do not establish crash recovery or live-data
migration safety. File inventories, not URL 404s alone, establish physical cleanup.

## Frontend contract

Authenticate with the ordinary PocketBase record token in `Authorization`. Only collection `likes_owners`, record `likesowner00001`, is admitted. Superusers and every other identity get **403**, before any network request.

Request JSON: `{"url":"https://example.com/article"}`. Success **200**, `Cache-Control: no-store`:

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

`image`, when available, is `{sourceURL, finalURL, name, type, base64}`. Base64 is raw standard base64, **not** a data URL. `name` is `preview.jpg`, `.png`, `.gif`, or `.webp`; `type` comes from decoding bytes, not the upstream header/filename. Relative image URLs resolve against the final page URL; HTML `<base>` is intentionally ignored. Open Graph fields take priority, then Twitter fields, then HTML title / description. Title and description are plain untrusted text, bounded to 300 and 2000 characters. Render with text APIs, never `innerHTML`.

Missing metadata is a successful empty result with a warning. Image failure preserves text metadata and adds a generic warning. **400** means invalid JSON/URL (8 KiB request cap, 4096-byte URL cap); **422** means page retrieval failed; **429** means rate/concurrency admission failed. Errors have a generic `{message}` and never reflect upstream error bodies or resolver/dial errors. Saving a manually entered URL remains independent of fetching.

There are **no database writes, temporary uploads, staged files, or archived HTML** in this endpoint. Consumers can review metadata and submit adopted images through the normal record asset save, preserving [provenance and attribution](../contracts.md#preview-adoption-and-provenance). PocketBase hooks/storage own validation and cleanup. The site itself uses dashboard editing, not this preview endpoint.

## Security and resource policy

- HTTP/HTTPS only, no credentials, no IPv6 zones, standard scheme ports only (80/443). TLS uses normal certificate and hostname verification.
- Every new connection resolves DNS and validates **all** answers; any non-public answer fails closed. The TCP dial receives a checked literal IP, never the hostname. Original hostname remains in HTTP Host / TLS SNI. No proxy, environment bypass, cookie jar, inherited auth headers, connection reuse or secondary hostname lookup.
- Conservative special-range exclusions for IPv4 and IPv6 (IPv6 restricted to 2000::/3, excluding special-use/documentation/transition prefixes). Mixed public/private DNS answers are rejected. Redirect URL validation and fresh DNS checks apply equally to pages and images.
- At most 4 redirects **per resource**, 12-second shared page/image network deadline, 4-second TCP/TLS/header deadlines, 32 KiB response headers, 1 MiB page, 5 MiB image. Compressed HTTP responses are rejected rather than decompressed. Only status 200 and `text/html` pages are accepted.
- JPEG/PNG/GIF/WebP only. Decode configuration first: maximum 4096 per dimension and 8 million pixels; then decode to validate before returning original bytes. No SVG, PDF or HTML images. For animated images the decoder validates the first frame; original bounded bytes are preserved. CPU decoding/parsing is size-bounded, not preemptible by the network deadline.
- Six admitted owner attempts per fixed minute and two simultaneous requests, including image download/validation. Invalid owner attempts count; unauthorized users do not. Limits are process-local and reset on restart: preserve the existing single-instance deployment or add a shared limiter before scaling.
- Controlled `Network` resolver/dialer injection exists only as a Go testing seam. Production passes its zero value, using real DNS and pinned TCP; no production bypass flags/env variables exist. Egress firewall restrictions are useful defense in depth; keep the special-use policy maintained as address registries evolve.

Go tests exercise exported Fetcher/API seams using controlled DNS/TCP fixtures, real PB tokens and temporary databases. No tests fetch arbitrary internet pages. Editor behavior and asset access remain the frontend / existing integration test seams, not duplicate storage code in this extension.
