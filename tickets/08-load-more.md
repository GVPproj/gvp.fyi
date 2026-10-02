# 08: Browse beyond the first page

**What to build:** Visitors can progressively load more published items in All or a selected named collection without losing their place or seeing duplicates.

**Blocked by:** 03: Organize Likes into named collections.

**Status:** ready-for-agent

- [ ] All and collection-filtered views fetch bounded pages and offer a Load more control when additional items exist.
- [ ] Ordering is newest-saved first with a deterministic tie-breaker; successive pages avoid duplicates or skipped items when new items are added during browsing.
- [ ] Editing an old item or changing memberships does not promote its saved timestamp.
- [ ] Changing filters resets pagination correctly and prevents stale in-flight responses from populating the wrong collection.
- [ ] Initial loading, subsequent loading, empty results, exhausted results, and retryable failures have clear accessible states.
- [ ] Drafts never appear in public pagination or leak through public counts.
- [ ] Loading more preserves existing content, scroll position, and usable keyboard focus.
- [ ] Automated verification covers multiple pages, equal timestamps, concurrent additions, filter changes, failed requests/retries, and exhausted results.
