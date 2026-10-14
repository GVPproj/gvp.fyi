"""Local recovery validation. Structural validation is NOT restore verification."""
from contextlib import closing, contextmanager
from pathlib import Path, PurePosixPath
from datetime import datetime
import gzip
import hashlib
import json
import sqlite3
import tarfile
import time
import tempfile


class VerificationError(ValueError):
    """A recovery gate failed; messages contain no captured values."""

    def __init__(self, message, *, gate='validation'):
        super().__init__(message)
        self.gate = gate


def _safe_name(name):
    parts = name.split("/")
    if (not name or "\\" in name or any(ord(c) < 32 for c in name)
            or any(p in ("", ".", "..") for p in parts)):
        raise VerificationError("unsafe archive")
    return PurePosixPath(name)


class _BoundedReader:
    def __init__(self, source, limit):
        self.source = source
        self.remaining = limit

    def read(self, size=-1):
        size = min(size if size >= 0 else self.remaining + 1, self.remaining + 1)
        data = self.source.read(size)
        self.remaining -= len(data)
        if self.remaining < 0:
            raise VerificationError("archive decompression limit exceeded")
        return data


@contextmanager
def _restored(archive_path, *, max_archive_bytes=512 * 1024**2,
              max_expanded_bytes=1024**3, max_file_bytes=512 * 1024**2,
              max_members=100000):
    with tempfile.TemporaryDirectory(prefix="pb-recovery-") as directory:
        root = Path(directory)
        try:
            with open(archive_path, "rb") as raw:
                raw.seek(0, 2)
                if raw.tell() > max_archive_bytes:
                    raise VerificationError("compressed archive limit exceeded")
                raw.seek(0)
                compressed = raw.read(2) == b"\x1f\x8b"
                raw.seek(0)
                source = gzip.GzipFile(fileobj=raw) if compressed else raw
                bounded = _BoundedReader(source, max_expanded_bytes)
                with tarfile.open(fileobj=bounded, mode="r|") as archive:
                    _extract(archive, root, max_members, max_file_bytes)
                # Include trailing padding/concatenated gzip data in the budget,
                # and require gzip CRC/trailer validation, even after tar EOF.
                while bounded.read(65536):
                    pass
        except (OSError, tarfile.TarError, EOFError):
            raise VerificationError("archive extraction failed") from None
        yield root


def _extract(archive, root, max_members, max_file_bytes):
    seen = set()
    for member in archive:
        if len(seen) >= max_members or member.size > max_file_bytes:
            raise VerificationError("archive member limit exceeded")
        name = _safe_name(member.name.rstrip("/") if member.isdir() else member.name)
        if str(name) in seen or member.issparse() or member.size < 0:
            raise VerificationError("unsafe archive")
        seen.add(str(name))
        if not (member.isdir() or member.isreg()):
            raise VerificationError("unsafe archive")
        target = root.joinpath(*name.parts)
        if member.isdir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as source, target.open("xb") as output:
                while chunk := source.read(65536):
                    output.write(chunk)


def _metadata(root):
    required_files = ('pb_data/data.db', 'pb_data/auxiliary.db', 'pocketbase', 'deployment.json')
    required_dirs = ('pb_data', 'pb_hooks', 'pb_migrations')
    if (any(not (root / p).is_file() for p in required_files)
            or any(not (root / p).is_dir() for p in required_dirs)
            or any(p.name not in {'pb_data', 'pocketbase', 'pb_hooks',
                                 'pb_migrations', 'deployment.json'} for p in root.iterdir())):
        raise VerificationError("normalized layout required")
    try:
        path = root / 'deployment.json'
        if path.stat().st_size > 1024**2:
            raise ValueError
        metadata = json.loads(path.read_bytes())
        if (type(metadata) is not dict or type(metadata.get('format_version')) is not int
                or metadata['format_version'] != 1
                or not isinstance(metadata.get('runtime_version'), str)
                or not metadata['runtime_version']
                or type(metadata.get('files')) is not dict
                or type(metadata.get('deployment')) is not dict
                or type(metadata['deployment'].get('command')) is not list
                or not metadata['deployment']['command']
                or not all(isinstance(arg, str) for arg in metadata['deployment']['command'])
                or type(metadata['deployment'].get('configuration')) is not dict):
            raise ValueError
        captured_at = metadata['captured_at']
        if not isinstance(captured_at, str) or not captured_at.endswith('Z'):
            raise ValueError
        datetime.fromisoformat(captured_at)
        return metadata
    except (ValueError, KeyError, TypeError, OSError, RecursionError):
        raise VerificationError("invalid deployment metadata") from None


def _inventory(root, metadata):
    actual = {p.relative_to(root).as_posix(): p for p in root.rglob('*')
              if p.is_file() and p != root / 'deployment.json'}
    inventory = metadata['files']
    if actual.keys() != inventory.keys():
        raise VerificationError("captured inventory mismatch")
    for name, path in actual.items():
        entry = inventory[name]
        if (type(entry) is not dict or type(entry.get('size')) is not int
                or entry['size'] != path.stat().st_size
                or not isinstance(entry.get('sha256'), str)):
            raise VerificationError("captured inventory mismatch")
        with path.open('rb') as source:
            digest = hashlib.file_digest(source, 'sha256').hexdigest()
        if digest != entry['sha256']:
            raise VerificationError("captured inventory mismatch")


