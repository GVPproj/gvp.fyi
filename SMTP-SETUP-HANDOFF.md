# Handoff: SMTP and superuser MFA verified; finish acceptance

Saved in the repository root at the owner's explicit request.

## Acceptance update

#18 is now closed: owner confirmed Likes login after MFA enablement, clarified
biolink is public-fetch-only (fresh public checks passed), and accepted keeping
the recovery procedure in the repository. Sanitized evidence and limits are in
`docs/superuser-mfa-verification.md` and the #18 closure comment. The owner subsequently requested committing and
pushing this handoff, the MFA evidence and the recovery checkpoint document.
No deployment or production write was performed. #21 remains open. The original handoff below is historical and its
pending #18 acceptance statements are superseded by this update.

## Resume here (original handoff)

Owner successfully configured PocketBase SMTP and enabled superuser password +
email OTP MFA. Clean-session dashboard login and the owner-run administrative API
checks passed. **Do not repeat setup, recreate credentials, disable MFA, or deploy
anything merely to resume.**

Next: finish shared Likes/biolink consumer checks and confirm the owner has securely
retained the recovery procedure, then reconcile #18 acceptance. #18 and #21 remain
open; no production rollout acceptance was claimed.

## Sources of truth — read rather than reconstruct

- `AGENTS.md`, `docs/agents/domain.md`, `CONTEXT.md`.
- `docs/agents/issue-tracker.md` before reading/publishing GitHub tickets.
- `docs/superuser-mfa-verification.md`: SMTP outcome, detailed positive/negative
  API evidence, recovery procedure, and explicit verification limits.
- `docs/content-cutover-checkpoint.md`: private recovery location, checksum,
  successful isolated recovery rehearsal, and production-restoration evidence.
- [#18](https://github.com/GVPproj/gvp.fyi/issues/18): exact MFA acceptance criteria.
  [Latest evidence comment](https://github.com/GVPproj/gvp.fyi/issues/18#issuecomment-6179503197).
- [#21](https://github.com/GVPproj/gvp.fyi/issues/21): parent rollout scope and other
  gates. [Progress comment](https://github.com/GVPproj/gvp.fyi/issues/21#issuecomment-6179503546).
- `docs/content-cutover-validation.md` and `docs/content-cutover-readiness.md` for
  broader rollout/test context, only as needed.

The evidence document and this handoff are local working-tree artifacts, not a
claim of committed/pushed files. GitHub comments were actually published. The
working tree contains extensive unrelated staged/unstaged work: preserve it; do
not commit, reset, or stage everything indiscriminately.

## Conversation state not yet reconciled into acceptance

After all API checks passed, the owner replied “great” to the recovery-plan
summary, then again to keeping the recovery document handy and leaving #18 open
until shared-consumer checks are complete. This is positive acknowledgement;
**secure retention of the procedure was not explicitly demonstrated**. Avoid
claiming that a live fallback toggle or production restore was exercised.

The original authenticated dashboard session was kept open during setup/testing.
Whether it is still open at resumption is unknown: ask before relying on it.
Do not ask the owner to log out of their remaining working session.

No fresh Likes/biolink consumer check was performed in this conversation. Do not
infer ordinary-user login/editing acceptance from superuser MFA success. Read-only
public checks can precede any specifically approved owner smoke writes. Do not
change ordinary-user authentication settings.

## Local verification utility

Owner already ran `~/.cache/gvp-mfa-verification/check.py`; all checks passed.
Aggregate-only results are beside it in `result.json`, outside Git. Secrets and
raw responses were not saved. Normally no rerun is needed. If a rerun becomes
necessary, the owner executes it locally because it prompts for hidden credentials
and sends a new OTP. Never request passwords, OTPs or tokens in chat or attempt to
run an interactive prompt through a noninteractive background tool.

## Separate unresolved AWS question

Earlier navigation exposed SES Mail Manager's managed SMTP/ingress endpoint form.
Owner subsequently chose IAM SMTP credentials for the actual sending setup.
It remains unknown whether an ingress endpoint was created earlier. Ask before
assuming: any resource/cost audit or decommissioning is separate. No ingress
creation, deletion, permission broadening or shared-credential rotation was
approved.

The available AWS CLI profile `gvp-storage` is backup-scoped, not SES-capable;
an earlier SES identity-list request was denied. Do not broaden its policies or
switch AWS identities/accounts without approval. Console checks were owner-run.

## Safety and continuation boundaries

- No new deployment, production downtime, restore or ordinary-user auth change
  occurred in this SMTP/MFA session.
- Current recovery material predates SMTP/MFA changes; a full restore would revert
  these and other newer writes. Follow the evidence document's approved-recovery
  gates rather than restoring automatically.
- Successful sending/OTP receipt does not guarantee future inbox placement.
- Do not publish personal email addresses, credential values, raw settings or
  authentication responses. Existing screenshots outside Git contain personal
  addresses and are not needed for continuation.
- `/tmp` previously had quota problems. If sensitive scratch work is needed, use a
  private directory outside Git; never emit secret-bearing environment/settings.
- Read `../unbusy.day/AGENTS.md` and its domain docs before exploring that sibling.
  Do not reuse its SMTP credentials or modify its working SES feedback setup.

## Suggested skills

Use the available Skill tool, or read the corresponding `SKILL.md` in this harness:

- **wizard**: only if remaining owner-only recovery/consumer steps need a repeatable
  guided procedure. Short conversational guidance has been sufficient so far.
- **diagnosing-bugs**: if a shared consumer fails or SMTP/OTP delivery regresses;
  establish a tight signal and change one variable at a time.
- **research**: if recovery or SES facts require primary-source verification.
- **handoff**: update this pointer document if another session boundary occurs.

Do not invoke deployment or backup provisioning merely to finish #18. Other #21
rollout gates remain separate.
