# Editorial inventory

## Scope and status

Repository inspection only: checked-in public content, source schemas, rendering paths and publishing documentation. No live PocketBase records, credentials, GitHub issues, deployment settings or remote media were inspected. Counts below are repository counts, not a production audit. No tests or deployment rehearsals were run for this inventory.

Read alongside [domain vocabulary](../CONTEXT.md), [dashboard plan](dashboard-publishing.md), [current publishing decisions](publishing-decisions.md), [release rehearsal](release-publishing.md), [importer](import-release.md), [release contract](../pocketbase/publishing-contract.md), [Likes contracts](../pocketbase/contracts.md) and [backend operations](../pocketbase/README.md). No `docs/adr/` directory is present.

**Current direction is not current coverage.** The target is native PocketBase `/_/` editing, local Fly-volume originals and static Netlify delivery. The only implemented snapshot publishing slice is the opt-in Watery Grave EP tracer. Documentation records its persistent Published toggle/JSON-track replacement as local, not deployed; the historical Fly trial still used separate commands/tracks, and Netlify was not connected. This inventory does not reverify that live state.

“Dashboard support” below distinguishes editable database fields from a complete accepted publishing workflow. Native record editing alone does not supply snapshots, static delivery, preview conveniences or deployment.

## Editorial versus layout

- **Editorial:** titles, prose, credits, attribution, links, dates/display overrides, content identity/slugs, category labels/membership/order, chosen artwork/audio, image descriptions and navigation destinations. These remain editorial even when currently embedded in TypeScript or Astro.
- **Presentation/application code:** page grids, responsive sizing, CSS, native controls, animation, accessible interaction mechanics, validation, pagination and image processing. Do not migrate these into a page builder.
- **Mixed boundaries needing agreement:** identity SVG artwork, embedded blog demonstrations, instrument branding/sounds, page headings and site metadata. Distinguish content from the mechanism displaying it.
- **UI copy:** button labels, errors, empty states, login instructions, fallback labels and accessibility instructions stay coupled to behavior by default. This is a proposed code-owned boundary, not approval to exclude all text from editorial scope.

## 1. Releases

### Sources and size

| Concrete source | Releases | Track entries |
| --- | ---: | ---: |
| `src/data/releases/graham-van-pelt.json` | 6 | 36 |
| `src/data/releases/miracle-fortress.json` | 12 | 42 |
| `src/data/releases/think-about-life.json` | 9 | 60 |
| `src/data/releases/other-credits.json` | 9 | 0 |
| **Total** | **36** | **138** |

Editorial fields include `title`, `artist`, `release_date`, `about`, `credit`, `display_title`, `display_date`, track titles/numbers/durations/audio URLs, release URL, Spotify/Apple/Tidal links, Bandcamp album/art IDs, artwork URLs and two `youtube_video_id` values in `graham-van-pelt.json`. Preserve fields even when not rendered today: YouTube IDs are not consumed by the current release templates/type declaration; full track listings/durations are not displayed independently of players. `player_height` is an existing presentation override, not release prose.

`src/lib/music-releases.ts` owns four category IDs, labels and their order: “as Graham Van Pelt”, “as Miracle Fortress”, “with Think About Life”, “Other Credits”. It applies display-title overrides and date-descending order. `src/lib/release-source.js` derives slugs; existing links must not accidentally change when titles are edited. `src/pages/music-releases/index.astro` and `[slug].astro` render listings/details, credits, paragraphs and listening links; they also own headings, generated cover alt text (`<title> album cover`) and player presentation.

### Media

- `public/images/music-releases/`: **14 JPEGs**, all referenced by catalogue artwork URLs. Remaining **22 releases** use remote art: 17 Bandcamp references (16 art IDs plus one explicit URL) and five Apple artwork URLs. Remote dependencies are not retained private originals and are not covered by the tracer's offline-media guarantee.
- `public/audio/watery-grave/`: **five MP3s**, `01-watery-grave.mp3` through `05-sacred-flowers.mp3`; these are the only checked-in release audio files. Track references live in `miracle-fortress.json`.
- Bandcamp embeds are external runtime playback, not locally materialized audio. Streaming destinations remain external links. Distinguish page/artwork offline availability from third-party playback availability.
- Catalogue research/provenance is in `docs/research/miracle-fortress.md`, `miracle-fortress-discogs.md`, `think-about-life.md`, `other-credits.md`; these are supporting records, not page loaders.

### Dashboard support and gaps

`pocketbase/pb_migrations/1782086400_publishing.js`, `1782172800_release_unpublish.js`, `1782259200_release_toggle.js` and `pocketbase/server/publishing/api.go` implement the release slice. Current `publishing_releases` supports slug/title/artist/date/about/display date/URL/streaming, protected artwork, JSON tracks and persistent `published`. Only `watery-grave-ep` currently publishes. `publishing_snapshots` and `publishing_builds` are internal, visible dashboard collections, not editorial tasks.

