# Minimal recurring PocketBase → off-host S3 recovery

Research date: **2026-10-14**. Recommendation, not an implemented or approved operational runbook.

## Scope and conclusion

Use an **existing-repository GitHub Actions workflow**, monthly and manually dispatchable, to capture a native PocketBase backup, verify a complete recovery set on an isolated runner, upload it to a private **S3 Standard backup-only bucket**, read it back and verify it, then retain the latest **three verified monthly sets**. Use **Healthchecks.io Hobbyist** for external missed-success and explicit-failure email to **me@gvp.fyi**. Use GitHub OIDC for AWS, not an AWS access key on Fly. Keep application originals on the existing Fly volume.

This is the smallest plausible design, **conditional on resolving unattended PocketBase authentication and capture consistency**. Native backup success alone is insufficient. If a reliable write freeze cannot be provided, live native capture must pass exhaustive database/file and isolated-startup verification before promotion; failures retain all prior good sets and alert. For the mandatory pre-change checkpoint, use coordinated quiescence, not this conditional live-capture shortcut.

The owner handoff, summarized in [the backup preflight](../backup-only-preflight.md), approves the existing AWS account for backup-only storage and selects the alert email. That supersedes the older “no backup provider approved” sentence in [publishing decisions](../publishing-decisions.md). Retained requirements come from that document, [readiness](../content-cutover-readiness.md), and [backend safety](../../pocketbase/README.md): monthly complete data/local-file recovery, three successful sets, failure and missed-run detection, fresh pre-change checkpoints, isolated restore, matching code/configuration and encryption-key custody. Monthly recovery-point loss is accepted; no recovery-time guarantee is agreed.

Only public primary sources and supplied local documents were read. Official pages/source were fetched using anonymous HTTP GETs; no cloud account, production endpoint, credentials, deployment, backup or remote mutation was used. This research ran in a background subagent. No other repository file was edited by that subagent. Historical production observations below are not fresh measurements.

## 1. What PocketBase 0.40.4 actually backs up

Version-pinned source takes precedence over general documentation. [P1–P7]

| Question | Verified behavior and consequence |
| --- | --- |
| Database consistency | `CreateBackup` uses SQLite `VACUUM INTO` separately for `data.db` and `auxiliary.db`; WAL/SHM files are excluded. SQLite documents each output as a consistent snapshot. This is **not one transaction spanning both databases and storage**. |
| Settings/auth | The main database snapshot includes its stored settings, collections, records and auth data. Settings may contain secrets; encryption depends on deployment configuration. Retain the external settings-encryption key separately. A ZIP is sensitive, not a sanitized export. |
| Local files | The remainder of `pb_data` is recursively copied, including local `storage` originals, thumbnails and `.attrs` sidecars if present/not excluded. There is no thumbnail-only exclusion. Custom `OnBackupCreate` hooks can change exclusions/behavior; audit the deployed custom build. |
| Exclusions | Default excluded root entries are local backups, temporary data, notifications, autocert cache and `lost+found`. This is a recovery snapshot, **not a byte-for-byte archive of every `pb_data` entry**. Files actually stored in application S3 are not fetched; enabling application S3 would require a different complete-set plan. |
| Deployment material | Hooks, migrations, custom binary/image and configuration outside `pb_data` are not included. A Git SHA/image digest is provenance, not a durable copy of the executable or source. Preserve usable matching artifacts separately. |
| Disk | Capture creates temporary database copies and a ZIP on the existing volume even with a remote destination. Source recommends at least **2× `pb_data` size free** for capture. Restore recommends at least **2× restored backup size free**, with additional operational headroom. |
| Destination | `Settings.Backups.S3` is independent of application `Settings.S3`. Native backup S3 takes configured access key/secret; it is not GitHub OIDC. Leaving native backups local and uploading from Actions avoids AWS credentials on PocketBase. |
| API completion | `POST /api/backups` synchronously calls `CreateBackup` and returns 204 after that call succeeds. It is **not** the asynchronous restore API. Supply a unique lowercase/digit/underscore/hyphen `.zip` name; API validation rejects existing names. A client timeout is ambiguous: reconcile that named backup before retrying. |
| Authorization | List/create/delete require superuser auth. Download uses a superuser file token in the URL and checks configured superuser IP restrictions. Native APIs provide no backup-only ordinary-user permission. Do not log download URLs/tokens. |
| Restore | Native restore replaces data and restarts the **current executable**; it does not restore/downgrade code. Its own minimum archive validation is only the presence of `data.db`, not a complete integrity/restore test. It is experimental and UNIX-oriented. |

