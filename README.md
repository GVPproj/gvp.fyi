# gvp.fyi

A minimal Astro site featuring the animated SVG portrait from `grahamvanpelt.dev` and the Nord palette.

Requires Node.js 22.12+ and pnpm 11.17.

```sh
pnpm install
pnpm dev
```

The dev server uses `http://127.0.0.1:4324`. On `asahi-mini`, Tailscale Serve proxies it at:

https://asahi-mini.tail40c3ca.ts.net:4324/

To recreate the tailnet-only HTTPS proxy:

```sh
tailscale serve --bg --https=4324 http://127.0.0.1:4324
```

Keep `pnpm dev` running while viewing the site. The port is fixed so the proxy cannot silently point at the wrong server.

- `pnpm build` generates the static site in `dist/`.
- `pnpm preview` serves the production build locally.

## Likes

`/likes` reads published links, images, PDFs, quotes, and personal notes from PocketBase in the browser; saves do not require a rebuild. `/links` retains a static-host-compatible redirect.

When you paste or submit a URL for a new item, an owner-only lookup checks for existing items (including drafts). Open a match to reuse it and edit its named collections, or choose **Save another** to keep your new excerpt, image, or commentary as a separate item. Matches show content, publication state, memberships, and record IDs so repeated finds remain distinguishable. Lookup failures keep your fields and block accidental creation; retry Save item after reconnecting or signing in again. Editing an existing item does not run this new-item check. There is no database URL-uniqueness constraint, and simultaneous clients can still create duplicates. See [`pocketbase/ticket-07-rollout.md`](pocketbase/ticket-07-rollout.md) for the conservative URL policy and backend-first rollout; deployment is pending.

Owners can create, rename, and delete named collections and choose zero or several memberships in the item editor. Visitors browse All or one collection using shareable `/likes?collection=<record-id>` URLs. Renaming preserves these URLs; deleted or unknown collections show an unavailable state with an All link. Deleting a collection requires confirmation and never deletes items. Collection names are public, but membership never makes a draft public.

Public Likes loads 24 items at a time, newest-saved first. **Load more** appends without replacing existing cards; failures keep the current page and offer Retry. Switching collections (including browser Back/Forward) starts a fresh page. Pages use an exclusive saved-time/ID cursor, so newly saved items do not shift the remaining results; use **Reload Likes** to see newer saves. Editing or regrouping an item does not change its saved time. Pagination requests are anonymous, exclude drafts, and request no totals. This is not a snapshot of concurrent deletions, publication changes, or membership changes. No backend migration is needed for pagination.

Copy `.env.example` to `.env` and set `PUBLIC_POCKETBASE_URL` before building. This is a public origin, not a credential. Never expose an administrator token through Astro environment variables. The owner signs in using the dedicated `likes_owners` email/password account; its token is kept only in memory and sign-out clears it. There is no signup UI, and signup is also locked on the server.

PocketBase 0.40.4 and the Likes collections are deployed; owner sign-in/save and anonymous publication are verified. See [`pocketbase/README.md`](pocketbase/README.md) for verification and setup. The board reports backend/configuration errors rather than using Git-backed sample content.

```sh
pnpm test
pnpm check
pnpm build
# Secure preview fetcher and owner endpoint (Go 1.27+):
(cd pocketbase/server && go test ./...)
# Include the real PocketBase authorization tests (upgrade target: version 0.40.4):
POCKETBASE_BINARY=/absolute/path/to/pocketbase pnpm test
# Run real-browser Likes navigation and upload/viewer regressions (otherwise skipped):
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chrome node --test tests/likes-navigation.test.js tests/likes-assets-browser.test.js tests/likes-previews-browser.test.js tests/likes-text-browser.test.js tests/likes-duplicates-browser.test.js tests/likes-pagination-browser.test.js
```

The browser regressions start temporary loopback Astro dev servers, mock PocketBase HTTP at `https://pb.example`, and block other external requests. They use `playwright-core` with an existing Chromium executable (for example `~/.cache/ms-playwright/chromium-*/chrome-linux/chrome` or `chrome-linux64/chrome`); no browser download or production backend is needed.

Tests cover safe rendering, browser states and save failures, and (with the binary supplied) real anonymous/owner/non-owner API permissions, protected uploads, file cleanup, and ordering in a disposable database. They never connect to production. URL preview fixtures cover safe fetching, editor overrides, failures, and stale responses. Links without an image retain square hostname placeholders.

Owners can upload one JPEG, PNG, GIF, WebP, or PDF per item, up to **10 MiB (10,485,760 bytes)**. The title is required; uploads need no destination URL. The optional URL credits a source, and description/commentary provide text. Images fit square previews without cropping and open an on-site viewer (Escape or Close to dismiss); PDFs open the stored file in a new tab. The editor retains the current upload unless you replace it or explicitly remove it. Selecting a file alone uploads nothing; Cancel clears the local selection. A failed save retains edits; if the connection drops, reload the board/drafts before retrying because the server may have completed the save.

Assets belong directly to their PocketBase item, not to Git or the static build. Draft originals and thumbnails are protected by the item’s view rule. Files already downloaded while published cannot be made secret retroactively. Deploy the backend migration **and hooks before the frontend**; see [`pocketbase/ticket-04-rollout.md`](pocketbase/ticket-04-rollout.md) for storage, cleanup, limits, and verification.

Pasting a URL in the owner editor fetches a suggested title, description, and preview image; you can also request a preview explicitly. Review or override the suggestions before saving. Fetch failures never prevent manual entry or saving, and a late response does not replace explicit edits. Preview images are held locally until Save, then copied into the same protected PocketBase storage as uploads; full pages are never archived. Fetched source attribution is stored separately from owner overrides. This requires the custom Go backend and additive migration described in [`pocketbase/ticket-05-rollout.md`](pocketbase/ticket-05-rollout.md); it is not yet deployed.

Choose **Quote** or **Personal note** in the editor to save plain text without a destination URL or title. Attribution and source URLs are optional; text is limited to 100,000 characters. Text items use bounded square previews and open a scrollable on-site reader, with Escape/Close dismissal and keyboard focus returned to the card. HTML is displayed as text, not executed. Drafting, publishing, collections, editing, and confirmed permanent deletion work as for other items. Text items cannot have an upload; remove the existing upload before converting one. Deploy the migration and hooks in [`pocketbase/ticket-06-rollout.md`](pocketbase/ticket-06-rollout.md) before this frontend; deployment is pending.

Nord colors and semantic color variables live in `src/styles/global.css`. The portrait respects reduced-motion preferences.

Gohu is self-hosted at `public/fonts/gohu-400-latin.woff2`, copied from `unbusy.day/internal/frontend/static/fonts/`. Its WTFPL license is included at `public/fonts/GOHU-LICENSE.txt`.
