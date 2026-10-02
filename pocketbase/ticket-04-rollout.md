# Ticket 04 backend: images and PDFs (not deployed)

## HTTP contract

PocketBase **0.40.4**; migration `1781827200_item_assets.js` and runtime hook `pb_hooks/likes_assets.pb.js` must ship together.

- `likes_items.asset`: one protected file, returned as a filename **string** (empty string when absent), maximum **10 MiB = 10,485,760 bytes** inclusive.
- Supported contents/extensions: JPEG `.jpg`/`.jpeg`, PNG `.png`, GIF `.gif`, WebP `.webp`, PDF `.pdf`. Filename extension and PocketBase-sniffed MIME must agree; request Content-Type is not trusted. Uppercase input extensions are accepted and stored lowercase. Use `asset.endsWith('.pdf')`; no separate type field.
- Sniffing is format identification, not malware scanning or full document decoding. SVG, HTML, unsupported/missing extensions and mismatched formats are rejected. Corrupt images may fall back to the original instead of producing a thumbnail.
- `url` is optional with an asset. Every item must have a destination URL or asset, including superuser writes and updates/removals. Nonempty URLs retain the existing HTTP(S) pattern and length validation. Title remains required; description and commentary hold attribution/descriptive text as before.
- POST/PATCH the record with native multipart FormData, including `asset` and metadata in the **same request**. Do not set the multipart Content-Type header manually. More than one multipart asset is rejected. Existing filenames may only be retained on their own record; copying a filename to another record is rejected. Identical uploads on different records are independent files.
- Omit `asset` to retain it; upload to replace it; send `asset: ''` to remove it (provide/retain a URL). DELETE the record for permanent deletion. Errors have PocketBase's normal field-error shape, including `data.asset` or `data.url` with actionable messages.
- Published originals and configured `400x400` thumbnails are anonymously accessible. The square thumbnail preset crops; use the original with CSS containment where retaining the full image's proportions is required.
- Draft originals **and thumbnails** use the record view rule: only the designated Likes owner (or administrative superuser) can access them. For browser image URLs, POST `/api/files/token` with owner authorization and append the returned short-lived file token as `?token=...`. Other users' file tokens do not grant access. Publication changes apply to existing file URLs, including previously generated thumbnails. Never put tokens into analytics/logs or persist them as item data.
- A public download cannot be recalled from a visitor's disk/browser cache. Do not add a CDN/service-worker cache that bypasses PocketBase's authorization checks after an item becomes a draft.

## Deployment checklist (owner approval required; no deployment performed)

1. Back up the complete mounted `pb_data` directory, including storage, and rehearse restoration. Preserve unrelated collections/hooks and the existing Fly volume.
2. Copy this migration after tickets 02/03 into the backend repository's migration directory. Copy `likes_assets.pb.js` into its runtime hooks directory **and include that directory in the image**. Do not replace existing backend hooks. Confirm startup uses these directories; migration alone does not enforce the cross-field/extension constraints.
3. Rehearse all migrations/hooks on an isolated backup with 0.40.4. Run the integration command below. Check unrelated backend consumers too.
4. Deploy backend before frontend using the existing Fly volume mounted at `/pb/pb_data`; retain local file storage (S3 disabled). PocketBase originals/thumbnails live below `/pb/pb_data/storage`, not in Git, the image, or frontend output. Monitor the existing 1 GB volume; a per-file limit is not a total-storage quota.
5. With owner approval, verify a standalone draft image/PDF, anonymous denial, publish/draft transitions, replacement and deletion. Verify body-size/proxy limits permit 10 MiB plus multipart metadata. Do not cache protected downloads at a proxy.
6. Rollback is backup-and-matching-code restoration with writes stopped, not a destructive down migration. Keep the new hook while the asset schema is installed. Restoring an older backup loses later writes unless reconciled.

## Cleanup and abandoned operations

There is no pre-upload/staging endpoint: selecting a file or cancelling before Save creates no backend asset. An incomplete/disconnected multipart upload commits neither a record nor durable storage. If the client disconnects **after** a complete request commits, the saved item is real; refresh/check the board before retrying rather than blindly duplicating the upload.

PocketBase's native FileField pipeline validates writes, saves files with the record, cleans newly written files on failed upload/commit, and removes replaced/removed originals and their thumbnail directories after successful writes. Record deletion removes its storage directory. The hook never writes or deletes storage itself. Do not implement filename-based sharing or delete files belonging to another item.

Disk faults, permission errors or process termination during cleanup are not a distributed transaction guarantee. PocketBase logs cleanup failures; monitor those errors and free-space alerts. On an error: stop writes, take a full backup, repair storage permissions/capacity, then reconcile **all** file fields across collections against `pb_data/storage`. Preserve every referenced original and its thumbnails; quarantine only confirmed unreferenced record/file paths before reviewed deletion. Never run age-only cleanup or delete a whole shared storage root. Restarting is not a promised orphan sweeper. OS multipart temp files are transient rather than durable assets; a hard-kill may require normal OS temp-file cleanup after ensuring no upload is running.

## Verification

```sh
POCKETBASE_BINARY=/path/to/pocketbase-0.40.4 node --test tests/pocketbase.test.js
```

Requires Node's native fetch/FormData and `python3` (stdlib only) for reading the ZIP downloaded through the superuser backup HTTP API. The harness copies both migrations and hooks, starts temporary loopback servers, and removes their data on completion. No production calls or credentials are used.

Coverage includes standalone supported formats, size boundary/rejection, matching extensions/MIME, multi-file rejection, unchanged URL rules, superuser cross-field validation, other-user/file-token isolation, a same-ID account in an unrelated auth collection, actual generated thumbnails, publication transitions, restart persistence, cross-record reference rejection, failed/interrupted requests, replacement/removal/deletion. Backup ZIP storage manifests verify physical original/thumbnail cleanup and unchanged storage after rejected/interrupted uploads, rather than treating a file URL's 404 alone as proof of cleanup. Hard-kill/disk-failure recovery remains an operational procedure, not a simulated test claim.

Native behavior references (pinned): [FileField validation and cleanup](https://github.com/pocketbase/pocketbase/blob/v0.40.4/core/field_file.go), [filename normalization](https://github.com/pocketbase/pocketbase/blob/v0.40.4/tools/filesystem/file.go), [backup storage export](https://github.com/pocketbase/pocketbase/blob/v0.40.4/core/backup_create.go).
