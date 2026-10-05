import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { ownerResult } from './helpers/owner-session.js';

test('Manage Likes is visible only while the owner session is valid', async t => {
  const original = { window: globalThis.window, document: globalThis.document, CustomEvent: globalThis.CustomEvent };
  const { window, document } = parseHTML('<p id="manage-likes" hidden><a href="/likes/manage">Manage Likes</a></p>');
  const stored = new Map();
  window.sessionStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key),
  };
  Object.assign(globalThis, { window, document, CustomEvent: window.CustomEvent });
  const { establishSession, clearSession, getSession, SESSION_KEY } = await import('../src/lib/session.js');
  t.after(() => { clearSession(); Object.assign(globalThis, original); });
  await import('../src/scripts/manage-likes-link.js');
  const link = document.getElementById('manage-likes');
  assert.equal(link.hidden, true);
  establishSession(ownerResult());
  assert.equal(link.hidden, false);
  clearSession();
  assert.equal(link.hidden, true);
  establishSession(ownerResult());
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(ownerResult(1)));
  getSession();
  assert.equal(link.hidden, true, 'Expiry hides the link');
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(ownerResult()));
  document.dispatchEvent(new window.Event('astro:page-load'));
  assert.equal(link.hidden, false, 'Existing sessions show the link on page load');
});
