# Issue reconciliation — local dashboard publishing

Reconciled against [#21](https://github.com/GVPproj/gvp.fyi/issues/21), including its owner-feedback comment approving Published-toggle/Save semantics. This is issue bookkeeping, **not implementation, deployment, production acceptance or a fresh infrastructure audit**.

## Scope and evidence read

Read `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, `CONTEXT.md`, `docs/publishing-decisions.md`, `docs/dashboard-publishing.md`, `docs/storage-preflight.md`, and `tickets/10-dedicated-login-and-session-controls.md` before changes. Retrieved full bodies/comments for #3, #11, #19, #20, #6, #8, #10, #12, #13, #14, #15, #18, #1 and #21 with `gh issue view --comments --json number,title,body,comments,state`.

The reconciliation subtask owned this file and issues other than #21/#9; the coordinating session subsequently completed parentage, status and documentation updates recorded below. No application code, local login ticket, cloud resources, credentials, budget, deployments or Git history changed.

## Closures (verified)

Only these four issues were closed, all with GitHub `state_reason: not_planned`. Historical bodies and earlier comments were preserved.

| Issue | Explanatory comment | Scope disposition |
| --- | --- | --- |
| #3 | [Supersession](https://github.com/GVPproj/gvp.fyi/issues/3#issuecomment-6174163032) | #21 replaces the S3-led epic. Catalogue/Likes workflow, static output, optimization, URLs/accessibility, draft privacy, retained revisions/media, security, recovery and staged acceptance remain required. Current toggle/Save, manual Netlify and repo-managed MP3 decisions supersede the old workflow. |
| #11 | [Scope transfer](https://github.com/GVPproj/gvp.fyi/issues/11#issuecomment-6174163942) | Local capacity checks; complete off-host database/file/sidecar/retained-media recovery; inventories/checksums; isolated restore and paired rollback; monthly automation, three successful sets and failure/missed-run notification; pre-change checkpoints; under-$1 target; MFA/rules/protected-file/shared-consumer checks; replacement/deletion safety; URLs/redirects; optimized media, production transfer/visual/mobile checks; caching and offline delivery transfer to #21/#14. S3 credentials, multipart/copy tests and separate database/S3 recovery orchestration do not transfer as prerequisites. |
| #19 | [Billing preservation](https://github.com/GVPproj/gvp.fyi/issues/19#issuecomment-6174165241) | Application-file S3 billing gate retired, not verified complete. Preserve the owner-reported USD 5/month account-wide budget including SES, actual-cost 100% email notification, no automatic actions, and historical USD 0.00 current-month spend report. AWS Budgets-specific delivery/threshold evaluation and credits/refunds/taxes treatment remain unverified; the anomaly-detection email proves neither. No budget deletion. Future AWS backup billing scope requires a separate narrow decision. |
| #20 | [IAM scope retirement](https://github.com/GVPproj/gvp.fyi/issues/20#issuecomment-6174166510) | No local-originals runtime S3 identity is needed. #16's human SSO setup remains historical; #20 has no recorded runtime principal/key creation or completed data-plane tests. Existing resources/credentials are not freshly audited, so absence is not asserted. No revocation/deletion/IAM/SES changes. Required security and backup custody transfer to #21/#18; any AWS backup identity needs separate narrow authorization. |

Comments expressly distinguish supersession from implementation completion and prohibit inferring cloud teardown authorization.

## Retained body changes (verified)

All existing acceptance checkboxes remain unchecked. No original acceptance obligation was removed except explicitly superseded S3/workflow choices; operational obligations were transferred rather than declared complete. Titles, labels and assignees were not changed.

- **#6, #8, #10, #12, #13, #14, #15, #18:** replaced `Part of #3.` with `Part of #21.`.
- **#6, #8, #10, #12, #13, #14, #15:** inserted this common current-direction paragraph:

  > Under #21, originals stay in local PocketBase storage. All new content starts as drafts; Published off + Save stays private, Published on + every Save updates the eligible coherent revision, and turning Published off + Save withdraws it. Retain snapshots and referenced media internally. Manually deploy through Netlify’s existing UI; Save is not deployment success. No application-file S3 or custom deployment-status service is required.

Additional changes:

| Issue | Exact substantive changes beyond the common updates |
| --- | --- |
| #6 | Replaced “optional drafts” with draft defaults and Published-toggle/Save behavior in dashboard acceptance. Replaced the narrowly retained-tool option with owner-approved exceptions requiring a new owner decision for retained app editing. Preserved isolated-data audit, parity, authorization, shared-consumer and compromise acceptance checks. |
| #8 | No additional changes. All tracer, privacy, optimization and accessibility checks retained. |
| #10 | Replaced S3/separate-media-migration compatibility with local protected uploads, retained published media and static Netlify delivery before the affected production slice. Explicitly retained repo-managed MP3 uploads/replacements and dashboard track metadata/audio references. Updated #9's dependency description to toggle/Save and manual Netlify. Added that catalogue completion does not block an independently verified release/software slice. |
| #12 | Changed the build description so retained app editing requires a new owner decision under #21. Preserved audit gating, required preview/duplicate alternatives, actual dashboard-path tests, type/asset validation, draft defaults, authorization and shared consumers. |
| #13 | Replaced the stale “newly saved default-public items” criterion with all new items starting as drafts and preservation of existing published Likes. Required toggle/Save edits, withdrawals, unrelated rebuilds and coherent retained revisions; Published Saves intentionally update the next eligible revision while drafts remain excluded. Updated #9's dependency description. |
| #14 | Added small-slice rollout, with all checks applied per affected slice and full coverage before closure. Replaced “completed #1” with its actual closed-but-unchecked/no-evidence-comment state. Changed object-storage backup wording to off-volume database/local uploads, retained media and sidecars. Added capacity checks, monthly complete off-host recovery, three successful sets, failure/missed-run notification accounting for autostop, matching code/configuration/keys, rollback-set preservation, under-$1 target and approval before adopting >=$1/month. Replaced blanket #10/#11/#13 blockers with #18 security; #10/#13 remain explicitly required for relevant slices/final completion. Added the transferred local-storage/protected-file/rules/shared-consumer/recovery/media checks and removed S3 provisioning/credential gates. All original production approval, backend-first, regression, offline, failed-build, visual, rollback and owner acceptance obligations remain. |
| #15 | Required a new owner decision for any retained app-editing exception. Added explicit #1/local-login-ticket reconciliation, preservation of the local ticket until separate resolution/migration, no obsolete app-management deployment, and retention of reusable backend functionality. Existing replacement-acceptance and shared-authentication audit gates remain. |
| #18 | Linked retained security scope to #21, labelled #11's discovery historical and MFA a production administrative-security prerequisite rather than S3 prerequisite. Changed live-state wording to the state at that inspection. Owner attendance, recovery, delivery, successful/failed MFA and administrative API/shared-consumer checks remain unchanged. |
| #1 | Prepended a current-coordination section linking #21. Kept this already-closed issue closed and the entire historical checklist unchanged. Recorded unchecked rollout criteria/no deployment-evidence comment, required #14 verification, reuse through #6/#12 and retirement only through #15. Recorded the local login ticket's done/local-only state and preservation requirement. Clarified that #21's monthly off-host recovery policy supersedes the old recurring-backup exclusion; current local-storage/toggle/draft/manual-Netlify direction does not authorize another deployment. |

#6/#8/#10/#12/#13/#14/#15/#18 remain open. #1 was already closed and was neither reopened nor closed again. No other issue state changed.

## Native dependency reconciliation (verified)

GitHub supported native dependency reads and deletes. Queried every repository issue (including closed issues, excluding pull requests) using:

```sh
gh api --paginate repos/GVPproj/gvp.fyi/issues?state=all\&per_page=100
gh api --paginate repos/GVPproj/gvp.fyi/issues/<number>/dependencies/blocked_by
```

Deleted these five edges using `DELETE repos/GVPproj/gvp.fyi/issues/<child>/dependencies/blocked_by/<blocker-database-id>`:

| Child | Removed blocker | Blocker database ID | Reason |
| --- | --- | --- | --- |
| #14 | #11 | 5814230248 | Retired S3 migration; local safety scope retained in #14/#21. |
| #11 | #19 | 5839504395 | Retired S3 billing gate. |
| #11 | #20 | 5839563976 | Retired S3 runtime-credential gate. |
| #14 | #10 | 5814229239 | Remove all-or-nothing rollout gate; catalogue remains a scoped/final acceptance obligation. |
| #14 | #13 | 5814232043 | Remove all-or-nothing rollout gate; static Likes remains a Likes-cutover/final acceptance obligation. |

Requeried all issue dependency lists: **no native blocked_by edge points to #3, #11, #19 or #20**. #14 is now blocked only by #18. Other nonempty lists were preserved:

- #15 ← #14
- #13 ← #9, #12
- #12 ← #5, #6
- Historical #11 ← closed #7, #16
- #10 ← #8, #9
- #9 ← #7 (read-only; not changed)
- #8 ← #7
- #7 ← #5

All other queried lists were empty. No new dependency edges were added. Historical textual blockers in retired issue bodies remain historical, superseded by their closure comments—not active rollout gates.

## Remaining gaps / coordination handoff

1. **Native parentage completed:** the coordinating session moved active #6/#8/#9/#10/#12/#13/#14/#15/#18 to #21 using the native sub-issue API with `replace_parent=true`, then verified #21's returned child list. Closed historical children remain with #3.
2. **Status corrected:** #9/#21 now identify `23e0ae2` as the local toggle/JSON-track implementation, not deployed or owner-accepted. Broader implementation and acceptance remain unfinished.
3. **Documentation updated:** `docs/editorial-inventory.md` records checked-in editorial sources and remaining scope decisions. `docs/dashboard-publishing.md` links this record and sequences rollout/security/recovery gates; the current #11 gate reference in `docs/release-publishing.md` now points to #21. Historical research is preserved.
4. **Actual delivery remains unverified by this task:** the earlier development trial is not full catalogue/Likes migration, current toggle deployment, public frontend cutover, owner acceptance, MFA completion or scheduled-backup completion. No fresh production requests, capacity checks, restore rehearsal or cloud resource/credential audit occurred. Preserve the existing billing alert and all resources pending separate consumer-aware owner-approved decisions.
5. **Backup/security work remains real work:** choose/approve the recovery destination/runner/notification path and verify complete costs, schedule/retention/failure handling and isolated restoration; complete #18 and protected-file/rules/shared-consumer checks. S3 retirement does not waive these duties.
6. **#1/local login overlap:** #1 is closed with unchecked criteria and no comments; the local ticket is marked done with local test results and explicitly no deployment. Neither is proof of current production state. Verify actual revisions under #14, reuse useful backend behavior, and retire redundant UI under #15 only after replacement acceptance. Local ticket preserved unchanged.
7. The coordinating session added supersession notes to closed #5/#7/#16, preserving historical bodies and explaining local originals, reusable tracer code and no resource-revocation authority. Unrelated #17 remains unchanged.

Local verification in the coordinating session: `node --test tests/publishing-*.test.js` passed 7 tests, skipped 10 executable-dependent checks, and failed none. PocketBase/old-PocketBase/Chromium executable variables were not configured; this is not full integration verification. `go test ./publishing ./cmd/import-release` passed (publishing package has no Go test files; importer tests ran).

Validation consisted of rereading edited GitHub bodies, asserting exact submitted-body equality and expected states, verifying all four closure reasons, and requerying the complete native blocker graph. These checks establish tracker reconciliation only.
