# AWS-only backup watchdog (Oregon)

Research: **2026-10-14**. Recommendation only; public AWS documentation/pricing fetched anonymously. No cloud account access or mutations. Read [backup design](backup-only-s3.md) and [provisioned resources](../../infra/backups/README.md); this note changes neither their implementation status nor their Healthchecks approval requirement.

## Preferred exact design

**EventBridge scheduled rule → Python Lambda → S3 verified marker → SNS standard topic → confirmed `email` subscription `me@gvp.fyi`; two CloudWatch metric alarms independently notify that same topic.** Everything is in `us-west-2`, account `524178179132`. This detects missing backup success independently of GitHub/Fly, and missing watchdog execution independently of watchdog code—not independently of AWS or SNS.

1. **Rule:** `gvp-backup-watchdog-daily`, default event bus, `ScheduleExpression="cron(17 8 * * ? *)"` (08:17 UTC daily). Use `events:PutRule`/`events:PutTargets`, **not** `scheduler:CreateSchedule`. Scheduled rules remain available but AWS labels them legacy and recommends Scheduler for new workloads. Rules use UTC, have minute precision and can be delayed; this simple daily job needs none of Scheduler's extra features. Target only this Lambda; explicitly set target `RetryPolicy` to `MaximumEventAgeInSeconds=3600`, `MaximumRetryAttempts=3`. [1, 2]
2. **Lambda:** dedicated `gvp-backup-watchdog`, supported Python runtime, on-demand x86, 128 MB, 30-second timeout, default 512 MB ephemeral storage, outside a VPC. No provisioned concurrency, NAT, custom metrics, tracing or paid secret store. Configure Lambda asynchronous event age to 3600 seconds and function-error retries to zero (`PutFunctionEventInvokeConfig`, `MaximumRetryAttempts=0`); the next daily run repeats an overdue alert. EventBridge delivery retries and Lambda execution retries are separate. Duplicate execution remains possible; checks must be read-only and duplicate emails harmless. [3]
3. **Marker contract:** proposed exact key `monthly/YYYY-MM/verified.json` in `gvp-pocketbase-backups-524178179132-us-west-2`. This is a **new contract to agree with the runner**, not an existing object. Publish last, after complete-set isolated restore and S3 round-trip verification; never manufacture a marker merely because capture/upload started. Include schema version, monthly slot, capture/verification UTC times, verification result, manifest key/hash and exact recovery-object keys/hashes. Require times to be plausible and the monthly capture to belong to that slot. Reject empty/malformed/future-dated/wrong-slot markers. Ad hoc rollback checkpoints must not reset monthly deadlines.
4. **Calendar deadline:** retain the proposed backup slot, second day at 06:17 UTC, plus 24-hour grace. Determine the most recent monthly slot whose deadline has passed; require that slot's valid marker. Thus October's deadline is October 3 at 06:17 UTC; before it, September is the latest due slot. Do not use “age < 30 days,” `LastModified` alone, or accept any recent rollback marker. Daily polling alerts within approximately 24 hours after the deadline (normally 2 hours for this chosen schedule), not immediately at deadline. Establish an explicit first monitored slot at activation; no endless bootstrap exemption.
5. **Checks and notification:** `s3.get_object` on that exact marker; validate bounded JSON, and preferably `head_object` each referenced recovery object against expected size/presence. HEAD does not verify content hashes; this is a freshness/completion watchdog, not another restore test. Missing/invalid/overdue marker → `sns.publish` a short nonsecret diagnosis and then return success **only if publication succeeded**. Unexpected S3/IAM/network/parse failures or SNS publish failure must raise, never be swallowed. No success heartbeat or custom metric is required. Repeat overdue emails daily without a state database; there is no automatic backup-recovery email in this stateless design. [4]
6. **Independent service-metric alarms:** enable actions and send `AlarmActions` and `OKActions` directly to SNS. Never route these through the checker Lambda. Use the configurations below. Pre-create its log group with 14-day retention; log only outcomes/timing, not marker contents or recovery data.

### Exact alarm settings and missing-run caveat

