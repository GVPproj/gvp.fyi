# Backup-only AWS preflight

Continuation of `/tmp/gvp-pocketbase-s3-backup-handoff.md`, 2026-10-14.

## Authority and scope

The owner approved the existing AWS account for **backup-only S3**, targeting **under $1/month**, and failure alerts to `me@gvp.fyi`. The owner subsequently approved the proposed existing-backend GitHub Actions runner, free Healthchecks.io monitoring and brief monthly write-free backup window, and requested setup. Application originals remain on Fly's persistent volume. This is not approval for production capture, deployment/cutover, MFA changes, unrelated credentials or resource deletion.

## Read-only observations

- `aws sts get-caller-identity --profile gvp-storage` succeeds in account `524178179132`, using the `GvpStorageProvisioner` IAM Identity Center role. The equivalent named profile `GvpStorageProvisioner-524178179132` also succeeds. The default profile is expired; use the explicit working profile rather than requesting another default login.
- `s3api list-buckets` returns an empty list. No bucket was created.
- The role denies `iam:ListOpenIDConnectProviders`, `budgets:ViewBudget` and `SNS:ListTopics`. These denials do not establish whether providers, budgets or topics exist, nor whether individual resource mutations are allowed. Do not broaden privileges merely to complete inventory.
- `GVPproj/pocketbase-fly-starter` is private; default branch is `main`; Actions is enabled. Its Actions secret-name inventory contains only `FLY_API_TOKEN`; no values were requested. Presence does not establish token scope or suitability for backup capture.
- The local sibling workflow deploys on pushes to `main`. A backup workflow cannot safely be activated by an unreviewed push containing the existing dirty deployment work. Private-repository Actions costs/available minutes must be checked before promising a zero-cost runner. The billing usage API returned 404 with a CLI notice that the token lacks the `user` scope; no authentication scopes were changed.
- Issues #21, #18 and #14 remain open. The recurring recovery, MFA and concrete rollout gates remain outstanding.

## Next decision

Choose the runner, production capture method, and independent missed-success monitor before creating runtime credentials or enabling a schedule. The policy is monthly complete recovery sets, three **verified successful** sets, failure and missed-run alerts, separate migration rollback sets, matching executable/code/configuration and secure key custody. Never prune a good set after failed capture or verification.

Primary-source design investigation: [backup-only S3 research](research/backup-only-s3.md). Research is not deployment or restore evidence.

The initial preflight performed no successful cloud mutation. Subsequent owner-approved AWS provisioning is recorded below. No production backup, machine stop, commit or push was performed; existing local implementation changes were preserved.

## Initial setup attempt after owner approval (superseded below)

- Selected destination: `gvp-pocketbase-backups-524178179132-us-west-2`, region `us-west-2`, dedicated to recovery (not application originals).
- Attempted `CreateBucket` with `BucketOwnerEnforced` ownership using `gvp-storage`; AWS denied `s3:CreateBucket` for this exact bucket ARN. No bucket was created; protection configuration and uploads were not attempted.
- `iam:GetRole` on the proposed `gvp-backup-runner` role was also denied. This does not prove the role is absent.
- Setup is blocked on appropriately scoped provisioning permissions in the existing account. Do not substitute unrelated AWS profiles/accounts, create access keys or change the current permission set without owner participation.
- Healthchecks account/check setup, least-privilege AWS OIDC trust/runtime permissions, approved Fly capture access and the tested recovery workflow remain unimplemented. No schedule is enabled. The monthly window approval does not authorize an immediate production stop or deployment of the pending application changes.
- Before writing recovery tests, confirm public seams with the owner: capture/resume safety, recovery-set verification and promotion/retention, and failure/missed-success notification. No tests or runner implementation were added during this blocked setup attempt.

## AWS provisioning after permission update

The owner updated the Identity Center permission set. Explicit-profile access then allowed provisioning:

- Created `gvp-pocketbase-backups-524178179132-us-west-2` in Oregon, with bucket-owner-enforced ownership, all four public-access blocks, SSE-S3 encryption, a TLS-only policy and project/purpose tags.
- Created the GitHub Actions OIDC provider with `sts.amazonaws.com` audience, and `gvp-backup-runner` role scoped to the backend repository's `main` branch. Queried GitHub's actual OIDC customization: default legacy repository/branch subject, not immutable-ID format.
- Installed prefix-scoped object permissions, with delete access restricted to monthly/candidate prefixes. No application-file S3, static AWS access keys or production credentials were configured.
- Read-back comparisons passed for all installed policies and bucket security controls; the bucket is empty. This does not prove GitHub OIDC assumption, object round trip or recoverability.
- Account-wide bucket listing is now denied (not needed for this targeted setup); no permission expansion was requested for it.

Nonsecret installed policies and remaining activation gates: [`infra/backups/`](../infra/backups/README.md). Safe capture/restore/retention implementation and runner activation remain pending. No production service interruption or schedule activation occurred.

## AWS-only watchdog request

The owner selected and authorized provisioning an AWS-only watchdog instead of Healthchecks (no new provider account). Proposed components: daily EventBridge scheduled rule, small Lambda reading verified S3 recovery markers, SNS email to `me@gvp.fyi`, and CloudWatch alarms for checker errors/missed invocations. The checker must not equate object existence with verified recovery. Keep the schedule disabled until the marker contract, tests and email confirmation are complete.

The initial provisioning access denied both `lambda:GetFunctionConfiguration` for `gvp-backup-watchdog` and `sns:GetTopicAttributes` for `gvp-backup-alerts`. No watchdog cloud resource was created. The role needs the additional narrowly named provisioning statements in [`infra/backups/watchdog-provisioning-policy.json`](../infra/backups/watchdog-provisioning-policy.json); these are not runtime permissions and must be appended without replacing existing permissions. Their IAM role-editing/PassRole capability is privileged and should be removed after setup. Owner confirmation of SNS email delivery is still required. Before implementation tests, confirm the handler/notification seam (fresh, stale, absent or invalid marker and AWS failures) and deployed alarm behavior.

After the owner updated permissions, created the SNS alert topic/subscription request, separate read-only watchdog IAM role, 14-day log group, and disabled daily EventBridge rule with no targets. Topic/role policies and disabled targetless rule were read-back verified. The owner has now confirmed the email subscription; a subsequent read-only `ListSubscriptionsByTopic` returned an active subscription ARN. This is not an end-to-end failure/missed-run alert test. No Lambda function, alarms or active monitor exists yet; no production backup or interruption occurred. Current detail and installed policies: [`infra/backups/README.md`](../infra/backups/README.md#aws-only-watchdog-provisioning-status).

## Local automation continuation

The owner confirmed the capture/resume, verified promotion/retention and watchdog
notification test boundaries. Local safety components and fault tests now exist;
see [implementation status](../infra/backups/implementation.md). This does not
change the cloud provisioning status above. Captured-runtime isolated startup,
the real Fly transport and archive normalization remain unimplemented; the
verifier deliberately refuses successful recovery until those gates are met.
The reviewed runtime Dockerfile does not supply the capture supervisor's Python
prerequisite; it has not been established in the deployed image.
No cloud action, production capture, credential, workflow or schedule activation
was performed by this local continuation.
