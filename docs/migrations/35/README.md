# #35: native content migration

**Status:** implementation, native validation, credential-free development/build
and independent review are complete. All migrated routes match the deployed
capture; all 98 old/native screenshot comparisons match exactly. The complete
suite passes **153/153 tests, zero skips**. One pre-existing software-thumbnail discrepancy still
needs explicit owner disposition; see [parity](parity.md). Opening the review PR
does not authorize deployment or shared-backend changes; neither has been performed.

Specification: [issue #35](https://github.com/GVPproj/gvp.fyi/issues/35).
Architecture: native Astro collections and assets, following the issue's approved
requirements. Pre-existing local domain-document changes are outside this PR.

- [Public manifest](manifest.json): identities, exact content paths/hashes,
  original formats/paths/hashes, actual legacy redirect chains, readable slugs,
  named-collection memberships, deployed release order, compatibility media,
  public route inventory, evidence hashes and browser capture settings.
- [Authoring](authoring.md): native files, source assets and build/deploy workflow.
- [Parity](parity.md): final three-way screenshots, image diagnosis/corrections and
  the remaining software-image acceptance gate; [machine report](parity-results.json).
- [Cutover checklist](cutover.md): verification gate, separate approval and static
  deployment rollback; not permission to deploy or retire the shared backend.

## Imported inventory

| Kind | Count | Destination |
| --- | ---: | --- |
| Published collection items | 9 | `src/content/likes/<slug>/index.md` |
| Music releases | 36 | `src/content/music/<slug>/index.md` |
| Original assets | 45 | Adjacent `image.*` / `artwork.*` |
| Exact native variants | 5 | Adjacent `image-{width}.webp` / `artwork-320.webp` |
| Named collections | 4 | `src/content/named-collections.json` |
| Deployed compatibility files | 181 | `public/published-content/`, `public/published-releases/` |
| Retained baseline screenshots | 98 | External evidence directory only |

Originals total **13,768,677 bytes**; compatibility assets total **17,460,780
bytes**. Every original matches its export SHA-256 and byte length; every
compatibility file matches the deployed `baseline.json` SHA-256 and byte length.
Formats were inspected from original bytes, with JPEGs stored as `.jpg`; the
bytes themselves were not re-encoded. All nine imported Likes assets are images.
Five captured responsive variants (220,456 bytes) also live beside their source
entries so native asset handling can preserve their exact visible bytes. The
manifest retains initial import hashes and current entry hashes for the three
entries with these explicit optional variants.

Entries use JSON frontmatter inside `---`, preserving literal text and imported
timestamp strings. Likes slugs come from actual deployed legacy redirect chains,
not a new title-slug algorithm. Music metadata is unchanged except for adding
native identity/artwork fields and selecting deployed `order` rather than export
acquisition order. The named registry contains Art, Podcasts, Webdev Inspo and
Work Tools with their existing IDs. No transport metadata or old published-image
objects are retained in the entries.

## Source and reconciliation

The only import authority was the reconciled public capture retained at:

```text
/home/gvp/.local/state/gvp-fyi-migration-35
```

The export was captured at **2026-11-07T16:38:24.063Z**; deployed baseline and
preflight manifest timestamps are **2026-11-07T16:39:37.386Z**. The implementation
starting revision is `40453ed9e0aedef850e0278e51f23ab4923232b3`. Public asset URLs
exposed deployment tag `6aef21d45994f5f412f1e73f`; this is an **observed `dpl` tag,
not an authenticated Git revision**. Confirm the corresponding prior static
deployment in hosting history before any cutover.

On **2026-11-07**, the owner explicitly approved in the implementation conversation:

1. Preserving the deployed equal-date Think About Life order for 2007:
   *Presents: Miracle Fortress Remixes 2 HITS!*, *Black Champagne EP*, then
   *Think About Life (Japanese Edition)*. Their imported global `order` values are
   22, 23 and 24. Fresh export/build order differed.
2. Preserving the exact deployed compatibility bytes, not regenerated substitutes.
   Five WebP variants differed from a fresh local build: Vincenzo Campi and
   88x31 Buttons at 320/640 widths, and Paul Cries at 320. Original/largest-image
   URLs agreed. All 181 deployed compatibility files, including those five,
   were copied verbatim; affected paths are listed in the manifest.

Preflight URL differences were deployment query parameters, not changed underlying
media paths. Final pixel comparison additionally identified the small pre-existing
software-thumbnail discrepancy documented in [parity](parity.md); it is not
silently waived. Software source/content/rendering remain unchanged. Both
preflight and final comparison found no missing detail routes or detail-page
text/link/date differences.

The external preflight README/manifest still describe the earlier approval gate;
they are retained as evidence, not rewritten history. The approval above resolves
that source-selection gate only, **not** final verification or deployment approval.

## Retained evidence and capture settings

`export.json`, `manifest.json`, `baseline.json`, `reconciliation.json`,
`screenshots.json`, `originals/`, `deployed/assets/`, raw public HTML under
`deployed/pages/`, and screenshots under `screenshots/` remain in the external
directory. The public manifest records evidence-file hashes and public screenshot
hashes/paths; HTML and screenshot bytes are not committed. Do not publish raw
authenticated responses, credentials or private/unpublished material.

The one-time `import-reconciled.mjs` remains there too, outside Git. It reads only
the retained public evidence, checks originals/formats, refuses existing output
paths, and checks copies against source hashes. It is not a synchronization
service. Neither historical fixtures, `old-build/` generated media nor the browser
suite's sample artwork were used as import sources.

Baseline screenshots use Chromium headless shell **153.0.8010.12**, desktop
**1280×800** and mobile **390×844**, device scale **1**, reduced motion, blocked
service workers, full-page capture and disabled animations. Captured public
HTML/assets are replayed; non-site requests (including embeds) get a fixed
`#2e3440` background. Capture waits for network idle, fonts, and image decoding.
There are **zero `missingAssets` and zero `unloadedImages`** across 98 captures.
The screenshot index has no embedded capture timestamp; recorded filesystem
modification times are explicitly file metadata, not invented capture instants.
Use the same browser, fonts, viewports and controls for native comparisons.

## Recheck the imported bytes

Run from the repository root; this checks the committed/imported bytes against
the manifest without accessing the backend or the external capture:

```sh
python3 - <<'PY'
import hashlib, json
from pathlib import Path
m = json.loads(Path('docs/migrations/35/manifest.json').read_text())
originals = [e['original'] for e in m['items'] + m['releases']]
for entry in originals + m['compatibilityAssets'] + m['preservedNativeVariants']:
    data = Path(entry['repositoryPath']).read_bytes()
    assert len(data) == entry['bytes'], entry['repositoryPath']
    assert hashlib.sha256(data).hexdigest() == entry['sha256'], entry['repositoryPath']
for entry in m['items'] + m['releases']:
    data = Path(entry['contentPath']).read_bytes()
    assert hashlib.sha256(data).hexdigest() == entry['contentSha256'], entry['contentPath']
print(f"Verified {len(originals)} originals, {len(m['compatibilityAssets'])} compatibility files, 5 native variants, 45 entries")
PY
```

These content hashes describe the migration snapshot; future intentional authored
edits naturally diverge. Do not regenerate immutable compatibility assets to
make a check pass. These migration hashes are not a future authoring workflow.

## Verification and review

Evidence and logs remain under the external evidence directory above. The
independent `clean-source/` copy has no `.env` and uses its own dependencies,
installed with `CI=true pnpm install --offline --frozen-lockfile`. Publishing
variables are unset for clean checks; isolated dev/build tests also configure an
unreachable backend URL. Node is `v22.22.2`, pnpm `11.17.0` and the browser is the
Chromium headless shell recorded above.

- `pnpm check`: **0 errors, 0 warnings**, three existing native-audio test hints.
- `pnpm build`: passes without credentials. Existing MDX warnings are unchanged.
- `pnpm test`: **153 passed, 0 failed, 0 skipped** (391 seconds). Targeted native
  asset, calendar-date and development URL corrections also pass. Final commands
  ran serially as `pnpm check`, `pnpm build`, the focused music-browser test, then
  `pnpm test`; logs are `final-check.log`, `final-build.log`, `native-url-fixed.log`
  and `final-test.log` in the external evidence directory.
- Browser coverage includes desktop/mobile layout, keyboard/focus, reduced motion,
  no-JavaScript operation, literal Likes text/PDFs, music and native audio playback.
  Physical devices and live third-party embed playback were not tested; controlled
  iframe targets/attributes and local audio were checked.
- All source/compatibility/native-variant and entry checksums pass. The final
  three-way run has zero semantic/geometry changes and zero old/native pixel
  changes. The strict parity command still exits 1 for the pre-existing software
  discrepancy; this is not reported as an unconditional parity pass.

### Standards review

No documented-standard violations. Initial internal-presentation assertions and
duplicate transform/build-runner findings were corrected with public built-output
assertions, `content-image.ts` and `buildSite()`. One non-blocking judgement call
remains: three small test entry writers duplicate JSON-frontmatter serialization.
This is retained as an optional test-maintenance suggestion, not a release blocker.

### Spec review

No remaining actionable implementation defect. Calendar validation now rejects
impossible ISO/RFC dates with regression tests. Native preserved variants satisfy
appearance preservation without restoring transport or publishing wrappers.
Final suite results are complete. Acceptance still requires explicit disposition
of the pre-existing software-thumbnail difference. Deployment/hosting verification is a
separate, unauthorized step in [cutover](cutover.md).
