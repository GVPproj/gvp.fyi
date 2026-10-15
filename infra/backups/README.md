# Backup operations

**Not active:** no scheduled backup, deployed watchdog Lambda, CloudWatch alarms or
verified monthly recovery baseline exists. Local components are candidates, not a
working recovery service. Application originals remain on Fly. Provisioning state
below is the last recorded read-back, not a fresh cloud audit.

## Approved scope and resources

Backup-only storage in AWS account `524178179132`, Oregon (`us-west-2`), targeting
**under $1/month**. Forecasts at or above $1/month require owner approval. Monthly
complete recovery sets, three distinct verified successful months, failure and
missed-success alerts, and separate pre-change rollback sets are required.
The owner approved the existing private backend Actions runner and a brief monthly
write-free window; an immediate production capture still needs an agreed window.
AWS-only monitoring replaces the earlier Healthchecks proposal.

- Bucket: `gvp-pocketbase-backups-524178179132-us-west-2`.
- Runner role: `arn:aws:iam::524178179132:role/gvp-backup-runner`.
- GitHub OIDC: `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`,
  subject `repo:GVPproj/pocketbase-fly-starter:ref:refs/heads/main`.
  Any OIDC-enabled workflow on that branch can request the role. Protect/review
  workflows; recheck trust if repository naming or OIDC subject settings change.
- SNS: `arn:aws:sns:us-west-2:524178179132:gvp-backup-alerts`, email `me@gvp.fyi`.
  Subscription confirmed, **not end-to-end alert delivery**.
- Watchdog execution role: `gvp-backup-watchdog`; read-only monthly/artifact S3
  access, SNS publish and own-log writes, no production Fly access.
- Log group: `/aws/lambda/gvp-backup-watchdog`. Creation and 14-day retention calls
  succeeded; retention was not read back.
- EventBridge rule: `gvp-backup-watchdog-daily`, daily 08:17 UTC,
  **disabled, no targets**.
- Reserved alarm names allowed by the topic policy:
  `gvp-backup-watchdog-errors` and `gvp-backup-watchdog-absent`.

Adjacent JSON files record installed bucket/trust/runtime policies;
`watchdog-provisioning-policy.json` is setup permission scope, not runtime access
or a standalone provisioning script. Remove temporary privileged provisioning
permissions after verification, not the runtime role or unrelated permissions.
Do not alter the shared OIDC provider without checking other consumers.

Bucket region, public-access blocks, owner-enforced ownership (ACLs disabled),
SSE-S3, TLS-only policy and runner trust/policy were read-back verified. Last
recorded bucket check was empty. No GitHub-issued OIDC assumption or object round
trip has been verified. No lifecycle expiry, application-file S3, customer-managed
KMS key or static AWS access key was configured. SSE-S3 is not client-side
encryption. Runner permissions allow deletion only under monthly/candidate
prefixes, but **allow overwriting rollback/artifact keys**: this is not immutable
or ransomware-proof custody. Use unique keys and independent hash checks;
rollback/artifact cleanup requires separate owner approval and access.

## Local components and limits

- `verify.py` (Python 3.11+, standard library): `validate_archive` checks normalized
  tar/gzip structure, full captured inventory, both SQLite databases and supported
  file-field originals. It returns `structural_valid: true`,
  `recovery_verified: false`. `verify_recovery` **always raises at
  `isolated_startup`**; no captured executable is started and no set can qualify.
- Normalized input contains only `pb_data/` (including `data.db`, `auxiliary.db`
  and all local files), actual captured `pocketbase`, `pb_hooks/`,
  `pb_migrations/`, and `deployment.json`. Empty hooks/history require explicit
  directories. Metadata format 1 includes UTC `captured_at`, `runtime_version`,
  `deployment.command`/`configuration`, and `files`: exact paths mapped to byte
  size and SHA-256 for every regular file except the metadata itself. Metadata
  is limited to 1 MiB. Never substitute a new checkout/binary/history or bless an
  incomplete historical archive by manufacturing its inventory.
- Default validation limits: 512 MiB archive, 1 GiB expanded, 512 MiB/file,
  100,000 members, five-second SQLite work limit per database. No links/special
  files or WAL/SHM/journal companions are accepted; capture coherent stopped or
  checkpointed databases, never discard a required WAL. Structural checks do not
  prove capture atomicity, custom JSON/rich-text references, external S3 data,
  decryption, runtime health or application semantics. Keys need independent
  private custody.
