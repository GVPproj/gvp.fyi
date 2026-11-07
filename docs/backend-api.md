# File authoring and static boundary

This site uses repository-managed Astro content, not a backend publishing API.
The historical filename is retained for existing documentation links. The
[architecture decision](adr/0001-repository-managed-astro-content.md) records the
boundary; [#35 evidence](migrations/35/README.md) records the migration and its
still-pending native verification.

## Ownership

- Likes: `src/content/likes/<slug>/index.md` and adjacent source images/downloads.
- Music: `src/content/music/<slug>/index.md` and adjacent source artwork.
- Named collections: `src/content/named-collections.json`; collection items refer
  to stable registry IDs, not copied names.
- Software: existing `src/content/software/<slug>/index.mdx` and adjacent assets.
- Blog: existing MDX entries under `src/content/blog/`.
- Site settings and interactions: repository code and `src/config/site-settings.json`.

[Authoring instructions](migrations/35/authoring.md) describe fields, stable URLs,
literal text, assets and validation. The public repository contains
publication-ready content only, with no draft workflow. Content is authoritative
in these files; this is not a cached backend export or an ongoing sync service.

## Build and visitor boundary

Development and builds need no publishing credentials, external CMS, database or
backend checkout. Native Astro collections validate structured content and resolve
local images. Native asset processing produces new responsive images. Required
PDFs under `src/` need explicit publication by the Likes download path; co-location
alone does not expose a file. Existing `/audio/...mp3` files stay under
`public/audio/`.

`public/published-content/` and `public/published-releases/` contain immutable
compatibility bytes for previously public URLs, including deployed image variants.
Do not regenerate them, point them at a backend, or remove them just because new
Astro images have different URLs. Their recorded checksums are in the
[migration manifest](migrations/35/manifest.json).

Visitors receive static pages and media. Independent external links and embeds
remain, but no backend authentication or content acquisition belongs in the
visitor path. Netlify's image CDN is not required for these local image assets.
A missing or invalid required entry/asset must fail the build rather than silently
publish an incomplete catalogue.

## Publication

1. Edit files/assets and preview locally with `pnpm dev`.
2. Run `pnpm check`, `pnpm test` and `pnpm build`; supply a working
   `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for browser tests. Run build/browser suites
   serially without another process sharing the generated workspace.
3. Review and commit entries and originals together. A commit is not deployment.
4. After separate owner approval, publish the successful static build in Netlify.

Edits and removals take effect only in the next successful deployment. Failed
builds leave the previous static site live. Content edits do not reset a
collection item's date added; title edits do not alter explicit slugs.

For this migration, follow the [cutover and rollback checklist](migrations/35/cutover.md).
Rollback restores the previous static deployment, not a shared backend database.
Removing this site's dependency grants no permission to stop the shared service,
change its schema or APIs, delete records/storage, or revoke shared credentials.

## Software remains unchanged

Software frontmatter requires `title`, `description`, `category`, integer `order`,
`tooling`, a local `screenshot`, and at least one HTTP(S) `url` or `repo` link.
Category IDs come from `src/config/site-settings.json`. Role, team, gallery and
tagline remain optional. Commit adjacent originals with the MDX entry. Shared
software pages continue to render structured frontmatter, not the currently
unused MDX bodies; the migration does not enable new body rendering.

## Testing boundary

Tests cover native collection validation, stable routes, named-collection
references, chronology, release precision/tie order, local assets and static
rendering/interaction behavior. Repository fixtures are test inputs, not sources
for the migrated public content. No backend mocks, authentication fixtures or
backend migration suite are required for this site's final boundary. Browser
skips are unexecuted checks, not passes. Final clean credential-free development,
build, browser and same-capture parity checks remain pending in the migration
record until the parent verification run supplies results.