@contextmanager
def _database(path, timeout):
    with path.open('rb') as source:
        if source.read(16) != b'SQLite format 3\x00':
            raise VerificationError("SQLite snapshot gate failed")
    if timeout <= 0 or any(Path(str(path) + suffix).exists()
                           for suffix in ('-wal', '-shm', '-journal')):
        raise VerificationError("SQLite snapshot gate failed")
    try:
        with closing(sqlite3.connect(path.as_uri() + '?mode=ro&immutable=1', uri=True)) as db:
            deadline = time.monotonic() + timeout
            db.enable_load_extension(False)
            db.execute('PRAGMA trusted_schema=OFF')
            db.execute('PRAGMA query_only=ON')
            db.set_progress_handler(lambda: time.monotonic() >= deadline, 1000)
            if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                raise VerificationError("SQLite integrity gate failed")
            yield db
    except sqlite3.Error:
        raise VerificationError("SQLite validation gate failed") from None


def _identifier(value):
    if not isinstance(value, str) or not value or '\x00' in value:
        raise VerificationError("collection schema gate failed")
    return '"' + value.replace('"', '""') + '"'


def _component(value):
    if (not isinstance(value, str) or not value or value in ('.', '..')
            or '/' in value or '\\' in value or any(ord(c) < 32 for c in value)):
        raise VerificationError("file reference gate failed")
    return value


# PocketBase v0.40.4 core/field_*.go. Unknown/custom types require explicit
# verification support; treating them as non-file fields can hide originals.
_FIELD_TYPES = {'text', 'number', 'bool', 'email', 'url', 'editor', 'date',
                'autodate', 'select', 'file', 'relation', 'json', 'geoPoint', 'password'}


def _references(root, db):
    try:
        tables = dict(db.execute("SELECT name, sql FROM sqlite_schema WHERE type='table'"))
        if '_collections' not in tables:
            raise VerificationError("collection schema gate failed")
        columns = {row[1] for row in db.execute('PRAGMA table_info(_collections)')}
        schema_columns = columns & {'fields', 'schema'}
        if len(schema_columns) != 1:
            raise VerificationError('collection schema gate failed')
        schema_column = next(iter(schema_columns))
        for collection_id, table, encoded in db.execute(
                'SELECT id, name, ' + _identifier(schema_column) + ' FROM _collections'):
            if not isinstance(encoded, str) or len(encoded) > 1024**2:
                raise ValueError
            fields = json.loads(encoded)
            if not isinstance(fields, list) or any(
                    type(field) is not dict or not isinstance(field.get('name'), str)
                    or not field['name'] or not isinstance(field.get('type'), str)
                    or field['type'] not in _FIELD_TYPES for field in fields):
                raise ValueError
            file_fields = [field['name'] for field in fields if field['type'] == 'file']
            if not file_fields:
                continue
            if table not in tables or 'VIRTUAL' in (tables[table] or '').upper():
                raise ValueError
            record_columns = {row[1] for row in db.execute(
                'PRAGMA table_info(' + _identifier(table) + ')')}
            if not {'id', *file_fields}.issubset(record_columns):
                raise VerificationError("collection schema gate failed")
            collection_id = _component(collection_id)
            selected = ', '.join(_identifier(name) for name in ['id', *file_fields])
            for record in db.execute('SELECT ' + selected + ' FROM ' + _identifier(table)):
                record_id = _component(record[0])
                for raw in record[1:]:
                    if raw is None or raw == '':
                        continue
                    if not isinstance(raw, str) or len(raw) > 1024**2:
                        raise ValueError
                    files = json.loads(raw) if raw.lstrip().startswith('[') else [raw]
                    if not isinstance(files, list):
                        raise ValueError
                    for filename in files:
                        path = root / 'pb_data/storage' / collection_id / record_id / _component(filename)
                        if not path.is_file():
                            raise VerificationError("referenced original missing")
    except (ValueError, KeyError, TypeError, RecursionError) as error:
        if isinstance(error, VerificationError):
            raise
        raise VerificationError("collection file reference gate failed") from None


def validate_archive(archive_path, *, sqlite_timeout=5, **limits):
    """Validate structure only; never qualifies a set for retention."""
    with _restored(archive_path, **limits) as root:
        metadata = _metadata(root)
        _inventory(root, metadata)
        for name in ('data.db', 'auxiliary.db'):
            with _database(root / 'pb_data' / name, sqlite_timeout) as db:
                if name == 'data.db':
                    _references(root, db)
        return {"structural_valid": True, "recovery_verified": False}


def verify_recovery(archive_path, *, startup_timeout=30, **limits):
    """Fail closed: there is no vetted isolated startup harness yet.

    No executable, hook, or migration is run. startup_timeout reserves the
    bounded-startup API; it cannot enable or bypass the missing runtime gate.
    """
    validate_archive(archive_path, **limits)
    raise VerificationError("isolated startup unsupported; recovery not verified",
                            gate='isolated_startup')
