# Dashboard publishing

Edit through PocketBase `/_/`. Visitors receive static Netlify pages and copied
media; the published site works with PocketBase offline.

## Workflow

1. Open `publishing_releases` (music), `editorial_entries` (software/blog), or
   `likes_items` / `likes_collections` (Likes). New items start unpublished.
2. Edit and Save. **Published on + Save publishes the saved edits** into an
   immutable revision. Turn Published off before saving private changes.
3. To withdraw, turn Published off and Save. **Deleting a working record does
   not withdraw its retained publication.** Unpublish before deleting.
4. Manually deploy in Netlify and check the result. **Save is not deployment.**
   Failed builds leave the last good deployment intact.

Slugs and editorial kinds are immutable. Snapshot/build collections are internal;
there is no automatic snapshot/media pruning. Old deployments, caches and downloads
can retain previously public content.

Named collection names have no draft toggle: renaming/deleting one updates retained
public memberships without publishing private item edits. Membership edits become
public on that item's Published Save.

## Content and assets

- Release `tracks` JSON: `{title, track_num, duration?, audio_url?}`. Number from 1
  consecutively; duration is nonnegative seconds. MP3s stay in `public/audio/`;
  reference their existing `/audio/...mp3` URLs. Artwork is uploaded separately.
- Software `data` retains the project's role/team/tooling/gallery fields. Numeric
  `order` sorts ascending, then slug. Use `screenshotAlt` and gallery descriptions
  for accessible images.
- Blog `data`: `{title, markdown}`. Raw HTML/MDX does not execute. A standalone
  `<!-- demo:face -->` paragraph inserts the fixed face demo once.
- `data.assetNames` maps original basenames to PocketBase's saved upload filenames.
  Replace **one file per Save** so references can be repaired unambiguously.
  Multiple replacements require matching original names or an explicit mapping.
  Images and local downloads must resolve to uploaded assets; missing references
  fail the build. External reading links remain links.
- Site identity, navigation, categories and placeholders come from
  `src/config/site-settings.json`, not legacy CMS settings records. Layout, interaction,
  instrument sounds and behavior-related copy also stay in Git.

Original uploads stay in `pb_data/storage` on Fly. Builds authenticate using
`PUBLISHING_CONTENT=true`, `PUBLISHING_POCKETBASE_URL`, `PUBLISHING_BUILD_EMAIL`
and `PUBLISHING_BUILD_PASSWORD`. Use a restricted `publishing_builds` identity,
never superuser credentials or public-prefixed secrets. Development and builds
require these settings and have no editorial repository fallback. Likes uses this loader in development too;
there is no website login/editor.

Field/API details: [releases](../pocketbase/publishing-contract.md),
[editorial](../pocketbase/server/editorial/README.md), [Likes](../pocketbase/contracts.md).
