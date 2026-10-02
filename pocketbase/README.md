# Likes backend — production upgraded; owner provisioning pending

## Production status (2026-10-02)

The owner approved upgrading the shared backend and both consumers: this site's Likes board and `../biolink-react`.

- **PocketBase 0.40.4 is live**, confirmed over SSH and by public health/API checks.
- Backend source commit `90c0be3` is on `GVPproj/pocketbase-fly-starter/main`. [CI tests and deployment passed](https://github.com/GVPproj/pocketbase-fly-starter/actions/runs/37066523001).
- Deployment image: `registry.fly.io/pocketbase-fly-starter:deployment-01M3Z80RB27FBFE4FWCGRG0FFB`.
- Original machine `4d89070a404018`, `sjc`, shared CPU / 512 MB, and original encrypted 1 GB volume `vol_re89nlggd6xqq15r` mounted at `/pb/pb_data` are preserved. Config primary region remains `sea`; placement was not changed.
- Both new collections, `likes_owners` and `likes_items`, are deployed. **No owner account or sample content was created.** Public Likes listing is empty.
- All nine live biolink records match the fresh pre-upgrade backup. Public `markdownPosts` (3), `posts` (2), and `tests` (6) remain readable. Both ordinary-user and Likes-owner password-auth endpoints are enabled.
- Biolink SDK **0.28.1** is deployed from commit `636cf6f` at `https://links.grahamvanpelt.com` (Netlify deploy `6ac0214bf8c65100089ba37c`).
- Likes frontend deployment/browser smoke checks are in progress; owner login/save verification awaits private account provisioning.

Keep content, credentials, databases, and backups outside Git. Do not deploy an empty database over the mounted volume. Existing collection rules were intentionally preserved, not silently tightened or loosened.

## Backup and recovery

The original owner-provided ZIP was restored privately and checked with PocketBase 0.22.22 before upgrading independent copies.

Immediately before production cutover, while the original machine was stopped:

- Created Fly snapshot `vs_eYLpy1NyA3jkCXVon840pJLV` (five-day retention; not a permanent backup).
- Restored it to a temporary volume and downloaded the complete data directory to `/home/gvp/.local/share/gvp-pocketbase-restore/preupgrade-pb-data.tar.gz`, outside Git.
- Backup SHA256: `749980d97adaf360f03787ee45543927d55b9071f8ca666f3598af351d11ac50`.
- SQLite integrity passed. All six original application tables matched the earlier verified owner backup.
- Built an amd64 Docker image and rehearsed it against that isolated snapshot on Fly, with no public service. Version, health, and empty Likes listing passed. Temporary machine/volume were removed afterward; the source snapshot and downloaded backup remain.

**Rollback requires stopping writes and restoring the old data AND matching old image together.** Never point 0.22.22 at an upgraded database. Old image:
`registry.fly.io/pocketbase-fly-starter:deployment-01JE9RPHWGZVH0YFSAXCYHET7D`.
Its digest is `sha256:fc84f7db129baf4e343cfe415077754fc935e51be306dcd13d8fdab1531ad1c9`.
Original machine/config metadata is saved beside the private backup. Restoring the pre-upgrade backup loses subsequent writes unless reconciled first.

## Verification evidence

- Fresh backup copies upgraded directly from 0.22.22 to 0.40.4 with SQLite integrity intact.
- Existing application values, user password hashes, admin IDs/emails/password hashes, collection IDs/rules, custom field identities/types, and relation targets were preserved. Admins became `_superusers`.
- Old/new loopback public API responses and ordering were identical for `bioLinks`, `markdownPosts`, `posts`, and `tests`.
- Full backend source, including existing migration history, repaired hooks, and additive Likes migration, started against fresh restored data. Historical applied migrations were skipped correctly. The old historical files are not a modern empty-database bootstrap.
- Likes: **19 tests passed, zero skipped**; backend hooks: **8 passed**; biolink SDK: **5 passed**. Both frontend builds passed.
- Biolink tests cover the actual installed SDK's public projection/order, ordinary-user login, authorized CRUD, rejected unauthorized writes, and signout. Browser owner login/CRUD still needs human verification; no test writes were made to production.
- Biolink's stale lockfile required updates beyond PocketBase to satisfy existing manifest ranges. Two moderate npm advisories remain; details are in its README.
- The restored settings had S3 and SMTP disabled; the supplied ZIP contained no uploads.

Research and breaking-change references: [`upgrade-research.md`](upgrade-research.md).

## Retired Netlify rebuild hook

`../grahamvanpelt.dev` loads local Markdown through Astro's content collection; all three former PocketBase posts were exported. The owner chose to retain the old PocketBase data but disable rebuild delivery.

The exact old capability hook was verified as belonging to that Netlify site, revoked, and its removal confirmed. **`NETLIFY_BUILD_HOOK` is unset in production**, verified over SSH; no replacement is needed. No real rebuild hook was invoked during tests.

The repaired optional hook uses post-commit success events, `$http.send`, a five-second timeout, and safe error handling. Tests use loopback mocks and cover commits/rollbacks, collection filtering, failed writes, HTTP failure, timeout, and unset configuration. The sole backend deploy workflow gates deployment on tests and updates existing Machines only, without adding replicas/volumes.

## Likes authorization and owner setup

Only `likes_owners` record **`likesowner00001`** (15 characters) may mutate Likes. Other authenticated accounts cannot. Anonymous visitors can read published items only; public owner signup/management is locked.

The owner must create that record administratively with a private email and password of at least 12 characters. Use this ordinary record to sign into `/likes`, **not a `_superusers` account**. Do not send passwords or admin tokens to an agent or commit them.

Website saves set `published: true`; text renders safely and destinations are restricted to HTTP(S) without embedded credentials. Preview fetching/uploads/editorial management are later tickets.

## Remaining checks

1. Finish Likes deployment with `PUBLIC_POCKETBASE_URL=https://pocketbase-fly-starter.fly.dev` and verify public browser rendering and the `/links` redirect.
2. Privately provision the exact owner record, then verify sign-in/save/sign-out and anonymous visibility using an intended real link, not seeded test content.
3. Owner should verify existing biolink login/edit behavior with their normal account; backend upgrade may require signing in again.
