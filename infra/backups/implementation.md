# Local recovery automation candidate

Part of #21. **Not activated or production-verified.** No scheduled workflow,
Lambda, alarm, new credential, production capture or cloud write is enabled by
these files. Existing feature branches are not the default deployment branches.

## Confirmed test boundaries

The owner confirmed capture/resume safety, verified recovery-set promotion and
three-successful-month retention, and failure/missed-success notification.

- `watchdog.py`: read-only monthly marker validation and S3 object-size checks,
  with explicit failure notification and raised infrastructure failures.
- `recovery_store.py`: isolated-restore boundary must succeed before payload and
  manifest upload; byte-for-byte S3 read-back precedes the final verified marker.
  Unique recovery-object keys use conditional creates. Only after successful
  promotion may the caller invoke retention. Every existing marker and referenced
  object is validated/read back before any pruning. The three latest **distinct
  successful months** survive; failed/unmarked candidates, rollback objects and
  shared artifacts are never garbage-collected here.
- `verify.py`: archive, database/file-reference completeness checks. **Matching-
  runtime isolated startup is not implemented:** `verify_recovery` always fails
  closed at that gate. Structural validation never qualifies a recovery set.
- Backend `backup/capture.py`: quiescent capture state machine and independent
  bounded maintenance fallback. Provider failure can prevent exact restoration;
  this is not an unconditional availability guarantee.

## Shared marker contract

`monthly/YYYY-MM/verified.json` is written last. Schema 1 has `slot`,
`status: verified`, UTC `captured_at` and `verified_at`, `manifest` and nonempty
`objects`. Each reference has `key`, lowercase SHA-256 and positive `size`.
Unique payload/manifest keys are under `monthly/<slot>/sets/<set-id>/`;
shared runtime artifacts, if used, are under `artifacts/<sha256>/`.
The complete archive should itself include matching runtime/hooks/migrations and
recoverable configuration; a source revision string alone is not sufficient.

The watchdog requires a first monitored slot, checks the latest slot whose
second-day 06:17 UTC capture plus 24-hour grace has elapsed, and must not accept
ad hoc rollback archives as monthly success. These timestamps remain a proposed
activation configuration, not an enabled schedule.

## Local tests

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s infra/backups -p 'test_*.py'
# From the sibling backend repository:
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_backup_capture.py'
```

S3/SNS/Machine service doubles test failure behavior without cloud mutations.
They do not prove AWS IAM/OIDC, remote command behavior, email receipt, or real
production recovery. Actual restore isolation is a separate verifier gate.

## Composition and activation gates

1. Implement and review the full captured-runtime isolation/startup harness;
   namespace availability alone does not prove restoration. Review the capture
   and verifier archive-layout contract together: the capture currently lacks
   normalized deployment metadata/inventory. Until these gates pass, no real set
   can qualify. Wire `verify.verify_recovery` as the store's required restore
   boundary, never structural validation or an always-successful callable. A full
   restore receipt must have `recovery_verified: true` and the archive's verified
   `captured_at`; storage rejects absent/structural receipts and relabelled times.
2. Implement/review/test the real Machine transport and scoped unattended Fly
   access, including cancellation, ambiguous provider updates, autostop and
   restoration. The reviewed runtime Dockerfile does not supply Python, which
   the local supervisor requires; do not point its command at production as-is.
   Do not create a superuser automation account or weaken MFA.
3. Add the Actions runner on the default branch only through separately approved
   workflow-only changes, without accidentally deploying pending application
   changes. Capture and deployment must share one concurrency exclusion.
4. Use the approved bucket and branch-scoped OIDC role; privately supply scoped
   Fly access. Verify actual assumption, conditional create and object round-trip.
5. Agree the immediate maintenance window, perform the first complete capture,
   isolated restore and S3 promotion, and measure cost before enabling monthly
   execution. Forecasts at or above $1/month need owner approval.
6. Deploy the watchdog disabled, attach its exact rule, independent Errors and
   missing-Invocations alarms, test each delivery/absence path and owner inbox
   receipt, establish the first monitored slot, then explicitly activate.

## Safety and limits

- These modules require a single authorized writer; they are not a distributed
  lock. S3 permissions are not immutable/ransomware-proof custody.
- The restore callable is a trusted composition boundary. Storage tests use a
  substitute restore service; their passing result is not a real restore proof.
  Its receipt must bind the exact capture time; only a real verified runtime
  receipt can be used in production. The current fail-closed verifier produces
  no successful receipts.
- Never invoke retention on a failed promotion. Interrupted pruning may leave
  orphaned old objects; retain them for separate reviewed cleanup rather than
  guessing ownership. Same-month superseded attempts are likewise preserved.
- The final marker upload can have an ambiguous result after a client/network
  failure. Do not prune; reconcile the marker and exact immutable keys before
  retrying with a new set ID. A failed run must still notify even if a verified
  marker reached S3.
- No private recovery payload/configuration belongs in logs, Actions artifacts,
  caches, Git, test fixtures or exception output.
