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

- `pnpm build` generates static assets in `dist/` and the Netlify Function for `/likes`.
- `pnpm dev` runs both static and on-demand routes locally. Use Netlify's local tooling or a Deploy Preview to verify the production function.

## Blog

Blog posts live in `src/content/blog/` as `.md` or `.mdx` files with a required `title` in YAML frontmatter. They appear automatically at `/blog/` (alphabetically by title), with the filename determining the post URL. Posts are prerendered; publishing changes requires a rebuild.

Use MDX to embed Astro components alongside Markdown:

```mdx
---
title: Drawing my face
---

import Face from '@src/components/Face.astro';

<Face />

Your Markdown here.
```

## Music Releases

`/music-releases` shows horizontal category rows of linked album covers, newest first. Each cover opens a static detail page at `/music-releases/<slug>` with release information, description (when available), a Bandcamp player, and available streaming links. Browsing works without JavaScript.

The **as Graham Van Pelt** catalogue is imported intact from `gvp-music-sv/src/lib/data/releases.json` into `src/data/releases/graham-van-pelt.json`. Edit the JSON and rebuild to publish changes; no PocketBase migration or connection is needed. Artwork and audio are hosted by Bandcamp. `src/lib/music-releases.ts` groups releases and derives display fields; detail slugs use the display title (or title), so renaming a title requires preserving its old URL with a redirect.

## Likes

`/likes` renders published links, images, PDFs, quotes, and personal notes in Astro on each request through a Netlify Function. Public browsing works without JavaScript; saves do not require a rebuild. All other pages remain prerendered. `/links` retains a static-host-compatible redirect.

`/likes/manage` contains the separate browser-based owner editor, drafts, collection management, and interactive board. Sign in at `/login`, then open **Manage Likes**. The management HTML is public; PocketBase authorization—not hiding the editor—protects owner data and writes.

When you paste or submit a URL for a new item, an owner-only lookup checks for existing items (including drafts). Open a match to reuse it and edit its named collections, or choose **Save another** to keep your new excerpt, image, or commentary as a separate item. Matches show content, publication state, memberships, and record IDs so repeated finds remain distinguishable. Lookup failures keep your fields and block accidental creation; retry Save item after reconnecting or signing in again. Editing an existing item does not run this new-item check. There is no database URL-uniqueness constraint, and simultaneous clients can still create duplicates. See [`pocketbase/contracts.md`](pocketbase/contracts.md) for the conservative URL comparison policy.

Owners can create, rename, and delete named collections and choose zero or several memberships in the item editor. The default `/likes` view shows horizontal named-collection rows, alphabetically, followed by **Misc.** for uncollected items. Each row has a published-block count, latest published-member edit time, and up to eight previews (latest edited first). Empty named-collection rows remain visible; Misc. is hidden when it has no published items. Counts include all published members, not just the previews; edit times do not track collection renames or historical removals. Summary reads are anonymous with at most four concurrent requests, and do not load the whole item library.

Selecting a row opens the existing grid at `/likes?collection=<record-id>` or `/likes?collection=misc`; **All items** remains available at `/likes?view=all`. Native links work without JavaScript, including returning to the overview. Renaming preserves collection URLs; deleted or unknown collections show an unavailable state with a link back to the overview. Deleting a collection requires confirmation and never deletes items. Collection names are public, but membership never makes a draft public.

Public Likes grids render 24 items per page, newest-saved first. Native filter and next-page links request fresh HTML; changing collections resets pagination. Backend failures return an HTTP 503 page with a retry link. Pages use an exclusive saved-time/ID cursor (`afterCreated` and `afterId`) ordered by `-created,-id`, so newly saved items do not shift the remaining results; reopen the grid without a cursor to see newer saves. The management board retains its JavaScript **Load more** interaction. Editing or regrouping an item does not change its saved time. Pagination requests are anonymous, exclude drafts, and request no totals. This is not a snapshot of concurrent deletions, publication changes, or membership changes. No backend migration is needed for pagination.

Copy `.env.example` to `.env` and set `PUBLIC_POCKETBASE_URL`. On Netlify, make it available to both **Builds and Functions**, then redeploy. Keep the build command `pnpm build` and publish directory `dist`; the `@astrojs/netlify` adapter generates function routing. `/likes` deliberately sends `Cache-Control: no-store` for this experiment and fetches anonymously with an eight-second timeout per backend request. PocketBase must be reachable from Netlify, and public page requests now consume function usage. No backend migration is needed for this hosting change. This is a public origin, not a credential. Never expose an administrator token through Astro environment variables. The owner signs in at `/login` using the dedicated `likes_owners` email/password account and lands on `/`. The token is kept in tab-scoped `sessionStorage` (never the password or `localStorage`), so navigation and refresh retain the session. The site-wide **Logged In** popover offers **Log out**, which clears local authentication and unsaved-editor recovery; it does not revoke tokens server-side. Browser session restoration may retain tab storage, so closing a tab is not a security-grade revocation mechanism. Expired Likes edits are recovered after signing in and returning to `/likes/manage`, without automatically saving. If browser storage is unavailable or full, download the offered private edit backup before leaving. There is no signup UI, and signup is also locked on the server.

