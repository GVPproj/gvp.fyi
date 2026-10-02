# 07: Handle repeated URLs intentionally

**What to build:** When the owner saves an already-collected URL, show the existing item and let the owner reuse it or deliberately save a separate item.

**Blocked by:** 03: Organize Likes into named collections.

**Status:** ready-for-agent

- [ ] Pasting or submitting a matching URL prompts the owner with the existing item before creating another.
- [ ] Matching uses a documented conservative URL-comparison policy that avoids treating distinct meaningful URLs as identical.
- [ ] The owner can open the existing item and add it to another named collection without duplicating it.
- [ ] An explicit Save another action permits a separate item with the same URL, allowing a different excerpt, image, or commentary. URL uniqueness is not a database constraint.
- [ ] If multiple matching items exist, the owner can distinguish them and choose which to reuse.
- [ ] Duplicate lookup is owner-only and does not expose private records through public endpoints or UI.
- [ ] Automated verification covers reuse, new memberships, explicit duplicates, matching/nonmatching URLs, and unauthorized lookup attempts.