### Important consistency limitation

The pinned algorithm registers a deleted-file interceptor before the main database snapshot, then **unbinds it immediately after `VACUUM INTO`**, before walking storage. It later excludes newly written files. The source comments acknowledge races and describe harmless extra files, but the implementation also logs a failed pre-delete copy as a warning and continues deletion. File-field update cleanup can delete replaced originals and thumbnails. Thus source inspection does **not establish a strict full database/file snapshot guarantee under concurrent mutation**: an original referenced by the captured database could be removed after the deletion watcher is detached and before storage traversal. This is a source-level risk analysis, **not a reproduced production bug**. [P1, P6]

**Design consequence:** favor a short, enforced write-free capture window covering all shared consumers, custom writers and maintenance jobs; merely asking the dashboard owner not to edit is not enforcement. Do not copy a running SQLite directory. If selecting live native capture for minimal recurring operation, verification must enumerate all file references—including retained publication media/custom references—and reject missing/corrupt files. Extra unreferenced files do not invalidate recovery, but missing referenced originals do. ZIP CRC and `PRAGMA integrity_check` alone cannot prove file completeness. Exact cross-database point-in-time consistency still requires quiescence. The full-directory stopped-process method remains the conservative alternative. [P1, P3, P6, P7]

### Native cron is not the retained-success policy

The pinned automatic-backup job sends failure alerts to superusers using PocketBase's mail path, but then proceeds into retention processing even after `CreateBackup` fails. Retention lists auto-prefixed objects and trims by modification time; it does not restore/verify sets or account for matching deployment artifacts. Setting `CronMaxKeep=3` therefore does **not** implement “three verified successful recovery sets.” Keep native cron off for the proposed external workflow, and do not layer age-based S3 expiry over successful sets. [P4]

## 2. Proposed workflow and success contract

**Runner:** one standard Linux GitHub-hosted job in an existing repository, with a shared concurrency group, `cancel-in-progress: false`, bounded execution/retries and no production-deploy step. A proposed schedule is `17 6 2 * *` (second day of each month, 06:17 UTC), plus `workflow_dispatch` for retries/pre-change checkpoints. The exact window needs owner approval. Retry in the same monthly slot; multiple successful retries must not displace distinct monthly recovery points.

