"""Local-only contract tests; no credentials or AWS SDK required."""

import copy
import io
import json
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

import watchdog


def utc(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def marker():
    return {
        "schema": 1,
        "slot": "2026-10",
        "captured_at": "2026-10-02T06:17:00Z",
        "verified_at": "2026-10-02T07:17:00+00:00",
        "status": "verified",
        "manifest": {
            "key": "monthly/2026-10/sets/run-1/manifest.json",
            "sha256": "a" * 64,
            "size": 100,
        },
        "objects": [
            {"key": "monthly/2026-10/sets/run-1/data.tgz", "sha256": "b" * 64, "size": 200},
            {"key": "artifacts/" + "c" * 64 + "/binary", "sha256": "c" * 64, "size": 300},
        ],
    }


NOW = utc("2026-10-04T08:17:00Z")


class MarkerTests(unittest.TestCase):
    def test_valid_verified_marker_is_returned(self):
        value = marker()
        self.assertEqual(watchdog.validate_marker(value, "2026-10", NOW), value)

    def test_invalid_envelope_or_implausible_times_raise_value_error(self):
        variants = [None, [], {}, "private metadata"]
        for field, bad_values in {
            "schema": [True, 1.0, 2, "1"],
            "slot": ["2026-09", "2026-1", None],
            "status": ["uploaded", None],
            "captured_at": ["2026-09-30T23:59:59Z", "2026-11-01T00:00:00Z",
                            "2026-10-02", "2026-10-02T06:17:00", "not-a-time",
                            "2026-10-02T07:17:00+01:00", 123],
            "verified_at": ["2026-10-01T00:00:00Z", "2026-10-05T00:00:00Z",
                            "2026-02-30T00:00:00Z", None],
        }.items():
            for bad in bad_values:
                value = marker()
                value[field] = bad
                variants.append(value)
        for value in variants:
            with self.subTest(value=value), self.assertRaises(ValueError):
                watchdog.validate_marker(value, "2026-10", NOW)
        for field in marker():
            value = marker()
            del value[field]
            with self.subTest(missing=field), self.assertRaises(ValueError):
                watchdog.validate_marker(value, "2026-10", NOW)

    def test_invalid_recovery_references_are_rejected(self):
        variants = []
        for field, bad_values in {
            "key": [None, "monthly/2026-09/sets/run-1/data", "monthly/2026-10/verified.json",
                    "monthly/2026-10/sets/Bad/data", "monthly/2026-10/sets/" + "a" * 81 + "/data",
                    "monthly/2026-10/sets//data", "monthly/2026-10/sets/run-1/../data",
                    "monthly/2026-10/sets/run-1/./data", "monthly/2026-10/sets/run-1//data",
                    "monthly/2026-10/sets/run-1/data\\evil", "/monthly/2026-10/sets/run-1/data",
                    "monthly/2026-10/sets/run-1/%2e%2e/data", "artifacts/bad/data",
                    "artifacts/" + "A" * 64 + "/data", "artifacts/" + "c" * 64 + "/"],
            "sha256": ["A" * 64, "g" * 64, "a" * 63, None],
            "size": [0, -1, True, 1.5, "100", None],
        }.items():
            for bad in bad_values:
                for target in ("manifest", "objects"):
                    value = marker()
                    ref = value[target] if target == "manifest" else value[target][0]
                    ref[field] = bad
                    variants.append(value)
        for bad in ([], None, {}, "data", [None], [{}]):
            value = marker()
            value["objects"] = bad
            variants.append(value)
        value = marker()
        value["objects"].append(copy.deepcopy(value["objects"][0]))
        variants.append(value)
        value = marker()
        value["objects"].append(copy.deepcopy(value["manifest"]))
        variants.append(value)
        for bad in (None, [], {}, "manifest"):
            value = marker()
            value["manifest"] = bad
            variants.append(value)
        for value in variants:
            with self.subTest(value=value), self.assertRaises(ValueError):
                watchdog.validate_marker(value, "2026-10", NOW)


class SDKError(Exception):
    """SDK-shaped external failure without importing botocore."""

    def __init__(self, code):
        super().__init__("private upstream details")
        self.response = {"Error": {"Code": code}}


class WatchdogTests(unittest.TestCase):
    def setUp(self):
        self.s3 = Mock()
        self.sns = Mock()
        self.s3.get_object.return_value = {"Body": io.BytesIO(json.dumps(marker()).encode())}
        self.s3.head_object.side_effect = [
            {"ContentLength": 100}, {"ContentLength": 200}, {"ContentLength": 300}
        ]

    def run_check(self, now=NOW, first_slot="2026-10"):
        return watchdog.run_watchdog(
            s3=self.s3, sns=self.sns, bucket="test-bucket", topic_arn="test-topic",
            first_slot=first_slot, now=now,
        )

    def test_healthy_marker_checks_exact_key_and_every_recovery_object(self):
        self.assertEqual(self.run_check(), {"healthy": True, "slot": "2026-10", "reason": "verified"})
        self.s3.get_object.assert_called_once_with(
            Bucket="test-bucket", Key="monthly/2026-10/verified.json"
        )
        self.assertEqual(self.s3.head_object.call_args_list, [
            unittest.mock.call(Bucket="test-bucket", Key="monthly/2026-10/sets/run-1/manifest.json"),
            unittest.mock.call(Bucket="test-bucket", Key="monthly/2026-10/sets/run-1/data.tgz"),
            unittest.mock.call(Bucket="test-bucket", Key="artifacts/" + "c" * 64 + "/binary"),
        ])
        self.sns.publish.assert_not_called()

    def test_missing_marker_alerts_and_returns_unhealthy(self):
        for code in ("NoSuchKey", "404"):
            with self.subTest(code=code):
                self.s3.get_object.side_effect = SDKError(code)
                self.sns.reset_mock()
                self.assertEqual(self.run_check(),
                                 {"healthy": False, "slot": "2026-10", "reason": "missing_marker"})
                self.sns.publish.assert_called_once_with(
                    TopicArn="test-topic",
                    Message="Backup watchdog: 2026-10 unhealthy (missing_marker).",
                )
        self.s3.head_object.assert_not_called()

    def test_invalid_marker_alerts_without_leaking_contents(self):
        values = [b"private malformed JSON", b"\xff", b"null"]
        for field, bad in (("verified_at", "2099-01-01T00:00:00Z"),
                           ("slot", "2026-09"), ("objects", [])):
            value = marker()
            value[field] = bad
            value["private_metadata"] = "do-not-disclose"
            values.append(json.dumps(value).encode())
        for raw in values:
            with self.subTest(raw=raw):
                self.s3.get_object.return_value = {"Body": io.BytesIO(raw)}
                self.sns.reset_mock()
                self.assertEqual(self.run_check(),
                                 {"healthy": False, "slot": "2026-10", "reason": "invalid_marker"})
                self.sns.publish.assert_called_once_with(
                    TopicArn="test-topic",
                    Message="Backup watchdog: 2026-10 unhealthy (invalid_marker).",
                )
        self.s3.head_object.assert_not_called()

    def test_marker_read_is_bounded_and_stream_is_closed(self):
        class BoundedBody(io.BytesIO):
            def read(self, size=-1):
                if size < 0 or size > 65537:
                    raise AssertionError("marker read must be bounded")
                return super().read(size)

        for size, healthy in ((65536, True), (65537, False)):
            with self.subTest(size=size):
                raw = json.dumps(marker()).encode()
                body = BoundedBody(raw + b" " * (size - len(raw)))
                self.s3.get_object.return_value = {"Body": body}
                self.s3.head_object.side_effect = [
                    {"ContentLength": 100}, {"ContentLength": 200}, {"ContentLength": 300}
                ]
                self.assertEqual(self.run_check()["healthy"], healthy)
                self.assertTrue(body.closed)

    def test_missing_or_wrong_size_recovery_object_alerts(self):
        for index in range(3):
            for failure, reason in ((SDKError("404"), "missing_object"),
                                    (SDKError("NoSuchKey"), "missing_object"),
                                    ({"ContentLength": 999}, "size_mismatch")):
                with self.subTest(index=index, reason=reason):
                    self.s3.get_object.return_value = {"Body": io.BytesIO(json.dumps(marker()).encode())}
                    heads = [{"ContentLength": 100}, {"ContentLength": 200}, {"ContentLength": 300}]
                    heads[index] = failure
                    self.s3.head_object.side_effect = heads
                    self.sns.reset_mock()
                    self.assertEqual(self.run_check(),
                                     {"healthy": False, "slot": "2026-10", "reason": reason})
                    self.sns.publish.assert_called_once_with(
                        TopicArn="test-topic", Message=f"Backup watchdog: 2026-10 unhealthy ({reason})."
                    )

    def test_s3_access_network_and_unexpected_errors_propagate(self):
        for boundary in ("get_object", "head_object", "body"):
            for error in (SDKError("AccessDenied"), SDKError("403"), SDKError("NoSuchBucket"),
                          SDKError("SlowDown"), TimeoutError("private network details")):
                with self.subTest(boundary=boundary, error=type(error)):
                    self.s3.get_object.side_effect = None
                    self.s3.get_object.return_value = {"Body": io.BytesIO(json.dumps(marker()).encode())}
                    self.s3.head_object.side_effect = None
                    if boundary == "body":
                        body = Mock()
                        body.read.side_effect = error
                        self.s3.get_object.return_value = {"Body": body}
                    else:
                        getattr(self.s3, boundary).side_effect = error
                    self.sns.reset_mock()
                    with self.assertRaises(type(error)) as raised:
                        self.run_check()
                    self.assertIs(raised.exception, error)
                    self.sns.publish.assert_not_called()

    def test_sns_failure_propagates_instead_of_returning_unhealthy(self):
        error = TimeoutError("private SNS details")
        self.s3.get_object.side_effect = SDKError("NoSuchKey")
        self.sns.publish.side_effect = error
        with self.assertRaises(TimeoutError) as raised:
            self.run_check()
        self.assertIs(raised.exception, error)

    def test_before_first_deadline_does_not_read_or_alert(self):
        self.assertEqual(self.run_check(now=utc("2026-10-03T06:16:59Z")),
                         {"healthy": True, "slot": None, "reason": "not_due"})
        self.s3.get_object.assert_not_called()
        self.sns.publish.assert_not_called()


class HandlerTests(unittest.TestCase):
    def test_handler_uses_explicit_environment_and_lazy_sdk_clients(self):
        sdk = Mock()
        s3, sns = Mock(), Mock()
        sdk.client.side_effect = {"s3": s3, "sns": sns}.__getitem__
        s3.get_object.side_effect = SDKError("NoSuchKey")
        env = {"BACKUP_BUCKET": "handler-bucket", "BACKUP_TOPIC_ARN": "handler-topic",
               "BACKUP_FIRST_SLOT": "2020-01"}
        with patch.dict("os.environ", env, clear=True), patch.dict("sys.modules", {"boto3": sdk}):
            result = watchdog.lambda_handler({}, None)
        self.assertFalse(result["healthy"])
        self.assertEqual(result["reason"], "missing_marker")
        self.assertEqual(s3.get_object.call_args.kwargs["Bucket"], "handler-bucket")
        self.assertEqual(s3.get_object.call_args.kwargs["Key"], f"monthly/{result['slot']}/verified.json")
        self.assertEqual(sns.publish.call_args.kwargs["TopicArn"], "handler-topic")

    def test_handler_rejects_missing_blank_or_invalid_config_before_sdk(self):
        base = {"BACKUP_BUCKET": "bucket", "BACKUP_TOPIC_ARN": "topic", "BACKUP_FIRST_SLOT": "2026-10"}
        variants = []
        for field in base:
            for bad in (None, "", "   "):
                env = base.copy()
                if bad is None:
                    del env[field]
                else:
                    env[field] = bad
                variants.append(env)
        variants.append({**base, "BACKUP_FIRST_SLOT": "2026-13"})
        for env in variants:
            sdk = Mock()
            with self.subTest(env=env), patch.dict("os.environ", env, clear=True), \
                    patch.dict("sys.modules", {"boto3": sdk}):
                with self.assertRaises(ValueError):
                    watchdog.lambda_handler({}, None)
                sdk.client.assert_not_called()


class DueSlotTests(unittest.TestCase):
    def test_calendar_deadline_inclusive_and_first_slot(self):
        cases = [
            ("2026-10-03T06:16:59Z", "2026-01", "2026-09"),
            ("2026-10-03T06:17:00Z", "2026-01", "2026-10"),
            ("2027-01-01T00:00:00Z", "2026-01", "2026-12"),
            ("2027-01-03T06:17:00Z", "2026-01", "2027-01"),
            ("2026-03-01T00:00:00Z", "2026-01", "2026-02"),
            ("2026-10-03T06:16:59Z", "2026-10", None),
            ("2026-10-03T06:17:00Z", "2026-10", "2026-10"),
            ("2028-01-04T00:00:00Z", "2026-10", "2028-01"),
        ]
        for now, first, expected in cases:
            with self.subTest(now=now, first=first):
                self.assertEqual(watchdog.latest_due_slot(utc(now), first), expected)

    def test_invalid_configuration_or_naive_clock_is_not_bootstrap(self):
        for first in ("", "2026-1", "2026-13", "0000-01", None, 202610):
            with self.subTest(first=first), self.assertRaises(ValueError):
                watchdog.latest_due_slot(utc("2026-10-04T00:00:00Z"), first)
        with self.assertRaises(ValueError):
            watchdog.latest_due_slot(datetime(2026, 10, 4), "2026-10")


if __name__ == "__main__":
    unittest.main()
