# gvp.fyi

Astro frontend, static Netlify publishing, custom PocketBase backend.

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
Development and builds both require published PocketBase content for music,
software and Likes; there is no checked-in fallback for those sections. The blog
is Git-owned MDX in `src/content/blog/`, not a CMS fallback. Missing configuration
or backend failures stop the build rather than silently publishing old content.

## Testing

```sh
pnpm check
pnpm test
pnpm build
```

Backend integration tests require `POCKETBASE_BINARY`; browser tests also require
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Upgrade tests need `OLD_POCKETBASE_BINARY`.
Missing prerequisites skip tests. Run browser/build suites serially, without a
dev server sharing the generated Astro/Netlify workspace.

## Publishing

See [PocketBase authoring and operations](pocketbase/README.md) and
[API contracts](pocketbase/contracts.md). Edit music, software and Likes in
PocketBase, then deploy manually in Netlify. Site settings and interactions stay
in code. Blog posts are authored only in the Astro content collection; PocketBase
has no blog publishing support.
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
