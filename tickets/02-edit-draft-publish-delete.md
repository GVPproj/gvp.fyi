# 02: Edit, draft, publish, and delete items

**What to build:** The signed-in owner can maintain Likes, hold items privately as drafts, publish them deliberately, and permanently delete items after confirmation.

**Blocked by:** 01: Save and browse links in Likes.

**Status:** implemented (local verification; deployment pending)

- [x] The owner can edit an existing item's URL, title, description, and commentary without changing its original saved order.
- [x] Saving publishes by default, with an explicit option to save as a draft.
- [x] The owner can find, view, edit, and publish drafts through the editor, separately from the public board.
- [x] Draft records are inaccessible to anonymous and non-owner users through listing and direct-record API requests, not merely hidden in the UI.
- [x] Published items can be returned to draft; explain that previously downloaded or cached content cannot be made secret retroactively.
- [x] Item deletion requires explicit confirmation, is permanent, and updates the board. There is no trash feature.
- [x] Save/delete failures are visible without silently discarding edits or falsely reporting success.
- [x] Automated verification covers owner editing, draft isolation, publication transitions, stable saved timestamps, and unauthorized mutation attempts.
