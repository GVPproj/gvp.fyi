# Legacy owner login and session controls

Implemented for the pre-cutover frontend. Retain this ticket until explicitly reconciled with [#21](https://github.com/GVPproj/gvp.fyi/issues/21); dashboard replacement acceptance precedes retirement of app editing.

## Contract

- `/login` is URL-only, with no anonymous navigation link. Success and an existing valid session redirect home. Failed login stays accessible and establishes no session.
- Authentication and unsaved-edit recovery are tab-scoped in `sessionStorage`, not deliberate cross-tab/browser persistence. Passwords are never stored. Tab closure is not server-side revocation.
- The native Logged In popover exposes logout site-wide. Logout clears auth, private UI/viewers and recovery, and invalidates pending private work.
- Expiry/rejected authentication stops private actions and preserves unsaved edits before linking to `/login`. Network and validation failures are distinct from auth rejection.
- Reauthentication lands home; returning to management restores the saved edit only for the authenticated owner, without saving/publishing it. Successful save, discard and logout clear recovery.
- Recovery includes fields, item identity, memberships, publication choice, provenance and upload bytes. Storage failure retains an in-memory backup and offers an explicit private-download warning.
- Hidden controls are not authorization: PocketBase rules continue enforcing owner-only writes and draft/file access. This is separate from superuser dashboard login/MFA.

## Lifecycle constraints

Keep `/login` and `/likes/manage` on native document navigation while the legacy workflow remains. Router adoption would require page-lifetime cancellation, private viewer cleanup, recovery-write ownership and history reconciliation. Existing native boundaries are not a guarantee of complete BFCache privacy.

The document-wide session timer survives public client navigation. Re-query current controls on `astro:page-load`; guard element binding against duplication. On back/forward restoration reconcile auth before showing private state.

## Verification

Relevant coverage: `tests/session-*.test.js`, `tests/likes-*.test.js` and `tests/public-likes.test.js`. Run browser/build work serially as described in [README](../README.md#testing).

The legacy early-submit login edge remains unfixed; waiting for page-load synchronization in tests does not fix it. Full-content mode redirects legacy owner routes and omits owner controls; unrelated backend authentication/endpoints remain for shared consumers and rollback.
