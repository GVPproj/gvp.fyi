"""Verified recovery promotion. No credentials, capture, or scheduling in this module.

The required restore callable is the isolated restore boundary: it must raise unless
full recovery succeeds. The production composition must use verify.verify_recovery;
never replace it with structural validation or an operator-supplied success flag.
"""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from watchdog import validate_marker

MAX_ARCHIVE_BYTES = 512 * 1024**2


def _archive_bytes(archive):
    with Path(archive).open('rb') as source:
        source.seek(0, 2)
        if not 0 < source.tell() <= MAX_ARCHIVE_BYTES:
            raise ValueError('archive size limit')
        source.seek(0)
        data = source.read(MAX_ARCHIVE_BYTES + 1)
    if not 0 < len(data) <= MAX_ARCHIVE_BYTES:
        raise ValueError('archive size limit')
    return data


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def _object(key, data):
    return {'key': key, 'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data)}


def _round_trip(s3, bucket, descriptor, data, *, replace=False):
    options = {} if replace else {'IfNoneMatch': '*'}
    s3.put_object(Bucket=bucket, Key=descriptor['key'], Body=data, **options)
    body = s3.get_object(Bucket=bucket, Key=descriptor['key'])['Body']
    try:
        downloaded = body.read(len(data) + 1)
    finally:
        body.close()
    if downloaded != data:
        raise ValueError('S3 round-trip mismatch')


def publish_recovery(s3, bucket, archive, *, captured_at, now, restore, set_id):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', set_id):
        raise ValueError('invalid recovery set ID')
    if captured_at.tzinfo is None or now.tzinfo is None or captured_at > now:
        raise ValueError('invalid recovery times')
    captured_at, now = captured_at.astimezone(timezone.utc), now.astimezone(timezone.utc)
    slot = captured_at.strftime('%Y-%m')
    prefix = f'monthly/{slot}/sets/{set_id}/'
    data = _archive_bytes(archive)
    receipt = restore(archive)
    if _archive_bytes(archive) != data:
        raise ValueError('archive changed during restore')
    try:
        if not isinstance(receipt, dict) or receipt.get('recovery_verified') is not True:
            raise ValueError
        restored_capture = datetime.fromisoformat(receipt['captured_at'].replace('Z', '+00:00'))
        if restored_capture.tzinfo is None or restored_capture != captured_at:
            raise ValueError
    except (KeyError, TypeError, ValueError, AttributeError):
        raise ValueError('invalid restore receipt or capture time') from None
    objects = [_object(prefix + 'checkpoint.tar.gz', data)]
    _round_trip(s3, bucket, objects[0], data)
    manifest_data = _json({'schema': 1, 'slot': slot, 'objects': objects})
    manifest = _object(prefix + 'manifest.json', manifest_data)
    _round_trip(s3, bucket, manifest, manifest_data)
    marker = {'schema': 1, 'slot': slot, 'status': 'verified',
              'captured_at': captured_at.isoformat().replace('+00:00', 'Z'),
              'verified_at': now.isoformat().replace('+00:00', 'Z'),
              'manifest': manifest, 'objects': objects}
    validate_marker(marker, slot, now)
    _round_trip(s3, bucket, _object(f'monthly/{slot}/verified.json', _json(marker)), _json(marker), replace=True)
    return marker


def _read(s3, bucket, key, limit):
    body = s3.get_object(Bucket=bucket, Key=key)['Body']
    try:
        data = body.read(limit + 1)
    finally:
        body.close()
    if len(data) > limit:
        raise ValueError('oversized recovery object')
    return data


def _keys(s3, bucket, prefix):
    options = {'Bucket': bucket, 'Prefix': prefix}
    while True:
        page = s3.list_objects_v2(**options)
        yield from (item['Key'] for item in page.get('Contents', []))
        if not page.get('IsTruncated'):
            return
        token = page.get('NextContinuationToken')
        if not token or token == options.get('ContinuationToken'):
            raise ValueError('invalid S3 pagination')
        options['ContinuationToken'] = token


def retain_recovery(s3, bucket, *, now):
    """Single-writer only; call after promotion, never from a failure handler.

    Validate every marker and referenced object before any delete. Keep the latest
    three distinct successful months; never touch rollback/artifact objects or
    unmarked candidate prefixes. An interrupted prune may leave safe orphan files.
    """
    markers = {}
    for key in _keys(s3, bucket, 'monthly/'):
        match = re.fullmatch(r'monthly/([0-9]{4}-[0-9]{2})/verified.json', key)
        if not match:
            continue
        slot = match[1]
        marker = validate_marker(json.loads(_read(s3, bucket, key, 65536)), slot, now)
        for ref in [marker['manifest'], *marker['objects']]:
            data = _read(s3, bucket, ref['key'], ref['size'])
            if len(data) != ref['size'] or hashlib.sha256(data).hexdigest() != ref['sha256']:
                raise ValueError('retained recovery object mismatch')
        markers[slot] = marker
    slots = sorted(markers)
    for slot in slots[:-3]:
        marker = markers[slot]
        s3.delete_object(Bucket=bucket, Key=f'monthly/{slot}/verified.json')
        for ref in [marker['manifest'], *marker['objects']]:
            if ref['key'].startswith(f'monthly/{slot}/sets/'):
                s3.delete_object(Bucket=bucket, Key=ref['key'])
    return slots[-3:]
