# gvp.fyi

Astro site with repository-managed content and static Netlify publishing.
Edit content files and their adjacent assets, commit, then build and deploy.
No database, external CMS or publishing credentials are required.

## Development

Requires Node.js 22.12+ and pnpm 11.17.

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4324`. There is no required `.env` setup.
Likes, music, software and blog content live under `src/content/`.
Only publication-ready content belongs in this public repository; there is no
draft feature. Missing or invalid required content/assets must fail the build.

## Testing

```sh
pnpm check
pnpm test
pnpm build
```

Tests cover content validation, static output and browser behavior.
Browser tests require `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
pointing to a working Chromium executable; missing browser prerequisites skip
tests, not pass them. Run browser/build suites serially, without a dev server
sharing the generated Astro workspace.

## Publishing

See [file authoring and the static boundary](docs/backend-api.md) for Likes,
categories, music, software and assets. Blog authoring is described below.
Site settings and interactions stay in code.

Commit content and assets together, run the checks above, and manually deploy the
successful plain static `dist/` output in Netlify; no Netlify adapter is required.
Changes go live only after a successful deployment; failed builds leave the
previous site live. Production deployment requires separate
owner approval and the [deployment safeguards](docs/backend-api.md#publication).

Issues/specs live in [GitHub Issues](https://github.com/GVPproj/gvp.fyi/issues).

### Blog

Add `.mdx` posts under `src/content/blog/` with `title` and quoted `YYYY-MM-DD`
`date` frontmatter. The filename determines `/blog/<slug>/`.

Import components only in articles that use them. For example,
`the-animated-face.mdx` imports `Face` directly:

```mdx
import Face from '@src/components/elements/Face.astro';

<Face />
```

Use fenced `astro` code blocks for source examples.
