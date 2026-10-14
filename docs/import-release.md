# Offline Watery Grave draft importer

`server/cmd/import-release` is a one-shot operator command for approved #21 only. It creates one private `watery-grave-ep` release with its own uploaded artwork and five ordered tracks in the release's `tracks` JSON array (#9 schema). It creates no separate track records. It does not publish, create snapshots, create credentials, load application hooks, start a server, or make API requests. `published` is explicitly false.

## Preconditions

- Parent/operator owns live execution. Rehearse first on a **restored actual paired database/storage backup after the publishing migrations**, with the same binary. This command does not install migrations.
- Explicitly supply the existing PocketBase data directory containing a nonempty `data.db`. The `publishing_releases` and `publishing_snapshots` collections must already exist, with `published` (bool) and `tracks` (JSON) on releases. The old `publish`/`unpublish` schema is not supported; `publishing_tracks` is no longer required. List/view rules must remain locked; release artwork must be protected. Any matching release **or snapshot** slug causes refusal, even if it is an incomplete draft or withdrawn snapshot. No adoption or overwrite is supported.
- Use local PocketBase storage. Stored S3 configuration being enabled causes refusal before saving; the tool must not access remote storage.
- Arrange exclusive maintenance externally: stop/quiesce **all** backend instances and other writers sharing this data directory, disable automated restarts for the window, and prevent deploys/administrative edits. The command does not acquire a deployment-wide lock. SQLite transactions alone are not maintenance coordination. Keep exclusivity through completion and verification.
- Take and verify a paired database/storage backup before execution. Run as the service filesystem owner with access to the existing data and storage directories. Keep source inputs stable during execution.

## Build and prepare (deployment repository root)

In the source repository, use `pocketbase/server` instead of `server` and `src/data/releases/miracle-fortress.json` instead of the sibling source path below. The importer source/tests are identical in both repositories.

```sh
(cd server && go test ./cmd/import-release)
(cd server && go build -o /tmp/gvp-import-release ./cmd/import-release)
(cd server && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o /tmp/gvp-import-release-amd64 ./cmd/import-release)

jq '.[-1]' ../gvp.fyi/src/data/releases/miracle-fortress.json > /tmp/watery-grave-release.json
```

The JSON must be the single approved object, not the full array. All known metadata, track titles/order, and the five exact `/audio/watery-grave/...mp3` URLs are pinned. Unknown fields, changed metadata, missing/reordered tracks, external URLs, and trailing JSON are rejected. The target track shape is `{title, track_num, duration?, audio_url?}`, with an optional nonnegative numeric duration. This deliberately pinned import supplies the five approved audio URLs and omits duration (none is present in the approved source); it is not a general track editor. Audio files are not read, uploaded, or fetched. The local artwork path is supplied independently; `artwork_url` is validated but not fetched. PocketBase validates and stores the supplied file.

## Operator invocation

Only after the preconditions above, on the machine holding the existing data:

```sh
/tmp/gvp-import-release \
  --dir /absolute/path/to/existing/pb_data \
  --release /tmp/watery-grave-release.json \
  --artwork /absolute/path/to/watery-grave.jpg
```

Use `/tmp/gvp-import-release-amd64` instead on Linux amd64. No endpoint, email, password, token, or authentication creation is needed. Do not run against an active service's data directory.

Success prints only `Imported record <id>; tracks=5`. Failure prints `Import failed.` and exits nonzero, including invalid flags. Input values, settings, and underlying errors are intentionally not printed. There is no verbose/debug mode.

The single release write (including the entire tracks JSON array) and collision checks run in one `RunInTransaction`. This is **database** atomicity, not a promise of filesystem atomicity across process crashes. On failure, inspect the offline copy before retrying; do not delete existing records to bypass refusal. If interrupted or storage state is uncertain, restore the paired backup under maintenance rather than assuming a retry repairs it.

After success, verify the private record, five ordered entries in its tracks JSON array, locally stored artwork, `published=false`, unchanged snapshots, and unchanged unrelated/auth records before resuming service. Publication remains a separate authorized action.

## Bootstrap scope and tests

The executable uses `core.NewBaseApp` with the explicit data directory and `Bootstrap`, not `Start`/serve. It registers neither system/application migration packages nor publishing hooks. A read-only preflight requires existing core/publishing tables and refuses if any system migrations have been registered in the executable, preventing accidental future migration imports. Bootstrap still performs normal PocketBase housekeeping (SQLite connections/journals, auxiliary logging database initialization, cached settings/collections, temporary-directory cleanup); this is not a read-only tool. Run against a database already compatible with this module version.

Focused tests cover pinned input/URL/order validation and missing-directory refusal. CLI tests build a real importer binary in a unique temporary directory and exercise successful JSON-track draft persistence without a track collection, both collision types, and rollback when release validation fails. No runtime migration or live database is used by these CLI fixtures. Tests initialize only disposable temporary databases; their migration import is test-only. The parent/operator's restored-backup rehearsal is still required to verify the actual deployed schema and storage.
