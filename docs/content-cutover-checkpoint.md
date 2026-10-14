# #21 fresh checkpoint and isolated recovery — 2026-10-14

The owner explicitly approved a brief shared-backend maintenance window for a
fresh recovery checkpoint. **No new application code was deployed, no content was
imported/edited, and no authentication settings were changed.**

## Capture and service restoration

Completed **21:10:28 UTC**, with a **41.2-second capture/resume/check cycle**.
The existing machine was initially autostopped. Used the same machine/volume/image:

- Machine `4d89070a404018`, volume `vol_re89nlggd6xqq15r`, region `sjc`.
- Image `registry.fly.io/pocketbase-fly-starter:deployment-01M4XAGGJPRX2NGNA434JGZ7KW`.
- Deployed source `9183a9a352fe59f2f9bf29c7b2db44caddda3990`.

Temporarily replaced the serve command with bounded maintenance on the existing
machine, with autostop disabled. The maintenance command included an independent
five-minute fallback to start the original serve command if the operator process
was lost. The capture process also restored the saved configuration in `finally`.
No concurrent backend Actions run was listed immediately before capture.

With PocketBase confirmed absent before and after archive creation, captured the
complete `pb_data` directory, actual deployed executable, hooks and migrations.
Downloaded into a private off-host directory and compared remote/local SHA-256.
Restored the original machine configuration **exactly**, including normal serve
and autostop. Health/dashboard/shared public reads and anonymous publishing/draft
access denial passed. Subsequent checks of the public Likes page and shared biolink
site returned 200. This is service/access verification, not owner login acceptance.

Private recovery material:
`~/.local/share/gvp-pocketbase-recovery/cutover-gfKgxzpJ/`

- `checkpoint.tar.gz`: **25,545,278 bytes**.
- Archive SHA-256: `a6f0e42a86cffb577e2cf473bc8cf0e94a901e24014dd20919edb85a3061e614`.
- Captured executable SHA-256: `ad89d227dfb3ed8c147a988ff27f101a2b22c373d6925b589d5e7bbd06157054`.
- Saved original/post-maintenance machine configurations, volume inventory,
  deployed-source archive, backend Git bundle and matching checked-in Fly config.
  The saved actual machine configuration is authoritative over historical `fly.toml`.
- Capture/rehearsal scripts, private logs and aggregate result JSON are alongside it.

No Fly application secrets were listed; the saved runtime command has no encryption
key argument and configured environment key names were only process/region metadata.
Private database settings remain inside the protected checkpoint, not in Git/logs.

## Isolated recovery and migration

Completed **21:13:13 UTC**. Successful local rehearsal took **4.3 seconds**, not a
production recovery-time guarantee. Used separate extracted baseline, old-runtime,
candidate and rollback copies. All application processes ran in a new network
namespace with loopback only and no outbound route, sanitized environment and no
Netlify hook. Production SMTP/OAuth/hooks could not reach the network.

- SQLite integrity checks passed for main and auxiliary databases.
- Checked all **20 stored files** byte-for-byte, including stored sidecars/variants;
  all **five referenced originals** existed.
- Started the **exact captured executable** against its matching data/hooks/history;
  all main-database records/schema/auth and all stored files remained unchanged.
- Started the reviewed fixed candidate with the three pending forward migrations
  added to the full captured historical migration directory. All unrelated records,
  authentication data, existing snapshots, unrelated collection definitions and file
  bytes were preserved. Ordered tracks and publication state transformed as specified.
- Exactly three migrations and two locked editorial collections were added; no
  editorial records or snapshots were implicitly seeded. Existing track records were
  transformed into release JSON, not silently discarded.
- Extracted another fresh copy and restarted the captured old executable with its
  matching original data/code/hooks. Full main-record/schema/auth and stored-file
  comparisons passed. No down migration and no old binary against upgraded data.

This proves local paired executable/data restoration and migration compatibility.
It does **not** claim a production restore, an OCI-image redeployment rehearsal,
all-content import rehearsal on this fresh data, live dashboard acceptance or MFA.

Two initial isolation-harness checks stopped before extraction/startup: reading
PID 1's namespace was denied, and the inherited sysfs mount showed host interfaces.
The corrected harness compares against the captured parent namespace and verifies
actual namespace links/routes with `ip`; no network-isolation assertion was waived.

## Remaining gates and current security observations

Read-only inspection of the fresh checkpoint confirms superuser password auth is
enabled; OTP, OAuth and MFA are disabled. SMTP is disabled although a host is
configured. Existing mail configuration was not replaced and no email was sent.
Before MFA enforcement, verify the owner's chosen second method actually works,
retain an authenticated session and rehearse recovery. Any auth/mail-setting change
requires the next explicit owner-attended approval.

The checkpoint is off the production volume on the operator machine. **No S3 copy
or verified monthly marker was created.** A read-only AWS check authenticated to the
expected account, but the current provisioning role denied
`s3:GetBucketPublicAccessBlock`; no permission expansion or alternate identity was
used. Existing bucket/role/watchdog provisioning history remains in
[backup preflight](backup-only-preflight.md), not evidence of active recovery automation.

Still outstanding: recurring verified off-host recovery/alerts, fresh-data additive
import reconciliation, owner-attended MFA, restricted build credentials, accepted
live dashboard tasks and concrete backend-first deployment approval. This checkpoint
will age as normal writes resume; refresh it before later production changes when
needed. No issue closure or production cutover acceptance is claimed.