1. **Preflight:** obtain AWS credentials by OIDC; check approved bucket/prefix, backup age, storage budget, matching deployment-artifact availability, authentication and local-volume headroom. Refuse to run against an unexpected runtime/build or application-S3 configuration. A repository checkout is not necessarily the code currently deployed.
2. **Wake and capture:** make an HTTP health request through Fly Proxy with bounded cold-start retries, then request a uniquely named native backup. Prefer an enforced write-free window. A health ping does not guarantee the Machine stays up for later SSH/background work. The native create call is synchronous, but proxy timeout/autostop behavior must be tested on the real configuration; a disconnected request does not cancel its `context.Background()` work. Poll/reconcile the unique name rather than blindly create another archive. Do not disable autostop permanently. [P2, F1]
3. **Download privately:** stream the native ZIP to ephemeral runner storage, no shell tracing and no GitHub artifact/cache upload. Fetch/attach preserved matching deployment material. Keep administrative tokens, private data, config values and manifests out of console logs.
4. **Verify locally:** test ZIP structure/CRC and safe extraction; run SQLite integrity checks on both databases; check schema/migration history; enumerate every original referenced by records and retained publication media; verify sizes/hashes and required sidecars/thumbnails against the captured inventory. Preserve private auth/hash/count comparisons without emitting their contents. Distinguish absent optional regenerable thumbnails from required originals, and document that distinction rather than silently dropping files.
5. **Isolated restore:** start the matching custom binary/image against a separate extracted copy, loopback-only, with outbound production email/OAuth/webhooks/S3 and cron disabled or blocked **before startup**. Verify application startup, collections, representative protected/local file retrieval, shared-consumer data and retained Published content. Prevent unintended migrations by using the captured exact code/history. Merely executing SQLite checks does not qualify as a verified set. Initial implementation must prove this isolation works; do not run restored production settings on an unrestricted runner.
6. **Off-host promotion:** upload to an immutable-by-convention unique candidate prefix, with a manifest containing capture time/month, runtime/build IDs, artifact hashes, file inventory, checks and result. Download the S3 objects and compare SHA-256; do not equate an ETag with SHA-256. Upload a small final verified marker **last**, only after all checks and round-trip validation. The marker identifies exact immutable object keys/hashes. A partial prefix without this marker is not a retained successful set. S3 has strong read-after-write/list consistency; workflow-level multi-object completion still needs this marker. [A4]
7. **Retention:** under the single-writer concurrency contract, list only verified monthly sets, keep the newest successful set for each of the latest three distinct months, and prune older monthly sets only after replacement verification. An incomplete or failed capture must never evict a good set. During bootstrap, keep all successful months until three exist. Pre-change/rollback sets use a separate prefix and **no automatic expiry** pending owner retirement. Keep deployment artifacts referenced by any retained set. Garbage collection must handle interrupted cleanup without deleting a referenced artifact or promoting an incomplete set.
8. **Notify and clean up:** send external success only after verified off-host promotion and required cleanup; explicit failure on any failure, including retention or notification errors. Preserve evidence that a valid set exists even if cleanup fails. Remove only the workflow's own local PocketBase ZIP after verified off-host recovery; separately reconcile failed/stale local candidates to avoid filling the volume. Do not indiscriminately delete existing backups. Erase runner working data on exit; do not upload it as a debugging artifact.

The manifest plus ZIP plus matching runtime/hooks/migrations/configuration form the **recovery set**. Nonsecret configuration can accompany it; secret configuration and settings-encryption keys require independently recoverable private custody. Storing the sole key inside the archive it unlocks is not recovery. SSE-S3 protects storage at rest but does not prevent an authorized reader from downloading secrets; optional client-side encryption changes the key/runner threat model and needs its own recovery test.

### Authentication is a decision, not solved by AWS OIDC

OIDC removes long-lived **AWS** keys from CI; it does not authenticate to PocketBase or Fly. Native backup APIs require a powerful PocketBase superuser credential/token. The project separately requires superuser MFA; do not silently create a password-only automation user, weaken MFA/IP restrictions, or mint an indefinitely valid bearer token to bypass it. [P2, G2]

Two implementation choices need explicit security review:

- Native API access with an approved unattended administrative credential lifecycle, rotation and MFA-compatible policy; smallest capture implementation but broad access to private data and mutation APIs.
- Fly app-scoped SSH/exec token and a carefully reviewed on-host capture path, avoiding a public PocketBase automation login. Fly documents narrower SSH-only and Machine-exec token types, but shell access still exposes the app and its data; it is not read-only backup access. A new in-process command/route or stopped-process capture procedure is implementation work, not functionality established by this research. Do not start a second normal `serve` process on the live database. [F3]

No new custom control-plane service is recommended. If neither authentication approach is acceptable, this runner design is blocked rather than “ready.”

## 3. GitHub Actions and Fly limitations

