# Likes URL preview extension

Custom PocketBase executable pinned to **v0.40.4**; requires **Go 1.27+** (Go toolchain auto-download works). Registers JS hooks, JS migrations, the migration CLI, static files, `POST /api/likes/preview`, and the owner-only `POST /api/likes/duplicates` ([comparison policy and rollout](../ticket-07-rollout.md)). Existing hooks/migrations are **not embedded**: ship the full existing backend directories, including hooks for other consumers. Upstream self-update is deliberately absent because it would replace this extension.

## Build / deploy

From this directory:

```sh
go test -race ./...
go build -trimpath -o /tmp/pocketbase-likes .
```

For the existing Linux amd64 Fly image, build with `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o /tmp/pocketbase-likes .` and use the result as `/pb/pocketbase`. Preserve the existing mounted `/pb/pb_data`, settings, deployment configuration, and all existing application hooks/migration history. Back up and rehearse on a copy first; this change does not deploy anything itself.

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

This runs on temporary loopback servers, not production; verifies existing migrations/hooks and the normal asset save, access-control, replacement/deletion lifecycle.

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

There are **no database writes, temporary uploads, staged files, or archived HTML** in this endpoint. Frontend reviews/overrides metadata, decodes image bytes to a `File`, and submits it through the normal record asset save. Existing PocketBase asset hooks/storage own atomic save, protection and cleanup. Frontend separately persists provenance and prevents late fetches from overwriting explicit owner edits. Merely fetching or canceling cannot create orphan files.

## Security and resource policy

- HTTP/HTTPS only, no credentials, no IPv6 zones, standard scheme ports only (80/443). TLS uses normal certificate and hostname verification.
- Every new connection resolves DNS and validates **all** answers; any non-public answer fails closed. The TCP dial receives a checked literal IP, never the hostname. Original hostname remains in HTTP Host / TLS SNI. No proxy, environment bypass, cookie jar, inherited auth headers, connection reuse or secondary hostname lookup.
- Conservative special-range exclusions for IPv4 and IPv6 (IPv6 restricted to 2000::/3, excluding special-use/documentation/transition prefixes). Mixed public/private DNS answers are rejected. Redirect URL validation and fresh DNS checks apply equally to pages and images.
- At most 4 redirects **per resource**, 12-second shared page/image network deadline, 4-second TCP/TLS/header deadlines, 32 KiB response headers, 1 MiB page, 5 MiB image. Compressed HTTP responses are rejected rather than decompressed. Only status 200 and `text/html` pages are accepted.
- JPEG/PNG/GIF/WebP only. Decode configuration first: maximum 4096 per dimension and 8 million pixels; then decode to validate before returning original bytes. No SVG, PDF or HTML images. For animated images the decoder validates the first frame; original bounded bytes are preserved. CPU decoding/parsing is size-bounded, not preemptible by the network deadline.
- Six admitted owner attempts per fixed minute and two simultaneous requests, including image download/validation. Invalid owner attempts count; unauthorized users do not. Limits are process-local and reset on restart: preserve the existing single-instance deployment or add a shared limiter before scaling.
- Controlled `Network` resolver/dialer injection exists only as a Go testing seam. Production passes its zero value, using real DNS and pinned TCP; no production bypass flags/env variables exist. Egress firewall restrictions are useful defense in depth; keep the special-use policy maintained as address registries evolve.

Go tests exercise exported Fetcher/API seams using controlled DNS/TCP fixtures, real PB tokens and temporary databases. No tests fetch arbitrary internet pages. Editor behavior and asset access remain the frontend / existing integration test seams, not duplicate storage code in this extension.
