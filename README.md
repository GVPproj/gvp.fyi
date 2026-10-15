# gvp.fyi

## Install

Requires Node.js 22.12+ and pnpm 11.17.

```sh
pnpm install
cp .env.example .env
```

Set `PUBLIC_POCKETBASE_URL` in `.env` to your PocketBase origin. See [`pocketbase/README.md`](pocketbase/README.md) for backend setup.

## Development

```sh
pnpm dev
```

The dev server uses `http://127.0.0.1:4324`. Keep `pnpm dev` running while viewing the site.

On `asahi-mini`, Tailscale Serve proxies it at `https://asahi-mini.tail40c3ca.ts.net:4324/`. To recreate the tailnet-only HTTPS proxy:

```sh
tailscale serve --bg --https=4324 http://127.0.0.1:4324
```

## Testing

Use the scripts in `package.json` for checks, tests and builds. Integration/browser tests require `POCKETBASE_BINARY`, `OLD_POCKETBASE_BINARY` where applicable, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; missing prerequisites skip tests rather than prove readiness.

Run browser suites with `--test-concurrency=1`. Keep builds and Astro servers from sharing the generated workspace during a test run. For tests supporting `PLAYWRIGHT_BASE_URL`, use a stable, already-built fixture server. Astro navigation assertions should wait for `astro:page-load`, not merely a URL change.

## Working docs

- [Dashboard workflow and content scope](docs/dashboard-publishing.md)
- [Imports](docs/import-editorial.md)
- [Cutover checklist and current blockers](docs/content-cutover-readiness.md)
- [Backup implementation and activation](infra/backups/README.md)
- [Admin access and recovery](docs/admin-recovery.md)
- [Ambient instrument](docs/ambient-playground.md)

Issues/specs live in [GitHub Issues](https://github.com/GVPproj/gvp.fyi/issues).
