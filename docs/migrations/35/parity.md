# Issue 35: three-way parity verification

**Migrated pages match. One pre-existing software-image discrepancy still needs
owner disposition.** No visual waiver, commit, deployment or shared-backend
change is authorized by this report.

## Reproduce

From the repository root, with installed dependencies:

```sh
export EVIDENCE=/home/gvp/.local/state/gvp-fyi-migration-35
export CHROMIUM=/home/gvp/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux-arm64/chrome-headless-shell
TMPDIR="$EVIDENCE/tmp" PLAYWRIGHT_CHROMIUM_EXECUTABLE="$CHROMIUM" \
  node scripts/verify-migration-parity.mjs "$EVIDENCE" "$EVIDENCE/parity-final"
```

Allow approximately four minutes. Exit **1** remains expected: the verifier does
not waive the software pixel difference described below. It checks both built
trees' `_redirects` files and fingerprints their files before/after the run. It
performs no live requests, build, source edits or deployment.

Inputs, outside Git:

- `baseline.json` and `deployed/`: captured public deployment.
- `old-source/dist/`: unchanged old renderer, built in isolation from the same
  reconciled capture, deployed media descriptors and approved release tie order.
- `native-build/`: completed native production build, with publishing credentials
  empty and the obsolete backend URL pointing at unreachable `127.0.0.1:1`.
- `originals/`: reconciled public originals for diagnostic resize probes.

The public manifest is [manifest.json](manifest.json). The verifier neither
rebuilds nor supplies the one-time old-renderer adapter. The final browser capture
completed at **2026-11-07T20:28:00.335Z**. Appending `--reuse` re-analyzes retained
screenshots only after verifying unchanged build/capture fingerprints and every
PNG checksum. The machine-readable [parity-results.json](parity-results.json)
records the capture/re-analysis timestamps and all evidence hashes.

## Coverage and controls

- 49 pages: all nine Likes details, all 36 music details, Likes/music indexes,
  home and software. All three outputs at 1280×800 and 390×844:
  **294 full-page screenshots**, with 294 pairwise comparisons.
- Chromium **153.0.8010.12**, scale 1, reduced motion, `en-US`, UTC, identical
  local Gohu fonts, settled layout and eagerly decoded images.
- Local files replay under `https://gvp.fyi`; third-party requests receive a
  fixed `#2e3440` document and never reach the network. Each GIF uses its own
  first frame. **No screenshot masks or pixel tolerances.**
- Ordered text, metadata/canonical URLs, links, image alt text/dimensions/srcset
  descriptors, audio paths/attributes and iframe targets/dimensions are compared.
  Only Astro generator metadata and same-origin `dpl` parameters are excluded.
  Native image URLs are compared separately as media, not as identical paths.
- Text/element geometry is checked at 1/64 CSS-pixel precision. Natural image
  dimensions match. `over8` is a diagnostic count, not an acceptance tolerance.

## Results

Counts are page/viewport comparisons, not unique routes.

| Comparison | Compared | Semantic mismatches | Geometry mismatches | Pixel mismatches |
| --- | ---: | ---: | ---: | ---: |
| Deployed → isolated old | 98 | 0 | 0 | 1 |
| Isolated old → native | 98 | 0 | 0 | 0 |
| Deployed → native | 98 | 0 | 0 | 1 |

Every migrated page and home is pixel-identical to the deployed capture at both
viewports. All 98 old/native comparisons are pixel-identical. Deployed 2007
release tie order is preserved. Selected-image comparisons also include images
outside the initial horizontal scroll position; none of the migrated image pairs
differ in decoded pixels.

Additional checks:

- Identical old/native inventories of **73 HTML routes**, redirect destinations
  and hosting `_redirects` rules. All 60 captured HTML documents correspond to
  that inventory. The 13 uncaptured routes are nine legacy-ID redirect documents
  plus `/film/`, `/projects/`, `/utils/` and `/video/`.
- Nine legacy-ID redirect targets and `/links/` independently match the manifest
  in both builds. Recorded HTTP slash redirects are retained as baseline evidence;
  actual hosting status behavior still requires post-deployment smoke checks.
- **320 captured files** match their SHA-256; **181/181 compatibility files**
  match deployed bytes in each build; all **277 native raster images** decode.
- Six local audio files retain identical paths/bytes. Fonts match the capture.
- No missing browser requests, undecoded images, page errors or changes to either
  built tree during verification.

### Image corrections verified

Initial runs found seven additional sampling differences caused by supplying
Astro rounded-height bounding boxes. The shared native image helper now uses a
ceiling-height box with `fit: 'inside'`; a built-output regression verifies the
captured hashes rather than testing helper internals.

Five known encoding differences remained. Their exact deployed variants are now
entry-relative native `image()` assets: Ricotta Eaters and 88x31 Buttons at
320/640px, and Paul Cries at 320px. Native asset URLs serve these bytes without
re-encoding; other widths still use `getImage`. All 45 originals and all 181
compatibility files remain unchanged. Native variant validation and emitted-byte
checks have 17 passing tests. Authoring instructions explain updating/removing
explicit variants when replacing a primary image.

No backend image pipeline or transport/snapshot wrapper remains. The final run
confirms these corrections removed every old/native image difference, including
the Paul Cries thumbnail outside the initial music-row viewport.

### Remaining deployed → old/native software discrepancy

Desktop `/software/` differs in **185 pixels (0.0099403%)**, maximum RGB-channel
difference **5**, inside `[945,924,965,936)` of the colour-picker thumbnail. No
text or geometry differs. The inspected side-by-side crop shows the same content
and layout; this small encoding difference also occurs with the unchanged old
renderer. Software source, content and rendering were not modified.

The same URL, `/_astro/port-colour.B7wK89SE_Z1FxGRV.webp`, has different bytes:

- Deployed: 1,392 bytes, SHA-256
  `939bb090c635f5abb2391666f3f30854bd1737903d6b078ae16e24382accd23c`.
- Old/native: 1,394 bytes, SHA-256
  `7de54acc1e3108bb0787ed4d35c10af6699f13bc724d43775c941254b4b4dd46`.

Raw decoding differs in 143 pixels; browser scaling produces the 185 screenshot
pixels above. Mobile's initial horizontal scroll hides that thumbnail, but the
raw-media comparison still covers it. This is **not a migration-only regression**
and is **not silently accepted**. Owner disposition remains an acceptance gate.

## Retained evidence and limits

`$EVIDENCE/parity-final/` contains screenshots and semantic/geometry snapshots
under `{desktop,mobile}/{deployed,old,native}/`; pairwise JSON/pixel diffs;
`inventory.json`, `checks.json`, `media-comparisons.json`, `resize-probes.json`
and `results.json`. The public report is a generated copy of `results.json`.
Earlier diagnosis and inspected crops remain in `$EVIDENCE/parity/investigation/`.

This runner verifies controlled built-output parity, not live third-party embeds,
physical devices or production hosting. Interactive/no-JavaScript/audio tests
and clean-checkout check/test/build results are recorded in [README.md](README.md).
No production requests or changes occurred during this comparison.
