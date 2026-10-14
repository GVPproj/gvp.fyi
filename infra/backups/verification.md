# Local recovery verification gates

## Status and public seam

`verify.py` is **local only**, Python 3.11+ standard library. It does not contact
cloud services or production, upload/promote markers, prune retention, or execute
captured code. No real production archive was read during implementation.

- `validate_archive(archive_path, *, sqlite_timeout=5, **limits)` extracts a private
  temporary copy, checks structure, captured inventory, both SQLite databases and
  original file references. Returns exactly
  `{"structural_valid": True, "recovery_verified": False}`. This is **not** a
  recovered/verified set. The temporary directory is removed on success/failure.
- `verify_recovery(archive_path, *, startup_timeout=30, **limits)` first performs
  the same validation, then **always raises** `VerificationError` with
  `gate == "isolated_startup"`. Startup is unsupported pending a vetted harness.
  `startup_timeout` reserves the bounded-startup interface; no process is started.
  Other validation errors have `gate == "validation"` and generic messages.
- There is no skip, supplied-success-flag, candidate-runtime or custom-executor
  option that can report successful verification. Extra JSON flags are not proof.
  Exceptions and summaries do not include filenames, records, settings, hashes,
  tokens, hook output, or private metadata.

**Retention seam:** only recovery sets that pass actual isolated restore **and**
independent S3 object read-back/hash verification count. Neither this structural
result nor a self-declared marker counts. This module currently promotes **zero**
sets. S3 verification/retention are outside this module's scope.

## Explicit normalized archive format, version 1

Accept uncompressed tar or gzip-compressed tar. No ZIP or automatic historical
layout guessing. A trusted capture/normalization step must produce:

```text
pb_data/
  data.db
  auxiliary.db
  storage/<collection-id>/<record-id>/<original-name>
  ... all captured local files, variants and sidecars ...
pocketbase                  # actual captured matching executable bytes
pb_hooks/                   # captured matching hooks; explicit dir if empty
pb_migrations/              # captured matching historical migrations; explicit if empty
deployment.json             # metadata + complete inventory
```

No other top-level entries are accepted. Never substitute a repository checkout,
candidate binary or new migrations for captured artifacts. Empty hooks/migrations
are acceptable only when the captured deployment actually has none. Historical
archives must be normalized explicitly without discarding files; construct the
inventory from capture evidence, **not** by blessing an incomplete recovery copy.

`deployment.json` is UTF-8 JSON, at most 1 MiB, with this required shape (example
placeholders are not real capture evidence):

```json
{
  "format_version": 1,
  "captured_at": "2026-10-14T21:10:28Z",
  "runtime_version": "captured-version-or-custom-build-id",
  "deployment": {
    "command": ["serve"],
    "configuration": {}
  },
  "files": {
    "pocketbase": {"size": 123, "sha256": "<64 lowercase hex characters>"},
    "pb_data/data.db": {"size": 456, "sha256": "<64 lowercase hex characters>"}
  }
}
```

The abbreviated example omits required inventory entries. `files` must list
**every regular file except `deployment.json`**, including auxiliary DB, hooks,
migrations, every storage original, thumbnail/variant and `.attrs` sidecar. Keys
are exact normalized archive-relative paths; values are byte size and SHA-256.
Missing, extra, same-size changed or incorrectly sized files fail. Directories
are not inventory files. Deployment command is a nonempty array of strings;
configuration is an object containing the captured configuration. Optional private
provenance/configuration can be added, but is never printed or executed.

Inventory checks prove agreement with captured metadata, not capture authenticity,
quiescence, matching-runtime compatibility or independent key custody. External
capture provenance and object hashes must bind the exact archive. Encryption keys
need independent private custody; this module does not resolve encrypted settings.

## Implemented validation

1. Stream extraction into a fresh private temporary directory. Reject absolute,
   traversal, backslash, control-character and non-normalized paths; duplicate
   entries; file/directory conflicts; symlinks, hardlinks, devices, FIFOs and sparse
   files. Never use tar `extractall`, restore owners/modes or follow archive links.
   Captured executables are written as ordinary non-executable files. No existing
   hooks or restored process can write outside the temporary copy because none run.
