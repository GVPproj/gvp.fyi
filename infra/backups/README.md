# Backup-only AWS resources

Provisioned with owner approval in account `524178179132`, Oregon (`us-west-2`). Application originals remain on Fly; no production capture or schedule has been enabled.

- Bucket: `gvp-pocketbase-backups-524178179132-us-west-2`
- Role: `arn:aws:iam::524178179132:role/gvp-backup-runner`
- OIDC provider: `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`
- Allowed subject: `repo:GVPproj/pocketbase-fly-starter:ref:refs/heads/main`

The repository's OIDC customization API reported `use_default=true`, `use_immutable_subject=false` and the matching subject prefix. Recheck trust if repository naming/subject settings change. Any workflow on that branch with OIDC permission can request this role; this does not restrict access to a specific workflow file. Protect the branch and review workflows.

JSON files contain the installed bucket policy, role trust and inline runtime policy. These are nonsecret configuration, not a standalone provisioning script.

## Verified configuration

Read-back checks passed for region, all four Block Public Access controls, bucket-owner-enforced ownership (ACLs disabled), SSE-S3 default encryption, TLS-only policy, exact role trust/inline policy and OIDC audience. The bucket is empty. No object upload or GitHub-issued OIDC assumption has been tested yet. An initial verification assertion expected a `KeyCount` field from paginated CLI output; rerunning the read with `--no-paginate` verified `KeyCount=0` and `IsTruncated=false`.

No lifecycle expiry, application-file S3, customer-managed KMS key, AWS access key or new compute resource was configured. Successful-set retention is a runner responsibility, not bucket lifecycle. SSE-S3 is at-rest encryption, not client-side encryption.

Runtime access is limited to recovery prefixes. It can delete monthly/candidate objects but not rollback/artifact objects. It **can overwrite existing object keys** via PutObject, including rollback/artifact keys; this is not immutable/ransomware-proof storage. Use unique keys and verify hashes. Artifact/rollback cleanup requires separate owner approval and access.

## Still required

1. Implement and verify quiescent capture/resume safety, full-set restore verification, promotion/three-successful-month retention and failure handling. Confirm test seams before writing tests per the TDD skill.
2. Establish a scoped unattended Fly access/recovery mechanism; no superuser credential or MFA bypass was created. Avoid indefinite maintenance after runner cancellation.
3. Owner selected an AWS-only watchdog instead of Healthchecks. The SNS email subscription is confirmed; implement the checker and verify explicit failure and absent-success alerts before activation. See current provisioning status below.
4. Configure the runner in the existing private backend repository without deploying its pending application changes. Main-branch pushes currently deploy production; do not blindly push local work to enable a workflow.
5. Verify actual GitHub OIDC assumption/object round trip, cost, cold start, isolated restore, safe retention and cleanup. No real backup payload belongs in Actions logs/artifacts/caches.
6. Only then enable the approved monthly schedule and record the first verified set. Production capture still needs an agreed immediate maintenance window.

## AWS-only watchdog provisioning status

Owner-approved replacement for Healthchecks. Created and read-back verified:

- SNS standard topic `arn:aws:sns:us-west-2:524178179132:gvp-backup-alerts`, with `watchdog-topic-policy.json`. Only the two named CloudWatch alarms may publish through the CloudWatch service principal. The initial wildcard SNS action was rejected by the service; the installed policy uses explicit supported actions.
- Email subscription to `me@gvp.fyi`: **confirmed by the owner**; read-only `ListSubscriptionsByTopic` returned an active subscription ARN (not `PendingConfirmation`). This verifies subscription activation, not end-to-end backup or alarm notification delivery.
- Lambda execution role `gvp-backup-watchdog`, with `watchdog-trust.json` and `watchdog-runtime-policy.json`. Read-only S3 monthly/artifact access, SNS publish and own-log writes; no S3 mutation or production Fly access.
- Log group `/aws/lambda/gvp-backup-watchdog`; creation and 14-day retention API calls succeeded. Read-back of retention was not performed with the current scoped permissions.
- EventBridge rule `gvp-backup-watchdog-daily`, daily 08:17 UTC, **DISABLED with no targets** (read-back verified).

No Lambda code/function, CloudWatch alarms or active monitor exists yet. Proposed checker/notification and missing-execution test boundaries were presented to the owner for confirmation before writing tests. Next: confirm test scope, implement/fault-test the marker contract and checker, attach Lambda target and independent errors/missing-invocation alarms, establish the first monitored monthly slot and only then enable. The backup runner and verified recovery baseline remain separate unfinished work.

Estimated watchdog increment is about **$0.21/month**, without relying on free tiers; see [AWS-only watchdog research](../../docs/research/aws-backup-watchdog.md). It shares AWS/SNS failure domains and does not detect an AWS-wide outage independently.

Temporary provisioning permissions can be removed after setup and verification; keep the separate runtime role. Do not revoke unrelated permissions or alter the shared OIDC provider without checking consumers.

See [preflight](../../docs/backup-only-preflight.md) and [design research](../../docs/research/backup-only-s3.md). This AWS setup is not evidence that recurring recovery or production cutover gates have passed.