`scripts/import-release.mjs` and `pocketbase/server/cmd/import-release/main.go` import only the pinned tracer as a private draft. `scripts/published-release.mjs`, `astro.config.mjs` and `src/lib/music-releases.ts` opt into its snapshot; absent credentials, all releases stay repository-sourced. The other 35 releases have no dashboard-to-site publishing path. The tracer's audio validation is pinned to existing references; it is not a general audio catalogue editor.

Missing full-catalogue support includes categories, credits, display-title overrides, Bandcamp/YouTube metadata, general multi-release reads/imports and remote-original capture. Do not assume nine Other Credits records with empty tracks can use the tracer's validation unchanged. Separate presentation `player_height` from editorial schema decisions. No independent cover-alt field exists today.

**Accepted exception:** MP3 uploads/replacements stay in Git/Netlify; track metadata and audio references are intended to be dashboard-editable. Do not silently expand this exception to artwork, other content or arbitrary future audio libraries.

## 2. Software

`src/data/software-projects.ts` contains **seven projects**: Tipbox, Bloom B&B, Biolink, Groundwaves, Quizzical, Tenzies and Colour Scheme Generator. Editorial values include stable slug, title, description, tooling list, website/repository URLs, category and array order. Tipbox additionally has a role heading/prose, tagline, eight team members (names/roles/optional links) and three ordered gallery images with explicit alt text.

`public/images/software/` has **ten images**: seven primary screenshots and Tipbox's `laptop.png`, `no-looking-back.png`, `project-board.jpg`. Width/height values are technical media metadata, not text to require the owner to maintain manually.

`src/pages/software/index.astro` hardcodes three ordered category labels: “Applications”, “Small websites”, “Early projects”. Projects retain source-array order within categories. `src/pages/software/[slug].astro` owns rendering, “Built with”/“Team”/link labels and generated primary screenshot alt text; gallery alt text is editorial data.

**Dashboard:** none; no software schema, upload/snapshot/import path or published reader exists. A representative project slice should include Tipbox's nested fields, not just title/description. Decide native JSON versus relations for team/gallery/tooling, ordering controls, category editing, primary screenshot alt text and URL/slug stability. Do not treat existing source-array order as a documented manual-sort interface.

## 3. Likes and named collections

### Authoritative sources and current delivery

Actual collection items and named collections live in PocketBase, not checked-in content files; their counts/content cannot be inventoried from this checkout. Definitions are in `pocketbase/pb_migrations/1781568000_create_likes.js` through `1782000000_text_items.js`; validation is in `pocketbase/pb_hooks/likes_assets.pb.js`. `pocketbase/contracts.md` records the field contract.

- `likes_items`: title, URL, description, commentary, optional `quote`/`note` type, body, attribution, many-to-many `collections`, single protected image/PDF `asset`, `previewProvenance`, publication state and saved timestamps. Empty type covers links/images/PDFs; an item need not have a destination URL.
- `likes_collections`: editable names and IDs; membership is on items. Names are not stable route keys. Named collections are currently publicly readable even when containing only drafts; deleting one removes memberships, not items.
- Uploads: JPEG/PNG/GIF/WebP/PDF, one file per item, 10 MiB maximum. Stored originals/thumbnails are under persistent `pb_data/storage`, not `public/`. Preview provenance contains source attribution and override information, not just technical cache data.
- `src/lib/likes.js` controls API reads, generated titles and virtual “Misc.” (ungrouped items, not a named collection record). Collections sort by name/ID; item listings use saved-created order; overview previews use updated order, up to eight each. These are derived behavior, not owner-authored ordering fields.
- `src/pages/likes.astro`, `src/pages/likes/[slug].astro` are runtime (`prerender=false`), uncached reads against mutable records. Detail route parameters are record IDs despite the filename `[slug]`. Public images/PDF links depend on PocketBase; there is no static/offline snapshot path.

### Existing editing versus dashboard parity

The website owner editor remains in `src/pages/likes/manage.astro`, `src/components/likes/ManagedItems.astro`, `src/components/likes/owner-tools/{OwnerTools,ItemEditor,DraftItems,NamedCollectionManager}.astro`, `src/scripts/likes.js` and `src/lib/likes.js`. Login/session support remains in `src/pages/login.astro`, `src/lib/session.js`, `src/scripts/session.js`, `src/scripts/manage-likes-link.js` and `src/components/likes/SessionRecovery.astro`.