- `recovery_store.py`: 512 MiB archive limit; requires a trusted real-restore
  receipt with `recovery_verified: true` bound to the exact `captured_at` before
  upload. Payload/manifest use conditional unique creates and byte-for-byte S3
  read-back. `monthly/YYYY-MM/verified.json` is written last (and replaceable).
  Schema 1 includes slot, verified status, capture/verification UTC times,
  manifest and nonempty objects; references include key, SHA-256 and size.
  Set keys are `monthly/<slot>/sets/<set-id>/`; shared artifacts may use
  `artifacts/<sha256>/`. An ad hoc rollback archive is not monthly success.
- Retention is **single-writer only**, invoked only after successful promotion.
  It validates all markers and reads/hashes referenced objects before pruning;
  keeps three latest distinct successful months; leaves unmarked attempts,
  superseded same-month sets, rollback and shared artifacts alone. Interrupted
  pruning may leave safe orphans. On ambiguous final-marker upload, do not prune:
  reconcile exact keys/marker before retrying with a new set ID, and still alert
  on the failed run. These modules are not a distributed lock.
- `watchdog.py`: validates the due marker (64 KiB maximum) and HEAD object sizes,
  **not hashes or restore validity**. Missing/invalid sets notify SNS; unexpected
  service failures raise for an independent Errors alarm. Lambda entry point is
  `watchdog.lambda_handler`; required environment: `BACKUP_BUCKET`,
  `BACKUP_TOPIC_ARN`, `BACKUP_FIRST_SLOT` (`YYYY-MM`). Due calculation assumes
  capture on day 2 at 06:17 UTC plus 24-hour grace; this is not an active schedule.
- Sibling backend `backup/capture.py` has a local capture/resume state machine and
  bounded maintenance fallback. Real Fly transport and normalized deployment
  metadata/inventory are missing. Its Python supervisor prerequisite is absent
  from the reviewed runtime Dockerfile; do not point it at production as-is.

Local regression command (no cloud mutations):

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s infra/backups -p 'test_*.py'
```

Service doubles and local tests do not prove IAM/OIDC, remote capture, email
receipt or real recovery. The older manually rehearsed rollback checkpoint is
recorded in [admin recovery](../../docs/admin-recovery.md#private-rollback-checkpoint),
not a successful run of this automation.

## Next activation gates

1. Implement/review capture normalization and full matching-runtime isolated
   startup. Wire `verify.verify_recovery` as the store's restore boundary, never
   structural validation or a supplied success flag. Before running captured
   code, isolate network/filesystem/descriptors/host sockets and credentials;
   allow loopback only, use a separate writable restore, bounded startup and
   descendant cleanup, suppress private output, and never fall back unrestricted.
   Verify readiness, protected/local-file retrieval, shared consumers and retained
   Published data, plus before/after schema/records/auth/file preservation.
2. Implement/test real Fly transport and scoped unattended access, cancellation,
   ambiguous updates, autostop and restoration. Resolve Python availability. Do
   not create a superuser automation account, bypass MFA or assume maintenance
   fallback guarantees availability through provider failures.
3. Add the runner through separately approved workflow-only default-branch
   changes. Backend `main` pushes deploy production: do not push pending application
   changes merely to activate backups. Capture and deployment need shared
   concurrency exclusion. Verify private Actions cost, actual OIDC assumption,
   conditional create and object read-back; privately supply scoped Fly access.
4. Agree the immediate maintenance window, capture a complete set, perform real
   isolated restore and S3 promotion, measure cost/cold start and verify retention
   and cleanup. Only then enable monthly execution and record the first verified set.
5. Deploy watchdog disabled; attach its exact rule, independent Errors and
   missing-Invocations alarms. Test explicit failure, absent success, checker
   failure/missing execution and owner inbox receipt. Establish the first monitored
   slot, then explicitly activate. AWS/SNS shares AWS failure domains and does not
   independently detect an AWS-wide outage.

No private payload, settings, credentials or recovery logs belong in Git, Actions
logs/artifacts/caches, fixtures or exception output. Provisioning is not production
cutover approval; do not broaden permissions or change MFA to finish setup.
