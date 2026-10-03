# 06: Collect quotes and personal notes

**What to build:** The owner can save quotes and personal notes alongside links and uploads, and visitors can expand text items into readable on-site views.

**Blocked by:** 02: Edit, draft, publish, and delete items.

**Status:** done (verified locally; deployment pending)

- [x] The editor supports quote and personal-note item types without requiring a destination URL.
- [x] Quotes support optional attribution and source links; personal notes support authored text and an optional title.
- [x] Text items have readable, bounded previews in the regular square grid rather than forcing the grid into a masonry layout.
- [x] Clicking a text item opens a readable expanded view with accessible close/navigation behavior; long content remains usable on mobile.
- [x] Text is rendered safely without executing user-supplied HTML or unsafe source URLs.
- [x] Drafting, publishing, editing, newest-saved ordering, and confirmed permanent deletion behave consistently with other item types.
- [x] Automated verification covers both text types, optional attribution, long content, expanded reading, draft isolation, and unsafe input.

## Verification

- Full suite: **92 passed, zero failures/skips**, with PocketBase 0.40.4 and Chromium enabled.
- `pnpm check`: zero errors, warnings, or hints. `pnpm build`, backend `go test ./...`, and `git diff --check` passed.

## Implementation notes

- Quotes and notes use plain-text bodies (up to 100,000 characters), optional titles, attribution, and source URLs. Existing link/upload records remain unchanged.
- Square previews open a native modal reader with mobile scrolling, Escape/Close dismissal, focus restoration, and distinguishing accessible names for untitled items.
- Additive schema and conditional server validation must deploy together before the frontend. See [`pocketbase/ticket-06-rollout.md`](../pocketbase/ticket-06-rollout.md). No production changes were made.
- Standards review found no documented violations and two duplication heuristics, resolved with shared title/focus helpers. Spec review found indistinguishable accessible names for untitled cards, fixed with bounded text excerpts and a browser regression test.
