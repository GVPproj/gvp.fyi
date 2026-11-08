# File authoring and static boundary

This site uses repository-managed Astro content, not a backend publishing API.
The [architecture decision](adr/0001-repository-managed-astro-content.md) records
this boundary.

## Ownership

- Likes: `src/content/likes/<slug>/index.md` and adjacent source images/downloads.
- Music: `src/content/music/<slug>/index.md` and adjacent source artwork.
- Named collections: `src/content/named-collections.json`; collection items refer
  to stable registry IDs, not copied names.
- Software: `src/content/software/<slug>/index.mdx` and adjacent assets.
- Blog: existing MDX entries under `src/content/blog/`.
- Site settings and interactions: repository code and `src/config/site-settings.json`.

The public repository contains publication-ready content only, with no draft
workflow. Content is authoritative in these files; this is not a cached backend
export or an ongoing sync service.

## Authoring

### Likes and named collections

Use JSON frontmatter in each `src/content/likes/<slug>/index.md`. Keep `id` and
explicit `slug` stable: the slug determines the readable page URL, while the ID
also supports existing legacy redirect pages. Changing a title must not change
the slug. `created` is the date added, not the last edit date; preserve it on edits.
Use valid timestamps with a timezone for `created` and optional `updated`.

Ordinary collection items need a `title` and a `url`, local `image` or PDF
`download`. A destination link is optional for an item with an asset. Choose
one image or PDF, not both. Quotes and notes use `type: "quote"` or `type: "note"`
and nonempty `body` text, with optional `attribution`; they cannot have an image
or download. `description`, `commentary`, `body` and attribution are literal text,
not Markdown composition in the file body. Use credential-free HTTP(S) links.

Put image originals and PDFs beside `index.md` and reference them with `./`
paths; downloads must be adjacent `.pdf` files. Assign optional named collections
through `collections`, using IDs from `src/content/named-collections.json`.
Registry entries need a unique stable `id` and nonempty `name`; `misc` is reserved.
Rename a named collection in the registry rather than changing its ID or copying
its name into collection items.

### Music

Use JSON frontmatter in `src/content/music/<slug>/index.md`, with stable `id` and
explicit `slug`, `title`, `artist`, `category`, `release_date` and local `artwork`.
Category IDs come from `src/config/site-settings.json`. Preserve release-date
precision (year, month or day) rather than inventing a more precise date. Releases
sort newest first within a category, then by integer `order` and stable ID for ties.

Keep artwork originals adjacent and reference them with `./` paths. `about` is
literal text. Tracks use `title` and consecutive `track_num` values starting at 1;
optional `audio_url` values reference existing `/audio/...mp3` files. Commit those
files under `public/audio/`. Listening links use HTTPS; optional display, credit,
streaming and embed fields remain structured frontmatter.

### Software

Software uses frontmatter only; no MDX body composition is required or rendered.
Frontmatter requires `title`, `description`, `category`, integer `order`,
`tooling`, a local `screenshot`, and at least one HTTP(S) `url` or `repo` link.
Category IDs come from `src/config/site-settings.json`. Role, team, gallery and
tagline remain optional. Commit adjacent originals with the entry and use `./`
image paths. Supply screenshot/gallery alt text; image dimensions come from the
originals, not redundant authored width/height fields.

## Build and visitor boundary

Development and builds need no publishing credentials, external CMS, database or
backend checkout. Native Astro collections validate structured content and resolve
local images; native asset processing generates responsive images from adjacent
originals. Required PDFs under `src/` need explicit publication by the Likes download
path; co-location
alone does not expose a file. Existing `/audio/...mp3` files stay under
`public/audio/`.

Legacy `/published-content/` and `/published-releases/` media URLs are no longer
supported. Existing `/audio/` files and legacy page redirects remain supported.
Netlify receives plain static `dist/` output. Blog redirect rules live in `public/_redirects`,
which is copied into `dist/`; existing Likes ID redirects remain static pages.

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

Before production publication, verify content, page URLs and redirects, ordering,
interactions and desktop/mobile appearance. Retain the previous successful static
deployment for rollback; rollback restores that deployment, not a shared database.
Removing this site's dependency grants no permission to stop the shared service,
change its schema or APIs, delete records/storage, or revoke shared credentials.

## Testing boundary

Tests cover native collection validation, stable routes, named-collection
references, chronology, release precision/tie order, local assets and static
rendering/interaction behavior. Repository fixtures are test inputs, not sources
for public content. Browser skips are unexecuted checks, not passes.
