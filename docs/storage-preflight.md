# Storage migration preflight

Tracks [#11](https://github.com/GVPproj/gvp.fyi/issues/11), part of [#3](https://github.com/GVPproj/gvp.fyi/issues/3).
This is inventory evidence, **not migration, backup, provisioning or rollout approval**.
The [owner-approved decisions](publishing-decisions.md) remain authoritative.

## Read-only inspection

`pocketbase/server/cmd/storage-preflight` is a standalone SQLite reader, not a
PocketBase server. It must not bootstrap PocketBase, run migrations/hooks, obtain
an administrative token, or export raw settings/content. It reports collection
metadata, rule classifications, authentication MFA configuration, storage settings
booleans and aggregate file reconciliation. It deliberately excludes credentials,
record IDs, filenames, raw rules and content.

Build and test from `pocketbase/server`:

```sh
go test ./cmd/storage-preflight
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath \
  -o /tmp/gvp-storage-preflight ./cmd/storage-preflight
```

Run against the **existing** data directory using `--data-dir`; see the
[tool's safety and output contract](../pocketbase/server/cmd/storage-preflight/README.md).
When inspecting Fly, copy only this tested executable to a unique temporary path,
verify its checksum, run as an unprivileged user with no write access to the data
directory/database/sidecars, and remove that executable afterwards. Never replace `/pb/pocketbase`,
install migrations, change storage settings, or download databases/settings into
the repository. Waking the existing auto-stopped machine is not deployment.

SQLite metadata is read in a read-only transaction, with `readonly_shm=1` to
prevent SQLite's usual WAL shared-memory writes and memory-only query scratch
space. `mode=ro` alone does not guarantee read-only sidecars. Database paths must
remain stable during inspection; no `immutable=1` shortcut is used on live data.
Filesystem reads are not an atomic snapshot of concurrent uploads/deletions. Repeat under coordinated stopped
writes for migration verification. A digest of referenced originals is a
comparison aid, not a restorable file manifest or independent recovery copy.
Unreferenced files are **not deletion candidates** without investigation and a
backup. Unprotected file fields on unrelated collections must not be silently
changed to protected fields: preserve their consumers and existing URLs.

## Fresh infrastructure checks — 2026-10-13

- Existing machine `4d89070a404018`, `sjc`, encrypted 1 GB volume
  `vol_re89nlggd6xqq15r` mounted at `/pb/pb_data`. Configuration still says primary
  region `sea`; actual placement is `sjc`. About 935,864 KiB available on the volume
  at inspection. No region decision is inferred from CLI configuration.
- `/pb/pocketbase --version`: **0.40.4**. Fly image
  `deployment-01M43GVMR9EPGYGJMYQFRY294S`, digest
  `sha256:dd5889095ed8d52f1a70c55aa412c8885aa20ecc7cabdccdc1707e08f822bb1b`;
  image metadata identifies backend commit `fc81cb32e5297a6731ad1613fd19dbf7e43aa4ae`.
- All three deployed hook files and all eight deployed migration files match
  SHA-256 checksums in the clean sibling backend checkout at that commit.
  Migration file presence is not proof of applied schema or working endpoints.
- Deployed Likes validation covers image/PDF upload validation and quote/note
  requirements. The unrelated `markdownPosts` Netlify hook remains present;
  `NETLIFY_BUILD_HOOK` is unset. No production writes were made to exercise hooks.
- Anonymous GETs to `/api/collections` and `/api/settings` returned **401**;
  `_superusers` and `likes_owners` record listing returned **403**. These checks do
  not establish authenticated authorization, MFA challenge behavior, or draft-file
  isolation.
- The historical local pre-upgrade recovery archive still exists outside Git:
  `/home/gvp/.local/share/gvp-pocketbase-restore/preupgrade-pb-data.tar.gz`,
  659,390 bytes, SHA-256
  `749980d97adaf360f03787ee45543927d55b9071f8ca666f3598af351d11ac50`.
  Its hash matches the historical record. It predates current uploads and is
  **not a current recovery set**; no fresh restore rehearsal was performed.

## Schema and security findings — 2026-10-13

The inspector ran successfully as `nobody` (UID/GID 65534). The data directory was
root-owned mode 0755; database/WAL/shared-memory files were root-owned mode 0644.
The temporary executable was checksum-verified and removed after inspection.
No database copies, settings exports, credentials, file names or content were
printed or downloaded. No application/configuration changes were made.

Both application-file S3 and backup S3 settings are **disabled**. Settings were
parseable without decryption; no settings values beyond the allowlist were output.
No release-publishing collections are deployed, consistent with #7 being local.

| Application collection | Records | File fields | Rule classification |
| --- | ---: | --- | --- |
| `Connections_Test` | 1 | none | all locked |
| `users` | 1 | `avatar`, unprotected, single | public create; conditional read/update/delete |
| `likes_items` | 3 | `asset`, **protected**, single | conditional read/write |
| `likes_owners` | 1 | none | record CRUD locked |
| `likes_collections` | 2 | none | public read; conditional write |
| `markdownPosts` | 3 | none | public read; writes locked |
| `bioLinks` | 9 | none | public read; conditional write |

Five additional internal collections were inspected, including `_superusers`
(one record). No view collections are deployed. The only referenced uploads are
in `likes_items` (`pbc_2903729855`); `users.avatar` has no referenced files.
Public `users` creation is existing shared-backend behavior, not authorization to
change it or to assume it is safe for every consumer. Exact conditional rules and
authenticated behavior still need verification.

**Superuser MFA is disabled**, as is MFA on `likes_owners` and `users`. The former
is a security prerequisite to resolve before rollout: arrange owner-authorized
configuration and an actual successful/rejected challenge plus recovery test,
without risking owner lockout or changing shared-user authentication silently.
No MFA/email/password settings were changed by inspection. Owner involvement is
isolated in [#18](https://github.com/GVPproj/gvp.fyi/issues/18), a native blocker of
#14's production rollout; it does not block further read-only/local work.

## Referenced-file reconciliation

Two consecutive runs of the final inspector agreed:

| Local storage category | Files | Bytes |
| --- | ---: | ---: |
| Referenced Likes originals | 3 | 2,257,424 |
| Associated thumbnails | 3 | 39,474 |
| Original/thumbnail `.attrs` metadata sidecars | 6 | 1,269 |
| Unreferenced / unattributed files | 0 | 0 |
| **Total** | **12** | **2,298,167** |

All three referenced originals exist locally. There are no uploads in other
collection roots. The earlier checkpoint's 12 files were not 12 uploads: half
are PocketBase file metadata. Preserve this metadata during backup/rehearsal;
do not treat `.attrs` as orphan files or as independent public uploads. Association
by path does not verify metadata integrity or thumbnail content.

Likes original-inventory SHA-256 (tool's documented framed digest):
`432d8feed7cb55fdcf79a2d28f2c920b8c2df048da3960bb37e943d596dd5533`.
Final Linux/amd64 inspector SHA-256:
`60e50eb29321076b80ac4d857f927860ff35579e013ad7e67b4500444b1b19c7`.

One earlier run of the final executable failed closed with `inspection_failed`;
no partial report was accepted. The same executable then passed twice without
changing data or loosening read-only safeguards. The transient failure's cause
was not established. Repeat under coordinated writes for authoritative migration
evidence; do not interpret successful live scans as an atomic backup.

## Verification

- `go test -race ./...` and `go vet ./...` pass.
- Tests cover sanitized output, unknown/encrypted settings, unsupported schema,
  unsafe paths/symlinks, missing originals, multi-file fields, file-bearing views,
  and read-only WAL behavior in a separate process.
- Linux/amd64 executable built for Fly; production inspection uses that executable
  without replacing the running PocketBase server.
- This is a live read-only inventory, not a coordinated migration manifest,
  authorization audit, complete backup, or restore rehearsal.

## Region, cost and credential checkpoint — 2026-10-13

**Selected implementation region: `us-west-1` (Northern California)** for private
originals, exercising #5's approved region-selection scope against the recorded
Fly `sjc` placement. This is geographic suitability, not measured latency; no
bucket was created. The Oregon CLI setting is unchanged and is not the storage
choice. Recheck placement/prices before provisioning if circumstances change.

[Regional pricing research](research/s3-region-costs.md) records official catalog
versions, reproducible extraction and explicit assumptions. Extraction was rerun
successfully during review. Northern California Standard costs $0.026/GiB-month,
$0.0055/1,000 write/list requests, $0.00044/1,000 reads and $0.09/GiB for the first
paid internet-egress tier. No free-tier allowance is assumed. At the recorded
2,298,167-byte payload, 1,000 writes/list + 10,000 reads + 30 full download
equivalents monthly model **$0.015735/month**, excluding recovery/hosting/tax.
At 1 GiB the same model is **$2.7359/month**; traffic assumptions are not observed
usage or a forecast. Private S3 source fetches are not per-visitor Netlify delivery.

Three complete recovery sets with an assumed 1-GiB object payload plus 10 MiB
other recovery material per set model **$0.179641/month** for storage, $0.01 request
allowance and one full-set internet export. This is **not an all-in backup quote**:
actual set/artifact size, extra source/read-back exports, fourth-set overlap,
rollback holdings, runner and failure/absence monitor costs remain unverified.
No backup approach has been adopted or shown to meet the under-$1 total yet.

[Pinned runtime/recovery research](research/pocketbase-s3-runtime-recovery.md)
establishes that PocketBase's internal S3 client requires an explicit key/secret,
without standard SSO/STS session-token support. The source-derived runtime policy
is bucket `ListBucket` plus object `GetObject`, `PutObject`, `DeleteObject` and
`AbortMultipartUpload`, with no recovery-bucket access. There is no configurable
common prefix; preserve native collection/record paths. Multipart starts at 6 MiB.
The source does not inspect 200-response completion errors; read-back hashing and
large-upload/error-path rehearsal remain required, not a diagnosed live failure.

Native backup ZIPs omit S3 files, and native cron neither verifies complete recovery
sets nor detects missed runs while Fly is stopped. The proposed external full-set
job, separate recovery bucket/identity and independent missed-success monitor are
**unimplemented candidates**. The safe shared-backend write-freeze/export mechanism,
runner, destination/custody, notification delivery and restore rehearsal are still
gates; do not assume stopping a Machine then SSH-copying from it works.

Owner-only access is isolated in [billing setup #19](https://github.com/GVPproj/gvp.fyi/issues/19)
and [runtime IAM setup #20](https://github.com/GVPproj/gvp.fyi/issues/20), native
blockers of #11's affected provisioning steps, not further local/read-only work.
Neither capability is granted by #16's existing SSO policy. No AWS authenticated
calls, resources, permissions, credentials or production settings were changed in
this research slice. `go test -race ./...` (cached results) and `go vet ./...` passed
again from `pocketbase/server`; no new frontend/full Node suite was run.

## Remaining gates

- Verify actual request/transfer expectations and complete backup cost against the
  selected region. Configure the approved $5/month incremental AWS alert and
  verify accounting scope/delivery via #19; free Budgets notifications are not a cap.
- Establish separate originals-bucket-scoped runtime credentials via #20; do not
  use human SSO, root, the existing SES identity, or site-build superuser credentials.
- Establish independent complete database AND object-file recovery, monthly
  scheduling, failure notifications and three-successful-set retention. Preserve
  migration rollback sets separately and rehearse restoration before cutover.
- Verify owner authentication/MFA, exact rules, draft-file isolation and shared
  consumers. Rule classifications and anonymous rejection alone are insufficient.
- Rehearse explicit file copying/checksums, replacements/deletions, old URL
  preservation and static optimized media with PocketBase unavailable.
- Obtain provisioning approval and the separate #14 production rollout approval.
  MP3 delivery remains unchanged.
