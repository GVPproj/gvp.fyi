# Dashboard-only publishing with local originals

Active plan: [#21](https://github.com/GVPproj/gvp.fyi/issues/21). This replaces the S3-led #3 plan, not its privacy, recovery or static-delivery requirements. This document records repository inspection and next steps, not production acceptance.

## Architecture and first milestone

- Originals stay on the existing persistent Fly volume (`pb_data/storage`). No application-file S3 provisioning/migration.
- Owner edits in PocketBase `/_/`; public visitors use static Astro/Netlify output. Retire app editing only after dashboard replacement acceptance and a shared-consumer audit.
- New items are drafts. Save changes a private working copy; explicit Publish captures coherent metadata and independently retained referenced files. Builds read only snapshots using restricted credentials.
- Public pages and materialized media must work with PocketBase offline. Failed builds must not replace the last good deployment.
- Owner-approved first-milestone workflow: dashboard Publish, then manual deployment in Netlify using its existing status UI. Do not equate publication with deployment.

Start with the existing Watery Grave EP tracer, preserved from `migration/pocketbase-s3` on `publishing/dashboard-local-storage`. Local release/import tests have been rerun against the rebuilt custom backend. This slice adds a native dashboard Unpublish command and explicit withdrawal revisions; working deletion retains the last published state. Verify static removal/republish and the real dashboard alongside file replacement/private edits before acceptance. Next demonstrate one software project and representative Likes types; do not wait for full catalogue conversion to accept useful slices.

## Repository editorial inventory

Counts describe checked-in sources, not live PocketBase records.

| Content | Current source | Target editing home / remaining work |
| --- | --- | --- |
| 36 releases, 138 track entries | Four JSON files in `src/data/releases/` | PocketBase release/track records. Preserve titles, artists, dates/display overrides, descriptions, credits, ordering, durations, links, Bandcamp/YouTube IDs and existing slugs. Tracer covers only Watery Grave EP. |
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

## Local withdrawal verification

The withdrawal slice has HTTP, real native-dashboard and actual Astro build coverage:
private Save, Publish/republish, explicit Unpublish, conflicting commands, retained
artwork, working deletion, delete/recreate withdrawal, static route removal,
unrelated-route preservation and fail-closed malformed/missing responses or partial
credentials. These tests do not establish production Netlify deployment/caching or owner
acceptance. The backend has since been deployed for the approved development
trial described below. MP3 files remain
static and are not removed by Unpublish.

## Existing Fly development trial

The owner approved using the existing deployment rather than a temporary Fly
instance. Backend commit `9183a9a` in `GVPproj/pocketbase-fly-starter` passed
[CI and deployment](https://github.com/GVPproj/pocketbase-fly-starter/actions/runs/38573509809).
The original machine/volume and local storage were preserved. A fresh stopped-data
off-host backup and real-data migration/import rehearsal preceded deployment;
existing application records, authentication and stored files were verified unchanged
on live copies before and after importing.

Watery Grave EP is a **private draft**, record `llcsvm8we43tdfi`, with five ordered
tracks and original artwork. Open `publishing_releases` in
[the dashboard](https://pocketbase-fly-starter.fly.dev/_/); edit tracks through
`publishing_tracks`. Publish/Unpublish create eligible revisions, but **Netlify is
unchanged and not yet connected to this source**. No build identity was created.
Public MP3 delivery remains repo-managed.

Live health/dashboard/shared reads and anonymous draft/file denial passed. Owner
workflow acceptance remains pending. Existing superuser MFA is not enabled; #18,
monthly backup automation and the remaining rollout obligations are not completed
by this development trial. Operational evidence and recovery locations are in the
sibling repo's `docs/publishing-release-rollout.md`.

## Issue reconciliation still pending

#3/#11/#19/#20 require supersession comments/closure, not completion claims. Review #6/#8/#9/#10/#12/#13/#14/#15 against this inventory; retain #18 security and #17 unrelated ambient failures. Inspect #1 and `tickets/10-dedicated-login-and-session-controls.md` before retiring overlapping work. Historical #5/#7/#16 and S3 research remain available. No issue closures, production resource audit, cloud deletion or key revocation are claimed by these documentation updates.
