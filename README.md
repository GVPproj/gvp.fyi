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
