# Content cutover

Tracking: [#21](https://github.com/GVPproj/gvp.fyi/issues/21).
**Live on 2026-10-15.** The owner explicitly approved the maintenance window,
manual checkpoint, backend deployment/import and Netlify configuration/deployment.

## Deployed state

- Backend: `c2998c660ac4daa7fd21a881b5e347bf51c96498`, successful
  [test/deploy run 38755301527](https://github.com/GVPproj/pocketbase-fly-starter/actions/runs/38755301527).
  Existing Fly machine `4d89070a404018`, existing volume and PocketBase 0.40.4 retained.
  Image: `registry.fly.io/pocketbase-fly-starter:deployment-01M5010C4BMZCVBFNJBZ2CG82W`.
- Frontend: `d16381e2f035a593c17cf0a8db055897524b93c8`, Netlify production
  deployment `6ad0ec270f191f785ceb80e9`, at <https://gvp.fyi>.
- Imported/published: **36 releases / 138 tracks and artwork**, seven software
  projects / ten images, one blog article, site settings and three existing
  published Likes. Watery Grave was reconciled in place, retaining its identity
  and previous snapshots. Existing Likes were saved without changing their content.
- Restricted `publishing_builds` identity configured; no superuser build credentials.
  Working-record reads, mutation and administrative inventory are denied to it.
  Superuser MFA remains enabled; shared records and the existing superuser are unchanged.
- Full static content mode is enabled. Public pages/media do not require PocketBase.
  `/login` and `/likes/manage` are static redirects to `/likes`; unrelated shared
  backend consumers and legacy rollback code remain intact.

## Verification and operational notes

Fresh off-host checkpoint, captured-runtime restore, candidate migration and paired
rollback passed before deployment. Fresh-copy imports, actual remote-artwork capture,
Go race tests, deployment checks, catalogue integration, editorial import, typecheck
and default/full-content builds passed. Preview and public browser checks covered
six page types, mobile release display and media with external/backend requests
blocked, without browser errors. All live releases were compared to repository
source and their public routes checked. This is not a claim that the unrelated
full ambient/browser suite in #17 is green.

Netlify's free plan does **not** support build-only environment scopes. A first
Git-triggered deployment used legacy mode because the CLI silently failed to set
those scopes. Corrected configuration was read back through the API and rebuilt:
all four `PUBLISHING_*` variables are production-context only, using free-plan
server-side scopes; the password is marked secret and excluded from post-processing.
No `PUBLIC_` credentials, plan upgrade or new infrastructure. Public output was
checked for credential leakage. Do not trust `env:set` exit status alone.

**Routine workflow:** edit in the native PocketBase dashboard, Published + Save,
then manually deploy the current `main` branch in Netlify. Save does not trigger a
build; `NETLIFY_BUILD_HOOK` remains unset. MP3 uploads/replacements remain in Git at
their existing URLs. See [authoring](dashboard-publishing.md).

Owner hands-on dashboard/visual acceptance remains to be confirmed; automated
checks are not owner acceptance. No further migration framework is needed.

## Deferred recovery work

Per owner direction, recurring backups, sandbox/transport development, retention
and failure/missed-run alerts are **deferred, not completed**, and are not launch
blockers. Unfinished local recovery changes are preserved and were not deployed.
No unattended workflow or schedule is active. The manual checkpoint protects the
pre-cutover shared-backend state; it is not a recurring recovery guarantee.

## Rollback

See [private checkpoint custody](admin-recovery.md#latest-pre-cutover-checkpoint).
The pre-cutover frontend deployment is `6ac94d3bf6bb2a0008156a50`; its saved Netlify
configuration is retained privately. Restore a known-good deployment with its
compatible configuration; merely clearing publishing variables is not content rollback.

For backend rollback, freeze writes and restore the complete matching pre-cutover
data/storage **and** captured old image/executable/hooks/configuration. This loses
subsequent imports/edits; reconcile shared-consumer writes first. Never run an old
binary against migrated data or use destructive down migrations. Preserve existing
resources and checkpoint files; deletion/revocation requires separate approval.
