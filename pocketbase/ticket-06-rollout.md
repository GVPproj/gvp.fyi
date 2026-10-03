# Ticket 06 backend: quotes and notes (not deployed)

## REST contract

PocketBase **0.40.4**: deploy `pb_migrations/1782000000_text_items.js` and the updated `pb_hooks/likes_assets.pb.js` together, after tickets 01–05 and before the text-item frontend.

- `likes_items.type`: optional single select, `quote` or `note`. Empty string retains existing link/upload behavior; no backfill or record rewrite.
- `body`: plain text, maximum 100000 characters; non-whitespace content required for quotes and notes on both create and update, including superuser writes.
- `attribution`: optional plain text, maximum 1000 characters.
- `title`: optional for quotes/notes, still required for existing link/upload items; existing 500-character maximum remains.
- `url`: optional for quotes/notes. Nonempty sources retain existing HTTP(S), no-credentials pattern and 8192-character bound. This field does not fetch a source URL.
- `asset`: forbidden for quotes/notes, including multipart uploads and retained files when changing type. Remove an existing asset explicitly in the same save when converting to text; native asset cleanup remains responsible for retiring the file. Existing items still require a URL or asset.
- Send JSON through the ordinary record POST/PATCH endpoints. Omitted PATCH fields retain their values. Validation failures are atomic and use PocketBase field errors (`data.body`, `data.asset`, etc.).
- Body and attribution are untrusted literal text, not HTML or sanitized markup. Frontends must render with text APIs, never `innerHTML`; this backend change does not implement previews or expanded reading UI.
- Existing access rules, named memberships, saved timestamps and file restrictions are unchanged. Only the designated Likes owner can mutate items; anonymous/nonowner reads exclude drafts. Sort by `-created`, not `-updated`, for newest-saved order. DELETE is permanent. Returning to draft cannot recall previously downloaded content.

## Deployment and recovery (separate owner approval required)

1. Back up the complete existing data/storage directory and retain matching code/image/configuration. Rehearse restoration and this migration on an isolated copy; check shared backend consumers.
2. Preserve historical migrations and unrelated hooks. Include the new migration and updated runtime hook in the existing backend image with its configured migration/hook paths. Keep Ticket 05's custom executable for preview support; this ticket requires no Go changes.
3. Apply pending migrations using the existing deployment process and mounted data volume, never an empty replacement database. Schema alone does not enforce conditional title/body/asset requirements; ship the hook in the same rollout.
4. Before frontend rollout, verify preserved link/upload content and timestamps, draft denial, both text types without destinations, optional attribution, publication/edit ordering, and rejected empty bodies/unsafe URLs/assets. Use disposable local data for automated checks; any production smoke writes require explicit owner approval.
5. Automatic down migration is intentionally refused. For rollback, stop writes and restore a reviewed backup with matching code/hooks; reconcile subsequent writes first. Old hooks cannot support new text records.

No production mutations or deployment were performed for this implementation.

## Local verification

```sh
POCKETBASE_BINARY=/tmp/gvp-pocketbase-preview node --test --test-name-pattern='quote and note|text migration' tests/pocketbase.test.js
POCKETBASE_BINARY=/tmp/gvp-pocketbase-preview node --test tests/pocketbase.test.js
```

The existing local executable reports version **0.40.4**. The complete PocketBase suite passed **34 tests, zero failures/skips**, using disposable loopback databases and random credentials. Coverage includes both text types, literal 100000-character content, optional/bounded attribution, owner and superuser validation, draft direct/list isolation, unauthorized mutations, publication/edit saved order, permanent deletion, asset rejection/conversion, and migration preservation of existing links/uploads. Existing file lifecycle and authorization regression tests also pass. No binary or database is stored in Git.
