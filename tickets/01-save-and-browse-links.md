# 01: Save and browse links in Likes

**What to build:** The owner can sign into Likes, save a link, and see it immediately on the public board. Use the existing PocketBase instance on Fly for authentication and durable content; static Astro reads published content in the browser without a rebuild. Keep content out of Git.

**Blocked by:** Owner-account provisioning and live owner login/save smoke verification. PocketBase 0.40.4 and the additive collections are deployed; the fresh recovery snapshot and existing public data were verified.

**Status:** in-progress — backend and biolink deployed; Likes frontend rollout and private owner provisioning pending

- [x] Inspect the existing PocketBase version, application, persistent storage, and deployment before making additive changes; preserve existing consumers and data.
- [x] Replace Links navigation with Likes, serve the board at `/likes`, and preserve access from `/links` through a redirect or hosting-compatible equivalent.
- [x] Retain Nord colors and Gohu typography in a wider, top-aligned board with regular square preview areas, uncropped proportional images when available, and consistent captions.
- [ ] The owner signs in with a normal PocketBase email/password account and can sign out. There is no public signup and no superuser credential in the client.
- [ ] Server-enforced access rules restrict mutations to the designated owner, not merely any authenticated account.
- [ ] The owner can save a URL with manually supplied title/description. Optional commentary is not required; newly saved items are published by default.
- [ ] Published links load from PocketBase without an Astro rebuild, ordered newest-saved first, and open their destinations in new tabs safely.
- [x] The board handles loading, empty, and failed-read states; failed saves preserve entered data and report an actionable error.
- [x] Automated verification covers an owner save appearing publicly, anonymous reads, rejected unauthorized writes, ordering, and safe rendering of supplied text and URLs.

## Implementation notes

- `/likes` and the static-compatible `/links` redirect are implemented. Plain links use square hostname placeholders; preview enrichment remains a later ticket.
- Browser email/password authentication, in-memory sign-out, publish-on-save, and runtime public reads are implemented. No content or credentials are stored in Git.
- **Verification: 19 tests passed, zero skipped**, using `POCKETBASE_BINARY=/path/to/pocketbase-0.40.4 pnpm test` after adapting the pending migration and integration harness to modern PocketBase APIs. Frontend/API and DOM interaction tests cover safe rendering, board states, and failed-save retention. Real PocketBase integration tests cover owner saves, anonymous reads, unauthorized writes, ordering, and migration collision protection in disposable databases, never production.
- `pnpm build` and `git diff --check` passed. Without `POCKETBASE_BINARY`, backend integration tests explicitly skip.
- Fly binary version and persistent storage were inspected. The owner supplied the live schema and a backup, and identified `../biolink-react` as the only other consumer. A separate backup copy upgraded to 0.40.4 with existing data/password hashes preserved and identical public collection responses. The legacy hook failure was reproduced; a compatible hook and consolidated deployment workflow are prepared in `../pocketbase-fly-starter`. The full staged backend starts successfully against a fresh restored backup. Eight hook tests and five biolink SDK tests pass; both frontend builds pass.
- PocketBase 0.40.4 and both new Likes collections are now deployed from backend commit `90c0be3`; biolink SDK 0.28.1 is deployed from `636cf6f`. Existing machine, volume, region, data, and collection rules were preserved. The obsolete Netlify hook was revoked and delivery remains disabled. No Likes owner or content has been created; private owner setup remains pending.
- Unchecked end-to-end criteria are implemented and verified locally, but remain open until live owner verification. Public production API checks passed; all nine biolink records match the fresh backup.

## Remaining rollout steps

1. Finish Likes frontend rollout and public browser smoke verification. Backend CI/deployment, fresh Fly snapshot restoration, full image rehearsal, and live API checks have passed; recovery artifacts are documented outside Git.
2. Administratively provision `likes_owners` record `likesowner00001` with the owner's private email/password credentials.
3. Smoke-test owner sign-in/save/sign-out, anonymous visibility, and existing biolink login/edit behavior. Do not seed test content into production.

See [`pocketbase/README.md`](../pocketbase/README.md) for inspection findings and rollout details.
