# Full release catalogue (local implementation, not deployed)

Apply `1782345600_release_catalogue.js` after the release-toggle migration and use the custom server. No production writes or sibling backend sync were performed. The migration adds working fields only; it neither republishes edits nor rewrites retained snapshots.

## Contract

- Build-identity-only `GET /api/publishing/releases` returns an array containing the latest immutable snapshot for **every previously published slug**, including explicit `{revision, slug, state: "unpublished"}` withdrawals. Never-published drafts are absent. Empty array is valid. Existing per-slug GET remains supported, now for any slug. Responses remain no-store.
- Slugs cannot change after record creation, even on drafts. Title/display-title edits do not rename routes. Deleting working records does not withdraw retained publication. Retained artwork remains revision-pinned.
- Publication includes existing metadata plus `category`, `credit`, `display_title`, `album_id`, `art_id`, `youtube_video_id`, and `player_height`. Tracks may be omitted or empty; supplied entries retain consecutive numbering validation. Non-tracer publication requires a category. Historical tracer snapshots without category map to `miracle-fortress`.
- Category IDs remain `graham-van-pelt`, `miracle-fortress`, `think-about-life`, `other-credits`. Category labels/order and player behavior remain code-owned in this slice. Artwork is independently retained, decoded and checked before publishing. MP3 files remain in Git; full builds accept track references under `/audio/*.mp3` (including subdirectories), not new external audio providers.

## Build mode

`PUBLISHING_CONTENT=true` requires `PUBLISHING_POCKETBASE_URL`, `PUBLISHING_BUILD_EMAIL`, and `PUBLISHING_BUILD_PASSWORD`. The build fetches the catalogue once and validates/materializes every visible snapshot's artwork. `virtual:published-release` exports an array; withdrawals are omitted. An empty array produces no release routes. There is **no repository fallback** on missing data, malformed records, authentication/network errors or bad artwork. Credentials/private payloads do not enter the public projection or error logs.

When the flag is unset, the old tracer behavior remains: credentials replace only Watery Grave EP; no credentials use repository content. Rendering retains date sorting, display titles, Bandcamp identifiers, credits and responsive local artwork. YouTube metadata is retained but does not introduce a new player.

## Additive rehearsal importer

```sh
PUBLISHING_POCKETBASE_URL=http://127.0.0.1:8090 \
PUBLISHING_IMPORT_TOKEN=... node scripts/import-catalogue.mjs
# Explicit publication, only on an isolated rehearsal backend:
# ... node scripts/import-catalogue.mjs --publish
```

The importer accepts **loopback HTTP only**. Use a disposable backend, never a tunnel to production. It imports all 36 repository records with stable slugs/category IDs, preserving metadata. It skips any slug already present in working records **or retained snapshots**, without overwriting/adopting it. Default creation is private. `--publish` publishes newly created records only; it does not flip previously imported drafts. The old `scripts/import-release.mjs` is unchanged.

Local originals are read from Git. Remote originals are fetched only over HTTPS from approved Bandcamp/Apple image hosts, without redirects, with time/byte/pixel/type limits and full decode checks; original bytes are uploaded without transformation. No silent remote-image fallback. Imports are per-record, not catalogue-atomic: a failure leaves earlier imports intact and rerunning safely skips them. Duplicate create races fail rather than overwrite.

## Verification and limitations

`tests/release-catalogue.test.js` covers local source identity/artwork, authorization, multiple slugs, optional/empty tracks, metadata, immutable slugs, latest-only listing, withdrawals, deleted-working-record retention and authoritative empty/full build preparation. Existing tracer importer/API tests still run; invalid-track fixtures use objects instead of empty arrays, which are now intentionally valid.

Remote captures in importer integration tests use checked image fixtures, not a live availability/rights audit. Real remote-source availability and full production inventory remain unverified. Snapshot pruning, deployment hooks, backup/restore rehearsal and production cutover are not implemented here. Save is eligibility, not deployment. Full-catalogue reads currently scan retained snapshots (no pagination/indexed latest-revision optimization); retention remains unbounded. Shared virtual-module typing and sibling-backend sync are parent-owned.