| Capability | Current dashboard position / gap |
| --- | --- |
| Metadata, quote/note text, attribution, memberships, publication boolean | Native record fields exist in source schema; this is not accepted dashboard-only publishing. Preserve cross-field validation on superuser saves. |
| Upload/replace/remove image or PDF | Native file editing plus runtime hook validation; type conversion to quote/note requires removing asset in the same Save. No retained published file snapshots; replacement/deletion follows mutable-file lifecycle. |
| Named collections | Native records/relations exist; no coherent publication of collection name, membership and item revision, nor draft collection workflow. |
| URL preview fetch/review/adopt, override tracking | Website feature; `pocketbase/server/preview/` custom endpoint accepts only the ordinary designated Likes owner, not dashboard superusers. Native Save does not fetch/adopt previews or maintain review state automatically. |
| Repeated URL warning/reuse/“Save another” | Website feature backed by `pocketbase/server/duplicates/`; advisory, not uniqueness enforcement. Endpoint rejects superusers and does not automatically run on dashboard Save. |
| Publication/defaults/deletion | Website `createLikesAPI.save` defaults `published=true`; “Save as draft” is opt-in. This conflicts with `CONTEXT.md` and the agreed all-new-items-as-drafts target. Native boolean omission is not the same as the website's default. Deletion is permanent; there is no release-style retained snapshot/withdrawal. |
| Public reader/media | Live mutable records, no snapshot build identity, materialized static files or coordinated withdrawal/deploy workflow. |

**Decisions needed:** preserve or explicitly waive preview/duplicate conveniences before retiring app editing; define safe provenance maintenance for manual dashboard edits; decide named-collection publication semantics and ordering; decide whether item-specific image alt text is needed (currently title-derived); preserve existing published items and stable record-ID links on migration. Deployment of later Likes capabilities is documented as pending, so schema presence here is not a live acceptance claim.

## 4. Blog

`src/content/blog/the-animated-face.mdx` is the **only article**: frontmatter title, prose, Sophia attribution/link, external reading links and a displayed Astro code example are editorial. The file also imports and executes `src/components/Face.astro` as a demonstration. The fenced code example is article content, not executable page layout.

`src/content.config.ts` loads Markdown/MDX with a title-only schema. `src/pages/blog/index.astro` sorts titles alphabetically; `[...id].astro` builds routes and wraps rendered content. There is no draft/publication/date field or dashboard blog collection. `astro.config.mjs` preserves `/blog/drawing-my-face/` → `/blog/the-animated-face/`.

**Decision:** dashboard prose with a bounded code-owned demonstration slot, or an explicit repo-managed MDX exception? Do not classify the entire article as layout merely because it contains a component. Preserve article ID/redirect, attribution and code formatting. No arbitrary executable dashboard MDX/page builder is implied.

## 5. Home, identity, about and placeholders

- `src/pages/index.astro`: home is the ambient instrument; the Face import/render is commented out. No standalone about route, biography page, home introduction, contact/social block or footer editorial source was found. Biographical material exists within release descriptions, software role/team copy and the blog; absence of an about page is not evidence that all biography has been inventoried as a separate record.
- `src/components/AmbientPad.astro`: visible brand “GVP”, product “PadLoop-1000”, subtitle “Loop machine” are small identity/copy choices. Controls, instructions/status and no-JavaScript explanation are behavior-related UI copy. No dashboard source.
- `src/lib/lib-ambient-pad/ambient-kit.ts`: twelve mapped notes/sample references. `public/audio/ambient-test/` contains **16 generated WAVs**; C3/D3/E3/G3 are not in the current mapping. `scripts/generate-ambient-samples.py` and `public/audio/ambient-test/README.md` describe fixture generation; `public/audio/ambient-silence.mp3` is technical media. Audio engine/looper limits and key mappings are implementation, not editorial records. Decide whether future sound selection/libraries and instrument branding are editorial or explicit code-owned exceptions.
- `src/components/Sig.astro` and `Face.astro`: inline identity/portrait artwork mixed with SVG accessibility text and animation. Keep animation/layout in code; owner must confirm whether artwork itself remains repo-managed. `PadIcon.astro`, `ChevronDown.astro` and inline menu/control icons are UI design assets, not collection media.
- `src/pages/[section].astro`: four generated pages `/video`, `/film`, `/projects`, `/utils`, each with its title and “Coming soon...”. Video/Film appear in main navigation; Projects/Utils do not. These are real editorial placeholders, not nonexistent pages. No dashboard fields. Decide whether to retain, hide, replace or dashboard-edit them; do not invent page-builder requirements or new about copy.

## 6. Navigation, site metadata and cross-page copy

