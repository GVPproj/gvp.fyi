# Public Likes ClientRouter and owner lifecycle audit

## Routing decision

Public `/likes` uses ClientRouter. Its content, filters, cursor links and cache
policy remain server-rendered and unchanged. `Sig.astro` is unchanged: the SVG
persists within a document, and its completed animation is stamped inline.

**Keep `/likes/manage` and `/login` native** (`clientRouter={false}`). Entering or
leaving either route reloads the document; signature persistence cannot cross
these boundaries or refreshes. This audit does not claim to resolve existing
owner-page recovery or BFCache limitations.

## Lifecycle audit

- `src/scripts/likes.js` initializes on `astro:page-load`, guarded by the root's
  `data-bound`. Both public and management pages use `#likes`; if management
  adopted the router, its retained initializer would attempt to bind missing
  editor controls on public Likes. A management-specific root guard is needed.
- Its `pagehide` handler closes private PDF windows and updates an existing
  recovery snapshot. **Client navigation does not emit `pagehide`.** The current
  `astro:before-swap` handler only removes `popstate`. Before owner adoption,
  committed Astro departure needs equivalent page-scoped disposal: close private
  windows/viewers, invalidate pending work and recovery writes, and unregister
  global listeners. Sensitive viewers should close before transition snapshots.
  Native owner boundaries still trigger the existing `pagehide` cleanup; public
  Likes does not initialize owner viewers or need that cleanup.
- Authenticated requests are guarded by `sessionGeneration`, not page lifetime.
  Board reads check `root.isConnected`, but drafts, previews, duplicate checks,
  viewer/file-token work and mutation continuations are not consistently guarded
  on departure. `src/lib/likes.js` does not expose request cancellation. Owner
  adoption needs lifetime guards and cancellation where feasible (canceling a
  mutation does not guarantee it did not commit on the server).
- Recovery snapshots are taken on expiry; `pagehide` only updates recovery when
  a record already exists, not every ordinary unsaved edit. Asynchronous upload
  serialization uses `recoveryGeneration`, which navigation does not invalidate.
  A retained old editor could overwrite recovery after departure or logout.
  An explicit dirty-edit policy and ownership of asynchronous recovery writes
  must precede owner adoption.
- `src/scripts/session.js` binds each current logout/form element once and
  re-queries controls on `astro:page-load`. Login refresh only guards token
  equality; login submission has no page/request lifetime guard. A late response
  could authenticate or redirect after leaving a router-enabled login page.
- Management filters call `history.pushState(null, ...)` and own `popstate`.
  This needs reconciliation with Astro's indexed history before owner adoption.
- `src/lib/session.js` checks expiry and emits reconciliation on `pageshow`;
  management reconciles changed/absent sessions. Same-token BFCache restoration
  returns early without refreshing private reads. Native `pagehide` closes PDF
  windows but does not scrub all private DOM/dialogs. Native routing is retained
  containment, not a new guarantee of complete BFCache privacy.

## Public shared state

`src/scripts/session.js` and `src/scripts/manage-likes-link.js` re-query current
DOM on page-load/session events. Per-element initialization prevents repeated
logout binding. `src/lib/session.js` owns the document-wide expiry timer and
visibility/pageshow reconciliation; it should survive public client navigation,
not be disposed on each swap. Public item text uses native `<details>` and asset
links, not management's private viewers.

## Verification

- Chromium browser coverage in `tests/public-likes.test.js`: 14 tests passed,
  none skipped. Covers completed SVG identity/no replay in both directions,
  forced remove/reinsert, navigation during drawing, fresh document drawing,
  reduced motion, keyboard filters, direct URLs, refresh, Back/Forward, repeated
  shared session initialization, single logout event and expiry reconciliation.
  The fallback may restart an unfinished draw on reinsertion; the same SVG
  survives and completes, after which the existing inline stamp prevents replay.
- `pnpm check`: passed, 0 errors/warnings (3 existing native-audio type hints).
- `pnpm build`: passed; existing MDX `use astro:head-inject` bundler warning.
- Relevant browser regression run: 25 passed, none skipped, using
  `node --test --test-concurrency=1 tests/public-likes.test.js tests/session-browser.test.js tests/session-resilience-browser.test.js tests/site-navigation-browser.test.js tests/likes-navigation.test.js`
  with the Chromium environment variable set. Native owner recovery, logout,
  private-state reconciliation and site navigation regressions also passed.
- A parallel browser-enabled `pnpm test` attempt failed: 103 passed, 26 failed,
  10 skipped (PocketBase binary unavailable). Failures included aborted document
  loads, unexpected reloads and timeouts across public Likes and unchanged owner,
  music and audio tests. Concurrent Astro dev-server/cache interference is
  suspected; the relevant browser files all pass serially without code changes.
  Do not treat the parallel all-browser suite as verified. Isolating each test
  server's dev cache is outside this routing change.
- Standard `pnpm test` (without optional browser/PocketBase executable variables):
  passed, 67 passed / 72 skipped / 0 failed. Relevant browser tests were run
  explicitly above rather than relying on these skips.
- Two-axis code review: no documented Standards violations and no Spec findings.
  One optional test-fixture duplication note was retained to keep the individual
  navigation scenarios explicit.

Browser tests use the existing local PocketBase HTTP fixture, exercising real
SSR and Astro navigation rather than replacing rendered public pages. Browser
executable: `PLAYWRIGHT_CHROMIUM_EXECUTABLE` set to cached Chromium 151. Browser
assertions wait for `astro:page-load`, not just the earlier URL/DOM swap.
