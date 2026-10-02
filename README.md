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

`/likes` reads published links from PocketBase in the browser; saves do not require a rebuild. `/links` retains a static-host-compatible redirect.

Owners can create, rename, and delete named collections and choose zero or several memberships in the item editor. Visitors browse All or one collection using shareable `/likes?collection=<record-id>` URLs. Renaming preserves these URLs; deleted or unknown collections show an unavailable state with an All link. Deleting a collection requires confirmation and never deletes items. Collection names are public, but membership never makes a draft public.

Copy `.env.example` to `.env` and set `PUBLIC_POCKETBASE_URL` before building. This is a public origin, not a credential. Never expose an administrator token through Astro environment variables. The owner signs in using the dedicated `likes_owners` email/password account; its token is kept only in memory and sign-out clears it. There is no signup UI, and signup is also locked on the server.

PocketBase 0.40.4 and the Likes collections are deployed; owner sign-in/save and anonymous publication are verified. See [`pocketbase/README.md`](pocketbase/README.md) for verification and setup. The board reports backend/configuration errors rather than using Git-backed sample content.

```sh
pnpm test
pnpm build
# Include the real PocketBase authorization tests (upgrade target: version 0.40.4):
POCKETBASE_BINARY=/absolute/path/to/pocketbase pnpm test
# Run only the real-browser Likes navigation regression (otherwise skipped):
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chrome node --test tests/likes-navigation.test.js
```

The browser regression starts a temporary loopback Astro dev server, mocks PocketBase HTTP at `https://pb.example`, and blocks other external requests. It uses `playwright-core` with an existing Chromium executable (for example `~/.cache/ms-playwright/chromium-*/chrome-linux/chrome` or `chrome-linux64/chrome`); no browser download or production backend is needed.

Tests cover safe rendering, browser states and save failures, and (with the binary supplied) real anonymous/owner/non-owner API permissions and ordering in a disposable database. They never connect to production. Preview enrichment and uploads belong to later tickets; links currently use square hostname placeholders.

Nord colors and semantic color variables live in `src/styles/global.css`. The portrait respects reduced-motion preferences.

Gohu is self-hosted at `public/fonts/gohu-400-latin.woff2`, copied from `unbusy.day/internal/frontend/static/fonts/`. Its WTFPL license is included at `public/fonts/GOHU-LICENSE.txt`.
