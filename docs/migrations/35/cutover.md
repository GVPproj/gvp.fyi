# #35 cutover and rollback checklist

**Not deployment authorization.** The owner approved the two source-reconciliation
choices on 2026-11-07, not production rollout. Completed checks below link to
[verification](README.md#verification-and-review) and [parity evidence](parity.md).
All 153 tests pass without skips. The pre-existing software-image disposition and
separate hosting/deployment approval remain gates.

## Before requesting deployment approval

- [x] Review the [public manifest](manifest.json): 36 releases, 9 published
  collection items, 45 originals, 181 exact compatibility files, five native
  preserved variants and four named collections. All recorded hashes match.
- [x] Confirm only publication-ready content/assets are present. No unpublished
  records, secrets, raw authenticated responses or large screenshots belong in Git.
- [x] Confirm software/blog/settings source and rendering remain unchanged;
  built route inventories and hosting redirect rules match. Actual hosting smoke
  checks remain below, and the software-image discrepancy is not waived.
- [x] Run check/build/test serially in the isolated credential-free source copy:
  0 errors/warnings (three existing hints), successful build, 153 tests passed,
  0 failed/skipped. Versions, commands and logs are in the verification report.
- [x] Verify credential-free dev/build without `.env`. Isolated tests point the
  obsolete backend URL at an unreachable endpoint; browser tests block external
  requests. No backend source/authentication dependency remains. Independent
  embeds still use their existing third-party hosts outside controlled tests.
- [x] Compare old and native implementations against the same reconciled capture
  in isolated builds, then compare that capture with the deployed baseline.
  Check route inventories, actual redirect targets, literal text, metadata,
  membership/chronology, release precision and equal-date order, external links,
  and required media. No historical fixture substitution.
- [x] Compare desktop/mobile appearance with matched browser/font/viewport/embed
  controls: 294 final screenshots, no semantic/geometry differences, all 98
  old/native comparisons pixel-identical. See the three-way parity report.
- [ ] Obtain explicit disposition of the pre-existing software-thumbnail
  discrepancy: 185 desktop pixels, maximum channel error 5, also present in the
  unchanged old renderer. Do not treat the strict verifier's exit 1 as a pass.
- [x] Automate keyboard/focus, reduced motion, no-JavaScript fallback, Likes
  grouping/details/downloads, music categories/details, external-player markup
  and native local audio playback. Physical devices and live third-party embed
  playback were not tested; do not describe controlled embeds as live playback.
- [x] Complete independent Standards and Spec reviews. No standards violations
  or actionable implementation defects remain; one optional fixture-deduplication
  suggestion is documented. Final evidence/acceptance gates remain explicit.
- [ ] In hosting history, identify the exact previous successful static deployment
  and verify it is available for restoration. Observed public deployment tag
  `6aef21d45994f5f412f1e73f` is a candidate, **not** an authenticated source revision.
  Record its hosting identifier and confirmed revision if available. Implementation
  began at `40453ed9e0aedef850e0278e51f23ab4923232b3`.
- [ ] Obtain separate owner approval for the reviewed static deployment and any
  site-scoped environment-reference cleanup, including a recovery window.

## Approved deployment only

- [ ] Inventory this Netlify site's obsolete publishing environment references
  and build-context dependencies privately. After approval, remove **only this
  site's references**; never copy secret values into logs, documentation or issues.
  Do not revoke identities or change credentials/configuration shared by other
  consumers. No such production cleanup has been performed by this import.
- [ ] Build the approved commit without obsolete variables, promote only its
  successful static output, and retain the prior deployment for rollback.
  A failed build must leave the previous site live.
- [ ] Record deployed commit, hosting deployment identifier, deployment time and
  verifier. The preflight `dpl` tag alone is insufficient deployment evidence.

## Post-deployment smoke checks

- [ ] Check `/`, `/likes`, `/music`, `/software`, representative software/blog
  pages, and all 45 imported detail routes from the manifest.
- [ ] Check `/links` reaches `/likes`, and all nine `/likes/<legacy-id>` routes
  reach their captured readable slugs, including slash-normalization behavior.
- [ ] Check alphabetical named collections, multiple membership behavior,
  newest-first items, ungrouped “Misc.” behavior and hidden empty groups where
  applicable; retain fixture coverage for cases absent from current content.
- [ ] Fetch all 181 legacy `/published-content/...` and
  `/published-releases/...` paths and compare served response-body SHA-256 with
  the manifest. Check native responsive images and download behavior separately.
- [ ] Check music release ordering, partial dates/display overrides, ordered
  tracks, listening links and controlled/uncontrolled external embeds as
  appropriate. Verify existing `/audio/...mp3` paths load and native controls
  play/pause/seek; preserve intentional-gesture audio and Home's silent start.
- [ ] Inspect desktop/mobile routes, console/network failures, keyboard focus and
  no-JavaScript behavior. Confirm no backend content/auth requests are made.
- [ ] Record results and unresolved differences. Stop rollout if acceptance fails.

## Recovery

1. Restore the confirmed previous **static deployment** if route, media,
   interaction or visual checks fail. Do not substitute a fresh build of the old
   backend-dependent frontend: that could acquire different current records.
2. Repeat critical route/legacy-media/audio smoke checks against the restored
   deployment and record its identifier/time. Keep failed candidate evidence for
   diagnosis; correct repository content/code and reverify before requesting a
   new deployment approval.
3. Do not restore, downgrade, migrate or delete the shared backend database or
   storage. Do not stop its service, modify schema/APIs, delete unpublished data,
   revoke shared credentials or alter another consumer. Site independence is not
   backend retirement. Any shared-backend work is a separately authorized task.
