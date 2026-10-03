# 07: Handle repeated URLs intentionally

**What to build:** When the owner saves an already-collected URL, show the existing item and let the owner reuse it or deliberately save a separate item.

**Blocked by:** 03: Organize Likes into named collections.

**Status:** done (verified locally; deployment pending)

- [x] Pasting or submitting a matching URL prompts the owner with the existing item before creating another.
- [x] Matching uses a documented conservative URL-comparison policy that avoids treating distinct meaningful URLs as identical.
- [x] The owner can open the existing item and add it to another named collection without duplicating it.
- [x] An explicit Save another action permits a separate item with the same URL, allowing a different excerpt, image, or commentary. URL uniqueness is not a database constraint.
- [x] If multiple matching items exist, the owner can distinguish them and choose which to reuse.
- [x] Duplicate lookup is owner-only and does not expose private records through public endpoints or UI.
- [x] Automated verification covers reuse, new memberships, explicit duplicates, matching/nonmatching URLs, and unauthorized lookup attempts.

## Verification

- Full suite: **104 passed, zero failures/skips**, with the custom PocketBase 0.40.4 binary and Chromium enabled. Run browser tests separately from production builds: an overlapping build caused three setup timeouts; the affected files and full suite passed without it.
- `pnpm check`: zero errors, warnings, or hints. `pnpm build`, backend `go test ./...`, race tests, vet, build, and `git diff --check` passed.
- Standards review: no documented violations; two non-blocking duplication heuristics (URL-request construction and explicit HTTP test fixtures) retained to avoid broadening this feature into a harness/API refactor. Spec review: no findings.

## Implementation notes

- Owner-only `POST /api/likes/duplicates` returns all matching published and draft items without fetching the destination. URL comparison, existing WHATWG serialization, concurrency limits of advisory lookup, and deployment are documented in [`pocketbase/ticket-07-rollout.md`](../pocketbase/ticket-07-rollout.md).
- Paste and new-item submission check for matches. Existing items open in the normal editor for membership changes; Save another preserves the new item's fields and respects native validation. Edits to existing items do not trigger this creation check.
- Lookup failures block creation and retain fields. URL edits, cancellation, opening an existing item, and sign-out invalidate pending lookups and clear private matches.
- Deploy the rebuilt custom backend before the frontend. No migration or uniqueness constraint is added. No production changes were made.
