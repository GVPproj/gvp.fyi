# Private editing and static publishing decisions

Status: **owner-approved decisions, 2026-10-12**. The owner approved unified Save/Publish semantics, the administration approach, normal removal delay, and monthly backups conditional on cheap/free operation on 2026-10-12; potential loss since the last recovery checkpoint is acceptable. The owner also approved private S3 originals and static Netlify delivery, with the S3 region chosen to suit the existing Fly backend and MP3 hosting unchanged. The owner approved a $5/month incremental AWS alert and a backup cost target under $1/month, included in that AWS total; ask before adopting a backup approach estimated at $1/month or more. Estimates and access must be verified before provisioning. Tracks [#5](https://github.com/GVPproj/gvp.fyi/issues/5), part of [#3](https://github.com/GVPproj/gvp.fyi/issues/3). Implementation tickets must implement the agreed choices below and verify the remaining operational prerequisites.

## Implementation checkpoint — 2026-10-13

#11 selected **`us-west-1` (Northern California)** for private originals against
verified Fly `sjc` placement, within the region-selection scope approved below.
[Current regional prices and explicit cost scenarios](research/s3-region-costs.md)
and [pinned runtime/recovery requirements](research/pocketbase-s3-runtime-recovery.md)
are research evidence, not provisioning or a verified all-in backup quote.
[Storage preflight](storage-preflight.md) records the current remaining gates.

#16 is closed for human non-root provisioning identity/intended scope; historical
root/setup-blocker language below is superseded. That policy does not grant
billing or IAM administration. Owner setup is isolated in
[#19 (spending alert)](https://github.com/GVPproj/gvp.fyi/issues/19) and
[#20 (runtime credentials)](https://github.com/GVPproj/gvp.fyi/issues/20).
Independent recovery, security/MFA, actual alert delivery and separate provisioning/
rollout approvals remain required. No production storage was changed.

## Agreed decisions

### Publication and drafts — agreed 2026-10-12

- Use the same **Save/Publish** behavior for Likes, releases, and software. All new items start as drafts: Save retains a private working version; explicit Publish creates a published snapshot eligible for the next successful deployment. Save alone never publishes.
- For already-published content, saving edits updates a private working version. Explicit publication creates a published snapshot; unrelated builds only read published snapshots. Existing published Likes remain published throughout migration.
- Snapshots include dependent metadata, named-collection membership, and retained file versions. Replacing/deleting a working file must not destroy the version referenced by a published snapshot. Builds use one coherent published revision rather than mixing records during concurrent edits.
- Unpublish and delete requests participate in the rebuild workflow. Failed fetches or builds preserve the last successful site; a successful build-hook HTTP request is not proof of deployment.

**Owner approved:** one consistent private-save/explicit-publish workflow for all content. This expressly changes the old Likes published-by-default behavior permitted by #5's owner-approval exception. Current Likes code still uses the old default; this records the target behavior, not an implemented change.

### Storage and delivery

- **Owner approved:** private Amazon S3 originals in the existing AWS account and static Netlify delivery. Choose the S3 region to suit the existing Fly backend after verifying its location; `us-west-2` is only the current CLI setting, not an adopted region. The [provider research](research/private-publishing-storage.md) favors R2 in isolation; S3 was selected because AWS access already exists and Netlify handles public delivery, reducing the benefit of adding another provider.
- Verified [AWS regional list prices](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/us-west-2/index.json) on 2026-10-12: S3 Standard in Oregon is $0.023/GB-month (first 50 TB), $0.005/1,000 writes/list requests and $0.0004/1,000 reads. For illustration, 1 GB + 10,000 writes + 100,000 reads is **$0.113/month**, excluding transfer, backups, versions, taxes and existing hosting. This is not a forecast or verified free-tier entitlement. Owner approved a **$5/month incremental AWS spending alert**, not a cap. Verify actual inventory, chosen-region pricing, transfer/request estimates, existing account usage and alert delivery before provisioning; this example does not establish the expected bill.
- Publish an allowlisted subset of files with the static Netlify deployment, including locally generated responsive images and any intentionally public Likes PDFs. Public HTML and these files must remain usable with PocketBase offline. Do not rely on runtime image transformations fetching a private/live PocketBase origin.
- **Owner approved:** keep existing MP3 hosting unchanged: the current EP's MP3s are already static files on Netlify, copied from `public/audio/watery-grave/`. They are not on a separate audio host. No CloudFront distribution, public bucket, custom media DNS, or audio migration is required.
- Private originals stay private: enable S3 Block Public Access, use authenticated/protected PocketBase file handling, and never include drafts, protected-file tokens, secrets, or private source payloads in public build output or logs.
- Build access should be a dedicated read-only published-snapshot API identity, including only files referenced by those snapshots. Do not use a PocketBase superuser or broad S3 reader in the site build. The backend's separate S3 credential needs bucket/prefix-scoped file-management permissions; implementation must verify the exact calls PocketBase needs.
- Treat PocketBase's storage setting as a migration affecting existing assets, not a per-new-collection switch. Inventory and preserve existing Likes and unrelated consumers before enabling it.

**Owner approved:** S3 with region selected to suit Fly, static Netlify delivery, and published media available with PocketBase offline. **Owner approved costs:** $5/month incremental AWS alert, with backups targeted under $1/month within that total; seek approval before adopting a backup approach estimated at $1/month or more. An alert is not a hard spending cap. Existing Netlify delivery and Fly costs remain separate from S3 storage/request charges.

### Private administration — agreed 2026-10-12

Retain the existing PocketBase hosting on Fly and its public HTTPS endpoint. Administration is owner-authenticated, not tailnet-only. The owner confirmed that this is the backend already in use and approved retaining this access model rather than introducing Tailscale as a migration prerequisite.

Before rollout, audit the deployed PocketBase version, superuser MFA, access rules, and protected-file handling. Verify authentication and authorization for both the dashboard and administrative API; hiding only `/_/` is insufficient. Preserve existing shared-backend consumers, and give builds narrowly scoped published-content read access, never superuser credentials. These security controls have **not yet been verified** in production.

Network-private administration remains a possible separate hardening change, not part of this migration by default. Making the entire service tailnet-only could break existing consumers and complicate Netlify builds; restricting administration alone would require additional routing and recovery work.

### Cache and removal semantics

- Normal visibility/removal latency is build queue + successful build/deploy + applicable cache lifetime, not immediate. No numeric end-to-end SLA is agreed yet.
- Use content-hashed immutable public assets; verify revalidation/deployment behavior for HTML. Never serve private authenticated responses through a public cache.
- Stop referencing removed assets in the replacement deployment. Old deploy URLs, CDN/browser caches, and downloaded copies can outlive it. Urgent removal requires investigating/purging host caches and old deploy artifacts as supported; no system can recall a visitor's downloaded copy.
- Saving a published record as private cannot retroactively privatize its former public version. Clearly distinguish editing privately from explicitly unpublishing.

**Owner agreed 2026-10-12:** normal deployment delay is acceptable, including the explained limits on recalling cached/downloaded copies. No bounded removal SLA was requested.

### Backup and recovery

Retain the existing [backup and rollback safety requirements](../pocketbase/README.md#backup-and-rollback-safety). Before migration/cutover, stop or coordinate writes and obtain a consistent database/local-storage backup plus an independent copy of external object files, matching code/hooks/migrations/configuration, and securely retained encryption keys. PocketBase backup ZIPs do not include S3-uploaded files. Verify inventories/checksums and rehearse restoration in isolation before switching production.

**Owner agreed 2026-10-12:** monthly automatic backups, retaining the latest **three successful recovery sets**, covering both the database and uploaded files, with notification on failure. Continue immediate backups before migrations or risky changes. Potential loss since the last checkpoint is acceptable: roughly a month of changes, or longer if backups fail. This is a deliberately small reopening of the previously declined recurring-backup work, targeting **under $1/month** for backups, included in the $5/month incremental AWS alert total. Ask before adopting an approach estimated at $1/month or more.

Until automation is implemented and verified, retain manual owner-triggered checkpoints and mandatory pre-change backups. Do not prune a valid recovery set because a new backup failed or is incomplete; verify replacement sets before retention cleanup. Preserve migration rollback sets separately until the owner authorizes their retirement. S3 versioning alone is not an independent backup.

**Follow-up:** select the simplest implementation of this policy, with estimated total cost, failure-notification destination and a restore test. Account for stored backup versions, requests, transfer and any scheduler/compute charges; do not promise a free tier or price without measuring backup size and checking account eligibility. Verify the under-$1/month estimate before enabling automation; escalate if it cannot be met. No guaranteed recovery-time target has been agreed. Backup destination, capacity, and access must be verified before migration; do not assume a historical archive still exists.

## Access and setup blockers

Read-only check on 2026-10-12: AWS STS succeeds, but the active CLI principal is the AWS account **root identity**. No AWS resources or policies were changed. Do not provision using that identity or copy it into application/CI configuration.

Before affected implementation proceeds:

| Requirement | Status / boundary |
| --- | --- |
| Owner decisions | Agreed; actual inventory/cost estimates, backup implementation and notification destination must be verified before rollout |
| Scoped non-root AWS provisioning identity | [Human setup #16](https://github.com/GVPproj/gvp.fyi/issues/16) blocks AWS provisioning in #11; authenticate locally, never paste keys into issues/chat |
| PocketBase access and production hosting administration | Not verified in this task; preserve the shared backend and coordinate with #1 |
| Administration security verification | Public HTTPS with owner-authenticated administration agreed; verify deployed version, superuser MFA, access rules and protected files before rollout. No tailnet prerequisite |
| S3 runtime credentials | Provision narrowly scoped credentials server-side using PocketBase's supported configuration; no `PUBLIC_` variables or Git secrets |
| Netlify build authorization and server-side build hook | Not verified/provisioned; separate published-read build access from build-trigger secret |
| Independent recovery storage and restoration access | Not verified; mandatory before migration |

AWS CLI availability does not establish Netlify/Fly/PocketBase authorization. Non-root authorization for the selected AWS approach is tracked in #16. No new provider signup or dashboard visit is presumed necessary. If MFA, account authorization, billing, or dashboard-only setup actually requires the owner, create a separate `ready-for-human` setup issue with the exact action and link it as a blocker to the affected implementation. Never request secrets in issue comments.

## Decision completion and implementation boundary

The owner decisions required by #5 are recorded here; `OBJECT-STORAGE.md` records the adopted provider/delivery choice. #5 can close as a decision task, not as deployed functionality. Actual inventory/cost estimates, region selection based on Fly's location, backup/notification configuration, access, security controls and restore verification remain implementation prerequisites under #3 and its implementation tickets. This record does not deploy code, provision infrastructure, migrate files, or remove the existing management UI. #16 blocks AWS provisioning in #11, not completion of #5.
