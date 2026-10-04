// Tab-local presentation state only; PocketBase still authorizes every request.
export const SESSION_KEY = 'owner-session';
export const RECOVERY_KEY = 'owner-editor-recovery';
const OWNER_ID = 'likesowner00001';
let timer;
let clearing = false;

function storage() { return window.sessionStorage; }
function emit(name, reason) {
  document.dispatchEvent(new CustomEvent(name, { detail: { reason } }));
}
function expiry(result) {
  if (result?.record?.id !== OWNER_ID || result.record.collectionName !== 'likes_owners' || typeof result.token !== 'string') return 0;
  try {
    const parts = result.token.split('.');
    if (parts.length !== 3 || !parts.every(Boolean)) return 0;
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    if (claims.id !== undefined && claims.id !== OWNER_ID) return 0;
    return typeof claims.exp === 'number' && Number.isFinite(claims.exp) && claims.exp > 0 ? claims.exp * 1000 : 0;
  } catch { return 0; }
}
function schedule(expires) {
  clearTimeout(timer);
  timer = setTimeout(() => getSession(), Math.min(Math.max(expires - Date.now(), 1), 2147483647));
}

export function getSession() {
  if (typeof window === 'undefined' || clearing) return '';
  let raw;
  try { raw = storage().getItem(SESSION_KEY); } catch { return ''; }
  if (!raw) { clearTimeout(timer); return ''; }
  let result;
  try { result = JSON.parse(raw); } catch { /* Invalid persisted state is not authentication. */ }
  const expires = expiry(result);
  if (!expires || expires <= Date.now()) {
    clearSession(expires ? 'expired' : 'rejected');
    return '';
  }
  schedule(expires);
  return result.token;
}

export function establishSession(result) {
  const expires = expiry(result);
  if (!expires || expires <= Date.now()) {
    clearSession('rejected');
    throw new Error('Sign in with the owner account and try again.');
  }
  // Persist only the token and identity, never credentials or the full auth response.
  try {
    storage().setItem(SESSION_KEY, JSON.stringify({ token: result.token, record: { id: OWNER_ID, collectionName: 'likes_owners' } }));
  } catch {
    clearSession('rejected');
    throw new Error('Session storage is unavailable. Allow storage for this site and try again.');
  }
  schedule(expires);
  emit('owner-session-change', 'login');
  return result.token;
}

export function clearSession(reason = 'logout') {
  if (typeof window === 'undefined' || clearing) return;
  clearing = true;
  clearTimeout(timer);
  try {
    // Listeners snapshot their editor synchronously, before auth is removed.
    if (reason !== 'logout') emit('owner-session-expiring', reason);
    try { storage().removeItem(SESSION_KEY); } catch { /* Storage can be disabled. */ }
    if (reason === 'logout') {
      try { storage().removeItem(RECOVERY_KEY); } catch { /* Storage can be disabled. */ }
    }
  } finally { clearing = false; }
  emit('owner-session-change', reason);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', () => {
    getSession();
    emit('owner-session-change', 'reconcile');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') getSession();
  });
}
