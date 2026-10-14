# Dashboard-only publishing with local originals

Active plan: [#21](https://github.com/GVPproj/gvp.fyi/issues/21). This replaces the S3-led #3 plan, not its privacy, recovery or static-delivery requirements. This document records repository inspection and next steps, not production acceptance.

## Architecture and first milestone

- Originals stay on the existing persistent Fly volume (`pb_data/storage`). No application-file S3 provisioning/migration.
- Owner edits in PocketBase `/_/`; public visitors use static Astro/Netlify output. Retire app editing only after dashboard replacement acceptance and a shared-consumer audit.
- New items are drafts. **Implemented and component-tested #9 LOCAL change, pending real-data rehearsal and deployment:** native one-record editing with owner-accepted `tracks` JSON and one persistent Published toggle. Save while off stays private; Save while on updates the eligible public version; turning it off and saving withdraws it. This replaces separate Publish/Unpublish commands and private working edits for published records. Builds still read coherent internal snapshots with retained media and restricted credentials. The deployed tracer has not yet been updated.
- Public pages and materialized media must work with PocketBase offline. Failed builds must not replace the last good deployment.
- Owner-approved first-milestone workflow: set Published and Save in the dashboard, then manually deploy in Netlify using its existing status UI. Do not equate Save with deployment. Owners should not need to edit build identities or snapshots.

Start with the existing Watery Grave EP tracer, preserved from `migration/pocketbase-s3` on `publishing/dashboard-local-storage`. The OLD deployed slice uses separate Publish/Unpublish commands and track records. The approved replacement puts metadata, `tracks` JSON, artwork and persistent `published` on one release record: every true Save snapshots the full content; false Save stays private, with an explicit withdrawal on the first transition off. New unpublished slugs and repeated off Saves do not create withdrawals. Recreating a deleted, still-published slug with Published off withdraws the retained publication. Working deletion retains the latest snapshot/withdrawal and media. Pin `publishing_releases` in the native sidebar; internal builds/snapshots remain visible but are not owner tasks. There is no promise to hide them.

The runtime and forward migration `1782259200_release_toggle.js` are synced in source and backend. Upgrade fixtures for draft, published-with-private-edits and withdrawn states preserve the latest snapshot/media without publishing working edits, copy ordered tracks to release JSON and remove the track collection transactionally. The Go importer CLI is copied into source and aligned with the backend; `scripts/import-release.mjs` also creates an atomic JSON-track release. Local verification: all 17 publishing tests pass, including Chromium dashboard/offline-output checks, migration refusal rollback and draft-file/upload rollback checks; source/backend Go race suites pass; backend Python publishing smoke 1 and build-hook 8 passed. The importer collision check also passes after adding retained-snapshot refusal. These are local fixture results, not a fresh live/private-data rehearsal. No deployment, owner trial or frontend cutover has occurred for this change. Next demonstrate one software project and representative Likes types; do not wait for full catalogue conversion to accept useful slices.

## Repository editorial inventory

Counts describe checked-in sources, not live PocketBase records.

| Content | Current source | Target editing home / remaining work |
| --- | --- | --- |
| 36 releases, 138 track entries | Four JSON files in `src/data/releases/` | PocketBase release records with owner-accepted native `tracks` JSON. Preserve titles, artists, dates/display overrides, descriptions, credits, ordering, durations, links, Bandcamp/YouTube IDs and existing slugs. Tracer covers only Watery Grave EP. |
| Release categories | `src/lib/music-releases.ts` | Dashboard labels/order; preserve four groupings. |
| Release covers | 14 JPEGs in `public/images/music-releases/`, plus remote Bandcamp/Apple references | Local protected uploads with snapshot copies; inventory remote originals and attribution before importing. Preserve alt text. |
| Five release MP3s | `public/audio/watery-grave/` | Owner-approved exception: files/uploads/replacements stay in the repo, delivered by Netlify at existing URLs. Track metadata/references remain dashboard-editable. |
| Seven software projects | `src/data/software-projects.ts` | Dashboard projects, links, tooling, descriptions and category membership. Include Tipbox role/tagline/team and gallery alt text; no schema yet. |
| Software images/categories | Ten images in `public/images/software/`; category labels/order in `src/pages/software/index.astro` | Dashboard uploads, gallery ordering and category labels/order. Dimensions are technical metadata. |
| Likes collection items | Existing PocketBase migrations/contracts | Dashboard title, URL, description, commentary, memberships, quote/note body and attribution. Preserve existing published items. Add snapshot publication; current public/owner app still uses mutable records. |
| Named collections | `likes_collections` | Dashboard names and many-to-many memberships; snapshot membership coherently. |
| Likes assets/previews | Protected single image/PDF attachment, preview provenance | Dashboard upload plus server-side validation. Audit preview and duplicate conveniences before retiring app forms. Current custom endpoints do not automatically run on dashboard saves. |
| Navigation/site metadata | `src/components/SiteHeader.astro`, `src/layouts/Layout.astro` | Proposed dashboard labels, destinations/order, site description; confirm scope. Keep navigation behavior/layout in code. |
| Placeholder section copy | `src/pages/[section].astro` | Proposed dashboard titles and “Coming soon...” text; confirm scope. |
| Blog article | `src/content/blog/the-animated-face.mdx`, `src/content.config.ts` | Requires explicit decision: article prose is editorial, but embedded Face component/code is executable presentation. Do not silently exclude or build a general-purpose page builder. |
| Home/about | `src/pages/index.astro` | No standalone bio/about copy found. Home is currently the ambient instrument; biography appears in release/software content. |

### Accepted exception

Release MP3 files remain repo-managed for now; dashboard editing covers track metadata and audio references, not uploading/replacing audio. Revisit if additions become frequent or repository/build size becomes burdensome.

### Remaining exceptions to confirm
- Instrument sounds: 16 generated WAV fixtures in `public/audio/ambient-test/` (12 mapped by `src/lib/lib-ambient-pad/ambient-kit.ts`); future sound libraries may be editorial. `ambient-silence.mp3` is technical.
- Inline identity/illustration SVGs in `Sig.astro` and `Face.astro` mix artwork with animation. Confirm whether artwork stays code-owned.
- Fonts, licenses and UI icons are proposed design/runtime exceptions. Layouts, CSS, player behavior, validation and interaction messages remain application code.

## Verification and incomplete work

See [release rehearsal](release-publishing.md) and [backend contract](../pocketbase/publishing-contract.md). The tracer lacks full catalogue schema coverage (including categories, credits and overrides) and general multi-release fetching. Release withdrawal is implemented through an explicit retained revision, not by treating a failed fetch as removal. Working-record deletion intentionally retains published snapshots; retention/pruning is not implemented.

Dashboard Likes parity needs a separate audit of preview acquisition, duplicate lookup, named-collection membership, type changes and uploads. Essential validation belongs in hooks/services; any lost convenience needs explicit agreement. Current public Likes is not yet snapshot-based/static.

Before production: fresh capacity checks; complete off-host database/file recovery and isolated restore; monthly automation retaining three successful sets with failure alerts; #18 MFA/rules/protected-file verification; shared-consumer checks; explicit production approval and paired rollback. Backup target remains under $1/month; ask before exceeding it. No backup destination has been selected here.

## Historical local withdrawal verification (OLD workflow)

The following records prior separate-command coverage, not #9 toggle/JSON-track
verification or results from this session. The withdrawal slice has HTTP, real native-dashboard and actual Astro build coverage:
private Save, Publish/republish, explicit Unpublish, conflicting commands, retained
artwork, working deletion, delete/recreate withdrawal, static route removal,
unrelated-route preservation and fail-closed malformed/missing responses or partial
credentials. These tests do not establish production Netlify deployment/caching or owner
acceptance. The backend has since been deployed for the approved development
trial described below. MP3 files remain
static and are not removed by Unpublish.

## Existing Fly development trial

**Historical deployment record; current live remains the OLD workflow.** No fresh
live inspection or deployment was performed in this session. The approved #9
native JSON-track / persistent Published Save change is local and pending deployment.

The owner approved using the existing deployment rather than a temporary Fly
instance. Backend commit `9183a9a` in `GVPproj/pocketbase-fly-starter` passed
[CI and deployment](https://github.com/GVPproj/pocketbase-fly-starter/actions/runs/38573509809).
The original machine/volume and local storage were preserved. A fresh stopped-data
off-host backup and real-data migration/import rehearsal preceded deployment;
existing application records, authentication and stored files were verified unchanged
on live copies before and after importing.

At that historical checkpoint, Watery Grave EP was a **private draft**, record `llcsvm8we43tdfi`, with five ordered
tracks and original artwork. The OLD workflow used `publishing_releases` in
[the dashboard](https://pocketbase-fly-starter.fly.dev/_/) and edited tracks through
`publishing_tracks`. Publish/Unpublish created eligible revisions, but **Netlify was
unchanged and not connected to this source**. No build identity was created.
Public MP3 delivery remains repo-managed.

Live health/dashboard/shared reads and anonymous draft/file denial passed. Owner
workflow acceptance remains pending. Existing superuser MFA is not enabled; #18,
monthly backup automation and the remaining rollout obligations are not completed
by this development trial. Operational evidence and recovery locations are in the
sibling repo's `docs/publishing-release-rollout.md`.

## Issue reconciliation still pending

#3/#11/#19/#20 require supersession comments/closure, not completion claims. Review #6/#8/#9/#10/#12/#13/#14/#15 against this inventory; retain #18 security and #17 unrelated ambient failures. Inspect #1 and `tickets/10-dedicated-login-and-session-controls.md` before retiring overlapping work. Historical #5/#7/#16 and S3 research remain available. No issue closures, production resource audit, cloud deletion or key revocation are claimed by these documentation updates.
