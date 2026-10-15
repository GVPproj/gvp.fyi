# PocketBase backend

Custom **PocketBase 0.40.4**, shared with other consumers.

- [Build and local setup](server/README.md)
- [Likes API](contracts.md), [release publishing API](publishing-contract.md),
  [editorial publishing API](server/editorial/README.md)
- [Dashboard authoring](../docs/dashboard-publishing.md)

## Deployment

Production lives in sibling `../pocketbase-fly-starter`.
**Pushing to its `main` deploys production.** Frontend `main` deploys through
Netlify. Deployment requires owner approval; deploy the backend before frontend
changes that need it. Dashboard Save does not deploy the site.

Ship the custom executable, full existing migration history and all runtime hooks,
including other consumers' hooks. They are not embedded. A stock PocketBase binary
cannot replace the custom routes. Never replay applied migrations or replace shared
production history with this repository's local-fixture history.

Preserve `/pb/pb_data`, local originals in `storage`, settings and shared consumers.
Rehearse migrations and serve startup on an isolated restored copy with outbound
side effects blocked. Verify owner access, denied nonowner writes, draft/media
isolation and publication/withdrawal before rollout. Keep single-instance topology
(preview limits are process-local) and `NETLIFY_BUILD_HOOK` unset (manual deployment).

## Backup and recovery

No scheduled backup or verified recurring recovery service is maintained here.
Existing AWS backup resources are not managed by this repository; deleting local
scaffolding does not decommission them.

Before production changes, capture **complete `pb_data`, including storage**, plus
matching executable/image, hooks, migrations and deployment configuration. Stop
PocketBase before directory copies; copying running SQLite files is not a consistent
checkpoint. Keep credentials, backups and settings-encryption keys outside Git.
Private historical checkpoints live under `~/.local/share/gvp-pocketbase-recovery/`;
they are not current backups. Verify integrity and isolated restoration before use.

For rollback, stop writes and restore matching **data and code together**. Account
for writes since the checkpoint. Never run an old binary against an upgraded database
or use destructive down migrations as recovery. Built-in restore restarts the current
executable; it does not downgrade it. Allow at least twice the restored backup size
in free space. See [upstream backup/restore guidance](https://pocketbase.io/docs/going-to-production/).

Superuser sign-in uses password plus email OTP MFA. If email delivery fails, retain
any working dashboard session and obtain owner approval for recovery. Do not disable
MFA, recreate credentials or modify running SQLite as routine troubleshooting.

## Storage reconciliation

PocketBase saves uploads with records and cleans failed/replaced/deleted files.
Publishing snapshots retain independent copies indefinitely. A disconnect after
commit does not undo a Save: refresh before retrying.

After disk/permission/process faults, stop writes, back up, repair the fault and
reconcile all collection file fields against `pb_data/storage`. Preserve referenced
originals and thumbnails; quarantine only confirmed unreferenced paths before
reviewed deletion. Never use age-only cleanup or delete shared storage roots.
