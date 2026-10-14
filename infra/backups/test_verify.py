"""Local-only recovery contracts, using real archives and SQLite databases."""
from contextlib import closing
import hashlib
import io
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import unittest

from verify import VerificationError, validate_archive, verify_recovery


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def archive(self, entries):
        path = self.root / "recovery.tar.gz"
        with tarfile.open(path, "w:gz") as archive:
            for name, content in entries:
                info = tarfile.TarInfo(name)
                if isinstance(content, tarfile.TarInfo):
                    archive.addfile(content)
                else:
                    info.size = len(content)
                    archive.addfile(info, io.BytesIO(content))
        return path

    def recovery_entries(self):
        entries = []
        for directory in ('pb_data', 'pb_data/storage', 'pb_hooks', 'pb_migrations'):
            info = tarfile.TarInfo(directory)
            info.type = tarfile.DIRTYPE
            entries.append((directory, info))
        db = self.root / 'fixture.db'
        with closing(sqlite3.connect(db)) as connection:
            connection.executescript('''
                CREATE TABLE _collections (id TEXT, name TEXT, fields TEXT);
                INSERT INTO _collections VALUES ('c1', 'photos',
                    '[{"name":"original","type":"file","maxSelect":1}]');
                CREATE TABLE photos (id TEXT, original TEXT);
                INSERT INTO photos VALUES ('r1', 'original.txt');
            ''')
        entries.extend([('pb_data/data.db', db.read_bytes()),
                        ('pb_data/auxiliary.db', db.read_bytes()),
                        ('pb_data/storage/c1/r1/original.txt', b'original bytes'),
                        ('pb_data/storage/c1/r1/thumbs/small.txt', b'thumbnail'),
                        ('pb_data/storage/c1/r1/original.txt.attrs', b'attributes'),
                        ('pocketbase', b'captured executable'),
                        ('pb_hooks/main.pb.js', b'// captured hook'),
                        ('pb_migrations/001.js', b'// captured migration')])
        return entries

    def complete_archive(self, entries=None, metadata=None):
        entries = self.recovery_entries() if entries is None else entries
        inventory = {name: {'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                     for name, data in entries if isinstance(data, bytes)}
        metadata = metadata if metadata is not None else {
            'format_version': 1, 'captured_at': '2026-10-14T21:10:28Z',
            'runtime_version': 'captured-custom-build',
            'deployment': {'command': ['serve'], 'configuration': {}},
            'files': inventory,
        }
        return self.archive(entries + [('deployment.json', json.dumps(metadata).encode())])

    def test_normalized_layout_and_captured_inventory_are_required(self):
        entries = self.recovery_entries()
        result = validate_archive(self.complete_archive(entries))
        self.assertEqual(result, {'structural_valid': True, 'recovery_verified': False})
        for required in ('pb_data/data.db', 'pb_data/auxiliary.db', 'pocketbase',
                         'pb_hooks', 'pb_migrations'):
            with self.subTest(required=required):
                reduced = [(name, data) for name, data in entries
                           if name != required and not name.startswith(required + '/')]
                with self.assertRaisesRegex(VerificationError, 'layout'):
                    validate_archive(self.complete_archive(reduced))
        for metadata in ({}, {'format_version': 1, 'files': {}}):
            with self.subTest(metadata=metadata):
                with self.assertRaisesRegex(VerificationError, 'metadata'):
                    validate_archive(self.complete_archive(entries, metadata))
        with self.assertRaises(VerificationError):
            validate_archive(self.archive(entries))

    def test_deployment_format_requires_an_actual_integer_version(self):
        entries = self.recovery_entries()
        path = self.complete_archive(entries)
        with tarfile.open(path) as archive:
            metadata = json.load(archive.extractfile('deployment.json'))
        for version in (True, 1.0, '1'):
            with self.subTest(version=version), self.assertRaises(VerificationError):
                validate_archive(self.complete_archive(entries, {**metadata, 'format_version': version}))

    def test_inventory_covers_every_captured_file_including_variants(self):
        entries = self.recovery_entries()
        path = self.complete_archive(entries)
        with tarfile.open(path) as archive:
            metadata = json.load(archive.extractfile('deployment.json'))
        for name in ('pocketbase', 'pb_hooks/main.pb.js', 'pb_migrations/001.js',
                     'pb_data/storage/c1/r1/original.txt',
                     'pb_data/storage/c1/r1/thumbs/small.txt',
                     'pb_data/storage/c1/r1/original.txt.attrs'):
            with self.subTest(name=name):
                changed = [(p, b'x' * len(data) if p == name else data) for p, data in entries]
                with self.assertRaisesRegex(VerificationError, 'inventory'):
                    validate_archive(self.complete_archive(changed, metadata))
        mutations = [dict(metadata, files={}),
                     dict(metadata, files={**metadata['files'], 'pb_data/storage/missing':
                                          {'size': 0, 'sha256': '0' * 64}})]
        for mutated in mutations:
            with self.assertRaisesRegex(VerificationError, 'inventory'):
                validate_archive(self.complete_archive(entries, mutated))

    def test_both_sqlite_databases_must_pass_read_only_integrity(self):
        entries = self.recovery_entries()
        for db in ('pb_data/data.db', 'pb_data/auxiliary.db'):
            with self.subTest(db=db):
                corrupt = [(name, b'not SQLite' if name == db else data)
                           for name, data in entries]
                with self.assertRaisesRegex(VerificationError, 'SQLite'):
                    validate_archive(self.complete_archive(corrupt))
        for suffix in ('-wal', '-shm', '-journal'):
            with self.subTest(suffix=suffix):
                with self.assertRaisesRegex(VerificationError, 'SQLite'):
                    validate_archive(self.complete_archive(entries + [('pb_data/data.db' + suffix, b'x')]))
        with self.assertRaisesRegex(VerificationError, 'SQLite'):
            validate_archive(self.complete_archive(entries), sqlite_timeout=0)

    def test_actual_collection_file_fields_require_all_referenced_originals(self):
        entries = self.recovery_entries()
        missing = [(name, data) for name, data in entries
                   if name != 'pb_data/storage/c1/r1/original.txt']
        with self.assertRaisesRegex(VerificationError, 'referenced original'):
            validate_archive(self.complete_archive(missing))
        # Historical schema column and multi-select file values are supported,
        # using collection id for storage but collection name for the SQL table.
        with closing(sqlite3.connect(self.root / 'fixture.db')) as db:
            db.executescript('''
                ALTER TABLE _collections RENAME COLUMN fields TO schema;
                UPDATE _collections SET schema =
                    '[{"name":"original","type":"file","options":{"maxSelect":5}}]';
                UPDATE photos SET original = '["original.txt", "second.txt"]';
            ''')
        multi = [(name, (self.root / 'fixture.db').read_bytes() if name == 'pb_data/data.db' else data)
                 for name, data in entries]
        with self.assertRaisesRegex(VerificationError, 'referenced original'):
            validate_archive(self.complete_archive(multi))
        multi.append(('pb_data/storage/c1/r1/second.txt', b'second'))
        self.assertFalse(validate_archive(self.complete_archive(multi))['recovery_verified'])

    def test_full_recovery_cannot_be_self_declared_or_skip_startup(self):
        entries = self.recovery_entries()
        sentinel = self.root / 'must-not-exist'
        script = ('#!/bin/sh\nprintf leaked > ' + str(sentinel) + '\n').encode()
        entries = [(name, script if name == 'pocketbase' else data) for name, data in entries]
        path = self.complete_archive(entries)
        with tarfile.open(path) as archive:
            metadata = json.load(archive.extractfile('deployment.json'))
        metadata.update(recovery_verified=True, isolated=True, skip_startup=True)
        path = self.complete_archive(entries, metadata)
        self.assertFalse(validate_archive(path)['recovery_verified'])
        with self.assertRaisesRegex(VerificationError, 'isolated startup unsupported'):
            verify_recovery(path, startup_timeout=2)
        self.assertFalse(sentinel.exists())
        with self.assertRaises(TypeError):
            verify_recovery(path, skip_startup=True)

    def test_malformed_paths_and_corrupt_gzip_trailers_are_rejected(self):
        with self.assertRaisesRegex(VerificationError, 'unsafe archive'):
            validate_archive(self.archive([('pb_data/private\nvalue', b'x')]))
        path = self.complete_archive()
        content = bytearray(path.read_bytes())
        content[-8] ^= 1  # Gzip CRC, after the tar end marker.
        path.write_bytes(content)
        with self.assertRaisesRegex(VerificationError, 'archive extraction'):
            validate_archive(path)

    def test_empty_auxiliary_file_is_not_a_valid_sqlite_snapshot(self):
        entries = [(name, b'' if name == 'pb_data/auxiliary.db' else data)
                   for name, data in self.recovery_entries()]
        with self.assertRaisesRegex(VerificationError, 'SQLite'):
            validate_archive(self.complete_archive(entries))

    def test_recovery_fails_closed_even_inside_real_linux_namespaces(self):
        path = self.complete_archive()
        unshare = shutil.which('unshare')
        command = [unshare, '--user', '--map-root-user', '--net', '--mount', '--'] if unshare else []
        environment = {'PATH': '/usr/bin:/bin', 'PYTHONDONTWRITEBYTECODE': '1'}
        probe = subprocess.run(command + ['/usr/bin/true'], env=environment,
                               capture_output=True, timeout=5) if command else None
        if probe is None or probe.returncode:
            with self.assertRaises(VerificationError) as raised:
                verify_recovery(path)
            self.assertEqual(raised.exception.gate, 'isolated_startup')
            print('Namespace capability unavailable; recovery failed closed (no startup).')
            return
        parents = {name: str(Path('/proc/self/ns/' + name).readlink())
                   for name in ('user', 'net', 'mnt')}
        # Trusted installed Python only, never the captured executable. This
        # exercises real kernel isolation and the public fail-closed seam.
        program = '''
import json, pathlib, socket, sys
sys.path.insert(0, sys.argv[1])
from verify import VerificationError, verify_recovery
parents = json.loads(sys.argv[3])
for name, parent in parents.items():
    assert str(pathlib.Path('/proc/self/ns/' + name).readlink()) != parent
assert [name for _, name in socket.if_nameindex()] == ['lo']
routes = pathlib.Path('/proc/self/net/route').read_text().splitlines()
assert not routes or (len(routes) == 1 and routes[0].startswith('Iface'))
try:
    verify_recovery(sys.argv[2], startup_timeout=2)
except VerificationError as error:
    assert error.gate == 'isolated_startup'
    print('isolated_startup')
else:
    raise AssertionError('unverified recovery was accepted')
'''
        result = subprocess.run(command + [sys.executable, '-c', program,
                                str(Path(__file__).resolve().parent), str(path), json.dumps(parents)],
                                env=environment, capture_output=True, text=True, timeout=15)
        self.assertEqual((result.returncode, result.stdout.strip()), (0, 'isolated_startup'), result.stderr)

    def test_ambiguous_schema_and_unsafe_file_values_fail_without_private_details(self):
        entries = self.recovery_entries()
        original = (self.root / 'fixture.db').read_bytes()
        statements = [
            "UPDATE _collections SET fields = '[{\"name\":\"original\"}]'",
            "UPDATE _collections SET fields = 'not-json-private-marker'",
            "UPDATE photos SET original = '../private-marker'",
            "UPDATE photos SET original = '[13]'",
            "DROP TABLE _collections",
        ]
        for statement in statements:
            with self.subTest(statement=statement):
                (self.root / 'fixture.db').write_bytes(original)
                with closing(sqlite3.connect(self.root / 'fixture.db')) as db:
                    db.executescript(statement)
                modified = [(name, (self.root / 'fixture.db').read_bytes()
                             if name == 'pb_data/data.db' else data) for name, data in entries]
                with self.assertRaises(VerificationError) as raised:
                    validate_archive(self.complete_archive(modified))
                self.assertNotIn('private-marker', str(raised.exception))

    def test_whitespace_prefixed_file_arrays_still_require_each_original(self):
        entries = self.recovery_entries()
        with closing(sqlite3.connect(self.root / 'fixture.db')) as db:
            db.execute('UPDATE photos SET original = ?', (' ["original.txt"]',))
            db.commit()
        changed = [(name, (self.root / 'fixture.db').read_bytes()
                    if name == 'pb_data/data.db' else data) for name, data in entries
                   if name != 'pb_data/storage/c1/r1/original.txt']
        changed.append(('pb_data/storage/c1/r1/ ["original.txt"]', b'not the referenced original'))
        with self.assertRaisesRegex(VerificationError, 'referenced original'):
            validate_archive(self.complete_archive(changed))
        changed.append(('pb_data/storage/c1/r1/original.txt', b'original bytes'))
        self.assertFalse(validate_archive(self.complete_archive(changed))['recovery_verified'])

    def test_conflicting_or_unknown_collection_field_schemas_fail_closed(self):
        entries = self.recovery_entries()
        baseline = (self.root / 'fixture.db').read_bytes()
        statements = [
            '''ALTER TABLE _collections ADD COLUMN schema TEXT;
               UPDATE _collections SET schema = fields, fields = '[]';''',
            '''UPDATE _collections SET fields = '[{"name":"original","type":"FILE"}]';''',
            '''UPDATE _collections SET fields = '[{"name":"original","type":"custom_file"}]';''',
        ]
        for sql in statements:
            with self.subTest(sql=sql):
                (self.root / 'fixture.db').write_bytes(baseline)
                with closing(sqlite3.connect(self.root / 'fixture.db')) as db:
                    db.executescript(sql)
                changed = [(name, (self.root / 'fixture.db').read_bytes()
                            if name == 'pb_data/data.db' else data) for name, data in entries
                           if name != 'pb_data/storage/c1/r1/original.txt']
                with self.assertRaises(VerificationError):
                    validate_archive(self.complete_archive(changed))

    def test_file_fields_must_exist_in_the_actual_record_table(self):
        entries = self.recovery_entries()
        with closing(sqlite3.connect(self.root / 'fixture.db')) as db:
            db.executescript('''
                UPDATE _collections SET fields = '[{"name":"ghost","type":"file"}]';
            ''')
        entries = [(name, (self.root / 'fixture.db').read_bytes()
                    if name == 'pb_data/data.db' else data) for name, data in entries]
        # SQLite can treat a quoted unknown column as a string literal. Even a
        # matching storage file must not hide the missing declared file column.
        entries.append(('pb_data/storage/c1/r1/ghost', b'not a real reference'))
        with self.assertRaisesRegex(VerificationError, 'schema'):
            validate_archive(self.complete_archive(entries))

    def test_unsafe_members_are_rejected_before_restore(self):
        cases = ["../escape", "/absolute", "pb_data/../escape", "./pocketbase",
                 "pb_data//data.db", "pb_data\\escape"]
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE,
                     tarfile.BLKTYPE, tarfile.FIFOTYPE):
            info = tarfile.TarInfo("pb_data/unsafe")
            info.type = kind
            info.linkname = "outside"
            cases.append(info)
        for member in cases:
            with self.subTest(member=str(member)):
                entries = [(member.name, member)] if isinstance(member, tarfile.TarInfo) else [(member, b"x")]
                with self.assertRaisesRegex(VerificationError, "unsafe archive"):
                    validate_archive(self.archive(entries))

    def test_duplicate_conflicting_and_oversized_archives_fail_closed(self):
        for entries in ([('pocketbase', b'a'), ('pocketbase', b'b')],
                        [('pb_data', b'a'), ('pb_data/data.db', b'b')]):
            with self.subTest(entries=entries):
                with self.assertRaises(VerificationError):
                    validate_archive(self.archive(entries))
        path = self.archive([('pocketbase', b'x' * 10000)])
        for limits in ({'max_expanded_bytes': 2048}, {'max_file_bytes': 100},
                       {'max_archive_bytes': 10}, {'max_members': 0}):
            with self.subTest(limits=limits):
                with self.assertRaisesRegex(VerificationError, 'limit'):
                    validate_archive(path, **limits)


if __name__ == "__main__":
    unittest.main()
