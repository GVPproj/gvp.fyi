# Likes backend operations

PocketBase is pinned to **0.40.4**. See [API contracts](contracts.md) and the
[custom server build, preview API and security policy](server/README.md).

Pending deployment is tracked in [issue #1](https://github.com/GVPproj/gvp.fyi/issues/1).
Local implementation and tests do not establish live availability. Recheck production
before deployment; the historical baseline below is not a current audit.

## Deployment coordination

Deploy the backend before the corresponding frontend, with separate owner approval.
Preserve the shared backend's full migration history and unrelated hooks. Ship these
additions in order after `1781568000_create_likes.js`:

| Capability | Required deployment artifacts |
| --- | --- |
| Commentary (02) | `pb_migrations/1781654400_item_commentary.js` |
| Named collections (03) | `pb_migrations/1781740800_named_collections.js` |
| Protected images/PDFs (04) | `pb_migrations/1781827200_item_assets.js` **and** runtime `pb_hooks/likes_assets.pb.js` |
| URL previews (05) | `pb_migrations/1781913600_preview_provenance.js`, asset hook, **custom Go executable** |
| Quotes/notes (06) | `pb_migrations/1782000000_text_items.js` **and updated** `pb_hooks/likes_assets.pb.js`; retain custom executable |
| Repeated URL lookup (07) | **Newly built custom executable** registering `/api/likes/duplicates`; no new migration/index |

Use the latest coordinated hook for the complete rollout. Schema alone does not
enforce asset extension/cross-field or conditional text requirements. Keep the
asset hook while its schema is installed; old hooks cannot support new text records.
Copying migrations/hooks alone cannot install Go routes; older/stock binaries return
404. Hooks and migrations are not embedded in the custom executable.

1. Inventory current consumers, schema/rules/indexes, applied migrations, hooks,
   external services and storage. Obtain a fresh complete backup and retain matching
   image/code/configuration; rehearse restore and migration on an isolated copy.
   Disable/stub outbound email, OAuth callbacks, cron, webhooks and production S3
   writes during rehearsal. Use loopback or otherwise non-public isolated services.
2. Build/test as in [server/README.md](server/README.md). Include the full existing
   runtime hook/migration directories in the image. Test actual `serve` startup,
   not just `migrate up`, and both shared consumers. Pending migrations run on startup
   or via `migrate up` with the configured paths.
3. Use the existing backend deployment process and mounted `/pb/pb_data` volume;
   never replace it with an empty database/volume. Preserve settings and placement.
   Keep local storage unless a separate storage migration is reviewed; originals
   and thumbnails live in `/pb/pb_data/storage`, not Git, the image or frontend output.
   Check current capacity on the historically 1 GB volume, proxy limits for 10 MiB
   plus multipart metadata, and memory headroom for concurrent previews.
4. Before frontend rollout, verify existing content/timestamps and other consumers,
   owner login and rejected nonowner writes, public/draft isolation, named memberships,
   standalone assets and cleanup, text validation, manual saves/previews, and owner-only
   duplicate lookup (including drafts). Production smoke writes require explicit
   owner approval. Never proxy-cache protected files or authenticated endpoint results.
5. Monitor startup, storage cleanup errors and free space. Preview admission limits
   are process-local: retain the single-instance topology unless shared limiting is
   introduced as part of a separately reviewed scaling change.

Migrations must not silently adopt colliding collections or rewrite existing items.
The named-collection migration refuses an existing `likes_collections`; existing
items acquire empty memberships. Automatic destructive down migrations are not a
rollback plan (named-collection and text migrations intentionally refuse them).

## Backup and rollback safety

Normal predeployment backup safety is required. Repeatable backup automation
(Ticket 09) was declined; it is **not** a pending implementation task.

- Keep content, credentials, databases, backups and encryption keys outside Git.
  Back up **complete `pb_data` including storage**, plus separately retain the matching
  executable/image, hooks, migrations and deployment configuration. Stop PocketBase
  before manual directory copies/replacements for transactional consistency.
- Built-in backup ZIPs include local uploads but exclude local backups and S3-uploaded
  files; snapshot external object storage separately if enabled. A schema export is
  not a data backup. Retain any settings-encryption key securely or restore may be
  impossible. Verify SQLite integrity, content/file inventories and restoration.
- **Stop writes and restore matching data AND code/image/hooks together.** Never point
  0.22.22 at an upgraded database. Restore loses subsequent writes unless reconciled.
  Built-in restore restarts the current executable; it does not downgrade binaries,
  and a newer binary will migrate old data again. Do not use destructive field drops
  or `migrate down` as a substitute for a reviewed paired restore.
- The pinned restore implementation is experimental/UNIX-oriented, recommends free
  space of **at least 2× the restored backup size**, and temporarily keeps old data
  until bootstrap succeeds. Subdirectory network mounts can break renames. That
  temporary directory is not a durable rollback backup.

References: [backup/restore](https://pocketbase.io/docs/going-to-production/#backup-and-restore),
[settings encryption](https://pocketbase.io/docs/going-to-production/#settings-encryption),
[pinned restore implementation](https://github.com/pocketbase/pocketbase/blob/v0.40.4/core/backup_restore.go).

### Storage reconciliation

There is no staging upload: selecting/cancelling before Save creates no asset.
Incomplete/disconnected multipart requests commit neither records nor durable storage.
A disconnect **after** a complete request commits does not undo the save: refresh/check
before retrying to avoid duplicate items.

PocketBase's native FileField pipeline validates writes, saves files with the record,
cleans newly written files on failed upload/commit, and removes replaced/removed
originals and thumbnails after successful writes. Record deletion removes its storage
directory. The hook never writes/deletes storage; never share files by filename across
records or delete another item's files.

Disk faults, permissions or process termination can interrupt cleanup; this is not a
distributed transaction guarantee. On cleanup errors: **stop writes, take a full backup,
repair permissions/capacity, then reconcile all file fields across all collections
against `pb_data/storage`**. Preserve every referenced original and its thumbnails.
Quarantine only confirmed unreferenced record/file paths before reviewed deletion.
Never use age-only cleanup or delete a shared storage root. Restart is not a promised
orphan sweeper. After a hard kill, OS multipart temp files may need normal OS cleanup,
but only after ensuring no upload is running.

Pinned references: [FileField validation/cleanup](https://github.com/pocketbase/pocketbase/blob/v0.40.4/core/field_file.go),
[filename normalization](https://github.com/pocketbase/pocketbase/blob/v0.40.4/tools/filesystem/file.go),
[backup storage export](https://github.com/pocketbase/pocketbase/blob/v0.40.4/core/backup_create.go).

## Local verification

```sh
cd pocketbase/server
go test -race ./...
go build -trimpath -o /tmp/pocketbase-likes .
cd ../..
POCKETBASE_BINARY=/tmp/pocketbase-likes pnpm test
pnpm check
pnpm build
```

For the HTTP suite alone:
`POCKETBASE_BINARY=/tmp/pocketbase-likes node --test tests/pocketbase.test.js`.
Without `POCKETBASE_BINARY`, integration tests skip; they require version 0.40.4,
Node native fetch/FormData and `python3` (stdlib ZIP inspection). Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` for real browser tests. Tests use disposable loopback
databases/random credentials and controlled network fixtures, not production writes
or credentials. Backup manifests check physical original/thumbnail cleanup; URL 404s
alone are not proof. Hard-kill/disk-fault recovery remains an operational procedure,
not a simulated-test claim.

## Owner and shared-backend safeguards

Only ordinary `likes_owners` record **`likesowner00001`** may perform application
mutations. Public owner signup/management is locked. Provision administratively with
private email and a password of at least 12 characters; sign into the website with
this ordinary record, **not `_superusers`**. Never expose passwords/admin tokens to
agents, Git or public frontend code. Administrative record operations remain subject
to runtime content validation; custom preview/duplicate routes reject superusers.

The former Netlify rebuild capability for `../grahamvanpelt.dev` was revoked after
its three posts were exported to local Markdown. Historical verification found
`NETLIFY_BUILD_HOOK` unset; no replacement is needed. Keep old PocketBase data.
The optional repaired hook uses collection-filtered post-commit success events,
`$http.send`, a five-second timeout and safe error handling; test it only with mocks.
The recorded backend workflow gates deploys on tests and updates existing Machines
without adding replicas/volumes; verify current configuration before using it.

### Legacy upgrade cautions

The 0.22 → 0.23 boundary converts admins to `_superusers` and changes schema, auth,
HTTP and JSVM APIs. System migration does not port custom code. Use the
[JSVM upgrade guide](https://pocketbase.io/v023upgrade/jsvm/) and
[migration docs](https://pocketbase.io/docs/js-migrations/): use transaction-scoped
`app` in migrations, `e.app` in hooks, continue handlers with `e.next()`, and use
post-commit success events for external side effects. Do not blindly delete history,
run `history-sync`, replay applied migrations or overwrite backend migration history.
Historical backend migrations are **not a modern empty-database bootstrap**; design
and verify a reviewed baseline separately if one is needed.

A direct 0.22.22 → 0.40.4 upgrade was rehearsed historically; a 0.23.12 checkpoint
can isolate conversion problems but is not a required binary hop. Future upgrades
need fresh compatibility checks, not the old research's “latest” claims. Review
release changes affecting rules/hook ordering, auth/token invalidation, relation
list/search access, file append/replace semantics, S3/OAuth, IDs, JSON limits,
index normalization and CLI exit behavior. Do not loosen sensitive rules merely to
restore a query. Pin/checksum release artifacts; do not run unpinned production updates
or use upstream self-update to replace the custom executable.

Server and SDK versions are independent. Legacy server 0.22.x requires JS SDK
<0.22.0 (0.21.5 compatible) or Dart <0.19.0; JS SDK 0.22+ requires server 0.23+.
Coordinate all consumers. Modern SDK code uses `collection('_superusers')`,
`authStore.record` and `isSuperuser`, not old admin APIs. Likes uses direct `fetch`
and still needs HTTP/error/auth regression checks.

## Historical baseline and recovery pointers — not current verified state

The following records the **2026-10-02** baseline, not a fresh production audit and
not evidence that changes 02–07 are live:

- PocketBase 0.40.4, initial `likes_owners`/`likes_items`, and owner sign-in/save plus
  anonymous publication were recorded as verified. Existing collection rules were
  preserved. Nine biolink records matched backup; public `markdownPosts` (3), `posts`
  (2) and `tests` (6) remained readable. Ordinary-user and Likes-owner password auth
  were enabled. Biolink browser login/edit was not separately human-verified.
- Backend source: `GVPproj/pocketbase-fly-starter` commit `90c0be3`;
  [CI/deployment evidence](https://github.com/GVPproj/pocketbase-fly-starter/actions/runs/37066523001).
  Image: `registry.fly.io/pocketbase-fly-starter:deployment-01M3Z80RB27FBFE4FWCGRG0FFB`.
- Preserved machine `4d89070a404018`, `sjc`, shared CPU/512 MB; encrypted 1 GB volume
  `vol_re89nlggd6xqq15r` at `/pb/pb_data`. Config primary region was `sea`; placement
  was unchanged. Restored settings had S3/SMTP disabled; supplied ZIP had no uploads.
- Biolink at `https://links.grahamvanpelt.com`: SDK 0.28.1, commit `636cf6f`, Netlify
  deploy `6ac0214bf8c65100089ba37c`. Likes at `https://gvp.fyi/likes/`: commit `fea55cf`,
  deploy `6ac0223deca7930008a13ed5`, `PUBLIC_POCKETBASE_URL` configured.
- The owner ZIP was restored with 0.22.22. Independent full copies upgraded directly
  to 0.40.4 with SQLite integrity and existing data/password hashes/IDs/rules/field
  identities/relations preserved; admins became `_superusers`. Existing public API
  responses/order matched. Full backend startup skipped historical applied migrations.
- With the original machine stopped, snapshot `vs_eYLpy1NyA3jkCXVon840pJLV` was made
  (five-day retention, **not a permanent backup**). A temporary restored volume yielded
  `/home/gvp/.local/share/gvp-pocketbase-restore/preupgrade-pb-data.tar.gz` outside Git.
  SHA256: `749980d97adaf360f03787ee45543927d55b9071f8ca666f3598af351d11ac50`.
  SQLite integrity and all six original application tables matched the earlier owner
  backup. An isolated amd64 Fly rehearsal passed; temporary machine/volume were removed.
  Verify the private archive's present availability/integrity; do not assume snapshot
  retention or these historical checks establish recoverability today.
- Matching **pre-upgrade** image:
  `registry.fly.io/pocketbase-fly-starter:deployment-01JE9RPHWGZVH0YFSAXCYHET7D`, digest
  `sha256:fc84f7db129baf4e343cfe415077754fc935e51be306dcd13d8fdab1531ad1c9`.
  Original machine/config metadata was saved beside the private backup. This old pair
  is a recovery reference, not a safe rollback target without reconciling later writes.
