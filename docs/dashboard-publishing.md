# Dashboard publishing

This workflow is **live as of 2026-10-15**. Deployment evidence, remaining owner
acceptance and rollback live in the [cutover record](content-cutover-readiness.md).

## Scope

Originals stay in PocketBase's persistent Fly volume (`pb_data/storage`), not
application-file S3. Edit through PocketBase `/_/`; visitors receive static Netlify
pages, images and downloads that work with PocketBase offline.

| Dashboard collection | Editorial content |
| --- | --- |
| `publishing_releases` | All 36 releases / 138 track entries: metadata, stable slugs, categories, credits, display overrides, streaming/Bandcamp/YouTube fields, artwork and native `tracks` JSON. |
| `editorial_entries` | Seven software projects (including Tipbox team/gallery) and one blog article. Edit `data` JSON and protected `assets`. Legacy `settings/site` records do not control the rendered site. |
| `likes_items`, `likes_collections` | Collection items, text/attribution, protected image/PDF uploads, named collections and memberships. Existing item IDs remain public route keys. |

Manual Likes editing is accepted: URL-preview acquisition and duplicate warnings
are not required. Server-side validation and preservation of existing publications
are still required. Blog prose uses safe Markdown, not executable MDX; a fixed
`<!-- demo:face -->` slot renders the code-owned demonstration.

Release MP3 uploads/replacements stay in Git/Netlify at their existing URLs;
track metadata and audio references are dashboard-editable. Layout, interaction,
SVG/design assets, instrument sounds and behavior-related UI copy stay in code.
Site settings—including navigation, identity/description, section/category labels and order,
and placeholder routes/copy—come exclusively from `src/data/site-settings.json` in every
build mode. CMS settings snapshots cannot override deployed code. There is no general-purpose page builder.

## Authoring

1. Open the relevant record in `/_/`. New records start with **Published off**.
   Release tracks are edited as JSON on the release itself. See
   [field shapes and asset handling](import-editorial.md#authoring-data-and-assets).
2. Edit content and uploads, then Save. **Published on + Save publishes saved edits**
   to an eligible immutable revision with independent media copies. There is no
   separate private working edit for a record left on. Turn Published off before
   saving changes that must remain private. An unchanged native Save makes no request.
3. To withdraw content, turn Published off and Save. The next successful deployment
   omits it; further off Saves stay private. **Deleting a working record does not
   withdraw its retained publication.** Unpublish first if removal is intended.
4. Manually deploy in Netlify using its existing UI, then check the result.
   **Save is not deployment.** Failed reads/builds must preserve the last good site.

Slugs (and editorial kinds) are immutable after creation; title edits do not rename
routes. Replace software assets one at a time per Save to keep reference mapping
unambiguous. Internal build/snapshot collections are not routine editing tasks;
there is no automatic snapshot/media pruning.

Named collection names have no draft toggle: renaming/deleting a publicly referenced
collection updates retained published memberships without publishing private item
edits. Item membership changes become eligible on that item's Published Save.

Removal includes build/deployment/cache delay. Old deployments, caches and downloaded
copies may retain previously public content; withdrawal cannot recall them.

## Build and transition boundary

Full mode uses `PUBLISHING_CONTENT=true` plus server-only
`PUBLISHING_POCKETBASE_URL`, `PUBLISHING_BUILD_EMAIL` and `PUBLISHING_BUILD_PASSWORD`
for a restricted `publishing_builds` identity. Never use superuser credentials or
public-prefixed secrets. Configuration belongs to the approved rollout, not routine
authoring. Full-mode editorial content has no repository fallback. Site settings remain
code-owned; a published `settings/site` record is not required.

In full mode Likes is static, `/login` and `/likes/manage` redirect to `/likes`, and
owner/session controls are inactive. Legacy code and shared backend endpoints remain
until replacement acceptance and consumer audit. Disabling full mode is not a general
rollback of subsequent dashboard edits. Follow the [runbook](content-cutover-readiness.md)
and [import safety instructions](import-editorial.md) before any migration or cutover.