| Source | Editorial values | Code-owned mechanics / current support |
| --- | --- | --- |
| `src/components/SiteHeader.astro` | Software; Music → Releases/Video/Film; Likes; Blog; destinations, group membership and order; mobile Home label | All hardcoded. Popovers, active-route matching, desktop/mobile layout and close/focus behavior are implementation. No dashboard menu schema. |
| `src/layouts/Layout.astro` | Site description “Graham Van Pelt's home on the web.”, `gvp.fyi` title branding, fallback identity “Graham Van Pelt” | All hardcoded. Title composition, document language, metadata markup, session controls and fonts are framework/design behavior. No site-settings schema. |
| `src/pages/{software,music-releases,blog}/index.astro`, `src/pages/likes.astro` | Section names/headings (some duplicated in navigation) | Confirm central editable labels versus fixed product vocabulary; counts, back links and generic control labels are generated/UI copy. |
| `src/pages/links.astro` | Legacy “Links is now Likes” message | Compatibility redirect/canonical to `/likes`, not a second editorial collection. Keep historical URLs working. |
| `astro.config.mjs` | Canonical site identity and historical blog destination | Site origin and redirect wiring are deployment/compatibility configuration; do not expose arbitrary routing machinery as editorial settings by default. |

`src/components/ContentRow.astro`, `src/components/likes/{PublishedItems,PublishedItem,CollectionRows,TextReader,ImageViewer}.astro`, scripts and styles render content and contain generic fallback/interaction copy. Overview image alt is intentionally empty beside visible titles; detail alt is title-derived except explicit software gallery descriptions. Preserve accessibility rather than mechanically making every string a dashboard field.

**Decision:** scope site-wide editorial settings explicitly (description, identity, section labels, navigation labels/URLs/order, placeholder copy). None currently has dashboard publishing support. Navigation labels must not rename the domain concept Likes casually. Changing a label must not implicitly rename routes or break compatibility URLs.

## 7. Non-public and shared-backend boundaries

- `docs/`, `README.md`, `OBJECT-STORAGE.md`, `CONTEXT.md`, `AGENTS.md`, `tickets/` and tests are documentation/specification/research/fixtures, not Astro editorial loaders. They can preserve provenance but are not content to migrate automatically.
- `public/fonts/` (font and license), `public/licenses/pixelarticons.txt`, CSS, illustration animation, audio runtime and generated build artifacts (`dist/`, `.astro/`, `.netlify/`) are not independent editorial sources. Font/icon/fixture exceptions still need scope agreement if “all content” is interpreted literally.
- `pocketbase/README.md` documents a shared backend with biolink and historical `markdownPosts`, `posts`, `tests` records. These are **not current gvp.fyi page sources**. Their recorded counts are historical, not inspected here. Preserve them and audit their consumers before retiring auth/editing/storage features; do not import or delete them as part of this inventory. A software link to Biolink does not make its records this site's navigation source.

## Owner decision register and acceptance gaps

| Priority | Decision or confirmation needed | Why |
| --- | --- | --- |
| 1 | Accept a dashboard replacement for representative Likes types and one software project; agree which preview/duplicate conveniences must survive | Native CRUD is not feature parity, and software has no publishing schema. |
| 1 | Confirm treatment of blog prose versus executable demonstration | Only remaining article mixes editorial and executable content; it cannot silently disappear from scope. |
| 1 | Confirm navigation/settings/placeholders scope; whether any home/about prose is actually wanted | Several editorial strings live in layout files, but no about content exists to migrate. |
| 1 | Agree full release schema and ordering/slug policy, preserving unused metadata | Tracer omits category/credit/override/provider fields and only supports one slug. |
| 2 | Confirm artwork sourcing/rights/attribution and alt-text needs | 22 remote release covers plus title-derived descriptions need intentional handling, not automatic dropping. |
| 2 | Confirm SVG identity, instrument sounds/branding and font/icon exceptions | Only release MP3s have an explicit accepted repo-managed media exception. |
| 2 | Decide named-collection publication/order/provenance handling | Current public names/mutable memberships and app-maintained preview provenance do not map directly to coherent static snapshots. |
| Rollout | Choose backup destination/notification, accept representative dashboard workflow and approve cutover separately | Docs require off-host monthly recovery sets (three successful sets), under-$1/month target, restore rehearsal, capacity, security/MFA and shared-consumer checks. These are not resolved by an inventory. |

Already settled in the current decision record: local originals, no application-file S3 migration, persistent Published + Save, owner-accepted release tracks JSON, manual Netlify deployment for the first milestone and repo-managed release MP3s. Do not reopen these as unanswered questions. Save is eligibility, not deployment; release working-record deletion is not withdrawal; retained snapshots/media have no pruning implementation. These semantics are currently implemented only for the tracer, not universally for Likes/software/blog/settings.

**Completion boundary:** inventory is complete for checked-in first-party page sources and documented external record sources. Live record/file counts, remote-original integrity/rights, deployed capability parity and owner acceptance remain unverified. No implementation, GitHub state or deployment was changed.
