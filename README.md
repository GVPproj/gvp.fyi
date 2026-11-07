# gvp.fyi

Astro site with repository-managed content and static Netlify publishing.
Edit content files and their adjacent assets, commit, then build and deploy.
No database, external CMS or publishing credentials are required.

## Development

Requires Node.js 22.12+ and pnpm 11.17.

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4324`. There is no required `.env` setup.
Likes, music, software and blog content live under `src/content/`.
Only publication-ready content belongs in this public repository; there is no
draft feature. Missing or invalid required content/assets must fail the build.

## Testing

```sh
pnpm check
pnpm test
pnpm build
```

Tests exercise repository content, static output and browser behavior without a
backend checkout or server. Browser tests require `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
pointing to a working Chromium executable; missing browser prerequisites skip
tests, not pass them. Run browser/build suites serially, without a dev server
sharing the generated Astro/Netlify workspace.

## Publishing

See [file authoring](docs/migrations/35/authoring.md) for Likes, named collections,
music and assets, and [the static boundary](docs/backend-api.md) for ownership.
Likes and music each use `<slug>/index.md` with JSON frontmatter and adjacent
originals. Keep explicit slugs stable when titles change and preserve each
collection item's date added. Software remains in `src/content/software/` with
its existing MDX entries and local images; blog authoring is described below.
Site settings and interactions stay in code.

Commit content and assets together, run the checks above, and manually deploy the
successful static build in Netlify. Saving or committing is not deployment.
Removing an entry removes it from the next successful deployment, not from the
currently live site. Failed builds leave the previous static deployment live.
Production deployment requires separate owner approval.

The [#35 migration record](docs/migrations/35/README.md) tracks imported public
content and baseline evidence. Final native verification/parity is pending; use
the [cutover checklist](docs/migrations/35/cutover.md) before any deployment.
Preserve existing `public/published-content/` and `public/published-releases/`
compatibility files: new Astro image output is not a replacement for old URLs.
Issues/specs live in [GitHub Issues](https://github.com/GVPproj/gvp.fyi/issues).

### Blog

Author posts as Git-owned `.mdx` files in `src/content/blog/`, with a `title` and
a quoted `YYYY-MM-DD` `date` in frontmatter. Astro's local `blog` collection renders
them; the filename determines the `/blog/<slug>/` route. Commit and deploy blog
edits with the site.

Import components only in articles that use them. For example,
`the-animated-face.mdx` imports `Face` directly:

```mdx
import Face from '@src/components/elements/Face.astro';

<Face />
```

Use fenced `astro` code blocks for source examples; there is no CMS demo marker
or global Face injection.

## Ambient instrument

Home's 12-pad sine instrument starts silent. Pointer, multi-touch,
QWER / ASDF / ZXCV and native Enter/Space activation are supported; audio
unlocks only on an intentional pad or transport gesture.

- Record starts a free-time first pass (1–8 seconds); Finish loop sets its length.
  No quantization, count-in or metronome. Overdub monitors new hits once, then
  repeats them next cycle. Limits: 512 events, 32 voices.
- Stop silences active/queued voices and discards unfinished recording, retaining
  committed events. Play restarts from zero; Clear removes everything without undo.
  Master volume affects monitoring and playback.
- Hiding/interruption stops audio and discards unfinished material; resumption is
  explicit. Navigation clears the unsaved loop. Errors are visible; transport state
  is announced, not conveyed by color alone.

`src/lib/lib-ambient-pad/` owns the kit, limits, transactional looper and audio
engine; `src/scripts/ambient-pad.ts` owns input/UI and Astro lifecycle cleanup.
Schedule on the audio clock: timers feed a lookahead horizon, skipping expired
occurrences after stalls rather than bursting missed hits. Tails can cross loop
boundaries. Dispose voices, timers and handlers on departure; restored pages start
silent. The engine uses `{ soundId, when }` triggers and `stop()`, with no samples.

`tests/ambient-*.test.js` cover scheduling/rendering and Chromium UI/lifecycle.
Physical-device listening/multi-touch, screen readers, interruptions and true
BFCache still need testing, especially Safari/iOS; synthetic tests do not establish
musical feel or real-device behavior. Targets: current desktop Chrome/Firefox/Safari,
Android Chrome and iOS Safari. Vertical range controls need Chrome 124+,
Firefox 120+ or Safari 17.4+.
