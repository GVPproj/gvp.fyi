import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';

export const settle = () => new Promise(resolve => setTimeout(resolve, 15));

export async function likesBrowser(t, initialURL = 'https://site.example/likes') {
  const source = await readFile(new URL('../../src/pages/likes.astro', import.meta.url), 'utf8');
  const markup = source.slice(source.indexOf('<section'), source.indexOf('</section>') + 10);
  const { document, window } = parseHTML(`<html><body>${markup}</body></html>`);
  document.querySelector('#likes').dataset.endpoint = 'https://pb.example';
  const original = { document: globalThis.document, fetch: globalThis.fetch, FormData: globalThis.FormData,
    location: globalThis.location, history: globalThis.history };
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
  t.after(() => Object.assign(globalThis, original));
  globalThis.document = document;
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