All alarms use `PutMetricAlarm`, standard resolution, no composite alarm. [5–8]

| Alarm | Metric / expression | Evaluation | Missing data |
| --- | --- | --- | --- |
| `gvp-backup-watchdog-errors` | `AWS/Lambda`, `Errors`, dimension `FunctionName=gvp-backup-watchdog`, `Sum` | `Period=300`, `EvaluationPeriods=1`, `DatapointsToAlarm=1`, `Threshold=1`, `GreaterThanOrEqualToThreshold` | `TreatMissingData=notBreaching` |
| `gvp-backup-watchdog-absent` | `m1`: `AWS/Lambda`, `Invocations`, same dimension, `Sum`, `Period=3600`; expression `FILL(m1,0)` | `EvaluationPeriods=26`, `DatapointsToAlarm=26`, `Threshold=1`, `LessThanThreshold` | `TreatMissingData=breaching` |
| Optional `gvp-backup-watchdog-delivery-failed` | `AWS/Events`, `FailedInvocations`, dimension **`RuleName=gvp-backup-watchdog-daily`**, `Sum` | `Period=300`, `EvaluationPeriods=1`, `DatapointsToAlarm=1`, `Threshold=1`, `GreaterThanOrEqualToThreshold` | `TreatMissingData=notBreaching` |

For the expression alarm, put the underlying metric in `Metrics` with `Id=m1`, `ReturnData=false`; the expression has its own ID and `ReturnData=true`. Do not also supply top-level `MetricName`, `Namespace`, `Statistic` or `Period`. One underlying metric means **one $0.10 alarm metric**, not a second custom-metric charge. [5, 9]

**Why not just a sparse 24-hour `Invocations` alarm?** Sliding alarms retrieve extra older datapoints and may ignore missing-data treatment when enough real points are available. `FILL(m1,0)` makes empty hourly buckets explicitly breaching; `TreatMissingData=breaching` remains the fail-closed setting if the expression itself lacks data. Twenty-six consecutive empty hours give daily scheduling/metric-publication slack. The 26-hour window is a multi-day alarm, evaluated hourly on completed hours: plan for roughly **26–27 hours after the last invocation**, plus telemetry/evaluation delay, not an exact SLA. Test actual absence behavior. AWS warns FILL can mishandle delayed latest datapoints; the long all-breaching window avoids alarming on one delayed bucket. Never use `FILL(...,REPEAT)`, which would repeat the last healthy invocation indefinitely. [6, 7]

Lambda's `Invocations` includes executions that fail; `Errors` catches uncaught exceptions/timeouts. Throttled/rejected invocations count as neither, so absence monitoring is essential. A dedicated function and restricted invocation permissions avoid unrelated/manual runs masking a stopped schedule. Optional EventBridge `FailedInvocations` reports **permanent target-delivery failures after retries**, not handler errors; it is emitted only when nonzero and cannot detect a disabled rule by itself. [8, 10]

**Coverage limits:** a checker that runs but incorrectly returns healthy can evade both alarms. CloudWatch is a separate evaluator of service-generated metrics, not a watchdog-generated “I'm alive” assertion, but it shares region/account/control-plane and SNS/email failure domains. Deletion/disabled actions, regional outages, unconfirmed/unsubscribed email, spam filtering and mailbox failure remain blind spots. SNS publish acceptance is not inbox receipt. CloudWatch emails on state transitions, not every hour while ALARM; `OK` on the absence alarm means execution resumed, not that backup verification passed. AWS-only does not provide an out-of-AWS dead-man switch. [8, 11]

## Verified API/IAM details