- Scheduled workflows must exist on and run from the **default branch**, using its latest commit. Runs can be delayed or **dropped** under load; avoid the start of the hour. Public-repository schedules automatically disable after **60 days without repository activity**. Do not assume successful cron executions keep an inactive repository enabled. Manual retry and external missed-success monitoring are essential; this is not a guaranteed monthly scheduler. Notifications go to the last cron editor, not necessarily the approved alert address. [G1]
- Standard hosted runners are free in public repositories. Private repositories consume an account-wide allowance (GitHub Free: 2,000 minutes/month); exhausted allowances, spending controls and queues can block/charge work. Larger runners are always charged. Do not claim a free private runner without checking account usage. No persistent Actions artifacts/caches are needed for private recovery payloads. [G3]
- AWS OIDC needs `id-token: write`, a configured AWS federated identity provider and a scoped role. Restrict audience to `sts.amazonaws.com` and subject to the exact repository/default branch or protected environment. Avoid repository-wide wildcard subjects admitting PRs. Current GitHub docs distinguish legacy subjects from immutable owner/repository-ID subjects for newer/opted-in repositories: inspect the applicable format during setup, not by printing a live token. Environment jobs have an environment subject rather than the branch subject; use environment branch restrictions too. Human approval on every run conflicts with unattended monthly execution. Pin third-party actions to reviewed commit SHAs. [G2, G4]
- Grant the AWS role only bucket/prefix listing and the required object PUT/GET/DELETE (plus multipart permissions if used), not bucket/IAM administration. Keep rollback artifacts outside automatic-delete scope where practical. A role that can delete all monthly sets is not ransomware-proof; Object Lock/separate custodial access would be additional hardening, not part of the minimal proposal.
- Fly autostart wakes an existing Machine in response to proxied requests; an in-process cron cannot execute while stopped. Background CPU/SSH activity is not a documented keepalive contract for proxy-driven autostop. Initial and recurring tests must demonstrate completion across cold start, request timeout and stop/restart; do not “solve” this with a permanently running Machine. [F1]
- Both existing repositories have deployment implications on `main` according to readiness. Adding a schedule to the default branch is not an inert merge: review existing deploy triggers and obtain separate approval before pushing/merging workflow changes.

## 4. Independent missed-success email

### Recommended: Healthchecks.io Hobbyist — $0/month

The official plan includes 20 jobs and 100 stored log entries per job. One check suffices. It supports cron schedules, a grace period, explicit failure pings and email integrations. Configure the same **monthly UTC schedule**, not “every 30 days,” and provisionally allow **24 hours grace** for delayed starts/retries. Only the successful verified-set path sends a success ping; heartbeat-on-job-start alone is insufficient. A `/start` ping may track execution but must not be mistaken for backup success. The grace period also bounds start-to-success time. Explicit `/fail` should alert promptly; no run, cancelled run, expired credential or disabled scheduler leads to missing-success detection. [H1–H4]

Owner setup must activate/arm the check, verify **me@gvp.fyi** receives a test alert and recovery notice, then intentionally withhold a test success to prove missed-run delivery. Use a separate short-interval test check rather than waiting a month. Treat ping URLs as secrets (possession can forge success); send no private backup/log payload. Provider/email outages remain possible; this is inexpensive external monitoring, not guaranteed delivery. A failed ping must not mark the job green or delete a good recovery set. Check whether manual pre-change pings affect the next monthly deadline; keep monthly monitor semantics separate from ad hoc checkpoints. [H2–H4]

### Alternatives

| Option | Assessment |
| --- | --- |
| **Cronitor free plan** | Official pricing lists five monitors and email/Slack alerts; every plan includes cron/heartbeat monitoring. Plausible $0 alternative if the owner already has an account. Verify the selected monthly schedule, grace/alert behavior and available free monitor before setup. Paid monitoring starts at $2/monitor/month, outside this target. [H5] |
| **AWS-only watchdog** | EventBridge Scheduler → small checker (e.g. Lambda) reads the last verified marker and sends SNS email when overdue. Scheduler offers 14 million invocations/month free, then $1/million; checker, notification, logging and state costs are separate. Technically plausible at tiny usage, but more IAM/code/resources and another scheduled failure mode. This research did not obtain a complete regional Lambda/SNS quote, so this is **not** an approved under-$1 alternative. SNS publication alone cannot detect a workflow that never ran. [A5] |
| **GitHub failure emails or PocketBase native alert email alone** | Useful supplementary signals, not missed-success protection: no executed job means no failure step; native PocketBase cannot alert while stopped. GitHub's configured recipient and PocketBase superusers are not automatically the chosen email. [G1, P4] |
| **Self-host the monitor on the existing Fly Machine** | Shares the failure/autostop domain; not independent. A new always-on monitor/runner adds operations and likely breaks the budget. |

