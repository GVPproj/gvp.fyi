# PocketBase 0.40.4: S3 runtime and independent recovery

Status: **read-only source research for [#11](https://github.com/GVPproj/gvp.fyi/issues/11), 2026-10-13**. No implementation, provisioning, migration, credential creation, infrastructure access or rollout approval. Only this research file was written. Existing working-tree changes were left alone. No secrets or production data were inspected.

## Findings and recommendation

- **Proved from pinned source:** PocketBase 0.40.4 uses its own internal S3 REST client, not an AWS SDK/default credential chain or the former Go Cloud driver. Standard configuration requires an access-key/secret pair; there is no session-token field or automatic role/SSO/OIDC/instance-credential discovery.
- **Source-derived runtime IAM minimum:** `s3:ListBucket` on the dedicated originals bucket; `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, and `s3:AbortMultipartUpload` on its object resources. Multipart uploads are real: the default boundary is **6 MiB, including exactly 6 MiB**. Neither multipart-list permission is required by this implementation.
- **Proved:** native backup ZIPs do not retrieve S3 uploads. Native cron retention counts ZIPs, not complete verified database-and-object recovery sets; its failure email cannot detect a process/scheduler that never ran.
- **Proposed, not implemented or verified:** one externally scheduled monthly job produces a full, independently stored, encrypted recovery set under a unique ID, verifies it, then retains the latest **three successful sets**. Keep backup credentials off PocketBase and give its runtime identity no recovery-destination access. Use an independent missing-success monitor, not just job failure email.
- Prefer full sets and a brief coordinated maintenance window over incrementals, version-history reconstruction, or continuous replication at this site's recorded size. The safe maintenance mechanism, runner, destination and notification recipient remain choices/gates—not existing capabilities.

## Scope and evidence quality

Read `AGENTS.md`, `docs/agents/domain.md`, `CONTEXT.md`, [publishing decisions](../publishing-decisions.md), [storage preflight](../storage-preflight.md), [`go.mod`](../../pocketbase/server/go.mod), and [backend operations](../../pocketbase/README.md), plus #11's body/comments. No ADR directory exists. Approved policy remains monthly recovery, three successful sets, failure notification, mandatory pre-change checkpoints, and backup cost **under $1/month within the $5/month incremental AWS alert**; ask before adopting an estimate of $1/month or more. Potential loss since the last checkpoint is accepted; no recovery-time guarantee is approved.

The preflight's S3-disabled state, three originals/2,257,424 bytes, total local storage 2,298,167 bytes, shared consumers, `sjc` placement and MFA finding are **prior recorded observations, not rechecked here**. #11's checkpoint says #16 closed for human provisioning access; the older publishing-decisions blocker table is stale on that point. Neither record grants IAM credential creation/billing privileges or provisioning approval. #18/#14 security and rollout gates remain outside this research.

### Exact implementation pin

The local Go cache contains `github.com/pocketbase/pocketbase@v0.40.4`. Its module metadata identifies commit **`5cec579da984436a258602a46a96302fbd31f77c`**. The repository's `go.sum` records module hash `h1:0SvSUreR3NhUMCs9LchE59oEG53efZ3cKiMGyAGBN9U=`. Sixteen inspected source files matched their cached module ZIP entries byte-for-byte; a public raw fetch of the commit-pinned uploader also matched. This is source provenance, not a production binary attestation or a new full module-authentication audit.

The actual transitive call chain is:

`core.NewFilesystem` → `filesystem.NewS3` → internal `s3blob` → internal `s3.S3` / `s3.Uploader` → Go `net/http`.

All S3 implementation code is in **the same PocketBase module/version**. There is no separately versioned AWS SDK or Go Cloud S3 dependency to configure. The driver explicitly says it is based on the *previously* used Go Cloud implementation; the lightweight client explains the AWS SDK omission. The uploader uses `golang.org/x/sync/errgroup` (pinned `v0.23.0`) for concurrency, not credential discovery. See [module requirements][mod], [filesystem construction][fs-new], [driver provenance][driver-new], [client][s3-client], [uploader][upload].

“Proved” below means established by this source or the identified primary documentation. It does **not** mean exercised against AWS, deployed settings, Fly, or a restored database. AWS/service documentation is current, unversioned documentation; PocketBase citations are immutable commit links with exact line ranges.

## 1. Credentials and storage layout

**Proved:** [`S3Config`][settings] has only enabled, bucket, region, endpoint, access key, secret and force-path-style fields. Enabled configuration requires the key and secret. Both application files and native backup ZIP storage instantiate this same client, with **separate settings fields** for the two filesystems [construction][base-fs].

The internal client has literal `AccessKey` and `SecretKey` fields and signs requests itself using SigV4 [client/signing][s3-client]. The standard constructor does not install a custom HTTP client or credential provider. There is no session-token configuration, STS exchange, token refresh, environment/shared-profile lookup, SSO, web-identity/OIDC or instance-metadata provider in this path. Merely setting `AWS_PROFILE`, `AWS_ACCESS_KEY_ID` or `AWS_SESSION_TOKEN` does not configure native PocketBase S3. AWS temporary credentials require the session token in the signed request ([AWS SigV4 temporary credentials][aws-signing]); a temporary access-key/secret pair alone is insufficient.

**Design implication:** the simplest stock-compatible AWS runtime identity is a dedicated non-console IAM user/access key with only the required data-plane policy. This is a proposal requiring authorized IAM creation, secure delivery, rotation and revocation ownership. Do not reuse root, human SSO, SES SMTP credentials or build credentials. Role-based temporary runtime credentials would need a separately reviewed integration/change; do not pretend the stock configuration supports them. An external backup runner can use a different tool with STS/OIDC support; PocketBase's limitation does not constrain that tool.

Keep runtime configuration server-side, never `PUBLIC_`, frontend output, Git or logs. Securely retain any settings-encryption key separately from its encrypted database. A database recovery archive can itself contain credentials/private content: treat the **whole set** as secret material, even when settings encryption is enabled.

**Proved layout:** switching `Settings.S3.Enabled` selects S3 instead of local `pb_data/storage`; it does not copy existing files [construction][base-fs]. There is no configurable common object-prefix field [settings][settings]. Record paths are collection storage path plus record ID [record paths][record-path]; originals/thumbnails share this namespace. This is a shared-backend storage setting, not a Likes-only or new-collection switch.

**Recommendation:** use the dedicated originals bucket already contemplated by #11, with no invented `originals/` prefix. Bucket-scoped access is simpler and less brittle than an allowlist of current collection IDs, especially with future releases/software and published-snapshot retained files. If a shared bucket/prefix policy is chosen instead, enumerate every actual generated collection/record/thumbnail key and list prefix—including cleanup paths—before granting it; a policy does not prepend a prefix. Do not restrict permissions to today's only populated Likes collection and silently break other consumers.

## 2. Actual calls and least privilege

### Pinned call-to-permission map

The permissions below assume ordinary general-purpose S3, current objects, no ACL/tagging requests and S3-managed encryption (SSE-S3). AWS's [API-to-policy-action table][aws-actions] supplies the IAM mappings; IAM action names are not always API names.

| PocketBase operation | Actual request / pinned evidence | Required runtime action and resource |
| --- | --- | --- |
| Attributes/existence | `HeadObject`; [driver attributes][driver-read], [HEAD implementation][head] | `s3:GetObject` on object ARN; there is no `s3:HeadObject` action |
| File/thumbnail source reads, range reads | `GetObject`, optional `Range`; [driver reader][driver-read], [GET implementation][get] | `s3:GetObject` on object ARN |
| List and prefix cleanup | paginated **ListObjectsV2**, not ListObjects v1; [driver paging][driver-list], [`list-type=2`][list] | `s3:ListBucket` on bucket ARN |
| Small uploads, including thumbnails | `PutObject`; [single upload][upload-single] | `s3:PutObject` on destination object ARN |
| Upload at least 6 MiB by default | `CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`; [threshold/dispatch][upload], [init/abort][upload-init], [complete][upload-complete], [parts][upload-parts] | `s3:PutObject` on destination object ARN for all three APIs |
| Failed multipart upload/completion cleanup | `AbortMultipartUpload`; abort retries with a background context if the supplied context was cancelled [abort][upload-init] | `s3:AbortMultipartUpload` on object ARN |
| Filesystem copy, when invoked | same-bucket `CopyObject` with `x-amz-copy-source`; [driver copy][driver-write], [implementation][copy] | source `s3:GetObject`, destination `s3:PutObject`; no `s3:CopyObject` action |
| Original/replacement/thumbnail cleanup | `DeleteObject` individually; prefix deletion lists then deletes keys [cleanup][fs-delete], [driver delete][driver-write], [DELETE implementation][delete] | `s3:DeleteObject` on object ARN, plus list permission for prefix cleanup |

The copy API is available through the filesystem abstraction; this does not claim every ordinary upload calls it. Multipart is not hypothetical even though current originals are small: the source uses a 6 × 1,048,576-byte part buffer and switches to multipart when the first buffer is full. Defaults are five upload workers, overridable by writer options [writer options][driver-write].

**No calls found/needed in this pinned standard path:** `ListBuckets`, `HeadBucket`, `GetBucketLocation`, bucket creation/deletion/configuration, ACL or object-tagging APIs, `ListParts`, `ListMultipartUploads`, object-version listing/read/deletion, STS or KMS APIs. In particular, **do not add** `s3:ListMultipartUploadParts` or `s3:ListBucketMultipartUploads` merely because multipart upload is used: part numbers/ETags are held in memory [parts][upload-parts]. Administrative diagnosis or another backup tool may need different permissions; that is not runtime evidence.

### Proposed runtime policy boundary (not applied)

For chosen bucket `B`:

- Bucket resource `arn:aws:s3:::B`: allow only `s3:ListBucket`.
- Object resource `arn:aws:s3:::B/*`: allow only `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:AbortMultipartUpload`.
- No recovery-bucket access, IAM/billing/configuration actions, account-wide S3 wildcard, version deletion or bucket deletion. Builds receive the separate published-snapshot API identity, not this key.

For a genuine restricted namespace, constrain object ARNs **and** list requests with `s3:prefix`; an object ARN restriction alone does not restrict bucket listing ([AWS prefix conditions][aws-prefix]). Prove missing-key behavior as well as successful reads: AWS documents HEAD as `GetObject`, and missing keys can return 403 rather than 404 without appropriate list permission ([HeadObject permissions][aws-head]). Do not turn every 403 into “missing.”

Provisioning-time protections, **not runtime permissions**: Block Public Access; bucket-owner-enforced ownership/ACLs disabled ([AWS ownership][aws-ownership]); HTTPS-only access; default SSE-S3. AWS documents automatic SSE-S3 encryption ([encryption][aws-encryption]). The PocketBase writer does not send an encryption or ACL header [writer][driver-write]; a bucket policy requiring an explicit `x-amz-server-side-encryption` header would reject these uploads despite default encryption. Likewise, do not require a signed payload hash: the client defaults to `UNSIGNED-PAYLOAD` [signer][s3-client]. These compatibility details do not justify disabling TLS or bucket privacy.

SSE-KMS would introduce separate key-policy and `kms:GenerateDataKey`/`kms:Decrypt` requirements, cost and restore-key dependencies ([AWS multipart permissions][aws-multipart]); it is not necessary for the simplest proposal. No KMS privileges are included in the minimum above.

A provisioning identity can configure an **abort-incomplete-multipart lifecycle rule** after an agreed interval ([AWS guidance][aws-multipart]); runtime needs no lifecycle-management access. The explicit abort path cannot clean up after process death. This rule is for incomplete upload parts, **not** expiration of successful recovery sets.

### Integrity caveat found in source

`SignAndSend` treats HTTP status ≥400 as failure. `multipartComplete` closes the response body without parsing it [signer][s3-client], [completion][upload-complete]. AWS explicitly permits an embedded error in a **200 OK** CompleteMultipartUpload response ([AWS API][aws-complete]). Thus this code path alone is not proof an uploaded object is complete. This is a source-derived risk, **not a reproduced production failure**. Verification must read back and hash objects/archives; neither a nil upload error nor ETag alone is sufficient. The driver's own [ETag conversion][etag] notes multipart ETags are not ordinary MD5 hashes. Record this for migration/large-upload testing rather than broadening IAM or silently patching the dependency in this task.

## 3. Native backup behavior and limits

| Proved behavior | Consequence |
| --- | --- |
| `CreateBackup` uses `VACUUM INTO` separately for `data.db` and `auxiliary.db`, omits their WAL/SHM copies, then copies remaining local files [backup algorithm][backup-create]. It observes local deletion/new-writer hooks to preserve file consistency, with a documented race trade-off. | A native ZIP is more appropriate than copying a live SQLite database file. It is not a database+S3 distributed snapshot or a stop-all-writes operation. |
| Local backups, temporary files, notify/autocert/lost+found entries are excluded by default. Local uploads are copied; S3 uploads are not fetched. File-tracker logic skips S3 [implementation][backup-create]. | A stale local `storage` directory could still enter a ZIP; its presence is not evidence of backing up the active S3 objects. External object capture remains mandatory. |
| ZIP staging happens under `pb_data` even when backup S3 is enabled; docs recommend free space at least 2× `pb_data`. Final ZIP is uploaded using a separately configured backup filesystem [creation][backup-create], [construction][base-fs]. | Remote ZIP storage does not eliminate local scratch capacity. It also does not copy application objects to that backup bucket. |
| Existing backup names can be overwritten [creation contract][backup-create]. | Use unique recovery-set IDs; never a single rolling `latest.zip`. |
| On `CreateBackup` error, cron logs and attempts email to all superusers; mail failure is logged [cron][backup-cron], [mail implementation][system-alert]. | SMTP/delivery is not proved. Failure details may contain sensitive identifiers; use sanitized external notifications. |
| Cron continues into retention even after creation failure. It lists `@auto_pb_backup_` files, sorts by modification time and deletes beyond `CronMaxKeep` [cron][backup-cron]. | It often leaves exactly three existing ZIPs alone after a failed fourth, but it has **no complete-set verification gate**. Do not describe `CronMaxKeep=3` as implementing the required retention policy. |
| Cron is an in-process timer matching the current minute, with UTC default and no persisted missed-run catch-up [scheduler][cron]. | It cannot wake an auto-stopped Fly service. No running process means neither backup nor native failure email; the previously recorded autostop makes this material. |
| Native restore extracts local data and restarts the **current executable**. It is experimental/UNIX-oriented, recommends at least 2× restored backup size, and temporary old data is removed after successful bootstrap [restore][restore]. | It does not restore S3 objects, select matching hooks/image or downgrade binaries. Temporary rollback directories are not independent retained backups. |

**Conclusion:** simply enabling backup S3 plus a monthly native cron is insufficient. Backup S3 can use a distinct identity, but credentials stored on the application remain accessible to an application compromise. Prefer an externally held backup identity and complete-set orchestration; no need to enable PocketBase's backup-S3 setting for the recommended design.

## 4. Simplest complete-set design — proposal, not verified

### Destination and identities

Recommend a **separate private S3 recovery bucket**, with unique full-set objects and no PocketBase runtime access. Same-account storage is the lowest-provider-count candidate given the existing AWS choice. This is independent of the live Fly volume and originals bucket, and of the runtime identity; it is **not** protection from account-wide administrative compromise or account loss. Choose cross-account/off-provider custody if that stronger boundary is required. Source versioning alone, a same-volume ZIP, Fly's short-lived snapshot, or a mirror with deletion propagation is not this recovery set.

Use a separate external backup identity:

| Identity | Proposed authority |
| --- | --- |
| PocketBase runtime | Only originals-bucket data-plane actions above; no backup destination or backup credentials |
| Backup job | Source bucket `ListBucket` + object `GetObject`; **no source write/delete**. Destination list, upload and read-back verification under recovery-set namespace; multipart abort if its selected uploader uses multipart |
| Retention execution | Destination deletion only in completed monthly-set namespace, executed only after verification. May be the same backup-job identity for simplicity; then acknowledge it can destroy retained history if compromised. Never grant it source deletion or rollback-archive deletion |
| Restore operator | Read recovery sets/decrypt with separately recoverable key; write only an isolated destination during rehearsal. Production restoration needs separate approval and scoped access |
| Provisioner | IAM/bucket policy/lifecycle/billing changes only through explicitly authorized human/setup permissions, not application runtime |

A distinct backup identity is not sufficient separation if its secret is placed on the app host. Prefer temporary OIDC/STS credentials in the external runner where supported by the **chosen backup tool**, plus a narrowly scoped way to obtain the database checkpoint from Fly. Pin and inspect that tool's actual S3 calls before finalizing its policy: some copy/sync tools additionally call tagging, region, version or multipart-list APIs. Do not reuse PocketBase's call table blindly.

### Monthly transaction

1. An **external** scheduler acquires a single-job lock and allocates a unique UTC set ID. Wake the existing backend if required and permitted. Also support a manual pre-change invocation. Record start/deadline outside Fly; a job-start signal is not backup success.
2. Establish a verified maintenance boundary for the entire shared backend: drain requests, prevent owner/API/background/import/cron writes and file deletions/replacements, and stop or reliably coordinate all writers. A settings toggle or asking the owner not to edit is insufficient. Keep the boundary through database and object capture.
3. Prefer a cleanly stopped-process copy of complete `pb_data` at this tiny scale, preserving local storage and `.attrs` sidecars. Exclude only explicitly documented disposable backup/temp material, not unknown files. Alternatively, use the pinned native ZIP **while all external object mutations remain frozen**, then independently capture the objects. Never copy only live `data.db` or discard WAL files from an unclean directory copy.
4. Capture **all current application objects across every collection**, including originals, thumbnails and retained files referenced by published snapshots. No age-only filtering or “public items only” backup. Freeze other S3 writers too. Paginate the full inventory; retain exact object keys, bytes, content type and user metadata (including original filename), with per-object SHA-256. S3 metadata is not a local `.attrs` file: restoration must preserve/reconstruct the correct representation [metadata mapping][driver-read], [writer][driver-write]. Store raw S3 keys unambiguously; the driver escapes some keys/metadata [driver provenance][driver-new].
5. Retain matching custom executable/image **as recoverable bytes or a verified durable artifact**, its digest, full hooks/migrations, configuration and a manifest of versions/checksums. A registry tag or Git commit alone does not guarantee future artifact availability. Retain settings/decryption keys securely out of band; include key identifiers/recovery instructions, never raw keys in Git or notifications.
6. Verify SQLite integrity on a disposable copy; reconcile every database file reference (including published snapshots/shared collections) to captured bytes and metadata. Reject missing references or hash mismatches. Retain unexplained extra objects for investigation rather than pruning them. Package a full encrypted archive (or a small fixed bundle plus manifest) per set; each set must restore **without older sets or the live source bucket**.
7. Upload under its unique ID to the independent destination. Download/read back and verify archive hash, decryption/extraction, SQLite integrity and inventory. A successful PUT/ZIP creation is not sufficient. Release maintenance once consistent local capture is durable, using guaranteed recovery/resume handling; verify normal service resumes. Do not hold the write freeze unnecessarily for remote upload if the captured checkpoint is safely retained, but alert if transfer subsequently fails.
8. Publish the completion marker/manifest **last**, only after all checks pass. Include capture interval, code/config identifiers, object/file counts, total bytes, hashes and verification result. An incomplete/staging prefix or start record never counts as success. This marker and any file manifest are private.
9. Keep the latest **three verified complete monthly sets**, ordered by checkpoint time. Only after a replacement succeeds, prune older complete monthly sets as whole units. Failure/incomplete copy/hash mismatch means **no successful-set pruning**. Keep pre-migration/rollback sets in a separate namespace outside this identity's retention/delete scope until owner-authorized retirement. Clean abandoned staging data by a separately reviewed rule that cannot touch completed sets.

**Feasibility gate:** no safe unattended write-freeze/maintenance/export mechanism was established in this research. Stopping a Fly Machine also stops its SSH/helper process; stopping a PID-1 PocketBase process may terminate the Machine. Do not assume “stop then SSH-copy” works. Before implementation approval, choose and locally rehearse either a supervised maintenance/export mode with mounted data accessible while PocketBase is stopped, or a comprehensive coordinated-write barrier plus native ZIP export. The runner's narrow Fly access, process lifecycle, all shared consumers, disk/scratch capacity and restart failure recovery must be verified. This is the main technical prerequisite, not permission to modify production now.

### Scheduling and absence detection

A scheduled workflow in existing GitHub Actions is a **candidate**, not an adopted reliable monthly clock or established authorization. It avoids a new always-on backup host, but GitHub documents delayed/dropped scheduled jobs, default-branch-only schedules and automatic disabling after 60 days of inactivity in public repositories ([GitHub schedule documentation][github-schedule]). An independent watchdog is mandatory; account minutes/cost and credential trust need checking. Use a different existing external scheduler if already available and more reliable; none was established here.

Propose one calendar-month checkpoint, e.g. day 1 at a non-hour-boundary UTC minute, with an owner-approved completion deadline/grace period. A bounded retry must use a new staging attempt without clobbering a successful set. Daily lightweight due-check/retry invocations are an option if the chosen scheduler is best-effort; they must not count as extra successful monthly checkpoints or rotate away historical months.

Two independent notification conditions:

- **Explicit failure:** job sends sanitized set ID, failed phase, last successful checkpoint time and private investigation link on capture, integrity, transfer, restart or pruning failure. No content, keys, signed URLs, raw settings or manifest in alerts. Retention-cleanup failure is reported even if the new set is recoverable.
- **Absent success:** a monitor outside the app **and outside the backup job's own schedule** expects a success heartbeat only after destination verification/completion. It alarms if the deadline passes, even when no job started, Fly never woke, credentials expired, scheduling was disabled, or the failure-email code never ran. Job-start signals must not reset the complete-set deadline. Show/alert on age of the last successful checkpoint.

A dead-man service such as Healthchecks.io is one concrete option: its [primary documentation][healthchecks] describes late/missing-success detection and grace-time alerts. This is **not** an approved signup, free-tier entitlement or chosen destination. An existing independent monitor with the same semantics is preferable if available. Confirm its initially armed state (not indefinitely “new”), schedule, timezone, grace, active integration and owner delivery. Rehearse both an explicit failing run and a deliberately withheld success heartbeat; a dashboard “configured” state is not delivery evidence. The backup scheduler cannot be its own only watchdog. AWS spending alerts remain separate from recovery-health alerts.

### Cost gate

No current region, complete-set size, runner entitlement, transfer bill or destination capacity was verified. `sjc` makes `us-west-1` a geographic candidate; it does not establish latency or price superiority over `us-west-2`. No region is adopted here.

Estimate before enabling:

`three full sets + temporary fourth/staging + separately retained rollback sets + destination versions/incomplete parts`, multiplied by chosen-region storage pricing, plus **source reads/listing, destination writes/read-back/listing/deletes as charged, source egress/runner transfers, restore-test traffic, scheduler/compute, monitoring and key-management charges**. Include originals-bucket ongoing costs separately within the overall $5 AWS alert.

The approved decisions' Oregon $0.023/GB-month figure is a prior documented illustration, not a current quote for the unchosen recovery region. At that illustrative rate, three 1-GB sets alone would be $0.069/month; that is not an all-in forecast. Today's recorded upload bytes are tiny but do not measure the complete encrypted set, database growth or artifacts. Avoid a paid always-on machine/custom KMS key solely for this task unless the full estimate and owner approval justify it. Verify a comfortably **under-$1/month** backup estimate and spending-alert delivery; escalate at $1 or more. Do not use age-based lifecycle expiry to simulate three-*successful*-set retention.

## 5. Isolated restoration acceptance — proposed

Before cutover, restore a newly verified full set, not just the historical pre-upgrade archive:

1. Use a disposable, non-public environment and storage, with production egress denied **before opening/bootstrapping the restored application**. Restored settings can contain live endpoints/credentials. Do not start first and sanitize later.
2. Obtain the encrypted set and decryption/settings keys using documented owner recovery access that does not depend on the lost Fly instance. Verify hashes and extract to a fresh directory. Check both SQLite databases and the complete manifest before startup.
3. Restore exact S3 object keys/metadata to an isolated test bucket or faithful local S3 test service. Use test-only credentials/endpoints and blocked production destinations. Converting to local storage requires explicit metadata conversion; simply dumping S3 bytes under `storage/` is not a proved equivalent restore.
4. Pair the database with the captured 0.40.4 custom executable/image, hooks, migrations and configuration. Disable/stub cron, SMTP, OAuth callbacks, rebuild hooks and other outbound integrations on the disposable copy, with the network deny as defense in depth. Prevent accidental new migrations. Never put 0.22.22 against upgraded data.
5. Verify all shared collection counts/relations, original/thumbnail hashes, file metadata, protected-file access and rejected anonymous/nonowner access, owner login in the isolated environment, and published-snapshot retained-file references. Exercise test-only upload/replacement/deletion, a >6-MiB multipart file and cancellation/error cleanup. Confirm inability of runtime credentials to read/delete recovery sets and of backup credentials to modify originals.
6. Demonstrate recovery without reading production originals or relying on earlier sets. Record elapsed time, capacity, discrepancies and exact successful checks without exposing private content. Retain a private restore report; public issue/report gets only sanitized evidence. Rehearse paired rollback without changing production. Any eventual production restoration/cutover requires its own coordinated-write window and explicit approval.

Native restore alone does not implement these checks; its [current-executable restart behavior][restore] is a reason to prefer fresh isolated restoration for rehearsal. No restore was performed in this task.

## 6. Concrete decisions still needed

| Owner / authorized operator choice | Proposed default / unresolved requirement |
| --- | --- |
| Originals region and namespace | Dedicated approved-in-issue originals bucket, native root layout; select region against Fly `sjc`, actual price/latency and transfer estimates. No bucket created |
| Runtime IAM administrator and custody | Name the authorized non-root IAM creator; approve dedicated non-console runtime user/key or separately fund a role integration. Choose secure injection/settings encryption, rotation/revocation owner and key recovery. Human SSO provisioning scope is not IAM approval |
| Recovery destination | Name bucket/account/region and custodian. Choose same-account isolation vs cross-account/off-provider disaster boundary; decide whether overwrite/delete resistance/Object Lock is required. No destination/access/capacity established |
| Backup/retention identities | Choose OIDC trust/runner identity, source read scope, destination write/verify/delete scopes, and whether deletion authority is separated. Keep rollback namespace outside automated pruning; never store recovery-destination credentials on PocketBase |
| Scheduler and Fly maintenance access | Choose existing external scheduler or GitHub Actions plus watchdog; authorize narrow Fly export/maintenance capability only after supervised-stop/write-freeze feasibility is rehearsed. Choose a monthly window and acceptable shared-backend interruption |
| Failure/absence recipient | Specify owner email/channel, monitor operator/service, monthly deadline/grace, escalation and acknowledgement expectations. Approve any new service/account and verify explicit-failure **and** absent-success delivery |
| Encryption and disaster access | Choose full-archive encryption method and offline/recoverable key custody, separate settings-key custody, and restore operator. Do not make the only key copy depend on production or its backup archive |
| Cost and retention protections | Measure full sets/artifacts, temporary fourth, rollback holdings, versions, transfers, compute and monitoring. Confirm under $1/month; approve at/above $1 before adoption. Verify $5 incremental AWS alert recipient/delivery through authorized billing access |
| Restore/rollout approval | Select isolated destination and acceptance operator; approve implementation/provisioning separately, then coordinated migration and #14 rollout after security gates. This note supplies none of those approvals |

## Primary sources

All PocketBase links below pin commit `5cec579da984436a258602a46a96302fbd31f77c` (v0.40.4). AWS/GitHub/Healthchecks links are current primary documentation read for this research, not version-pinned service guarantees.

[mod]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/go.mod#L1-L50
[settings]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/core/settings_model.go#L427-L446
[base-fs]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/core/base.go#L744-L817
[fs-new]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/filesystem.go#L63-L91
[record-path]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/core/record_model.go#L604-L612
[driver-new]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3blob.go#L1-L65
[driver-list]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3blob.go#L99-L156
[driver-read]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3blob.go#L158-L227
[driver-write]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3blob.go#L229-L299
[s3-client]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3/s3.go#L1-L234
[head]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3/head_object.go#L63-L89
[get]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3/get_object.go#L18-L43
[list]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3/list_objects.go#L54-L121
[copy]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3/copy_object.go#L25-L59
[delete]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3/delete_object.go#L8-L31
[fs-delete]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/filesystem.go#L405-L491
[upload]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3/uploader.go#L1-L138
[upload-single]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3/uploader.go#L140-L170
[upload-init]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3/uploader.go#L181-L258
[upload-complete]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3/uploader.go#L260-L310
[upload-parts]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3/uploader.go#L312-L417
[etag]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/filesystem/internal/s3blob/s3blob.go#L408-L435
[backup-create]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/core/backup_create.go#L28-L301
[backup-cron]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/core/backup.go#L32-L116
[system-alert]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/core/system_alert.go#L66-L131
[cron]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/tools/cron/cron.go#L21-L230
[restore]: https://github.com/pocketbase/pocketbase/blob/5cec579da984436a258602a46a96302fbd31f77c/core/backup_restore.go#L18-L196
[aws-actions]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-policy-actions.html
[aws-head]: https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html
[aws-signing]: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
[aws-prefix]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/amazon-s3-policy-keys.html#amazon-s3-policy-keys-prefix
[aws-ownership]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/ensure-object-ownership.html
[aws-encryption]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html
[aws-multipart]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html
[aws-complete]: https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html
[github-schedule]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
[healthchecks]: https://healthchecks.io/docs/
