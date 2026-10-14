"""Storage contracts; S3 and the isolated restore service are boundaries."""
import hashlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from recovery_store import publish_recovery, retain_recovery


class S3:
    def __init__(self):
        self.objects = {}
        self.deleted = []
        self.corrupt_downloads = False

    def put_object(self, *, Bucket, Key, Body, **kwargs):
        if kwargs.get('IfNoneMatch') == '*' and Key in self.objects:
            raise RuntimeError('precondition failed: immutable key exists')
        self.objects[Key] = bytes(Body)

    def get_object(self, *, Bucket, Key):
        body = self.objects[Key]
        if self.corrupt_downloads:
            body += b'corruption'
        return {'Body': io.BytesIO(body)}

    def list_objects_v2(self, *, Bucket, Prefix, **kwargs):
        return {'Contents': [{'Key': key} for key in sorted(self.objects) if key.startswith(Prefix)], 'IsTruncated': False}

    def delete_object(self, *, Bucket, Key):
        self.deleted.append(Key)
        del self.objects[Key]


class RecoveryStoreTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.archive = Path(directory.name) / 'checkpoint.tar.gz'
        self.archive.write_bytes(b'complete recovery payload')
        self.s3 = S3()

    def publish(self, month=10, day=2, set_id='first', restore=None):
        captured = datetime(2026, month, day, tzinfo=timezone.utc)
        if restore is None:
            # Substitute external restore service. Full runtime verification is
            # tested separately; this fixture must not be used in composition.
            def restore(path):
                return {'recovery_verified': True, 'captured_at': captured.isoformat()}
        return publish_recovery(self.s3, 'test', self.archive,
            captured_at=captured, now=datetime(2026, month, day, 7, tzinfo=timezone.utc),
            restore=restore, set_id=set_id)

    def four_months(self):
        for month in (6, 7, 8, 9):
            self.publish(month=month)

    def retain(self):
        return retain_recovery(self.s3, 'test', now=datetime(2026, 10, 3, tzinfo=timezone.utc))

    def test_failed_restore_never_publishes_or_prunes(self):
        self.s3.objects['monthly/2026-06/verified.json'] = b'previous successful marker'

        def rejected_restore(path):
            raise RuntimeError('isolated restore failed')

        with self.assertRaisesRegex(RuntimeError, 'isolated restore failed'):
            self.publish(restore=rejected_restore)
        self.assertEqual(self.s3.objects, {'monthly/2026-06/verified.json': b'previous successful marker'})
        self.assertEqual(self.s3.deleted, [])

    def test_structural_result_or_wrong_capture_time_cannot_qualify_for_promotion(self):
        for receipt in (None, {}, {'structural_valid': True, 'recovery_verified': False},
                {'recovery_verified': True},
                {'recovery_verified': True, 'captured_at': '2026-09-02T00:00:00Z'}):
            with self.subTest(receipt=receipt), self.assertRaisesRegex(ValueError, 'restore receipt'):
                self.publish(restore=lambda path: receipt)
            self.assertEqual(self.s3.objects, {})

    def test_restored_payload_and_manifest_are_read_back_before_verified_marker(self):
        restored = []

        def restore(path):
            restored.append(Path(path).read_bytes())
            return {'recovery_verified': True, 'captured_at': '2026-10-02T00:00:00Z'}

        marker = self.publish(restore=restore)
        self.assertEqual(restored, [b'complete recovery payload'])
        self.assertEqual(marker['status'], 'verified')
        self.assertEqual(marker['slot'], '2026-10')
        self.assertEqual(json.loads(self.s3.objects['monthly/2026-10/verified.json']), marker)
        self.assertEqual(self.s3.objects[marker['objects'][0]['key']], b'complete recovery payload')
        self.assertEqual(marker['objects'][0]['sha256'], hashlib.sha256(b'complete recovery payload').hexdigest())
        manifest = json.loads(self.s3.objects[marker['manifest']['key']])
        self.assertEqual(manifest['objects'], marker['objects'])

    def test_corrupt_round_trip_keeps_previous_marker_and_every_good_set(self):
        self.s3.objects['monthly/2026-10/verified.json'] = b'last good marker'
        self.s3.corrupt_downloads = True
        with self.assertRaisesRegex(ValueError, 'round-trip'):
            self.publish()
        self.assertEqual(self.s3.objects['monthly/2026-10/verified.json'], b'last good marker')
        self.assertEqual(self.s3.deleted, [])

    def test_retention_keeps_three_distinct_months_and_ignores_unverified_candidates(self):
        self.four_months()
        self.publish(month=9, day=3, set_id='retry')
        self.s3.objects['monthly/2026-10/sets/failed/checkpoint.tar.gz'] = b'incomplete'
        self.s3.objects['rollback/checkpoint.tar.gz'] = b'keep'
        self.s3.objects['artifacts/keep/runtime'] = b'keep'
        self.assertEqual(self.retain(), ['2026-07', '2026-08', '2026-09'])
        self.assertFalse(any(key.startswith('monthly/2026-06/') for key in self.s3.objects))
        self.assertIn('monthly/2026-07/verified.json', self.s3.objects)
        self.assertIn('monthly/2026-10/sets/failed/checkpoint.tar.gz', self.s3.objects)
        self.assertIn('rollback/checkpoint.tar.gz', self.s3.objects)
        self.assertIn('artifacts/keep/runtime', self.s3.objects)

    def test_reused_set_identity_cannot_overwrite_retained_bytes(self):
        self.publish()
        before = dict(self.s3.objects)
        self.archive.write_bytes(b'different recovery payload')
        with self.assertRaisesRegex(RuntimeError, 'immutable key exists'):
            self.publish()
        self.assertEqual(self.s3.objects, before)

    def test_archive_changed_during_restore_is_not_promoted(self):
        with self.assertRaisesRegex(ValueError, 'changed during restore'):
            self.publish(restore=lambda path: Path(path).write_bytes(b'unverified replacement'))
        self.assertEqual(self.s3.objects, {})

    def test_oversized_local_payload_is_rejected_before_restore_or_upload(self):
        with self.archive.open('wb') as file:
            file.truncate(512 * 1024**2 + 1)

        def must_not_restore(path):
            self.fail('oversized payload reached restore')

        with self.assertRaisesRegex(ValueError, 'archive size limit'):
            self.publish(restore=must_not_restore)
        self.assertEqual(self.s3.objects, {})

    def test_corrupt_existing_recovery_aborts_all_pruning(self):
        self.four_months()
        self.s3.objects['monthly/2026-09/sets/first/checkpoint.tar.gz'] = b'bad'
        with self.assertRaisesRegex(ValueError, 'object mismatch'):
            self.retain()
        self.assertEqual(self.s3.deleted, [])
        self.assertIn('monthly/2026-06/verified.json', self.s3.objects)

    def test_interrupted_pruning_never_deletes_the_three_newest_months(self):
        class InterruptedS3(S3):
            interrupt = True

            def delete_object(self, *, Bucket, Key):
                if self.interrupt and Key.endswith('checkpoint.tar.gz'):
                    raise OSError('provider unavailable')
                super().delete_object(Bucket=Bucket, Key=Key)

        self.s3 = InterruptedS3()
        self.four_months()
        with self.assertRaisesRegex(OSError, 'provider unavailable'):
            self.retain()
        for month in ('07', '08', '09'):
            self.assertIn(f'monthly/2026-{month}/verified.json', self.s3.objects)
            self.assertIn(f'monthly/2026-{month}/sets/first/checkpoint.tar.gz', self.s3.objects)
        self.s3.interrupt = False
        self.assertEqual(self.retain(), ['2026-07', '2026-08', '2026-09'])


if __name__ == '__main__':
    unittest.main()