## 5. S3 configuration and cost

Use a general-purpose private bucket dedicated to backups, S3 Standard, Block Public Access, bucket-owner-enforced ownership/no public ACLs, TLS-only access and default **SSE-S3**. SSE-S3 encryption has no additional fee. Do not add a customer-managed KMS key, Intelligent-Tiering, archive transitions, replication, paid inventory or elaborate monitoring without a separate quote/need. Three tiny monthly ZIPs do not justify retrieval delays/minimum-duration rules. Versioning is optional defense against overwrite, **not** successful-set retention; enabling it requires explicit noncurrent-version accounting/pruning. [A1–A3]

**Region:** recommend `us-west-2` (Oregon) for a new backup-only bucket unless an existing suitable private destination makes `us-west-1` simpler. Historical originals-region selection does not bind this backup-only choice. At tiny scale their difference is negligible; no existing bucket suitability was inspected.

Official AWS regional offer files fetched on the research date both report publication **2026-10-12T23:11:02Z**. Values below are S3 Standard, not similarly named Tables/Vectors/Files products. [A1]

| Charge | Oregon `us-west-2` | Northern California `us-west-1` |
| --- | ---: | ---: |
| First storage tier, GB-month | $0.023 | $0.026 |
| PUT/COPY/POST/LIST, per 1,000 | $0.005 | $0.0055 |
| GET/other tier-2 requests, per 1,000 | $0.0004 | $0.00044 |

S3 has no minimum charge; standard DELETE requests and internet ingress are free. First 100 GB/month internet egress is free **aggregated across AWS services/regions** (with stated regional exceptions), not 100 GB reserved for these backups. Do not count introductory AWS credits or assume unused allowances. Fly lists North America internet egress at **$0.02/GB**. Its compute is billed while running; the exact incremental `sjc` runtime bill remains unmeasured. [A2, F2]

### Transparent small-data estimate (USD/month, before tax)

Let **B** be GB per complete set including amortized retained deployment material, not just the compressed database. Budget **4B** storage conservatively for three retained monthly sets plus one candidate held for an entire month. Separately add rollback archives/shared images/noncurrent versions. Assume 100 tier-1 requests and 100 tier-2 requests per month (well above a few ZIPs/manifests), one capture transfer from Fly, and one S3 read-back. For transfer beyond any free allowance, reserve **$0.10/GB** for the read-back as a conservative planning allowance, **not a verified region-specific egress tariff**; price the actual tier before enabling if it matters.

| Complete set size B | Oregon storage, 4B × $0.023 | Requests | Fly transfer, B × $0.02 | S3 read-back reserve, B × $0.10 | Subtotal |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.01 GB (10 MB) | $0.00092 | $0.00054 | $0.00020 | $0.00100 | **$0.00266** |
| 0.10 GB (100 MB) | $0.00920 | $0.00054 | $0.00200 | $0.01000 | **$0.02174** |
| 1 GB | $0.09200 | $0.00054 | $0.02000 | $0.10000 | **$0.21254** |

Add **$0 monitor**, **$0 standard public Actions runner** (or verified included private minutes), plus measured incremental Fly runtime. Even allowing a deliberately generous **$0.10/month Fly-runtime reserve**, the 100 MB example is about **$0.122/month**. This is a conditional budget, not a live bill guarantee. Current GitHub baseline Linux overage is $0.006/minute: 30 paid runner minutes would add $0.18; building/restoring large images or retries could use more. [G3]

The historical readiness archives were about 3 MB, but they predate current content and exclude some separately retained deployment material. Do **not** forecast current total size from them. Count complete image/source/config artifacts, temporary duplicate objects, long-lived pre-change sets, retry transfers, taxes and any client-side encryption overhead. Deduplicate deployment bundles by digest while retaining every referenced bundle. No static egress IP, new Fly app/volume, NAT gateway, paid secret store or always-on runner is included.

