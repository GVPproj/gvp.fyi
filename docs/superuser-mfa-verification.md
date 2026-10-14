# Superuser SMTP and MFA verification — 2026-10-14

Part of [#18](https://github.com/GVPproj/gvp.fyi/issues/18) and
[#21](https://github.com/GVPproj/gvp.fyi/issues/21). No application deployment,
production interruption, or ordinary-user authentication change was performed
in this session.

## Owner-attended setup

- Owner approved and created dedicated SES IAM SMTP credentials for PocketBase
  in Oregon (`us-west-2`). The sending group policy permits only
  `ses:SendRawEmail` on `*`; no shared credential rotation/group-policy edit
  was requested or performed. Credentials were entered locally, not in chat.
- PocketBase SMTP configured with `email-smtp.us-west-2.amazonaws.com`, port
  `587`, `Auto (StartTLS)` and `PLAIN`. TLS control semantics were verified
  against installed PocketBase v0.40.4 UI and mailer source.
- Owner corrected an initially concatenated SMTP hostname, then the sender
  address. Email receipt was confirmed. Owner reports sending works after the
  sender correction; earlier tests had landed in spam. This is delivery evidence,
  not a guarantee of future inbox placement.
- Existing SES `unbusy.day` domain DKIM reported successful. No new domain
  verification, DKIM changes, custom MAIL FROM changes or feedback-configuration
  changes were made. Exact sender/login addresses are intentionally omitted.
- Owner enabled `_superusers` MFA and completed a separate-session password +
  email OTP login while retaining the original dashboard session.

## Administrative API checks

At approximately 22:04 UTC, owner ran the local API verification utility and
reported every check passing. The utility was syntax-checked by the agent;
credentials and authentication responses remained in memory. Only aggregate
pass/fail results were saved outside Git.

- Anonymous `/api/settings` and `/api/collections`: HTTP 401.
- Anonymous `/api/collections/_superusers/records`: HTTP 403.
- Correct password alone: HTTP 401, MFA challenge, no auth token.
- Incomplete MFA challenge used as Authorization: administrative endpoints denied.
- OTP request accepted and owner received the newly requested email.
- Deliberately incorrect OTP: HTTP 400, no auth token.
- Correct password + valid OTP: token issued; `/api/settings` accessible.
- Authenticated collection read confirms `_superusers` password auth, OTP and
  MFA enabled, with an empty MFA rule (all superusers).

No tokens, passwords, OTP codes, email addresses, or raw responses are recorded
here. This does not test old-token revocation, every possible authentication
method/attack, or ordinary-user login acceptance.

## Recovery procedure to retain

1. Keep the original authenticated dashboard session open until recovery approval
   and remaining acceptance are complete.
2. If fresh MFA sign-in fails, use that retained session to open `_superusers`
   collection settings → Options → Multi-factor authentication, disable MFA and
   save. In v0.40.4 the superuser MFA and OTP toggles are coupled; disabling MFA
   also disables OTP. Leave password auth enabled. This is a temporary security
   rollback, not normal operation; diagnose mail access before re-enabling.
3. If no authenticated session is usable, stop and arrange explicitly approved
   operator-assisted recovery. Do not assume password reset bypasses MFA and do
   not edit the running SQLite database or restore data without approval.
4. Independent operator SSH access to the existing Fly machine was verified
   read-only; the deployed executable and data directory are accessible.
5. The off-host checkpoint checksum was reverified and matches
   `docs/content-cutover-checkpoint.md`. That document records successful isolated
   paired executable/data restore rehearsal. Full restoration is a last resort:
   it would revert content and SMTP/authentication changes made after capture.
   A live production restore was not performed or authorized in this session.

Owner accepted this recovery procedure and its retention in this repository.
No separate owner copy is required. The owner requested committing and pushing
this document together with the recovery checkpoint and handoff. The fallback toggle was not exercised on production;
its coupled behavior was verified from v0.40.4 source.

## Fresh read-only shared-consumer checks

At 22:08 UTC on 2026-10-14, after owner approval to proceed:

- Public Likes and biolink pages returned HTTP 200 with nonempty HTML.
- Backend health returned HTTP 200.
- Anonymous Likes and biolink record reads returned HTTP 200 with valid list
  responses (three Likes records and nine biolink records).
- Anonymous settings/collections remained HTTP 401; superuser records HTTP 403.

Only aggregate results were recorded. No login attempt, content write, deployment
or authentication change was performed. These checks establish reachability and
public API availability, not browser rendering, content equality, ordinary-user
login or editing acceptance by themselves. Subsequently, the owner confirmed
that Likes login works after MFA enablement and clarified that biolink only
consumes a public fetch, with no separate owner login. No editing smoke writes
were performed or claimed.

## Remaining limits

- Owner accepted recovery-procedure retention in this repository and authorized
  committing and pushing the documentation.
- Shared-consumer checks passed: owner confirmed Likes login, and biolink's public
  fetch passed. Owner editing smoke writes were not performed or claimed.
- Clarify whether an SES Mail Manager ingress endpoint was created during earlier
  console navigation. If created, audit possible ongoing cost separately; no
  deletion or new paid ingress resource was authorized here.
- MFA does not complete #21: deployment, import, recurring off-host backup/alerts,
  restricted build credentials and other rollout gates remain separate.