- Lambda resource policy: `lambda:AddPermission`, action `lambda:InvokeFunction`, principal **`events.amazonaws.com`**, constrained to the exact rule ARN using `SourceArn`. Same-account EventBridge → Lambda uses that resource policy; do not substitute a Scheduler execution role or add a target `RoleArn`. Check `PutTargets.FailedEntryCount`/`FailedEntries` even on HTTP 200. [2, 12]
- Separate Lambda execution role, trusted by `lambda.amazonaws.com`; do not reuse the GitHub backup writer. Runtime permissions: `s3:GetObject` only for monthly marker/referenced recovery prefixes; `sns:Publish` only to the watchdog topic; `logs:CreateLogStream`/`logs:PutLogEvents` only in its pre-created log group. No S3 write/delete or alarm-management permissions. **`GetObject` and `HeadObject` both require IAM `s3:GetObject`; there is no IAM `s3:HeadObject`.** Without `s3:ListBucket`, a missing object can yield 403 instead of 404; treat either as unhealthy, never absence of evidence as health. If discovery is later needed, API `ListObjectsV2` uses IAM `s3:ListBucket` on the bucket ARN with a prefix condition; handle pagination. [4]
- Topic policy: allow **`cloudwatch.amazonaws.com`** to perform `sns:Publish`, constrained by `aws:SourceAccount=524178179132` and the exact alarm ARNs in `aws:SourceArn`. Lambda publication uses its execution-role permission. Do not confuse this with an EventBridge → SNS target policy. Avoid a customer-managed KMS key here; it adds pricing and key-policy dependencies. [11, 12]
- SNS uses `CreateTopic` (standard, not FIFO), `Subscribe(Protocol="email", Endpoint="me@gvp.fyi")`, confirmation, then `Publish(TopicArn=..., Message=...)`. Email subscriptions require human confirmation and support standard topics only. There is no `SendEmail` SNS action; SES is unnecessary. Test the subscription and each actual alarm path. [13]

## Current list-price estimate (USD/month; no free-tier deduction)

Regional AWS offer files were fetched on the research date: Lambda publication **2026-10-14**, SNS **2026-09-15**, CloudWatch **2026-10-07**, EventBridge **2026-09-24**. These are public list prices, not an account quote. Apply the paid SNS tiers from the first request/delivery in this estimate. [9, 14–17]

| Component | Oregon list rate | Tiny-volume allowance / month |
| --- | --- | ---: |
| Lambda requests | **$0.20/million** (`USW2-Request`) | 31 requests: $0.0000062 |
| Lambda x86 duration, first tier | **$0.0000166667/GB-second** (`USW2-Lambda-GB-Second`) | 31 × 5 billed seconds × 0.125 GB: $0.000323 |
| EventBridge **scheduled rule**, same-account Lambda target | **$0 additional rule/event-delivery charge** under the default/classic bus pricing model; target costs separate | $0 |
| SNS standard API requests | **$0.50/million**, paid tier (`USW2-Requests-Tier1`) | 100 small publishes: $0.00005 |
| SNS email/email-JSON delivery | **$2/100,000** ($0.00002 each; `USW2-DeliveryAttempts-SMTP`) | 100 deliveries: $0.002 |
| CloudWatch standard metric alarms | **$0.10/alarm metric-month** (`USW2-CW:AlarmMonitorUsage`) | Two: **$0.20**; three: **$0.30** |
| CloudWatch Logs Standard ingestion | **$0.50/GB** (`USW2-DataProcessing-Bytes`) | 0.001 GB: $0.0005 |
| CloudWatch Logs archived storage | **$0.03/GB-month** (`USW2-TimedStorage-ByteHrs`, compressed stored volume) | Conservative 0.001 GB-month: $0.00003 |

**Subtotal: approximately $0.203/month with two alarms, $0.303 with three. Budget $0.21/$0.31**, allowing tiny S3 GET/HEAD requests (Oregon S3 Standard $0.0004/1,000 in the existing research). Even 31 executions billed at the full 30-second timeout cost only about $0.00194 in duration before retries. Lambda duration includes initialization and is rounded to 1 ms; budget billed duration, not just handler time. [14, 18]

**Scheduled-rule pricing qualification:** AWS's current pricing page/offer distinguish classic event-bus charges (custom/partner events, cross-account delivery and optional features) from **Scheduler**'s `ScheduledInvocation` SKU. There is no separately priced scheduled-rule SKU; the $0 row is the application of that published model to a same-account default-bus scheduled rule, not a quoted free invocation allowance. Do **not** apply Scheduler's 14-million free tier, or its **$1/million paid invocation rate**, to `events:PutRule`. The current page is less explicit about legacy scheduled rules than Scheduler; recheck the pricing model before provisioning if AWS changes it. [1, 16, 17]

