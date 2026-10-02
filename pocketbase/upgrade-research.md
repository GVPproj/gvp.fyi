# PocketBase upgrade research

Verified **2026-10-02 UTC** against official GitHub releases, tagged source, and PocketBase docs. Research only: no production requests, deployments, migrations, or secret access; no upgrade executed.

## Verified target

- **Latest stable/non-prerelease: v0.40.4**, published **2026-09-12 14:35:16 UTC**. GitHub `/releases/latest` returned `tag_name: v0.40.4`, `prerelease: false`. It fixes a migration/log-write deadlock. “Stable” here means a non-prerelease, not a 1.0 compatibility guarantee. [Release](https://github.com/pocketbase/pocketbase/releases/tag/v0.40.4), [verification API](https://api.github.com/repos/pocketbase/pocketbase/releases/latest).
- Latest observed legacy maintenance release: **v0.22.55**; latest JS SDK: **v0.28.1**. Server and SDK version numbers do **not** track together. [Legacy release](https://github.com/pocketbase/pocketbase/releases/tag/v0.22.55), [SDK release](https://github.com/pocketbase/js-sdk/releases/tag/v0.28.1).

## Path from 0.22.22 and intermediate migrations

**Recommended rehearsal: 0.22.22 → 0.23.12 → 0.40.4**, with independently restorable checkpoints. The 0.23 stop isolates the large API/schema conversion; it is a diagnostic recommendation, **not a mandatory binary hop**. The official guide requires starting from 0.22.x, which 0.22.22 already satisfies. Updating first to 0.22.55 is optional, not a documented prerequisite. [Official upgrade guide](https://pocketbase.io/v023upgrade/jsvm/), [0.23.12](https://github.com/pocketbase/pocketbase/releases/tag/v0.23.12).

The v0.40.4 source still includes the four `1717233556`–`1717233559` v0.23 conversion migrations plus subsequent system migrations. Thus there is no identified requirement to run every intermediate minor binary; a direct jump is a staging-test candidate, **not verified for this application's data/code**. System conversion does not port custom JS. [Tagged migration directory](https://github.com/pocketbase/pocketbase/tree/v0.40.4/migrations).

Important gates to cover even when skipping binaries:

| Boundary | Migration/compatibility checks |
| --- | --- |
| [0.23](https://github.com/pocketbase/pocketbase/releases/tag/v0.23.0) | Existing data upgrades automatically on startup. Admins become `_superusers`; collections/fields/settings/auth structures change. Manually port hooks, custom migrations and clients. `/api/admins/*` disappears; remove trailing slashes from manually constructed API URLs; top-level error `code` becomes `status`; multi-file uploads replace instead of append unless using `field+`/`+field`. |
| [0.24](https://github.com/pocketbase/pocketbase/releases/tag/v0.24.0) | Create-rule “dry submit” removed: review self-references, counters and empty-collection multi-match conditions. Programmatic/superuser email changes invalidate record tokens. |
| [0.25](https://github.com/pocketbase/pocketbase/releases/tag/v0.25.0), [0.26](https://github.com/pocketbase/pocketbase/releases/tag/v0.26.0) | Google OAuth metadata/parameters change; S3 implementation replaced in 0.26 (test actual provider); OAuth-created email precedence changes. |
| [0.27](https://github.com/pocketbase/pocketbase/releases/tag/v0.27.0), [0.28](https://github.com/pocketbase/pocketbase/releases/tag/v0.28.0) | All CRUD rules checked before corresponding request hooks; check code relying on the old create/manage order. Default JSON-field max becomes 1 MB; inspect configured limits. |
| [0.31](https://github.com/pocketbase/pocketbase/releases/tag/v0.31.0), [0.32](https://github.com/pocketbase/pocketbase/releases/tag/v0.32.0) | Client relation filter/sort now requires List/Search access through the relation chain, including junction collections. Test existing queries; do not broadly unlock sensitive collections to restore old behavior. |
| [0.33](https://github.com/pocketbase/pocketbase/releases/tag/v0.33.0) | Stricter record-ID character validation; inspect custom IDs/regexes. |
| [0.38.1](https://github.com/pocketbase/pocketbase/releases/tag/v0.38.1) | System migration resaves collections with indexes and normalizes indexes, including manually created ones. Compare schema/indexes and query performance. |
| [0.40](https://github.com/pocketbase/pocketbase/releases/tag/v0.40.0) | CLI errors now propagate nonzero exit status; review shell chaining. Go 1.27/JSON v2 changes warrant payload regression tests (Go minimum matters if building from source). Use 0.40.4 for its migration deadlock fix. |

## JS hooks and custom migrations

The [JSVM upgrade guide](https://pocketbase.io/v023upgrade/jsvm/) maps the old APIs:

- `Dao`/`$app.dao()` removed: use application methods such as `app.findRecordById()` and `app.save()`.
- `migrate((db) => ...)` becomes `migrate((app) => ...)`, receiving a **transactional app**; raw SQL uses `app.db().newQuery(...)`. Use that transaction-scoped app, not the global app.
- Collection `schema` becomes `fields`; field options and collection options are flattened/restructured. Port auth configuration explicitly; do not mechanically rename just `schema`.
- `onModelBeforeCreate` → `onRecordCreate`; `onModelAfterCreate` → `onRecordAfterCreateSuccess` (likewise update/delete). Request before/after hooks consolidate into `onRecordCreateRequest`, etc., with work before/after `e.next()`. Handlers must continue the chain with `e.next()` unless intentionally stopping it. Use `e.app` for event-scoped DB work.
- For a rebuild after a committed write, evaluate collection-filtered `onRecordAfterCreateSuccess` / `onRecordAfterUpdateSuccess` / `onRecordAfterDeleteSuccess`, rather than pre-save hooks. Success hooks account for transaction completion. Stub outbound rebuild calls during rehearsal; avoid introducing duplicate effects. [Current hook semantics](https://pocketbase.io/docs/js-event-hooks/).

**Local impact:** [`pb_migrations/1781568000_create_likes.js`](pb_migrations/1781568000_create_likes.js) uses `Dao`, `schema`, nested field/auth options and intentionally refuses rollback. It cannot be reused unchanged for fresh 0.23+ installs. Preserve its collision refusal, owner-only rules and URL/password validation when porting. Test both an already-applied database and an empty database.

The guide's delete/regenerate-snapshot shortcut is conditional on **all migrations being autogenerated**. This repository has custom logic: do not blindly delete history, run `history-sync`, replay an applied migration, or overwrite the deployment repository's migrations. Preserve applied filenames/history; deliberately port custom files or design a reviewed baseline. Unapplied user migrations run automatically on `serve` or `migrate up`. [Migration docs](https://pocketbase.io/docs/js-migrations/).

## SDK / HTTP clients

- While staying on server **0.22.x**, pin JS SDK **<0.22.0** (latest listed compatible patch **0.21.5**) and Dart SDK **<0.19.0**. JS SDK 0.22.0 requires server 0.23+. [Server compatibility notice](https://github.com/pocketbase/pocketbase/releases/tag/v0.23.0), [SDK changelog](https://github.com/pocketbase/js-sdk/blob/v0.28.1/CHANGELOG.md).
- For target 0.40.4, **JS SDK 0.28.1** is the current candidate: its changelog includes the 0.40 logs endpoint. Migrate `pb.admins.*` to `pb.collection('_superusers').*`, `authStore.model` to `authStore.record`, and admin checks to `isSuperuser`. Coordinate client/server rollout; do not upgrade old-server clients blindly. Inventory Dart/other consumers separately.
- This repo's `package.json` has no PocketBase SDK dependency; `src/lib/likes.js` uses direct `fetch`. It still needs HTTP/error/auth regression tests. Existing other consumers and their SDK versions have not been inventoried in this research. No superuser credential belongs in the public website.

## Backup, restore and rollback caveats

- Back up **the complete `pb_data`**, plus separately preserve the matching executable/image, hooks, migrations and deployment configuration. Manual directory copy/replace requires PocketBase to be **stopped** for transactional safety. A built-in ZIP includes local uploaded files, but excludes local backups and **S3-uploaded files**; snapshot external object storage separately. A schema export is not a data backup. [Official backup docs](https://pocketbase.io/docs/going-to-production/#backup-and-restore).
- Rehearse restoring the old backup with **0.22.22 first**, then migrate a disposable copy. Retain encryption keys securely outside Git if settings encryption is enabled; a backup without its key is insufficient. [Settings encryption](https://pocketbase.io/docs/going-to-production/#settings-encryption).
- Built-in restore replaces data and restarts the **current executable**; it is not a binary downgrade. Starting a new binary against old data triggers migrations again. Rollback means stopping service and restoring the pre-upgrade data **and matching old code/image**, not merely swapping binaries or running `migrate down`. Quiesce writes for cutover; restoring a checkpoint loses subsequent writes unless separately reconciled.
- Tagged restore code labels the API experimental/UNIX-oriented, recommends free disk space of **at least 2× the restored backup size**, and temporarily retains old data until successful bootstrap. Subdirectory network mounts can break rename operations. Do not treat the temporary old directory as a durable rollback backup. Check real disk headroom on the documented 1 GB volume. [v0.40.4 restore implementation](https://github.com/pocketbase/pocketbase/blob/v0.40.4/core/backup_restore.go).

## Practical execution plan — requires separate approval

1. Resolve the blockers below; inventory all consumers, current schema/rules, applied migrations, hooks/cron and external services. Pin official release artifacts and verify their published checksums; retain the old image. Do not use an unpinned `update` in production.
2. Obtain a fresh private backup and isolated storage; restore under 0.22.22, verify SQLite integrity, row counts/content fingerprints and file inventory. Disable/stub outbound email, OAuth callbacks, cron, webhooks and production S3 writes; bind only to loopback.
3. Port hooks/migrations/clients on a branch. Rehearse 0.23.12 conversion, checkpoint, then 0.40.4. Review migration/startup logs and compare data, rules, indexes and auth settings at each gate. Test a clean install too. Record exact commands/artifacts for repeatability.
4. Run the adapted Likes integration tests against the target and test **actual `serve` startup with all deployed hooks**, not only `migrate up`. Test owner/anonymous/other-user authorization, password login/refresh, existing consumers, relations, uploads, realtime and mocked rebuild behavior. Rehearse rollback.
5. Only with owner approval: maintenance/write freeze, fresh verified backup, one controlled deployment preserving the existing volume/region, paired binary/code/client rollout, smoke tests and monitored rollback window. No such step was performed here.

## Current blockers / limits

These are recorded in [`pocketbase/README.md`](README.md), not independently rechecked against production:

- Deployment hook fails with `onRecordCreate is not defined` on 0.22.22; `migrate up` can finish despite the error while `serve` panics. Newer registration support alone does not certify its body/semantics.
- Two deployment workflows independently deploy on pushes to the backend repository's `main`; consolidate/control them before any deployment push.
- Existing consumers are active, but full client/hook compatibility with 0.40.4 is untested. Current tests target 0.22.22 and exclude deployed hooks in the earlier backup check.
- Earlier local backup verification is useful but is **not** an upgrade/rollback rehearsal. Fly snapshot restoration, current disk headroom and external-file coverage remain unverified; the supplied backup had no uploaded files.
- This document does not authorize upgrading or applying the pending Likes schema. No binaries were run and no migration compatibility result is claimed.
