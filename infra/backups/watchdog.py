"""Read-only monthly backup watchdog; importing never loads the AWS SDK.

Lambda entry point: watchdog.lambda_handler. Required environment:
BACKUP_BUCKET, BACKUP_TOPIC_ARN, BACKUP_FIRST_SLOT (YYYY-MM).
Missing/invalid backups return unhealthy only after SNS accepts the alert.
Unexpected SDK/network failures propagate for an independent Lambda Errors alarm.
HEAD checks presence/size, not hashes or recoverability. No resources are deployed
by this module, and no marker data or upstream exception text is logged.
"""

from datetime import datetime, timedelta, timezone
import re
import json
import os

MAX_MARKER_BYTES = 64 * 1024


def _slot(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", value):
        raise ValueError("invalid monthly slot")
    if value.startswith("0000"):
        raise ValueError("invalid monthly slot")
    return value


def _utc_now(now):
    if not isinstance(now, datetime) or now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("timezone-aware clock required")
    return now.astimezone(timezone.utc)


def validate_marker(marker, slot, now):
    """Return a verified monthly marker, or raise ValueError for invalid data."""
    _slot(slot)
    now = _utc_now(now)
    if not isinstance(marker, dict):
        raise ValueError("invalid marker")
    required = {"schema", "slot", "captured_at", "verified_at", "status", "manifest", "objects"}
    if not required <= marker.keys():
        raise ValueError("incomplete marker")
    if type(marker["schema"]) is not int or marker["schema"] != 1:
        raise ValueError("unsupported schema")
    if marker["slot"] != slot or marker["status"] != "verified":
        raise ValueError("not verified for due slot")
    times = []
    for field in ("captured_at", "verified_at"):
        value = marker[field]
        if not isinstance(value, str) or not re.fullmatch(
            r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|\+00:00)", value
        ):
            raise ValueError("invalid UTC timestamp")
        times.append(datetime.fromisoformat(value.replace("Z", "+00:00")))
    captured, verified = times
    if captured.strftime("%Y-%m") != slot or not captured <= verified <= now:
        raise ValueError("implausible verification times")
    objects = marker["objects"]
    if not isinstance(objects, list) or not objects:
        raise ValueError("empty recovery set")
    seen = set()
    for ref in [marker["manifest"], *objects]:
        if not isinstance(ref, dict):
            raise ValueError("invalid recovery reference")
        key, digest, size = (ref.get(field) for field in ("key", "sha256", "size"))
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError("invalid digest")
        if type(size) is not int or size <= 0:
            raise ValueError("invalid size")
        if not isinstance(key, str) or any(
            part in ("", ".", "..") for part in key.split("/")
        ) or any(char in key for char in ("\\", "%")) or any(ord(char) < 32 or ord(char) == 127 for char in key):
            raise ValueError("unsafe recovery key")
        monthly = re.fullmatch(
            rf"monthly/{slot}/sets/[a-z0-9-]{{1,80}}/.+", key
        )
        artifact = re.fullmatch(r"artifacts/[0-9a-f]{64}/.+", key)
        if not (monthly or artifact) or key in seen:
            raise ValueError("disallowed or duplicate recovery key")
        seen.add(key)
    return marker


def latest_due_slot(now, first_slot):
    """Latest monthly slot due at day 2 06:17 UTC plus 24 hours, or None."""
    _slot(first_slot)
    now = _utc_now(now)
    month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    deadline = month.replace(day=2, hour=6, minute=17) + timedelta(hours=24)
    if now < deadline:
        month = (month - timedelta(days=1)).replace(day=1)
    slot = f"{month.year:04d}-{month.month:02d}"
    return slot if slot >= first_slot else None


def _is_missing(error):
    response = getattr(error, "response", None)
    return isinstance(response, dict) and response.get("Error", {}).get("Code") in ("NoSuchKey", "404")


def _alert(sns, topic_arn, slot, reason):
    # Never include marker data, keys, configuration or upstream exception text.
    sns.publish(TopicArn=topic_arn, Message=f"Backup watchdog: {slot} unhealthy ({reason}).")
    return {"healthy": False, "slot": slot, "reason": reason}


def run_watchdog(*, s3, sns, bucket, topic_arn, first_slot, now):
    """Check the exact due marker using injected SDK-compatible clients."""
    slot = latest_due_slot(now, first_slot)
    if slot is None:
        return {"healthy": True, "slot": None, "reason": "not_due"}
    try:
        response = s3.get_object(Bucket=bucket, Key=f"monthly/{slot}/verified.json")
    except Exception as error:
        if not _is_missing(error):
            raise
        return _alert(sns, topic_arn, slot, "missing_marker")
    body = response["Body"]
    try:
        raw = body.read(MAX_MARKER_BYTES + 1)
    finally:
        body.close()
    if len(raw) > MAX_MARKER_BYTES:
        return _alert(sns, topic_arn, slot, "invalid_marker")
    try:
        marker = validate_marker(json.loads(raw), slot, now)
    except (ValueError, UnicodeError):
        return _alert(sns, topic_arn, slot, "invalid_marker")
    for ref in [marker["manifest"], *marker["objects"]]:
        try:
            head = s3.head_object(Bucket=bucket, Key=ref["key"])
        except Exception as error:
            if not _is_missing(error):
                raise
            return _alert(sns, topic_arn, slot, "missing_object")
        if head["ContentLength"] != ref["size"]:
            return _alert(sns, topic_arn, slot, "size_mismatch")
    return {"healthy": True, "slot": slot, "reason": "verified"}


def lambda_handler(event, context):
    """Lambda adapter: explicit configuration, lazy boto3, UTC wall clock."""
    values = [os.environ.get(name) for name in (
        "BACKUP_BUCKET", "BACKUP_TOPIC_ARN", "BACKUP_FIRST_SLOT"
    )]
    if any(not value or not value.strip() for value in values):
        raise ValueError("missing watchdog configuration")
    bucket, topic_arn, first_slot = values
    _slot(first_slot)

    import boto3

    return run_watchdog(
        s3=boto3.client("s3"), sns=boto3.client("sns"), bucket=bucket,
        topic_arn=topic_arn, first_slot=first_slot, now=datetime.now(timezone.utc),
    )
