# One-release publishing rehearsal (#7)

This is an **isolated tracer bullet**, not a production cutover. It implements the
[approved Save/Publish decisions](publishing-decisions.md) for **Watery Grave EP**.
All other releases retain their checked-in source. The existing public route
`/music-releases/watery-grave-ep` and all five `/audio/watery-grave/*.mp3` URLs remain
unchanged. No S3 resources, storage settings, production records, Netlify credentials,
or Likes behavior are changed.

## Local backend and import

Use the pinned custom PocketBase 0.40.4 executable with the repository's full
migration/hook directories. See [backend contract](../pocketbase/publishing-contract.md)
for schema and authorization details. A stock executable is insufficient: the
custom executable implements publication and the published-read endpoints.

Run only against a fresh disposable loopback backend, with production outbound effects
and storage disabled. Never point a rehearsal at a shared `pb_data` directory. Existing
[backup/rollback requirements](../pocketbase/README.md#backup-and-rollback-safety) remain
mandatory for any later deployment.

`scripts/import-release.mjs` exports `importRelease({endpoint, token})` and can also run
as a CLI. It reads the existing catalogue and JPEG, creates a private release and five
ordered track records, and **does not publish**. CLI configuration:

- `PUBLISHING_POCKETBASE_URL`: isolated `http://127.0.0.1:<port>` (or IPv6 loopback).
- `PUBLISHING_IMPORT_TOKEN`: temporary local administrative token, supplied privately
  through the process environment; never commit, paste into tickets, or reuse for builds.

```sh
node scripts/import-release.mjs
```

The importer rejects non-loopback targets and any existing `watery-grave-ep` slug.
It never adopts/overwrites records. It is intentionally additive, not an upsert:
a repeated import fails safely. If an interrupted import leaves partial draft records,
inspect the isolated dashboard and recreate the disposable backend before retrying;
there is no automatic destructive cleanup. Publication requires a complete ordered
release, and the build additionally checks the five existing MP3 references.

## Dashboard workflow

1. Sign into the isolated PocketBase `/_/` dashboard as its temporary superuser.
   Production administrative MFA/security verification remains a separate rollout gate.
2. Open `publishing_releases` and edit the imported release. Save metadata/artwork
   normally; this retains a private working version. New releases start as drafts.
3. Edit the associated `publishing_tracks` records, preserving unique consecutive
   `track_num` values and the existing MP3 URLs. Save all dependent edits first.
4. Reopen the release, tick **publish**, and Save. The server resets this command to
   false and captures one coherent immutable metadata/track/artwork snapshot.
5. Build the site. Later ordinary Saves, unrelated builds, and working-file replacement
   or deletion do not replace the published snapshot. Publish again to update it.

This uses supported dashboard record editing, not a fictional custom button. Publication
makes a snapshot eligible for a build; it does **not** trigger a Netlify build or claim
successful deployment. Request/build/deployment status and unpublish/delete workflows
belong to #9. Deleting a working record does not unpublish it. Snapshots and their own
artwork copies are retained without automatic pruning in this tracer.

## Opt-in Astro source and static media

Create a dedicated temporary `publishing_builds` email/password identity administratively
on the isolated backend. This identity cannot read working records, manage identities,
write records, or use ordinary snapshot collection/file APIs. It can only read published
snapshots and their retained artwork through the custom endpoints.

Set these **server-only** environment variables for `pnpm build` (or local `pnpm dev`):

- `PUBLISHING_POCKETBASE_URL`: backend origin; HTTPS required except literal loopback.
- `PUBLISHING_BUILD_EMAIL` and `PUBLISHING_BUILD_PASSWORD`: dedicated published-read identity.

No `PUBLIC_` variables or superuser credentials are used for this path. With all three
unset, the site retains its existing checked-in catalogue. Partial configuration,
authentication errors, no published snapshot, invalid metadata, missing/changed MP3
references, failed downloads, bad image dimensions, or checksum mismatches fail the build;
there is no fallback to stale local data after opting in. Restart dev to read a newer
snapshot; one process/build intentionally pins one revision.

The build authenticates once, reads one complete snapshot, downloads only its revision-pinned
same-origin `/api/publishing/` artwork, verifies SHA-256 and decoded dimensions, and
materializes responsive WebP files under `/published-releases/` in the build output.
Redirects and arbitrary remote image origins/paths are rejected. Credentials and private
payloads never enter the public projection or error logs. Images are generated locally,
not by a runtime Netlify image transform fetching PocketBase. No broader Astro
`remotePatterns` permission is needed. Detail images use intrinsic aspect ratio, responsive
`srcset`/`sizes`, descriptive alt text and eager loading; overview thumbnails remain lazy.

Public HTML and generated artwork work with PocketBase offline. Existing Likes routes
remain dynamic and are **not** converted by this slice. Original public image URLs remain
in place; no historical media URL is removed. MP3s retain native controls and
`preload="none"`. Normal successful-deployment/cache removal delay still applies, and
already downloaded files cannot be recalled.

## Verification

```sh
(cd pocketbase/server && go build -trimpath -o /tmp/gvp-publishing-pocketbase .)
POCKETBASE_BINARY=/tmp/gvp-publishing-pocketbase node --test tests/publishing-pocketbase.test.js tests/publishing-import.test.js
POCKETBASE_BINARY=/tmp/gvp-publishing-pocketbase PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium node --test tests/publishing-build.test.js tests/publishing-workflow-browser.test.js
pnpm check
```

Tests use disposable loopback databases and random credentials, standard administrative
save/upload requests, a real dashboard browser, restricted build authentication, and the
actual Astro/Netlify adapter build. Generated-output scans check secrets/private content;
mobile/desktop browser checks load deployed artwork after the fixture backend stops.
They do not establish production Netlify deployment behavior or owner visual acceptance
(#11/#14). Tests explicitly skip executable-dependent checks when executables are absent.

Measured with the checked-in 300×283 JPEG and Sharp 0.35.5, WebP quality 80:

| Asset | Bytes |
| --- | ---: |
| Original JPEG | 36,927 |
| Full-width 300px WebP | 22,528 |
| 160px WebP | 8,712 |

Do not enable this source in production yet. #11 must finish S3/security/cost/backup
preflight and migration rehearsal; #14 gates concrete deployment approval and owner
acceptance. Reverting the opt-in configuration restores the local source for this isolated
slice; it is not a destructive database rollback or a production data-recovery procedure.
