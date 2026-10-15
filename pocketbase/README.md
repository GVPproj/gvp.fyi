# PocketBase backend

Custom **PocketBase 0.40.4** shared with other consumers. The whole-content
candidate is committed locally, **not deployed**; local tests do not establish
production availability.

- [Build and local setup](server/README.md)
- [Likes API](contracts.md), [release publishing API](publishing-contract.md),
  [editorial publishing API](server/editorial/README.md)
- [Dashboard authoring](../docs/dashboard-publishing.md) and
  [content imports](../docs/import-editorial.md)
- [Rollout and acceptance](../docs/content-cutover-readiness.md)
- [Backup operations](../infra/backups/README.md)

## Deployment safety

The production deployment lives in sibling `../pocketbase-fly-starter`.
**Pushing or merging to its `main` deploys production after tests.** Review the
exact candidate and workflow before any push; deployment requires owner approval.
Frontend `main` also deploys through Netlify. Deploy and verify the backend before
cutting over the frontend. Dashboard Save does not deploy the static site.

- Ship the custom executable, the full existing `pb_migrations` history and all
  runtime `pb_hooks`, including unrelated consumers' hooks. They are not embedded
  in the binary. Copying migrations/hooks alone cannot install Go routes; a stock
  binary cannot replace this server. Keep the current Likes asset hook: schema
  alone does not enforce its cross-field, text and extension validation.
- Preserve the existing `/pb/pb_data` volume, settings, placement and shared
  consumers. Originals remain in `/pb/pb_data/storage`; do not enable
  application-file S3 or replace the database/volume with an empty one.
- Inventory current schema, migration history, files, consumers and outbound
  effects. Take a fresh complete checkpoint and rehearse migration **and actual
  serve startup** on an isolated restored copy. Block/stub production email,
  OAuth callbacks, cron, webhooks and storage writes during rehearsal.
- Preserve existing content, IDs, timestamps, auth and unrelated rules. Never
  silently adopt colliding collections, replay applied migrations, run
  `history-sync` or replace the backend's migration history. Historical backend
  migrations are not a modern empty-database bootstrap.
- Recheck disk/restore headroom, proxy limits for 10 MiB uploads plus multipart
  overhead, and memory for concurrent previews. Retained publishing snapshots
  grow indefinitely; no pruning is implemented.
- Verify shared consumers, owner login, denied nonowner writes, draft/file
  isolation, publication/withdrawal and build access before frontend rollout.
  Production smoke writes need explicit approval. Never cache protected files or
  authenticated API results publicly.
- Preserve single-instance topology: preview admission limits are process-local.
  Keep `NETLIFY_BUILD_HOOK` unset; publishing uses manual Netlify deployment.

Superuser MFA #18 is closed. Do not treat it as unfinished work or change shared
authentication policy during deployment. Monthly complete-backup automation is
still incomplete; use the [backup runbook](../infra/backups/README.md), not local
component tests, to assess recurring recovery readiness.

## Backup and rollback safety

Keep databases, credentials, backups and encryption keys outside Git. A recovery
set needs **complete `pb_data`, including storage**, plus matching executable/image,
hooks, migrations and deployment configuration. Retain settings-encryption keys
separately. Stop PocketBase before manual directory copies/replacements; a running
SQLite directory copy is not a consistent checkpoint.

Built-in backup ZIPs include local uploads but exclude local backups and S3-uploaded
files. Schema exports and expiring volume snapshots are not complete recovery sets.
Verify SQLite integrity, record/file inventories and isolated restoration.

**Stop writes and restore matching data AND code/image/hooks together.** Reconcile
writes made after the checkpoint. Never point an older binary at an upgraded DB or
use destructive down migrations/field drops as rollback. Built-in restore restarts
the current executable; it does not downgrade it, and newer code can migrate restored
data again. The pinned restore implementation recommends at least **2× the restored
backup size** free, uses temporary old-data retention during bootstrap, and can fail
on subdirectory network-mount renames. That temporary directory is not a durable backup.

See upstream [backup/restore and settings encryption](https://pocketbase.io/docs/going-to-production/)
and the [pinned restore implementation](https://github.com/pocketbase/pocketbase/blob/v0.40.4/core/backup_restore.go).

## Storage reconciliation

There is no staging upload: selecting/cancelling before Save creates no asset.
Incomplete multipart requests commit neither records nor durable storage. A disconnect
**after commit** does not undo a save: refresh/check before retrying.

PocketBase's native FileField pipeline saves files with the record, cleans new files
on failed upload/commit, and removes replaced/removed originals and thumbnails after
successful writes. Record deletion removes its storage directory. The Likes hook
does not manipulate storage; never share filenames across records or delete another
item's files. Publishing snapshots own separate retained copies.

Disk faults, permissions and process termination can interrupt cleanup. On cleanup
errors: **stop writes, take a complete backup, repair capacity/permissions, then
reconcile every collection's file fields against `pb_data/storage`**. Preserve all
referenced originals and thumbnails. Quarantine only confirmed unreferenced paths
before reviewed deletion. Never use age-only cleanup or delete a shared storage root;
restart is not a promised orphan sweeper. OS multipart temporary files may need normal
OS cleanup after a hard kill, but first ensure no upload is running.

The [read-only storage inspector](server/cmd/storage-preflight/README.md) can help
inventory a local copy; it is neither a backup nor authorization to delete files.
