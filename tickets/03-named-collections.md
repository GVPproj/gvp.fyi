# 03: Organize Likes into named collections

**What to build:** The owner can group items into optional named collections, and visitors can browse one collection at a time using shareable filters.

**Blocked by:** 01: Save and browse links in Likes.

**Status:** done (verified locally; deployment pending)

- [x] The owner can create, rename, and delete named collections and assign or remove an item's memberships.
- [x] An item can belong to zero, one, or several named collections; saving never requires a membership.
- [x] The board offers All and one active named-collection filter at a time, retaining newest-saved ordering.
- [x] Each filter has a shareable URL that restores the selected collection on a direct visit or refresh; browser navigation restores filter state.
- [x] All includes ungrouped published items. Membership does not grant access to otherwise private items.
- [x] Renaming a collection preserves its memberships and shareable identity; unknown or deleted filters produce a clear fallback or not-found state.
- [x] Deleting a named collection requires confirmation and removes only the grouping, never its items.
- [x] Server rules restrict collection and membership mutations to the owner.
- [x] Automated verification covers multiple memberships, ungrouped items, filter URLs, authorization, and non-destructive collection deletion.
