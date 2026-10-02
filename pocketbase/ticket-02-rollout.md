# Ticket 02 rollout

Deploy `pb_migrations/1781654400_item_commentary.js` to the existing PocketBase 0.40.4 backend **before deploying this frontend**. It adds optional commentary to Likes without changing existing items or access rules. Back up the existing database first; use the existing backend deployment process and data volume, not a replacement database. No production deployment is performed by this ticket's local implementation.

The owner editor publishes by default, supports private drafts and editing, and permanently deletes only after confirmation. Returning an item to draft prevents subsequent public API reads but cannot revoke downloaded or cached content. There is no trash.

Run local verification with a disposable loopback PocketBase database:

```sh
pnpm check
POCKETBASE_BINARY=/absolute/path/to/pocketbase-0.40.4 pnpm test
pnpm build
```

Without `POCKETBASE_BINARY`, integration tests are skipped. Tests never use production credentials or write production data.
