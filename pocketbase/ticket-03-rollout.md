# Ticket 03 rollout — named collections

Deploy `pb_migrations/1781740800_named_collections.js` to the existing **PocketBase 0.40.4** backend after the Ticket 01/02 migrations and **before deploying the named-collection frontend**. This file is not yet deployed by this local implementation.

1. Back up the existing database/data directory and retain the matching backend image. Rehearse against an isolated backup copy first.
2. Copy the new migration into the backend repository's deployed migrations directory, retaining its existing history. Use the existing deployment process and mounted data volume; do not replace the database. PocketBase applies pending migrations at startup (or via `pocketbase migrate up` with the backend's configured data/migration paths).
3. Verify public named-collection listing, existing published items, and owner sign-in. Existing items should have empty memberships; existing content, saved timestamps, commentary, owner accounts, and item access rules are unchanged.
4. Deploy the frontend after migration success. With owner approval, check create/rename, multiple memberships, filtering, and deletion confirmation. Deleting a named collection must leave its items intact; draft content must stay private.

The migration creates no accounts, credentials, or sample content. It refuses an existing `likes_collections` collection rather than adopting it. Automatic down migration is intentionally refused: use a reviewed backup/restore plan, stop writes first, and account for writes made since the backup.

## REST contract

- `likes_collections`: public list/view, required `name` of at most 100 characters. Create/update/delete require the ordinary `likes_owners` record `likesowner00001` (both collection and record identity are checked).
- `likes_items.collections`: optional multi-relation, up to 1000 memberships, `cascadeDelete: false`. Empty memberships are valid. Deleting a named collection removes only its membership references, never the items or their other memberships.
- Named collections are public even when they contain drafts. Membership never overrides item list/view rules; reverse expansion also excludes drafts for anonymous and nonowner callers.
- Store/share the named collection's **record ID**, not its mutable name. Verified 0.40.4 item query: `filter=collections.id ?= "COLLECTION_ID"` with `sort=-created` (URL-encode query parameters). Use the explicit `.id` traversal: the bare `collections ?= "COLLECTION_ID"` query returned no matches in local integration testing. All omits the membership filter and includes ungrouped published items. A deleted collection's record view returns 404 and its item filter returns an empty list.

## Local verification

```sh
POCKETBASE_BINARY=/absolute/path/to/pocketbase-0.40.4 node --test tests/pocketbase.test.js
```

The tests enforce binary version 0.40.4 and use temporary databases, random test credentials, and loopback servers only. Without `POCKETBASE_BINARY`, integration tests are skipped. No production credentials or production writes are needed.
