# Read-only storage inventory (Linux)

Use for capacity and file reconciliation, not S3 migration or cleanup. For deployment
and recovery requirements see [backend safety](../../../README.md).

From `pocketbase/server`:

```sh
go build -o /tmp/storage-preflight ./cmd/storage-preflight
/tmp/storage-preflight --data-dir /absolute/path/to/pb_data
```

Use an owner-authorized local copy or read-only mount. No credentials or encryption
key are needed. Do not replace/rename `data.db`, its sidecars, or their directory
ancestors while inspecting. Normal database transactions may continue, but an
isolated complete backup is preferable for operational comparisons. Linux `/proc`
is required. SQLite resolves the `/proc/self/fd` symlink; the open directory
handle does not protect SQLite against namespace replacement. Run as an
unprivileged user.

Output is one sanitized JSON object on stdout. Exit 0 means inspection completed;
exit 1 emits a fixed JSON error, never underlying errors or input paths. Unknown or
missing schema, malformed file values, unsafe references, symlinks, special files,
and read failures fail the entire inspection (no partial successful inventory).
Missing storage/originals are counted, not fatal. This is not a cleanup tool.

- Uses the existing modernc SQLite driver, `mode=ro`, `query_only`,
  `trusted_schema=off`, `readonly_shm=1`, memory-only query scratch space, and one
  read transaction, ended immediately after loading database references and before
  filesystem traversal/hashing (so hashing does not pin the WAL snapshot).
  No PocketBase bootstrap, migrations, settings decryption,
  network calls, or write queries. Does not use `immutable=1` (which ignores WAL).
  A database requiring recovery or unavailable read-only WAL access may fail;
  the inspector does not repair it or create missing sidecars.
- Recognizes the pinned PocketBase **0.40.4 structural schema**, not proof of the
  deployed executable version. Classifies rules as locked/public/conditional;
  this is not an effective-authorization audit. MFA enabled does not establish
  enrollment or universal enforcement (PocketBase supports an MFA rule).
- Emits only allowlisted settings. `encryptedOrUnknown` means settings could not
  be understood, not proof of encryption. Region is emitted only if it matches
  an AWS-region-shaped value; arbitrary S3-compatible region strings are omitted.
- View collections retain schema/rules and a `COUNT(*)` row count, but report
  `fileInventory: "source-collections-only"`: PocketBase resolves view files to
  source collection/record files (`core/view.go`, `FindRecordByViewFile`). View
  IDs and nullable file values are not inventoried. Their physical totals are
  zero and digest is empty, not an assertion that their files are absent.
  Files under view collection roots are unattributed; source collections alone
  contribute physical references, avoiding false missing files and double counts.
- References are deduplicated across all source collection file fields by
  `collectionId/recordId/filename`. `referencedOriginals`, `thumbnails`,
  `metadataSidecars`, and `unreferenced` are disjoint local file count/byte totals.
  Pinned `tools/filesystem/internal/fileblob/fileblob.go` writes `.attrs` metadata
  sidecars for both originals and thumbnails. `metadataSidecars` combines
  `<referenced filename>.attrs` and `.attrs` files directly under
  `thumbs_<referenced filename>`; `thumbnails` counts only non-sidecar files
  directly under those thumbnail directories. Explicit original references take
  precedence over `.attrs` filename heuristics and are hashed as originals.
  Association requires a database source reference, not local data presence:
  this is not a full metadata integrity check. Metadata contents are neither read,
  parsed, hashed, nor emitted. Unreferenced includes orphan originals, thumbnails,
  and either kind of metadata sidecar when there is no source reference.
  Files outside known collection roots are aggregated as `unattributedFiles`;
  their path components are never emitted. Directories do not count as files.
- `missingReferences` means missing **locally**, not necessarily missing in S3.
  No S3 inventory or availability check is performed.
- `inventorySHA256` hashes `storage-preflight-v1\0`, then each sorted full relative
  reference path: big-endian uint64 byte length, path bytes, presence byte (0/1),
  and, if present, the original's binary SHA256. No per-file hash/path is emitted.
  Missing references participate; thumbnails, metadata sidecars, and unreferenced
  files do not.
- Filesystem inventory is **live**, not atomically consistent with the database
  or other files. Concurrent in-place changes can yield mixed observations even
  if inspection succeeds. Preserve data and coordinate writes before remediation.

Tests use synthetic SQLite databases (including a real view) and local files only:

```sh
go test ./cmd/storage-preflight
go test -race ./...
go vet ./...
```