**Budget gate:** measure an authorized complete set and actual execution time, check account allowances and total retained bytes, and obtain owner approval before a forecast of **$1/month or more**. A billing alert is not a spending cap. Use no age-based expiry on verified sets: if backups fail for months, the three good sets must survive even when older than 90 days.

## 6. Alternatives to the recommendation

- **PocketBase native cron → native S3:** least capture code, but not reliable under Fly autostop; puts AWS credentials on PocketBase; native retention does not verify recoverability; no external missed-run signal. External wakeups spanning cron time still leave races and require a runner/monitor. Not recommended. [P4, P5, F1]
- **Actions → native S3 backup + S3 verification:** removes the initial ZIP transit through Actions but requires two AWS trust paths (PocketBase static credentials plus runner OIDC), still downloads for restore, and retains the same consistency/auth problems. No meaningful benefit for tiny data. [P5]
- **Actions → quiescent full-directory archive over Fly SSH/exec:** strongest simple capture semantics, preserves everything in `pb_data`, and follows historical recovery practice. But safely keeping the Machine alive while PocketBase is stopped, preventing writes/restarts, restoring the exact serve command after failures, and recovering after runner cancellation are consequential production automation. Needs a reviewed maintenance window, scoped Fly credential and watchdog/recovery procedure. Prefer for pre-change checkpoints; choose for recurring use if strict quiescence outweighs brief monthly downtime. [P7, F1, F3; local readiness]
- **AWS scheduled capture/checker:** avoids GitHub's inactive-public-repository schedule disabling but adds resources, code, secret custody and restore-execution constraints. Revisit only if GitHub's best-effort schedule plus external alert/manual retry is unacceptable.
- **Local laptop cron/manual checkpoints/Fly snapshots:** useful additional copies, not a reliable independent monthly runner; expiring snapshots and a powered-off laptop do not implement three verified off-host monthly sets.

## 7. Decisions and implementation gates

Already settled: **existing AWS account, backup-only S3, originals stay local, under-$1 target, `me@gvp.fyi` alerts**. Do not ask those again or reopen retired application-originals S3 work.

Owner decisions still needed:

1. **Runner/repository:** approve existing-repository Actions and best-effort scheduling with external missed-success alerts/manual recovery, or require a different scheduler. Identify repository and approve default-branch/deployment implications.
2. **Capture and access:** choose native live capture with mandatory complete verification versus an enforced monthly write-free window/quiescent capture; approve the exact unattended PocketBase or Fly credential model without weakening MFA. This is the main unresolved design/security gate.
3. **Monitoring:** approve Healthchecks.io Hobbyist account/check and proposed 24-hour monthly grace; alternatively select an existing Cronitor free account. Verify email delivery and absent-run alerts with the owner.
4. **Destination/custody:** choose a suitable existing private bucket or approve a new backup-only bucket/region (Oregon proposed), runtime-artifact custody, encryption-key recovery, and whether client-side encryption/versioning is required. No provisioning is authorized by this research.
5. **Verification policy:** approve the proposed per-set isolated startup/file validation and distinct-month retention; define any extra custom files/settings that require point-in-time treatment. Keep rollback sets separate until explicitly retired.

Before enabling: test cold-start capture, timeout reconciliation, concurrent file replacement/deletion, volume-full errors, missing objects, corrupt ZIP/DB, restore isolation, runtime/key mismatch, partial upload, retention interruption, failed notification and absent workflow. Verify no failure removes a good set. Test complete restore with the **matching custom executable**, including existing shared consumers, and demonstrate independently accessible keys/artifacts. Record aggregate results only. Measure full costs. The mandatory fresh pre-change real-data backup/restore/migration rehearsal and owner-attended MFA remain separate cutover gates; this file passes none of them.

### Remaining uncertainties

