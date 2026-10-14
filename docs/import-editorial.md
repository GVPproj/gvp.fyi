# Editorial import and rendering (GH21)

`node scripts/import-editorial.mjs` imports seven software projects, one blog article and `settings/site` into an **isolated loopback** PocketBase. Set `PUBLISHING_POCKETBASE_URL` and `PUBLISHING_IMPORT_TOKEN` locally. No production endpoint is accepted. Existing working or retained `(kind, slug)` identities are skipped, never adopted, withdrawn, overwritten or republished. A superuser-only identity inventory checks retained collisions before any draft creation. New entries are drafts. `--publish` explicitly publishes only newly imported entries after upload-name mapping is saved. Partial failures leave drafts for review; rerunning does not repair or publish those drafts.

## Native `editorial_entries` shape

Common fields: `kind`, stable `slug`, JSON `data`, protected multi-file `assets`, boolean `published` (false by default).

- **software:** `data` preserves every field from `src/data/software-projects.ts`, including nested role, paragraphs, tooling, team links, tagline, gallery descriptions and dimensions. Adds zero-based numeric `order` and editable `screenshotAlt`. The record's slug wins over `data.slug`. Order is ascending, with slug as the tie breaker. Categories are arbitrary stable IDs matching settings metadata.
- **blog:** `{ "title": "…", "markdown": "…" }`. Slug is the existing route ID; titles sort alphabetically. Markdown is rendered with `markdown-it`, raw HTML disabled, no MDX/import execution. A standalone `<!-- demo:face -->` paragraph inserts the code-owned Face component, at most once per article. The marker inside code fences stays text. The importer converts the existing Sophia attribution to a Markdown link and preserves the entire displayed Astro code example. The historical redirect remains config-owned.
- **settings**, slug **site:** see `src/data/site-settings.json` for the complete initial document. `title`, `identity`, `description`, `homeLabel`; `sections` keyed by stable route name; ordered `navigation` of `{id,label,href}` or `{id,label,children:[{label,href}]}` (stable unique lowercase IDs); ordered `categories.software` and `categories.releases` arrays of `{id,title}`; `placeholders:[{slug,title,body}]`. Navigation labels do not rename routes. Placeholder body is plain text. SVG identity, instrument and control UI copy remain code-owned.

## Assets

Software `screenshot` and gallery `src` retain their original source paths. `data.assetNames` maps each original basename to its actual PocketBase-generated uploaded filename. The importer creates a private draft with files first, then saves this mapping (and optionally publishes). Upload order is used to associate PocketBase's returned `assets` filenames with the submitted files. Replace one file at a time and Save: the server repairs its stable alias after PocketBase assigns the new filename, before publishing. Multiple replacements are accepted only when original filenames disambiguate their aliases; ambiguous mappings reject Save rather than publishing broken references. Keep `assetNames` for replaceable images/downloads. Direct uploaded filenames also work, but then references must be maintained manually.

Blog Markdown image/link destinations can also reference uploaded filenames or original source paths using the same optional `assetNames` mapping. All image references and local download references must resolve to retained uploads or the build fails. External HTTP(S) reading links remain links; upload any image intended to appear in the article so it remains available offline.

The frontend matches the mapped filename against snapshot `assets[].name`, then uses its materialized `url`; it never constructs public PocketBase URLs or falls back to Git images in full mode. Missing referenced assets fail the build. Image dimensions and responsive variants are derived from the uploaded files; gallery descriptions are not synthesized.

## Integration

The build integration registers `virtual:published-content`, exporting `null` outside full mode or authoritative latest snapshots in full mode (including withdrawals). There is no repository fallback in full mode. A published `settings/site` record is required; missing/withdrawn settings fail the build rather than silently emptying site navigation and identity. `sectionLabel()` and `categorySettings()` supply all section renderers, including release categories.

Runtime dependency `markdown-it` and dev dependency `@types/markdown-it` are installed and locked.

Checks: `node --test tests/editorial-content.test.js tests/editorial-build.test.js`; `pnpm check`. The build test renders Tipbox, blog prose/demo and settings from a mock snapshot endpoint, checks materialized image URLs and confirms repo-only/withdrawn projects are absent. Importer tests use injected mock HTTP, not production writes.
