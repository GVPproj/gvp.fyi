# DJ recordings

The DJ catalogue is manually maintained in `src/content/dj/<folder>/index.md`,
with adjacent original artwork. Build with `pnpm build`; validate with
`pnpm check` and `pnpm test`. There is no feed or build-time Mixcloud request.
The initial research pass publishes 132 verified recordings; see the
[research audit](dj-catalogue-research.md) for coverage, evidence, exclusions and
unresolved dates. This is a point-in-time catalogue, not a completeness guarantee.
Browser tests use Playwright's Chromium; on a fresh machine, provision it with
`pnpm exec playwright-core install chromium`.

## Adding a recording

- Keep one entry per recording, including shared broadcasts and reuploads.
  `id` identifies the recording, not an uploading account or presenter. Reconcile
  reuploads manually and retain the same ID rather than publishing another entry.
  `slug` is the unique local route. The build rejects duplicate IDs, routes and
  canonical Mixcloud URLs.
- `category` is the programme: `a-friendly-wave`, `island-city`, or
  `other-appearances`. It does not follow the uploading account. Programme row
  labels/order live in `src/config/site-settings.json`.
- Preserve the source `title` and original artwork. `artwork` must be an adjacent
  repository image (e.g. `./artwork.jpg`). Cards crop to square; detail pages retain
  the image's original proportions.
- `credit` describes the confirmed participation. For shared recordings, credit
  the other participants and say “Shared broadcast”; do not label the entire
  recording as Graham's set or invent segment timestamps.
- `duration_seconds` is a positive integer for the **whole linked recording**.
- `mixcloud` is the HTTPS recording URL, not a profile, playlist, widget or audio
  file. `sources` contains labelled public evidence links for manual verification.
- `broadcast` explicitly records date certainty (see below). A verified exact
  date requires a source. Do not use an upload timestamp or infer a date from a
  URL slug. Verified dates sort newest first; undated/uncertain recordings follow
  them, in stable ID order. That placement does not claim they are older.

```yaml
broadcast:
  status: verified
  date: "2026-10-20"
  source: https://afriendlywave.com/
```

When the evidence is incomplete, use `status: uncertain` with a `note` explaining
what is known, or `status: unknown` with no date. These states do not get a
fabricated machine-readable exact date. For example:

```yaml
broadcast:
  status: uncertain
  note: October 2026; exact day unverified
```

Only frontmatter is published on episode pages. Listening is a plain Mixcloud
link; the template intentionally has no body renderer, player or download.
`tests/dj-catalogue.test.js` checks every published card/detail journey, programme
counts, date ordering and representative evidence decisions. Update the researched
expectations when intentionally adding or reclassifying recordings; keep the
isolated validation scenarios in `tests/dj.test.js` independent of catalogue size.

## Launch recording verification

`afw-2026-10-20`, checked 2026-11-09:

- [Mixcloud recording](https://www.mixcloud.com/afriendlywave/graham-van-pelt-afw-live-on-chir-fm-101326/)
  and [API metadata](https://api.mixcloud.com/afriendlywave/graham-van-pelt-afw-live-on-chir-fm-101326/):
  title “Graham Van Pelt - AFW Live on CHIR FM - 10/20/26”, host Graham Van Pelt
  (`/grahamvanpelt/`), `audio_length: 3585` (59:45).
- The API's `created_time` is **2026-10-21T11:45:01Z**, not the broadcast date.
- [Original episode artwork](https://thumbnailer.mixcloud.com/unsafe/0x0/extaudio/4/5/5/5/8fb4-5e7d-4c36-8b7e-e02ff2507fdc)
  (1728 × 1728 JPEG) explicitly prints “Graham Van Pelt” and “October 20, 2026”.
- [A Friendly Wave](https://afriendlywave.com/) associates that title with this
  exact recording and artwork.
- [CHIR FM programme archive](https://www.chir.fm/a-friendly-wave/programme-archive/)
  embeds [the station listing](https://chirfm.vits.space/player/show/a_friendly_wave/mode/dark/theme/cyan),
  which lists “October 20, 2026” (`2026-10-20_WAVE.mp3`).

The Mixcloud slug's `101326` disagrees with the dated artwork, current title,
programme website and station archive. The published broadcast date is therefore
**2026-10-20**, not October 13 or the October 21 upload date. No co-presenter is
credited in the examined metadata. The duration describes the Mixcloud recording;
no audio comparison with the station archive was performed.
