# 10: Dedicated login and site-wide session controls

**What to build:** Move owner sign-in out of Likes into `/login`, preserve authentication across navigation within the current tab, and provide a discreet site-wide logged-in indicator with logout.

**Blocked by:** 02: Edit, draft, publish, and delete items.

**Status:** done

## Agreed behavior

### Login route

- [x] `/login` contains the owner login form. Remove the login form and in-place reauthentication form from `/likes`; authenticated Likes editing remains available there.
- [x] Logged-out visitors see no login links in public navigation, footers, or other public page chrome. The login route is accessed by URL only, except for the session-expired recovery link described below.
- [x] Successful login redirects to the home route `/`, not `/likes` or the previous page.
- [x] Visiting `/login` with a valid authenticated session also redirects to `/`.
- [x] Failed login stays on `/login` with an accessible error and does not establish an authenticated session.
- [x] Keep the existing designated-owner authentication and authorization rules. This is not visitor signup, a new account system, or PocketBase administrator login.

### Tab-scoped session

- [x] Share authentication between site pages using tab-scoped `sessionStorage`, so ordinary navigation and refresh do not sign the owner out.
- [x] Do not deliberately persist authentication across browser restarts using `localStorage` or introduce a remember-me option. Browser session restoration may restore `sessionStorage`; do not promise tab closure is a security-grade revocation mechanism.
- [x] Never store the login password. Keep credentials out of URLs and logs; retain existing backend enforcement of owner-only actions and draft access.
- [x] Expired or rejected authentication stops authenticated actions and clears the authenticated-looking UI. Distinguish authentication failures from network errors or ordinary validation failures.

### Logged-in indicator and logout

- [x] Show a small **Logged In** tab in the bottom-right corner on every site page while authenticated. Anonymous visitors see no replacement login control.
- [x] Clicking the tab opens a dropdown containing **Log out**, using the native HTML Popover API and CSS rather than a dropdown library. Wire logout behavior with JavaScript as needed.
- [x] The control is keyboard-accessible, has an accessible name and visible focus, supports native dismissal, and avoids obscuring mobile navigation or essential page controls.
- [x] Explicit logout clears the tab's authentication and any saved unsaved-editor recovery state. On Likes, also clear owner-only drafts, editor state, and private viewers without allowing pending requests to repopulate them.
- [x] Logout does not leave a stale Logged In indicator or owner-only UI after navigation, refresh, or browser back/forward restoration. Do not describe local logout as server-side token revocation.

### Session expiry and unsaved edits

- [x] If authentication expires during editing, preserve unsaved editor contents in tab-scoped storage before the owner leaves to reauthenticate.
- [x] Show an accessible session-expired notice with a `/login` link, not an embedded login form. This recovery link is the exception to URL-only login discovery and is not shown to ordinary anonymous visitors.
- [x] Reauthentication still lands on `/`. When the authenticated owner returns to Likes, restore the unsaved edit without automatically saving or publishing it.
- [x] Failed reauthentication does not discard the saved edit. Do not restore private editor contents into an anonymous view.
- [x] Clear recovery state after a successful save, deliberate discard, or explicit logout so stale edits do not reappear.

## Implementation context

The current frontend is static Astro with browser-to-PocketBase requests. Authentication is held only in page memory in the Likes script; moving the form alone will lose login on navigation. Likes uses full-document navigation, so the session and indicator must initialize correctly on each page rather than depending on a client-side router.

Start with:

- `src/pages/likes.astro` and new `src/pages/login.astro` for route markup.
- `src/scripts/likes.js` and `src/lib/likes.js` for existing auth, editing, logout, and reauthentication behavior.
- `src/layouts/Layout.astro`, `src/components/SiteHeader.astro`, and `src/styles/global.css` for shared session UI and positioning.
- `tests/likes-ui.test.js`, `tests/likes-editor.test.js`, and `tests/likes-navigation.test.js` for existing browser coverage.

Keep PocketBase access rules intact: hidden controls and an unlinked login route are presentation choices, not security boundaries. No backend authentication replacement, visitor accounts, or persistent cross-tab login is in scope.

## Verification

- [x] Browser tests cover direct `/login` access, failed login, successful login redirecting home, and already-authenticated `/login` redirecting home.
- [x] Verify anonymous public pages have neither a login form nor a login link; Likes has no login form in any session state.
- [x] Verify authentication survives navigation and refresh, and the bottom-right indicator appears consistently across pages.
- [x] Verify native popover interaction, keyboard dismissal, logout, mobile placement, and back/forward session reconciliation.
- [x] Verify expiry disables authenticated actions, preserves unsaved edits through `/login` and `/`, and restores them on returning to Likes. Cover failed reauthentication and explicit logout cleanup.
- [x] Verify anonymous and non-owner requests still cannot read drafts or mutate Likes; do not regress existing save/edit/publish/delete behavior.
- [x] Run the relevant browser and authorization tests, project checks, and build; record results in this ticket.

## Implementation notes

- Owner login now lives only at `/login`; existing sessions are checked with PocketBase `auth-refresh` before redirecting home.
- Authentication and recovery use tab-scoped `sessionStorage`. Authentication rejection is distinguished from validation and connectivity failures. Logout invalidates pending private requests and clears recovery.
- The site-wide Logged In control uses native popover behavior. Private PDF viewers use an opener-less, same-origin shell so they can close on logout or when leaving Likes.
- Recovery includes editor fields, item identity, memberships, publication choice, provenance, and selected upload bytes. Storage failures retain an in-memory backup with an explicit private-download warning rather than silently losing the edit.

## Review

### Standards

Initial findings about recovery lifecycle, obsolete tests, stale security documentation, and a generic API proxy were addressed. Final review: no remaining findings.

### Spec

Initial and follow-up findings about storage failure, rejected existing sessions, private PDF cleanup, and upload restoration during navigation were addressed. Final review: no remaining findings.

Browser regressions were also tightened to wait for queued dialog-close cleanup and post-save board refresh, rather than asserting during those transitions.

## Verification results

- `pnpm check`: passed, 0 errors and 0 warnings.
- `pnpm build`: passed, all 6 static routes including `/login`.
- Full suite: **127 passed, 0 failed, 0 skipped**, including real Chromium browser coverage and real PocketBase authorization tests. Executed sequentially after checks/build to avoid interference with the temporary Astro dev servers:

  ```sh
  PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/gvp/.cache/ms-playwright/chromium-1234/chrome-linux/chrome \
  POCKETBASE_BINARY=/tmp/pocketbase-likes-ticket07 \
  node --test --test-concurrency=1 tests/*.test.js
  ```

- Separate PocketBase 0.40.4 integration run: **41 passed**, covering anonymous/non-owner restrictions, owner editing/publication/deletion, draft files, and collection rules. No backend rules were changed.
- Added browser checks cover expiry and rejection recovery, failed reauthentication, discard/save/logout cleanup, isolated tabs, refresh/navigation/history, native keyboard dismissal and mobile placement, invalidated-session refresh, storage-failure backup, private PDF cleanup, and recovery upload bytes across subsequent navigation.
- `git diff --check`: passed. No production requests or deployment were performed.
