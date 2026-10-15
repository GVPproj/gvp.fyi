# Content cutover

Tracking: [#21](https://github.com/GVPproj/gvp.fyi/issues/21).
**Not deployed or ready to cut over.** This is the rollout checklist, not a live-state audit.

## Current state

- Content candidate committed on feature branches: frontend `0f549de`, backend `c2998c6`. Subsequent backup safety components: frontend `f42c96d`, backend `1f88ab2`.
- Catalogue, editorial and static Likes implementation has passed targeted import, dashboard, migration and build rehearsals. A green final monolithic browser suite is not established; unrelated ambient failures remain in #17.
- A complete off-host checkpoint and isolated old-runtime restore, forward migration and paired rollback rehearsal passed. See [checkpoint](admin-recovery.md#private-rollback-checkpoint). Refresh after intervening writes.
- Superuser MFA and owner recovery/shared-consumer acceptance are complete (#18).
- Recurring backups are **not operational**. Local recovery work now includes normalized capture, isolated captured-runtime HTTP/preservation verification, and promotion/alert composition. Real Fly/AWS execution, unattended workflow activation and deployed alerts remain unproven. See [backup implementation and activation gates](../infra/backups/README.md).
- Last recorded production state: old release-dashboard trial on Fly; Netlify still builds the legacy frontend from `main`, without publishing credentials/configuration.

## Rollout gates, in order

### 1. Recurring recovery deferred — not a cutover gate

Owner direction: finish the pre-launch blog/CMS migration simply; existing content is not precious. Recurring backup automation, sandbox/transport development, retention and alert activation are deferred, not completed. Preserve the unfinished recovery work without including it in the deployment candidate. Do not provision more infrastructure for this cutover.

Use one manual off-host checkpoint before changing the shared backend, primarily to preserve authentication/configuration and unrelated consumers. No monthly recovery or alerting guarantee is claimed. The existing CMS implementation and native dashboard remain the scope; no new migration framework is needed.

### 2. Freeze and rehearse the candidate

- Record exact frontend/backend commits and verify synchronized runtime, hooks and migrations. Preserve unrelated shared-backend work.
- Run Go race tests, backend deployment checks, required import/upgrade/dashboard/static-build suites, typecheck and default/full-content builds. Required integration tests must run rather than skip.
- Run browser/build suites serially in an isolated workspace; concurrent Astro servers/builds can corrupt generated state and invalidate results.
- Rehearse the [additive imports](import-editorial.md) against a fresh isolated copy of actual data. Explicitly reconcile existing Watery Grave and published Likes; do not blindly reimport or implicitly publish drafts.

### 3. Approve the maintenance window and checkpoint

Obtain explicit approval for the immediate shared-backend interruption, exact candidate, import writes, credential/configuration changes and deployment. Scope approval is not execution approval.

Freeze writes and competing deployments. Capture all `pb_data`, matching executable/image, hooks, migrations and recoverable configuration; retain keys separately. Download off-host, compare hashes and restore in isolation with outbound effects blocked. Verify records/auth, SQLite integrity, file references and stored bytes. Retain a separate old-runtime/original-data rollback pair. Recheck volume headroom, allowing for capture, imports and retained media.

### 4. Deploy backend, import and accept the dashboard

- Use the existing Fly app/volume and test-gated deployment; no extra replicas or replacement volume. Backend `main` pushes deploy production.
- Verify actual startup, image/version, applied migrations, health, protected-file denial and shared consumers—not only CI success.
- Execute only the rehearsed imports under their required exclusivity. Reconcile ambiguous timeouts before retrying. Compare preserved records/files/auth and take a post-import checkpoint.
- Owner accepts release, software and representative Likes editing/file replacement, draft creation, Published Save, withdrawal and deletion in the real dashboard.

### 5. Configure and deploy the static frontend

- Create a restricted `publishing_builds` identity, never a superuser. Verify eligible-snapshot/media access and rejection of drafts, working-record access and mutation.
- Enter server-only `PUBLISHING_POCKETBASE_URL`, `PUBLISHING_BUILD_EMAIL`, `PUBLISHING_BUILD_PASSWORD` and `PUBLISHING_CONTENT=true` into the existing Netlify site with approved build/context scopes. Keep credentials out of `PUBLIC_` variables, browser output and logs. Leave `NETLIFY_BUILD_HOOK` unset.
- Frontend `main` is the production branch: review auto-publish behavior before merging. Saving content and deploying remain separate actions.
- Check an unpublished artifact: routes, content/order, MP3 URLs, images/downloads, draft exclusion, mobile/accessibility and owner visuals. Block backend requests in an isolated browser to prove public content/media remain usable offline. Verify failed fetch/auth/build preserves the last good deployment.
- Publish the approved revision manually, verify the actual public site and shared consumers, then record deployed identities and owner acceptance in #14/#21. Retire app editing only after replacement acceptance; preserve unrelated backend consumers.

## Stop and rollback

Stop on unexpected data/schema/file differences, failed recovery, inadequate space, secret exposure, shared-consumer regression or unclear revision provenance.

- **Frontend:** restore the recorded last-good Netlify deployment and compatible configuration. Clearing publishing variables is not a general content rollback.
- **Backend:** freeze writes, reconcile post-checkpoint edits, restore complete matching data/storage **and** old executable/image/hooks/configuration. Never run an old binary against upgraded data or use destructive down migrations.

Preserve recovery sets and existing resources. Resource deletion and credential revocation require separate approval.
