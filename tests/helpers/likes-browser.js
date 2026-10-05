import { parseHTML } from 'linkedom';
import { renderedLikes } from './rendered-likes.js';
import { establishSession, clearSession } from '../../src/lib/session.js';
import { ownerAuth } from './owner-session.js';
export { ownerToken } from './owner-session.js';
export const login = async () => { establishSession(ownerAuth); await settle(); };
export const logout = () => clearSession();

export const settle = () => new Promise(resolve => setTimeout(resolve, 15));

export async function likesBrowser(t, initialURL = 'https://site.example/likes') {
  const { document, window } = parseHTML(await renderedLikes(t));
  // Preserve this harness's board-only scope, using the rendered DOM rather
  // than route source. Layout metadata also has name="description", which
  // would otherwise collide with existing tests' editor field selectors.
  const likes = document.querySelector('#likes');
  if (!likes) throw new Error('Astro-rendered /likes is missing #likes');
  document.head.replaceChildren();
  document.body.replaceChildren(likes);
  likes.dataset.endpoint = 'https://pb.example';
  const original = { document: globalThis.document, fetch: globalThis.fetch, FormData: globalThis.FormData,
    location: globalThis.location, history: globalThis.history, window: globalThis.window,
    CustomEvent: globalThis.CustomEvent, sessionStorage: globalThis.sessionStorage };
  const stored = new Map();
  window.sessionStorage = {
    getItem: key => stored.get(String(key)) ?? null,
    setItem: (key, value) => stored.set(String(key), String(value)),
    removeItem: key => stored.delete(String(key)),
    clear: () => stored.clear(),
    key: index => [...stored.keys()][index] ?? null,
    get length() { return stored.size; },
  };
  const entries = [initialURL];
  let index = 0;
  window.location = new URL(initialURL);
  window.history = {
    pushState(_state, _unused, url) {
      entries.splice(++index, entries.length, new URL(url, window.location).href);
      window.location = new URL(entries[index]);
    },
    back() { if (index > 0) { window.location = new URL(entries[--index]); window.dispatchEvent(new window.Event('popstate')); } },
    forward() { if (index + 1 < entries.length) { window.location = new URL(entries[++index]); window.dispatchEvent(new window.Event('popstate')); } },
  };
  t.after(() => { clearSession(); Object.assign(globalThis, original); });
  Object.assign(globalThis, { document, window, CustomEvent: window.CustomEvent, sessionStorage: window.sessionStorage });
  // Linkedom does not supply browser FormData or form.reset(). Honor disabled
  // controls and unchecked checkboxes so mutation tests exercise native semantics.
  globalThis.FormData = class {
    constructor(form) {
      this.fields = [...form.querySelectorAll('input,textarea,select')]
        .filter(el => !el.disabled && (el.type !== 'checkbox' || el.checked))
        .map(el => [el.name, el.value]);
    }
    get(name) { return this.fields.find(([key]) => key === name)?.[1]; }
    [Symbol.iterator]() { return this.fields[Symbol.iterator](); }
  };
  // Linkedom's select.value lacks the native setter.
  for (const select of document.querySelectorAll('select')) {
    Object.defineProperty(select, 'value', {
      get() { return [...this.options].find(option => option.selected)?.value ?? this.options[0]?.value ?? ''; },
      set(value) { for (const option of this.options) option.selected = option.value === value; },
    });
  }
  for (const form of document.querySelectorAll('form')) {
    form.reset = () => form.querySelectorAll('input,textarea,select').forEach(el => { el.value = ''; el.checked = false; });
  }
  return { document, window };
}