Built-in service metrics have no custom-metric ingestion charge. No Logs Insights queries, dashboards, metric filters, detailed monitoring, cross-region transfers or optional SNS payload filtering are included. SNS meters requests in 64 KB chunks; keep alerts small. The estimate is incremental **watchdog** cost, not an unconditional under-$1 total backup bill: retained recovery artifacts, runner/Fly time, transfers, taxes and existing AWS usage remain separate. No reliance on free tiers or introductory credits. [9, 15]

## Blockers and acceptance gates

1. **Approval:** owner must approve replacing the currently documented Healthchecks choice, the daily detection latency and AWS-only shared-failure risk. No watchdog resources or subscription were inspected/provisioned here.
2. **Runner/marker:** capture/resume safety, unattended Fly access, isolated restore, exact marker schema/path/month semantics, first monitored slot and three-successful-month retention remain implementation gates. The infrastructure README reports an empty bucket; no healthy backup baseline is established by this research.
3. **Email and fault tests:** confirm `me@gvp.fyi`; prove stale/missing/malformed marker alerts, S3 access denial, SNS publication failure → Lambda Errors alarm, timeout, target permission denial, disabled rule → actual missing-invocation alarm, and recovery. A forced `SetAlarmState` tests notification wiring only, **not** missing-data evaluation. Test a never-invoked function too; bootstrap must fail closed. Use isolated test resources/shortened intervals with approval, not production failure injection. [8]
4. **Operational boundary:** if “reliable” means detecting loss of AWS/CloudWatch/SNS itself or guaranteed inbox delivery, **this design cannot meet it**. Keep an external monitor or explicitly accept that limitation. No pricing blocker was found for this tiny watchdog under $1/month.

## Official primary sources

1. [EventBridge scheduled rules (legacy)](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-rule-schedule.html), [PutRule](https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutRule.html).
2. [PutTargets](https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutTargets.html), [target retry policy](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html).
3. [Lambda asynchronous error handling/retries](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html), [PutFunctionEventInvokeConfig](https://docs.aws.amazon.com/lambda/latest/api/API_PutFunctionEventInvokeConfig.html).
4. [S3 GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html), [HeadObject permissions/error behavior](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html), [ListObjectsV2](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html).
5. [CloudWatch PutMetricAlarm](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_PutMetricAlarm.html).
6. [Missing-data evaluation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html), [alarm evaluation and multi-day windows](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarm-evaluation.html).
7. [Metric math: FILL semantics and delayed-data warning](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/using-metric-math.html).
8. [Lambda metric definitions](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html), [CloudWatch alarms, actions and testing](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html).
9. [CloudWatch pricing, including metric-math alarm billing](https://aws.amazon.com/cloudwatch/pricing/), [Oregon offer JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/us-west-2/index.json).
10. [EventBridge metrics and dimensions](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-monitoring.html).
11. [CloudWatch alarm notification/topic policies](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Notify_Users_Alarm_Changes.html).
12. [EventBridge resource policies for Lambda and SNS](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html).
13. [SNS email subscriptions](https://docs.aws.amazon.com/sns/latest/dg/sns-email-notifications.html), [Publish API](https://docs.aws.amazon.com/sns/latest/api/API_Publish.html).
14. [Lambda Oregon offer JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSLambda/current/us-west-2/index.json).
15. [SNS pricing](https://aws.amazon.com/sns/pricing/), [Oregon offer JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonSNS/current/us-west-2/index.json).
16. [EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/), [Oregon offer JSON](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSEvents/current/us-west-2/index.json).
17. [EventBridge FAQ: Scheduler versus scheduled rules](https://aws.amazon.com/eventbridge/faqs/).
18. [Lambda pricing and billing units](https://aws.amazon.com/lambda/pricing/).
