# Ticket 05 backend: URL previews (not deployed)

## Architecture and save contract

URL previews require the custom **PocketBase 0.40.4 Go executable** in `pocketbase/server`, not only a JavaScript hook. DNS resolution must be validated and the actual connection pinned to the validated IP; checking a hostname before handing it to a generic HTTP client would leave a DNS-rebinding gap. The executable retains PocketBase's JavaScript migrations/hooks support.

`POST /api/likes/preview`, with the designated Likes owner's authorization and JSON `{ "url": "https://…" }`, returns `sourceURL`, `finalURL`, `fetchedAt`, `title`, `description`, `image`, and `warning`. The optional image contains `sourceURL`, `finalURL`, `name`, `type`, and bounded `base64` bytes. Neither a preview request nor a failed fetch saves or changes an item. No complete page HTML is returned or archived, and no scripts are executed.

The editor reviews the metadata and locally held image bytes before Save. The ordinary multipart item save sends the reviewed image as `asset` alongside the item fields. Thus previews use **the same protected FileField, publication rules, validation, and replacement/removal/deletion cleanup** as uploaded assets. There is no new staging collection, remote hotlink, orphan preview file, or independent asynchronous record mutation. Cancelling a preview creates no durable storage. Saving without metadata or an image remains possible with a manually supplied title and destination URL.

Migration `1781913600_preview_provenance.js` adds a 64 KiB-bounded `previewProvenance` JSON field:

- `fetched`: requested/final source URLs, fetch timestamp, fetched title and description, and optional image source/final URLs, filename and MIME type. Never includes image bytes or page HTML.
- `overrides`: flags distinguishing owner title, description, and image choices from the latest fetched values. Effective text remains in the existing `title` and `description` fields; the effective image remains in `asset`.
- `assetSource`: attribution for the **adopted image**, independently of the latest fetch: image source/final URLs, filename, MIME type, fetch timestamp, and final page URL. It is null for a manual upload or absent/unknown fetched source. Refetching or a later image failure must not erase attribution for a retained image; replacing/removing that image updates/clears its attribution.

Provenance is owner-editable attribution, not a signed attestation of a remote site. It has the item's publication visibility: do not put secret source URLs into published items. Explicit owner edits and existing metadata are retained when a request finishes. Responses for a changed URL, cancelled/switched editor, signed-out session, or already-started save are ignored.

## Supported destinations and bounds

- HTTP on port 80 and HTTPS on port 443 only. Credentials, non-web schemes, IPv6 zone identifiers, private/local/link-local/multicast/reserved/documentation ranges, and transition addresses are rejected. Every DNS answer must be public; dialing uses the validated IP literal while TLS still verifies the original hostname. Proxy environment variables are not used. Redirects and image downloads follow the same checks, with no connection reuse that could skip revalidation.
- At most 4 redirects per download, a 12-second deadline shared by page and image retrieval, 4-second connection/TLS/header timeouts, and 32 KiB response headers. Pages are at most 1 MiB; compressed responses are refused rather than risking decompression expansion.
- Images are at most 5 MiB, 4096 pixels per dimension, and 8 million pixels total. Only decoded JPEG, PNG, GIF, or WebP is accepted; SVG/HTML and corrupt images are rejected. Image failure retains successfully fetched text. Uploaded assets still have Ticket 04's separate 10 MiB limit.
- The one authorized owner may request 6 previews per minute with at most 2 active requests. Limits are process-local, suitable for the existing single backend machine; multiple instances would need shared admission limits. Restarting resets the window. Unauthorized callers never reach the network.

## Deployment (owner approval required)

1. Follow the backup/rehearsal and shared-consumer safeguards in [Ticket 04](ticket-04-rollout.md). No production deployment is part of this change.
2. With Go 1.27 or newer, build the custom executable from `pocketbase/server` (`go build -o /absolute/path/to/pocketbase .`). The pinned Go module records the PocketBase version. Run its Go tests, then the repository's PocketBase HTTP tests using this executable.
3. In the backend deployment repository, replace the stock PocketBase executable build with this Go build. Preserve all unrelated hooks and historical migrations; include this repo's additive migration after tickets 02–04 and retain `likes_assets.pb.js`. Merely copying the migration does **not** install the preview endpoint.
4. Rehearse against an isolated full backup, including both shared consumers. Use the same `serve`, `--dir`, `--hooksDir`, and `--migrationsDir` configuration as before. Preserve the existing Fly volume at `/pb/pb_data`; do not replace the database or create an empty volume.
5. Deploy backend before frontend. Keep outbound network restrictions as defense in depth, and never proxy-cache authenticated preview responses or protected files. The preview endpoint sends `Cache-Control: no-store`. Review memory headroom for bounded concurrent fetches and monitor the existing 1 GB asset volume.
6. With owner approval, verify manual saving, a supported public preview, failed image retrieval, draft protection, publication transitions, and preview replacement/deletion. Roll back using stopped writes plus a matching reviewed backup/code pair; do not drop provenance or asset fields destructively.

## Verification

```sh
cd pocketbase/server
go test ./...
go build -o /tmp/likes-pocketbase .
cd ../..
POCKETBASE_BINARY=/tmp/likes-pocketbase pnpm test
pnpm check
pnpm build
# Include real browser tests by setting PLAYWRIGHT_CHROMIUM_EXECUTABLE.
```

Fixtures are controlled and never fetch production URLs. The Go suite exercises the network boundary, metadata extraction, image handling, and owner endpoint. JavaScript tests exercise preview requests, manual overrides, editor races, and multipart provenance. The real PocketBase HTTP suite verifies durable preview bytes/provenance across restart, anonymous denial for drafts, publication, and original/thumbnail cleanup through backup manifests. See Ticket 04 for cleanup fault recovery; fetching does not introduce a separate storage lifecycle.