2. Bound input bytes, expanded bytes (including tar metadata/padding and trailing
   gzip data), per-file bytes and member count. Drain gzip to validate its trailer
   and CRC after tar EOF. Defaults: 512 MiB archive, 1 GiB expanded, 512 MiB/file,
   100,000 members. Keyword overrides: `max_archive_bytes`,
   `max_expanded_bytes`, `max_file_bytes`, `max_members`. Retain runner disk and
   overall job-time limits as additional independent defenses.
3. Require normalized deployment artifacts and inventory; hash actual extracted
   bytes, not merely the manifest's declarations.
4. Require SQLite headers and full `PRAGMA integrity_check` returning only `ok`
   for **both** DBs. Open with `mode=ro&immutable=1`, query-only mode, untrusted
   schema and extension loading disabled. Reject DB WAL/SHM/journal companions;
   normalize only coherent stopped/checkpointed snapshots, never drop a needed WAL.
   A progress handler bounds SQL work to `sqlite_timeout` seconds per database.
5. Read actual main-DB `_collections.fields` (modern) or `.schema` (historical)
   definitions; require exactly one schema column and reject ambiguous/invalid or
   unsupported field definitions (supported types pinned to PocketBase v0.40.4). For each `type: file`
   field, read records from the actual collection-name table, safely quote SQL
   identifiers, require declared file columns to exist in the actual record table,
   and check originals using **collection id**, record id and filename.
   Support single filenames and JSON filename arrays, including leading JSON
   whitespace; reject unsafe references.
   File-bearing views/virtual tables are unsupported. Extra unreferenced stored
   files are permitted only when inventoried; captured variants are never silently
   treated as optional.

Not proved: cross-database capture atomicity, custom references embedded in JSON/
rich text/retained publication media, application-S3 objects, decryption, collection
semantics, runtime health, protected retrieval or post-startup preservation. These
remain gates; structural success must not be interpreted as full completeness for
arbitrary custom deployments.

## Required isolated-startup implementation (blocked)

Namespace availability alone is not a sufficient harness. Before **any** captured
executable/hook/migration starts, a reviewed harness must:

- Enter Linux user + network + mount namespaces (or a vetted independent harness),
  verify them against the parent, configure loopback only, verify actual interfaces
  and IPv4/IPv6 routes, and block all outbound access before startup.
- Make only a separate restored copy writable; isolate the filesystem/mount view,
  inherited descriptors and host Unix sockets so captured code cannot access shared
  hooks, credentials or write elsewhere. A new mount namespace by itself does not
  remove host filesystem access. Use a sanitized environment and private cwd/home.
- Start the exact inventory-bound captured binary with only captured hooks/history,
  never candidate migrations. Do not blindly execute `deployment.command`.
  Enforce a bounded timeout, kill/reap all descendants, suppress private logs and
  clean up on every exit path. Do not fall back to unrestricted startup.
- Verify genuine PocketBase readiness and representative protected/local file
  retrieval, shared-consumer and retained Published data, plus before/after main
  schema/records/auth and stored-file comparisons. A process exit code, health
  string or self-declared isolated flag cannot prove restored compatibility.

This implementation deliberately fails closed instead of attempting a partial
sandbox. The host used here supports namespace creation, but no captured-runtime
startup or full isolated restore was performed.

## Tests and local evidence

Run without producing repository bytecode:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s infra/backups -p test_verify.py -v
```

Fifteen tests, developed one red → green slice at a time, use real temporary tar/gzip
archives and SQLite databases. They cover unsafe member types/paths, duplicate/
conflicting entries, limits, normalized layout/metadata, complete inventory and
same-size corruption, both DBs (including empty auxiliary DB), modern/historical
file references, ambiguous schemas, gzip trailer corruption, and fail-closed
recovery despite supplied flags. Additional review regressions reject conflicting schema columns, unsupported
field types, whitespace-array reference bypasses and non-integer format versions.
No storage/cloud mocks or production data.

A real trusted-Python subprocess in user/network/mount namespaces verifies changed
namespace IDs, only `lo`, and no IPv4 routes, then invokes the **public** recovery
seam and observes rejection at `isolated_startup`. It does not run a captured
executable and is not a full restore test. All fifteen tests passed on this host.
Where namespace creation is unavailable, the same test explicitly checks local
recovery rejection and reports the capability limitation rather than skipping or
claiming successful isolation. A sentinel executable fixture also proves the
unsupported path does not launch captured code.
