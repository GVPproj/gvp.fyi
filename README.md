# gvp.fyi

Astro frontend with static Netlify publishing. The separately maintained
[PocketBase backend](https://github.com/GVPproj/pocketbase-fly-starter) owns the API,
schema, migrations and deployment; this repository consumes its HTTP API only.

## Development

Requires Node.js 22.12+ and pnpm 11.17.

```sh
pnpm install
cp .env.example .env
# Fill in the PocketBase publishing credentials in .env.
pnpm dev
```

Set the server-only publishing variables in `.env` to a PocketBase instance
with a restricted build identity, then open `http://127.0.0.1:4324`.
Development and builds acquire current published PocketBase records for music and
Likes; there is no snapshot or checked-in fallback for those sections. Software and the blog
are Git-owned content collections in `src/content/software/` and
`src/content/blog/`, not CMS fallbacks. Missing configuration or backend failures
stop the build rather than silently publishing old content.

## Testing

```sh
pnpm check
pnpm test
pnpm build
```

Frontend tests use local HTTP API fixtures, not a PocketBase binary or backend
source checkout. Browser tests require `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; missing
browser prerequisites skip tests, not pass them. Run browser/build suites serially,
without a dev server sharing the generated Astro/Netlify workspace.
Backend API, migration and upgrade coverage lives in the backend repository.

## Publishing

See [frontend API boundary](docs/backend-api.md) for integration ownership and
backend documentation. Edit music in PocketBase's `music_items` and Likes in
`likes_items`, then deploy manually in Netlify. Save makes published edits eligible
for the next build; it does not deploy. Unpublishing/deleting removes items on the
next successful deployment that observes the change. Named-collection names and
memberships also come from current records, excluding drafts. Acquisition is not
an atomic site-wide capture: media changes may fail a build and require retry.
Failed builds leave the existing static deployment intact. Backend support must
ship before this frontend; see the [cutover/recovery steps](docs/backend-api.md#current-record-cutover-2829).
Production deployment requires separate owner approval.

Edit software in `src/content/software/` and commit its entries and
original images with the frontend. Astro builds responsive software images into
the static output; they do not need Netlify's image CDN or the publishing backend.
Site settings and interactions stay in code. Blog posts are authored only in the
Astro content collection; PocketBase has no blog publishing support.
Issues/specs live in [GitHub Issues](https://github.com/GVPproj/gvp.fyi/issues).

### Blog

Author posts as Git-owned `.mdx` files in `src/content/blog/`, with a `title` in
frontmatter. Astro's local `blog` collection renders them; the filename determines
the `/blog/<slug>/` route. Commit and deploy blog edits with the frontend, not
through PocketBase.

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