No live authentication/MFA/storage settings, deployed custom backup hooks, current file inventory, current volume capacity, AWS/GitHub allowances, bucket configuration, Fly cold-start/timeout behavior or monitor delivery was inspected. The concurrency concern is source-derived, not experimentally reproduced. Reliable unattended authentication and write exclusion are not yet implemented. The total size of retained custom images/configuration and per-run verification duration is unknown. Native capture can recover a coherent primary database but does not promise one atomic instant across auxiliary logs and arbitrary custom files. These limits prevent an unconditional “production-ready” or all-in price claim.

## Primary sources

All external sources below were fetched/read on 2026-10-14. PocketBase references are pinned to **v0.40.4**; other documentation/pricing is live and must be rechecked at implementation.

- **P1:** [PocketBase `core/backup_create.go`](https://github.com/pocketbase/pocketbase/blob/v0.40.4/core/backup_create.go) — capture, exclusions, file interceptors, temporary ZIP and space guidance.
- **P2:** [Backup routes/auth/download](https://github.com/pocketbase/pocketbase/blob/v0.40.4/apis/backup.go), [synchronous create/name validation](https://github.com/pocketbase/pocketbase/blob/v0.40.4/apis/backup_create.go).
- **P3:** [Pinned restore implementation](https://github.com/pocketbase/pocketbase/blob/v0.40.4/core/backup_restore.go), [SQLite VACUUM INTO](https://www.sqlite.org/lang_vacuum.html#vacuuminto).
- **P4:** [Native cron, alert and retention implementation](https://github.com/pocketbase/pocketbase/blob/v0.40.4/core/backup.go).
- **P5:** [Filesystem construction](https://github.com/pocketbase/pocketbase/blob/v0.40.4/core/base.go), [backup/S3 settings](https://github.com/pocketbase/pocketbase/blob/v0.40.4/core/settings_model.go).
- **P6:** [File-field post-write deletion and thumbnails](https://github.com/pocketbase/pocketbase/blob/v0.40.4/core/field_file.go).
- **P7:** [PocketBase production: backup and settings encryption](https://pocketbase.io/docs/going-to-production/).
- **G1:** [GitHub scheduled workflow limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
- **G2:** [GitHub OIDC in AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).
- **G3:** [GitHub Actions billing, allowances and runner rates](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
- **G4:** [GitHub OIDC reference](https://docs.github.com/en/actions/reference/security/oidc).
- **F1:** [Fly autostop/autostart](https://fly.io/docs/launch/autostop-autostart/).
- **F2:** [Fly compute and transfer pricing](https://fly.io/docs/about/pricing/).
- **F3:** [Fly scoped SSH/exec and deploy tokens](https://fly.io/docs/security/tokens/).
- **A1:** AWS official regional offer JSON: [Oregon](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/us-west-2/index.json), [Northern California](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/us-west-1/index.json); `TimedStorage-ByteHrs`, `Requests-Tier1`, `Requests-Tier2`, standard product SKUs.
- **A2:** [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/) — requests, transfer allowance, archive minima and no minimum charge.
- **A3:** [S3 SSE-S3 encryption and no additional fee](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html).
- **A4:** [S3 overview, access controls and consistency model](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html).
- **A5:** [EventBridge Scheduler pricing](https://aws.amazon.com/eventbridge/pricing/), [SNS pricing](https://aws.amazon.com/sns/pricing/) — component sources, not a complete checker quote.
- **H1:** [Healthchecks.io plans/pricing](https://healthchecks.io/pricing/).
- **H2:** [Healthchecks concepts/grace and success states](https://healthchecks.io/docs/), [check configuration](https://healthchecks.io/docs/configuring_checks/), [cron syntax](https://healthchecks.io/docs/cron/).
- **H3:** [Healthchecks explicit failure signals](https://healthchecks.io/docs/signaling_failures/).
- **H4:** [Healthchecks notification integrations](https://healthchecks.io/docs/configuring_notifications/).
- **H5:** [Cronitor official pricing](https://cronitor.io/pricing), [cron-job monitoring](https://cronitor.io/docs/cron-job-monitoring).
