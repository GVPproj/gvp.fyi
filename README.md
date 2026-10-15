# gvp.fyi

Astro frontend, static Netlify publishing, custom PocketBase backend.

## Development

Requires Node.js 22.12+ and pnpm 11.17.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://127.0.0.1:4324`. Without publishing credentials, development uses
checked-in music/software/blog content; Likes is empty. Set the server-only
publishing variables in `.env.example` to build from PocketBase.

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

## Where things live

- `src/`: pages, components, content and publishing build integrations.
- `public/`: static audio, images, fonts and licenses.
- `pocketbase/`: [backend setup and operations](pocketbase/README.md), migrations and hooks.
- `tests/`: regression tests and disposable fixtures.

Edit content through the [PocketBase dashboard](docs/dashboard-publishing.md),
then deploy manually in Netlify. Site settings and interactions stay in code.
See [ambient instrument behavior](docs/ambient-playground.md).

Issues/specs live in [GitHub Issues](https://github.com/GVPproj/gvp.fyi/issues).
