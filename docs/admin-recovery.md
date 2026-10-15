# Admin MFA and recovery

## Current operating baseline

PocketBase v0.40.4 superusers use password + email OTP MFA. SMTP sending and a
fresh-session MFA login were verified; password alone and incomplete/incorrect
challenges did not grant administrative access. Anonymous administrative endpoints
were denied. Owner confirmed Likes login; biolink uses public fetch only. Do not
repeat setup, recreate credentials, disable MFA or deploy merely to resume work.
Old-token revocation and owner editing smoke writes were not verified.

SMTP uses dedicated SES IAM SMTP credentials in `us-west-2`, endpoint
`email-smtp.us-west-2.amazonaws.com`, port `587`, **Auto (StartTLS)**, `PLAIN`.
The sending policy permits only `ses:SendRawEmail` on `*`; existing `unbusy.day`
DKIM was successful. Keep credentials and sender/login addresses private; do not
reuse sibling-site credentials or modify its feedback setup. Confirmed receipt
is not a guarantee of future inbox placement.

## If MFA sign-in fails

1. Do not log out of a working dashboard session. Ask whether one is still usable;
   the setup-time session must not be assumed to remain open.
2. With owner approval, use that session: `_superusers` collection settings →
   Options → Multi-factor authentication → disable MFA and save. In v0.40.4 this
   also disables OTP; leave password auth enabled. This is temporary security
   rollback, not normal operation. Diagnose email access/delivery before re-enabling
   and verify a separate-session login before releasing the retained session.
3. If no session works, stop and arrange explicitly approved operator-assisted
   recovery. Independent operator SSH access to the existing Fly machine was
   verified. Do not assume password reset bypasses MFA, edit running SQLite, or
   restore production data without approval. The fallback toggle was source-checked,
   not exercised on production.
4. Full restoration is a last resort: use the paired checkpoint below only after
   assessing newer writes/settings and getting approval for the maintenance window
   and data loss. Never run the old binary against upgraded data or attempt an
   improvised down migration.

If fresh authentication verification is needed, the owner can run
`~/.cache/gvp-mfa-verification/check.py` locally; it prompts for credentials and
sends a new OTP. Aggregate results are in adjacent `result.json`. Do not request
passwords/OTPs/tokens in chat or run its interactive prompts in a background tool.
No routine rerun is needed.

## Latest pre-cutover checkpoint

Captured on **2026-10-15**, immediately before the approved CMS cutover, after MFA
was enabled. Private directory:
`~/.local/share/gvp-pocketbase-recovery/cms-cutover-oj97suym/`.

- `checkpoint.tar.gz`: **25,549,084 bytes**; SHA-256
  `5616ddc2fe2905346352aa4fa177a373dfba89a65e5afbf54dbe5f0383680d88`.
- Complete stopped-process data/storage, deployed executable, hooks and migrations;
  remote/local checksums matched. Original machine configuration restored exactly;
  capture/resume/health cycle took 46 seconds.
- Captured-runtime restore, candidate migration and separate paired rollback passed
  with outbound networking blocked. Fresh-copy imports subsequently passed.
- Matching old machine configuration/image metadata and pre-cutover Netlify
  configuration/deployment are retained alongside private verification results.
- This predates the new CMS imports and build identity. Restoring it loses those
  changes and any later writes. It is a manual checkpoint, not scheduled recovery.

Use this newer set for cutover rollback, not the pre-MFA historical set below.
The [cutover record](content-cutover-readiness.md) identifies the deployed revisions.

## Private rollback checkpoint

Captured **2026-10-14 21:10:28 UTC**, before SMTP and MFA were enabled. A full
restore would revert these settings and all subsequent content/authentication
writes. This is an aging pre-change rollback set, **not a current monthly backup**.

Private off-host directory on the operator machine:
`~/.local/share/gvp-pocketbase-recovery/cutover-gfKgxzpJ/`

- `checkpoint.tar.gz`: **25,545,278 bytes**.
- Archive SHA-256: `a6f0e42a86cffb577e2cf473bc8cf0e94a901e24014dd20919edb85a3061e614`.
- Captured executable SHA-256: `ad89d227dfb3ed8c147a988ff27f101a2b22c373d6925b589d5e7bbd06157054`.
- Complete `pb_data`, actual deployed executable, hooks and historical migrations
  were captured with PocketBase stopped. Remote/local archive hashes matched.
- Directory also holds saved original/post-maintenance machine configurations,
  volume inventory, deployed-source archive, backend Git bundle, matching checked-in
  Fly config, and capture/rehearsal scripts/private results. **Saved actual machine
  configuration is authoritative**, not historical `fly.toml`.
- Capture target: machine `4d89070a404018`, volume `vol_re89nlggd6xqq15r`, `sjc`;
  image `registry.fly.io/pocketbase-fly-starter:deployment-01M4XAGGJPRX2NGNA434JGZ7KW`;
  deployed source `9183a9a352fe59f2f9bf29c7b2db44caddda3990`.

Before approved restoration, verify archive size/hash and captured executable
hash; consult the saved scripts/configuration privately. Keep the captured
executable, data, hooks and migration history paired. The checkpoint contains
private database settings: never put it, extracted data or raw logs in Git or
Actions artifacts/caches. No Fly application secrets were inventoried; any external
secret/encryption-key dependency needs independent private custody and review.

A local isolated rehearsal successfully started the exact captured runtime with
its matching data/history, checked both SQLite databases, all 20 stored files and
five referenced originals, and preserved main schema/records/auth and file bytes.
A separate fresh-copy rollback rehearsal passed after candidate migration testing.
Application processes had loopback-only networking and no outbound route. This
supports paired local restoration, **not** a production restore, OCI redeployment
rehearsal or guaranteed recovery time. Original production machine configuration
(including serve/autostop) was restored after capture and service checks passed.

No S3 copy or monthly verified marker was created. Recurring recovery and alert
activation remain gated in [backup operations](../infra/backups/README.md).
Refresh the checkpoint before later production changes when required; neither
MFA acceptance nor this checkpoint authorizes deployment/cutover.

## Separate unresolved cost check

It is unknown whether an SES Mail Manager ingress endpoint was created during
console navigation. Ask the owner before a separately approved resource/cost audit
or decommissioning. No ingress creation/deletion, shared credential rotation or
permission broadening is authorized. The `gvp-storage` CLI profile is backup-scoped,
not SES-capable; do not switch identities/accounts or expand it to investigate.
