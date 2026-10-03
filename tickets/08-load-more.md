# 08: Browse beyond the first page

**What to build:** Visitors can progressively load more published items in All or a selected named collection without losing their place or seeing duplicates.

**Blocked by:** 03: Organize Likes into named collections.

**Status:** done (verified locally; deployment pending)

- [x] All and collection-filtered views fetch bounded pages and offer a Load more control when additional items exist.
- [x] Ordering is newest-saved first with a deterministic tie-breaker; successive pages avoid duplicates or skipped items when new items are added during browsing.
- [x] Editing an old item or changing memberships does not promote its saved timestamp.
- [x] Changing filters resets pagination correctly and prevents stale in-flight responses from populating the wrong collection.
- [x] Initial loading, subsequent loading, empty results, exhausted results, and retryable failures have clear accessible states.
- [x] Drafts never appear in public pagination or leak through public counts.
- [x] Loading more preserves existing content, scroll position, and usable keyboard focus.
- [x] Automated verification covers multiple pages, equal timestamps, concurrent additions, filter changes, failed requests/retries, and exhausted results.

## Verification

- Full suite with real PocketBase 0.40.4 and Chromium: **116 passed, zero failures/skips**. Run builds after browser tests, not concurrently with their Astro dev servers. The initial overlapping run timed out; the serial full suite passed.
- `pnpm check`: zero errors, warnings, or hints. `pnpm build`, backend `go test ./...`, and `git diff --check` passed.
- Standards review: no documented violations; two naming heuristics addressed. Spec review and followups: initial-retry focus regression fixed with a red/green browser test, and response-gate synchronization made explicit. No outstanding findings.

## Implementation notes

- Public pages show 24 records with one-record lookahead, sorted by `-created,-id`. An exclusive saved-time/ID cursor avoids shifting offsets; no public totals are requested. Named collections use PocketBase's `collections.id` relation filter.
- Filter changes and browser navigation clear the current page and invalidate earlier requests. Failed append requests keep their cursor and existing cards; Retry resumes the failed page. Reload Likes starts fresh to reveal new saves.
- Loading more appends DOM nodes without replacing cards or stealing focus. Loading and retry controls remain focusable with `aria-disabled`; status messages sit below the board to avoid moving existing content.
- No migration or backend change is required. This does not snapshot concurrent publication, membership, or deletion changes. No production changes were made.
