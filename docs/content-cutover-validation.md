# #21 candidate review and validation — 2026-10-14

Local validation only. **No deployment, production data/authentication change,
maintenance window, credential creation or backup schedule activation occurred.**
Source baseline: `d3d32f69fa7439e066dbe50d3f539c15e40f9073`;
backend baseline: `0f3d5cc3ba1ebb1f34c8caa7276da58ac2e0c823`.
The implementation remains uncommitted in both repositories.

## Review and fix

Two independent reviews examined the uncommitted cutover implementation:

- **Spec/correctness:** found one migration-safety defect. Deleting an existing
  published Like before explicit snapshot seeding removed its working record/media,
  after which the build completeness check could no longer detect the missing
  identity. Added a transactional model-level deletion guard requiring explicit
  seeding first; it checks persisted state, not unsaved caller edits.
- **Standards:** no confirmed documented-standard violations. Optional maintenance
  suggestions: consolidate publishing HTTP-client logic and asset-output logic;
  replace untyped named-collection references with a typed representation. These
  refactors were not mixed into the safety fix.

A real PocketBase `App.Delete` regression test failed before the fix and passes
now. It verifies rejected deletion preserves record/file bytes and the fail-closed
build check, does not implicitly publish, and permits seeded deletion while retaining
publication/media. Draft and pre-editorial-schema deletion remain supported.

Changed runtime/tests and their README are synchronized byte-for-byte into the
sibling deployment repository. Catalogue/toggle/editorial migration files and
publishing runtime were also compared. Unrelated existing changes were preserved.

## Candidate capture

Private local source/backend archives and SHA-256 file manifests are under
`~/.cache/gvp-cutover-validation/candidate-20261014/`. They contain tracked and
nonignored candidate source, not live data, ignored credentials or dependencies.
The archives capture the fixed candidate before this validation report:

- `source.tar.gz`: `79a5b4ad4f7a1db8e968182abc4ebe1546e10b4e9f2e8fcf207d99a1be464460`
- `backend.tar.gz`: `85ecd0640c9ad337caca7dfa78865c53b8995bb8fc0403d4ac29a4b4f4b85c42`

The directory also preserves the fixed binary and old upgrade-fixture binary:

- `pocketbase-fixed`: `e72a21d977872c870b85f10de85c1def4271e42e1b717bb02bca536d333d8894`
- `old-fixture-pocketbase`: `53f06ada38abfc0e1df175f681c5132fd121840480b65fff89c0e415c058cf68`

These are local reproducibility snapshots, **not release commits or production
recovery sets**. The old fixture's checksum is not a fresh proof of the live image.
Freeze reviewed commits and deployment configuration before rollout.

## Verification

The initial Go attempt could not write to `/tmp` because of a local quota limit.
Subsequent commands use `TMPDIR=~/.cache/gvp-cutover-validation/tmp` on the home
filesystem. No existing scratch files/backups were deleted to make space.

- Source Go race suite: passes, including after the deletion fix.
- Sibling Go race suite: passes; its editorial race tests also pass after the fix.
- Backend Python build-hook/publishing deployment smoke checks: **9 passed**, rerun
  against the fixed binary.
- `pnpm check`: zero errors/warnings, three existing native-audio test hints.
- Ordinary pre-cutover `pnpm build`: passes.
- Fixed-binary backend/import/upgrade/migration-failure suite: **9 passed, 0 skipped**.
- Fixed-binary catalogue/native-dashboard/static-build suite: **13 passed, 0 skipped**.
  Includes opt-in remote artwork capture and all-content catalogue rehearsal,
  static Likes with the backend stopped, native software/image/quote editing,
  release dashboard editing, withdrawal/republish and fail-closed build checks.
- `git diff --check HEAD`: passes.

The broad initial `pnpm test` run reported **258 passed, 14 failed, 1 skipped**
(273 including nested tests). It used the pre-fix binary and **is not clean release
evidence**. The skipped test was opt-in catalogue capture, subsequently run above.
Two ambient-layout failures match #17's recorded tests. Other failures included
legacy Likes/session/native-audio browser checks and two publishing builds.

Follow-up browser probes unfortunately ran dev servers in the active source tree
while that broad suite was still running. Despite separate ports, these share
Astro/Netlify generated directories. The build failures explicitly report missing
`.netlify/build` modules; probes captured unexpected page reloads. Do not treat
all failures as proven baseline bugs, or use that contaminated run to establish a
regression. Both failed publishing-build cases pass in the serial cutover rerun.

Pagination investigation reproduced a timeout in 1/30 current-tree runs and a
focus failure in another; 30 baseline runs passed. Quote editing passed 3/10 runs
in the active tree, 5/5 unchanged-baseline runs and 5/5 isolated-current-snapshot
runs. These were uncontrolled with respect to other active servers and do not
establish a product-level cause. The affected browser suites were rerun serially
from the frozen source archive outside the watched working tree: **35 passed,
1 failed, 0 skipped**. All originally failing browser checks passed; the remaining
failure was a different logout test whose temporary server could not start because
its selected port was already occupied. Its independent rerun **passed (1/1)**.
Thus all affected browser checks have passing isolated evidence, but this is not a
claim of a green final monolithic suite. No assertions were weakened and no
unrelated legacy UI changes were made.

Local logs: `~/.cache/gvp-cutover-validation/`, especially
`full-tests.log`, `fixed-backend-integration.log`, `fixed-cutover-suite.log`,
`editorial-delete-*.log`, and `frozen-browser-rerun.log`.

## Next operational gates

See [readiness](content-cutover-readiness.md) for the backend-first rollout/rollback
procedure. Its historical AWS status is superseded by the later
[backup preflight](backup-only-preflight.md) and [installed resources](../infra/backups/README.md):
the backup bucket/role and confirmed SNS subscription exist, but capture/verification
and watchdog execution are not active. No fresh cloud-state audit was performed here.

Subsequently, the owner approved the immediate maintenance window: the
[fresh checkpoint and isolated restoration/migration rehearsal](content-cutover-checkpoint.md)
passed, and original service/configuration were restored. That separately approved
operation does not change the local-only scope of the validation above. Next,
perform owner-attended superuser MFA verification after confirming second-method
delivery; refresh the checkpoint before later changes if intervening writes require it. Recurring recovery, scoped build
credentials, live import/dashboard acceptance and concrete deployment approval are
still required. This review does not close #21 or authorize skipping those gates.
