# Make repository-managed Astro content authoritative

Store publication-ready content and required assets in the repository using Astro content collections, so building and running the site requires no database or external CMS. The owner edits and commits files directly; there is no browser-based editor or draft workflow.

Likes and music use a folder per entry with structured frontmatter in `index.md` and adjacent assets. Software renders structured frontmatter, not MDX bodies. Preserve literal text rather than introducing Markdown interpretation. Keep explicit slugs and existing IDs stable across title changes, and retain legacy page redirects. Each entry belongs to one category defined in `src/config/site-settings.json`; Likes categories sort alphabetically.

Use native Astro responsive images generated from adjacent originals; historical image byte parity and legacy `/published-content/` and `/published-releases/` media URLs are not required. Public page URLs, legacy page redirects and `/audio/` files remain supported.

Publish plain static `dist/` output to Netlify without an adapter, retaining blog rules in `public/_redirects` and Likes ID redirect pages. Publication requires a successful build and separate owner approval; failed builds leave the previous deployment live. Shared backend services and data are outside this repository's operational scope.
