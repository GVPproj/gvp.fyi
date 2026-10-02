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

Nord colors and semantic color variables live in `src/styles/global.css`. The portrait respects reduced-motion preferences.

Gohu is self-hosted at `public/fonts/gohu-400-latin.woff2`, copied from `unbusy.day/internal/frontend/static/fonts/`. Its WTFPL license is included at `public/fonts/GOHU-LICENSE.txt`.
