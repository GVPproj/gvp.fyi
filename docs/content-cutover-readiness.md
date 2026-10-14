# #21 content cutover: operational readiness

Investigation: **2026-10-14, approximately 17:34–17:39 UTC**. Read-only remote inspection; this document is the only owned change. **Not ready for production cutover yet.** Existing infrastructure is sufficient for the next rehearsal; no new Fly app, volume, application-file S3 bucket or publishing control plane is needed.

## Scope and authority

The owner approved implementing/migrating releases and artwork, software, Likes, blog prose, navigation/site metadata and placeholder copy. Manual Likes editing is acceptable; dashboard URL-preview acquisition and duplicate warnings need not be reproduced. MP3s, executable blog demos, SVG/design assets, instrument sounds and behavior-related UI copy remain repo-managed. These decisions supersede the outstanding scope questions in older planning documents ([#21 comments](https://github.com/GVPproj/gvp.fyi/issues/21)).

Implementation/cutover direction is approved, **not blanket permission to execute every operational action**. This investigation did not deploy, stop machines, alter settings/data, create credentials, provision paid resources, delete resources, or publish issue comments. It used existing CLI access, anonymous HTTP GETs, and Fly Machine exec for version/disk/checksum/environment-presence reads. No secret values or private content were printed. Public health requests can wake the existing autostopped machine.

Keep local originals on `/pb/pb_data/storage`; use native PocketBase dashboard editing, persistent Published + Save, retained coherent revisions, static Astro/Netlify delivery and manual Netlify deployment. Save is not deployment. Preserve the shared backend and existing consumers. See [domain vocabulary](../CONTEXT.md), [current plan](dashboard-publishing.md), [backend operations](../pocketbase/README.md), and [#14 rollout gates](https://github.com/GVPproj/gvp.fyi/issues/14).

## Freshly verified

### Access and deployment configuration

| Check | Observation this session | Limit |
| --- | --- | --- |
| GitHub CLI | `gh` 2.94.0; issue and backend Actions reads succeeded | No workflow triggered; token privileges not exhaustively audited |
| Fly CLI | `fly`/`flyctl` 0.4.116; machine/volume inventory and read-only exec succeeded | No deployment authorization inferred |
| Netlify CLI | 27.0.1; authenticated site and environment-metadata reads succeeded | No configuration/deploy action performed |
| Local Netlify linkage | `.netlify/state.json` contains geolocation only, no site ID | Do not run an unqualified deploy or relink by assumption |
| Local build environment | `.env` contains only `PUBLIC_POCKETBASE_URL`; no inherited Fly/Netlify/PocketBase/publishing credential variables found by key-name inspection | CLIs have their own stored authentication; absence from process environment does not mean no access |

**Fly:** app `pocketbase-fly-starter`, one started machine `4d89070a404018` in `sjc`; shared CPU, 512 MiB. Encrypted 1 GiB volume `vol_re89nlggd6xqq15r`, mounted at `/pb/pb_data`. Snapshot retention metadata is five days, not durable recovery. Local `fly.toml` still names primary region `sea`; actual placement remains `sjc`. Live service has autostop/autostart enabled and minimum running machines zero.

- Live binary reports **PocketBase 0.40.4**.
- Image: `registry.fly.io/pocketbase-fly-starter:deployment-01M4XAGGJPRX2NGNA434JGZ7KW`.
- Digest: `sha256:2adfaddf4d4ae761487339cb5100afa530fe27e6ead86210e5be476e90303c18`.
- Image label identifies backend commit `9183a9a352fe59f2f9bf29c7b2db44caddda3990`. Latest listed deploy run [38573509809](https://github.com/GVPproj/pocketbase-fly-starter/actions/runs/38573509809) succeeded.
- All three live hooks and ten migration files match the sibling checkout's corresponding files by SHA-256. Live migration files end at `1782172800_release_unpublish.js`; **`1782259200_release_toggle.js` is absent**. This corroborates the old deployed workflow. File presence alone does not prove applied schema/history.
- Live command is normal `serve`, with explicit `/pb/pb_data`, `/pb/pb_hooks`, `/pb/pb_migrations`; not the historical maintenance `sleep infinity` command.
- `NETLIFY_BUILD_HOOK` is unset. Preserve that state.
- `df -k /pb/pb_data`: 1,009,132 KiB total, 4,792 KiB used, **935,732 KiB available (~914 MiB)**. This is current headroom, not a future growth/restore guarantee.

**Netlify:** existing site `gvpfyi`, ID `7264bd2a-6634-441c-b8cd-3e9652d77fd2`, serving `https://gvp.fyi`.

- Connected repository `GVPproj/gvp.fyi`, branch **`main`**, build command `pnpm build`, output `dist`, no base directory.
- Published deployment **`6ac94d3bf6bb2a0008156a50`**, state `ready`, source `422a06db6b75e5c6c204b413b8f642263bd88d21`, published 2026-10-09 20:23:50 UTC.
- Environment API returned only `NODE_VERSION` and `PUBLIC_POCKETBASE_URL`, both with all contexts. No `PUBLISHING_POCKETBASE_URL`, `PUBLISHING_BUILD_EMAIL`, `PUBLISHING_BUILD_PASSWORD` or `PUBLISHING_CONTENT` entries were returned. Values were withheld.
- Thus the production build is **not configured for the publishing source**. This observation is stronger than the historical statement “Netlify unchanged,” but is not an audit of every possible build plugin or external secret source.

### Health and anonymous access

At `https://pocketbase-fly-starter.fly.dev`:

| GET | Status |
| --- | --- |
| `/api/health`, `/_/` | 200 |
| `/api/collections`, `/api/settings` | 401 |
| `/api/collections/_superusers/records` | 403 |
| `/api/collections/publishing_releases/records`, `/api/collections/publishing_snapshots/records` | 403 |
| `/api/collections/bioLinks/records?perPage=1`, `/api/collections/likes_items/records?perPage=1` | 200 |

`https://gvp.fyi/likes/` and `https://links.grahamvanpelt.com` returned 200. These are reachability/access-denial checks, **not** content equality, authenticated editing, MFA, draft-file denial, or browser acceptance tests. No current private record inventory was taken.

### Repository state is not a release candidate

Source branch `publishing/dashboard-local-storage`, HEAD `d3d32f69fa7439e066dbe50d3f539c15e40f9073`. Sibling backend branch `upgrade-pocketbase-likes`, HEAD `0f3d5cc3ba1ebb1f34c8caa7276da58ac2e0c823`.

The source already commits the local toggle implementation (`23e0ae2`); the sibling has uncommitted toggle/runtime/importer/test/workflow changes and an untracked toggle migration. During this investigation, other work actively added/modified catalogue/editorial migrations, runtime, import/build scripts and static Likes/frontend files in the source tree. In particular `1782345600_release_catalogue.js`, `1782432000_editorial.js`, `scripts/import-catalogue.mjs` and `scripts/published-content.mjs` appeared. **Do not interpret older “tracer only” docs as a complete inventory of this moving working tree, or these new files as verified implementation.** No edits to that work were made here; no suite was rerun against it.

The inspected sibling workflow deploys on pushes to `main`, after tests, using `flyctl deploy --remote-only --update-only --ha=false`; pull requests run tests only. The workflow itself is dirty. **A push/merge to backend `main` is a production action**, not a harmless way to checkpoint work. Likewise, the Netlify production branch is `main`; do not assume merging frontend work is inert. Review exact committed workflows/configuration before scheduling either change.

## Historical evidence — not newly established acceptance

Primary operational history is in [sibling rollout notes](../../pocketbase-fly-starter/docs/publishing-release-rollout.md), [backend README](../../pocketbase-fly-starter/README.md), [storage preflight](storage-preflight.md), and [release rehearsal](release-publishing.md).

- Earlier real-data rehearsal preserved unrelated records/authentication and files, deployed the old Publish/Unpublish workflow, and imported Watery Grave as a private release with five separate track records. It recorded zero snapshots/build identities then. **Current private state and owner edits have not been rechecked.** Do not reimport Watery Grave blindly.
- Historical `_superusers` MFA was **disabled**. This session did not inspect the private authentication configuration or attempt login; current MFA enforcement remains unverified. Anonymous 401/403 does not satisfy [#18](https://github.com/GVPproj/gvp.fyi/issues/18).
- Application-file S3 and backup S3 were historically disabled. Current database settings were not read. Do not enable S3 or assume SMTP/OTP delivery is configured.
- Prior local toggle suites report 17 publishing tests, Go race tests and backend smoke checks passing. Those results do not validate the concurrent all-content implementation, a fresh real-data migration, or this production deployment.
- Historical off-host directory `~/.local/share/gvp-pocketbase-recovery/dashboard-xFEBRy/` **exists now**. The pre-change `pb-data.tar.gz` is 2,940,571 bytes, SHA-256 `ec09c362ec5a7d727f3482366194f5547f4271877ce238d4c4eb962e4adf8a47`; post-import `live-after-draft.tar.gz` is 2,980,189 bytes, SHA-256 `75bcbd2d2303c8d7a4a5f01d82fd902665646f465a5d57f4368d9e88f5a746f1`. Hashes were computed this session, not compared against a newly authenticated remote manifest. Matching-image/configuration files and a Git bundle are present by filename; their recoverability was not revalidated. Archive presence/hash is **not a restore test or a fresh checkpoint**.
- The older pre-upgrade archive under `~/.local/share/gvp-pocketbase-restore/` also exists; it predates later changes and is not a current rollback target.
- No evidence of implemented monthly complete-backup scheduling, three-successful-set retention, or tested failure/missed-run notifications was found in the reviewed deployment workflow/runbooks. No global account-wide scheduler audit was performed.

## Blockers and required involvement

| Gate | What resolves it | Who/authority |
| --- | --- | --- |
| Stable deployable candidate | Freeze source/backend commits; review complete migration/hook/runtime synchronization and concrete import plan; rerun all tests | Agent/local work permitted; do not overwrite concurrent changes |
| Fresh recoverable checkpoint | Coordinated shared-backend write freeze, complete off-host data/storage archive, matching image/config/code, isolated restore and migration comparison | Explicit maintenance window/production-action approval; not performed here |
| Superuser MFA (#18) | Owner-attended second-method, successful/rejected auth and recovery verification | Human presence plus explicit auth-setting authorization |
| Recurring recovery | Select existing/private off-host destination, runner, custody and notification destination; demonstrate schedule, restore, failed and missed-run alerts | Owner chooses/approves destination and credentials; paid provisioning forbidden here; ask at **$1/month or more** |
| Restricted build identity | Provision a dedicated `publishing_builds` identity only after scope/security tests; enter server-only Netlify settings privately | Separate credential/config authorization; none created here |
| Real dashboard acceptance | Release, software and representative Likes edit/upload/draft/publish/withdraw tests; shared biolink/legacy consumers preserved | Owner acceptance, with specifically approved smoke writes |
| Frontend cutover | Backend-first verified revisions, static media/offline proof, failed-build preservation, last-good deploy/rollback | Concrete deploy approval after gates; broad scope approval does not bypass this read-only task |

Do not reopen retired S3 originals provisioning/billing/IAM tickets as hidden cutover prerequisites. Existing provider/runner facilities are preferable to bespoke infrastructure. No resource deletion, credential revocation, new paid runner/storage, or account-wide infrastructure changes are authorized.

## Ordered next steps (runbook, **not executed**)

### 1. Freeze and prepare locally

1. Coordinate with the implementation owner and record exact source/backend candidate SHAs and dirty-tree resolution. Preserve all unrelated backend migrations/hooks, the existing volume, current settings and single-instance topology. Review new catalogue/editorial migrations and importers, including conflicts with existing published Likes and Watery Grave. Do not use the old one-release importer as an all-content migration tool.
2. Build custom PocketBase 0.40.4 from the candidate; retain the **old deployed custom binary/image** for upgrade tests and paired rollback. A stock binary is insufficient. Neither `migrate up` alone nor copying migrations installs Go routes.
3. Run the existing documented suites plus new slice-specific tests. Baseline commands from repository root (local fixtures only):

   ```sh
   (cd pocketbase/server && go test -race ./...)
   (cd pocketbase/server && go build -trimpath -o /tmp/gvp-cutover-pocketbase .)
   POCKETBASE_BINARY=/tmp/gvp-cutover-pocketbase pnpm test
   pnpm check
   pnpm build
   # Supply actual pre-toggle custom binary and Chromium paths, not placeholders:
   OLD_POCKETBASE_BINARY=/path/to/old-custom-pocketbase \
     POCKETBASE_BINARY=/tmp/gvp-cutover-pocketbase \
     node --test tests/publishing-upgrade.test.js tests/publishing-migration-failure.test.js
   POCKETBASE_BINARY=/tmp/gvp-cutover-pocketbase \
     PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium \
     node --test tests/publishing-build.test.js tests/publishing-workflow-browser.test.js
   ```

   Reject skipped required integration/browser checks as acceptance evidence. Run sibling Go/Python/image tests from its README against the exact synchronized candidate. Record unrelated known failures separately rather than silently waiving new regressions.

### 2. Obtain a fresh complete checkpoint and rehearse

1. Approve a shared-consumer maintenance window. Prevent dashboard/app writes and competing deployments/restarts. Record machine configuration, image tag/digest, full matching source/hooks/migrations, volume identity and last-good Netlify deployment outside Git. Retain any settings-encryption key separately and securely; never print runtime environments or raw settings.
2. Choose the capture method explicitly. The known successful historical method is **quiescent full-directory capture on the existing machine**: stop the PocketBase process under coordinated maintenance, keep the machine available with the reviewed maintenance command, archive all `/pb/pb_data`, then download to a private off-host directory and compare remote/local SHA-256. Do not try SSH/exec into a stopped Machine. Do not copy a running SQLite directory and call it transactionally consistent. This requires production stop/config/write authorization and is forbidden during this investigation.
3. A native PocketBase backup ZIP can be considered under the existing recovery policy instead, but invoking it is a production write and needs authorization. It includes local uploads, excludes local backup archives and any S3-uploaded files; retain separate matching deployment material. Confirm settings and full-set completeness before choosing it. Schema exports and expiring Fly snapshots alone are insufficient.
4. Restore the checkpoint into a **separate private local directory**, never over live data. Bind loopback only and block/stub production outbound effects (email, OAuth, hooks, cron, S3 writes). Do not expose a restored admin dashboard publicly or create replacement production credentials. Verify SQLite integrity, all collections/records/auth hashes, referenced originals, thumbnails, `.attrs` sidecars and retained snapshots. Keep private comparison manifests outside Git; report aggregates only.
5. On independent restored copies, test old serve startup, candidate migration and actual candidate serve startup with the complete historical directories. Compare before/after state: preserve old publication/media without accidentally publishing working edits; preserve IDs, slugs, track order/audio URLs, unrelated records and auth; exercise migration refusal and rollback. Existing historical migrations are **not** a clean-empty-database bootstrap.
6. Rehearse the concrete all-content import additively. Existing matching records/snapshots must be explicitly reconciled, not deleted to bypass collision checks. The [old importer](import-release.md) intentionally refuses an existing Watery Grave slug and requires exclusive offline maintenance; its HTTP sibling is loopback-only. Neither should be casually pointed at production. Verify draft defaults, preserved currently published Likes, links/order/alt text, local protected files and snapshot retention across replacement/deletion.
7. Test a full paired restoration with the matching old image/code, not just database readability. Record restoration duration and required disk space. PocketBase's pinned restore guidance recommends at least **2× restored backup size** free; also budget current data, imports and retained snapshot growth. Recheck volume usage immediately before deployment. No paid expansion without approval.
8. Resume normal service with the explicit original `serve` command and verify it; Fly configuration updates may merge an empty `init` rather than clear `sleep infinity`. Check health, shared reads and approved owner login. Preserve the checkpoint independently of short-lived volume snapshots.

### 3. Resolve MFA and recurring recovery before cutover

- Follow [#18](https://github.com/GVPproj/gvp.fyi/issues/18) with the owner: preserve an authenticated session and current recovery checkpoint; verify two usable enabled auth methods and actual delivery/access before enforcement. If using email OTP, confirm SMTP delivery first without replacing existing SES/shared-consumer configuration casually. Verify MFA applies to all superusers (no rule bypass), successful clean-session login, rejected password-only/incomplete/invalid challenges, administrative API protection and recovery. Keep OTPs/passwords/tokens out of chat/logs. Do not silently change `users` or `likes_owners` auth policy.
- Use a simple existing scheduled facility and approved off-host storage for monthly complete recovery sets. Determine runner/destination/notification ownership and total cost first. Fly autostop means an in-process monthly cron alone is not reliable evidence of execution; include external missed-success detection. Retain three **verified successful** sets, never evict a good set after failure, and retain migration rollback sets separately. Test backup failure, absent-run notification and isolated restore. A manual checkpoint is useful but does not fulfill this gate.

### 4. Backend-first deployment and import

After the preceding evidence and concrete revision/smoke-write approval:

1. Refresh the checkpoint if writes occurred since rehearsal. Deploy the reviewed backend using its existing test-gated process and `--update-only --ha=false`; no new replicas/volumes. Keep all hooks/history and `/pb/pb_data`. Do not push to `main` merely to obtain CI before this approval.
2. Request health to ensure the autostopped app has actually started; the historical rollout caught a deployed image whose migrations had not run until startup. Verify version/image, migration results and routes, not just CI success.
3. Execute only the rehearsed, approved content import under its required maintenance/exclusivity model. Verify preserved shared data/files/auth and new content using private aggregate comparisons; take a post-import checkpoint. Do not rerun additive importers blindly after a timeout.
4. Perform the scoped owner acceptance checklist in the actual dashboard. Validate hooks on administrative saves, not just app endpoints. Preserve ordinary shared-consumer behavior and private file denial. Keep old app editing until replacement acceptance and dependency audit.

### 5. Scoped build credentials and manual Netlify cutover

1. With separate authorization, create a restricted `publishing_builds` identity (not a superuser or Likes owner). Verify it cannot read drafts/working collections, manage identities or mutate records; it may only read eligible snapshots/retained media through the intended custom routes.
2. Enter `PUBLISHING_POCKETBASE_URL`, `PUBLISHING_BUILD_EMAIL`, `PUBLISHING_BUILD_PASSWORD` privately in the **existing site**, scoped to authorized builds/contexts. Never use `PUBLIC_` for these secrets. Confirm the frozen candidate's full-content opt-in (`PUBLISHING_CONTENT=true` is appearing in current work; its final contract is not validated here). Do not enable a partially configured/tracer-only build for all content. Keep `NETLIFY_BUILD_HOOK` unset.
3. Review Netlify Git branch/auto-publish behavior before merging; manually trigger the approved source revision through the existing Netlify UI rather than inventing trigger machinery. First verify an unpublished preview/local artifact: all agreed routes, draft exclusion, explicit withdrawal, optimized responsive images/downloads, preserved MP3 URLs, sanitized public output/logs, mobile/accessibility and owner visuals.
4. Prove public HTML/media work with PocketBase unavailable **in isolation or with browser network blocking**, not by stopping production for a test. Prove failed authentication/fetch/validation/build does not replace the last good deployment; missing records/errors must not mean withdrawal. Check static Likes has no runtime backend dependency.
5. Record the previous published deploy ID/settings privately, then publish the approved artifact/revision. Verify the actual public site and shared consumers. Record source/backend/image/deploy IDs, checks and owner acceptance in #14/#21. Retire redundant login/editing UI only after accepted replacement; preserve unrelated backend auth/routes and the local login/session ticket until reconciled.

### 6. Rollback and stop conditions

Stop on unexpected schema/history, record/file differences, failed recovery, insufficient headroom, unverified MFA, credential leakage, shared-consumer regression or unclear candidate provenance.

- **Frontend:** restore the last known-good Netlify deployment and its compatible build configuration. An old checked-in content fallback may be stale after broader migration; do not treat clearing publishing variables as a general data rollback. Removed content may persist in old deployments/caches/downloads.
- **Backend:** freeze writes; reconcile post-checkpoint changes; restore **complete matching data/storage AND old image/code/hooks/configuration** under maintenance. Never run destructive down migrations, drop fields as rollback, or point an old binary at an upgraded database. Native data restore restarts the current executable and does not downgrade it.
- Preserve rollback archives and resource identities. No deletion of working records, retained snapshots, cloud resources or credentials as “cleanup” without separate review/approval.

## Evidence reproducibility and limits

Read-only commands used included `gh issue view`, `gh run list`, `fly machine list --json`, `fly volumes list --json`, `fly machine exec` with version/`df`/`sha256sum`/variable-presence checks, and Netlify API `listSites`/`getEnvVars` with **allowlisted output only**. Do not emit raw API objects, `.env`, CLI credential stores, machine environments, backup contents or private settings. Netlify's local state was not linked; site discovery used authenticated reads. `fly machine status --json` is unsupported in this installed CLI; machine-list JSON supplied the configuration instead.

No fresh DB inventory, restore rehearsal, authenticated MFA check, production smoke write, test-suite run or deploy was performed. No background-agent tool was available; research was conducted directly. The moving source tree and point-in-time remote observations require rechecking before execution.