The last recorded production baseline was PocketBase 0.40.4 with initial link support; this is not a fresh production check. Deployment of the subsequent Likes features is tracked in [issue #1](https://github.com/GVPproj/gvp.fyi/issues/1). See [`pocketbase/README.md`](pocketbase/README.md) for backend setup and deployment guidance. The board reports backend/configuration errors rather than using Git-backed sample content.

```sh
pnpm test
pnpm check
pnpm build
# Secure preview fetcher and owner endpoint (Go 1.27+):
(cd pocketbase/server && go test ./...)
# Include the real PocketBase authorization tests (upgrade target: version 0.40.4):
POCKETBASE_BINARY=/absolute/path/to/pocketbase pnpm test
# Run real-browser Likes navigation and upload/viewer regressions (otherwise skipped):
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chrome node --test tests/likes-navigation.test.js tests/likes-assets-browser.test.js tests/likes-previews-browser.test.js tests/likes-text-browser.test.js tests/likes-duplicates-browser.test.js tests/likes-pagination-browser.test.js tests/public-likes.test.js
```

Run browser tests separately from builds to avoid interfering with their Astro dev servers. The browser regressions start temporary loopback Astro dev servers, mock PocketBase HTTP at `https://pb.example`, and block other external requests. They use `playwright-core` with an existing Chromium executable (for example `~/.cache/ms-playwright/chromium-*/chrome-linux/chrome` or `chrome-linux64/chrome`); no browser download or production backend is needed.

Tests cover safe rendering, browser states and save failures, and (with the binary supplied) real anonymous/owner/non-owner API permissions, protected uploads, file cleanup, and ordering in a disposable database. They never connect to production. URL preview fixtures cover safe fetching, editor overrides, failures, and stale responses. Links without an image retain square hostname placeholders.

Owners can upload one JPEG, PNG, GIF, WebP, or PDF per item, up to **10 MiB (10,485,760 bytes)**. The title is required; uploads need no destination URL. The optional URL credits a source, and description/commentary provide text. Images fit square previews without cropping. Public image cards link to the original file; the management board retains its on-site viewer (Escape or Close to dismiss). PDFs open the stored file in a new tab. The editor retains the current upload unless you replace it or explicitly remove it. Selecting a file alone uploads nothing; Cancel clears the local selection. A failed save retains edits; if the connection drops, reload the board/drafts before retrying because the server may have completed the save.

Assets belong directly to their PocketBase item, not to Git or the static build. Draft originals and thumbnails are protected by the item’s view rule. Files already downloaded while published cannot be made secret retroactively. Deploy the backend migration **and hooks before the frontend**; see [`pocketbase/README.md`](pocketbase/README.md) for deployment and storage recovery, and [`pocketbase/contracts.md`](pocketbase/contracts.md) for upload limits and access rules.

Pasting a URL in the owner editor fetches a suggested title, description, and preview image; you can also request a preview explicitly. Review or override the suggestions before saving. Fetch failures never prevent manual entry or saving, and a late response does not replace explicit edits. Preview images are held locally until Save, then copied into the same protected PocketBase storage as uploads; full pages are never archived. Fetched source attribution is stored separately from owner overrides. This requires the custom Go backend and coordinated migrations described in [`pocketbase/README.md`](pocketbase/README.md).

Choose **Quote** or **Personal note** in the editor to save plain text without a destination URL or title. Attribution and source URLs are optional; text is limited to 100,000 characters. Public text items use native expandable disclosures to read the full text without JavaScript. The management board retains bounded square previews and a scrollable on-site reader, with Escape/Close dismissal and keyboard focus returned to the card. HTML is displayed as text, not executed. Drafting, publishing, collections, editing, and confirmed permanent deletion work as for other items. Text items cannot have an upload; remove the existing upload before converting one. Deploy the text-item migration and updated hooks together before this frontend; see [`pocketbase/README.md`](pocketbase/README.md).

Nord colors and semantic color variables live in `src/styles/global.css`. The portrait respects reduced-motion preferences.

Gohu is self-hosted at `public/fonts/gohu-400-latin.woff2`, copied from `unbusy.day/internal/frontend/static/fonts/`. Its WTFPL license is included at `public/fonts/GOHU-LICENSE.txt`.
