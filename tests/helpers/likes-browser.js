import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';

export const settle = () => new Promise(resolve => setTimeout(resolve, 15));

export async function likesBrowser(t) {
  const source = await readFile(new URL('../../src/pages/likes.astro', import.meta.url), 'utf8');
  const markup = source.slice(source.indexOf('<section'), source.indexOf('</section>') + 10);
  const { document, window } = parseHTML(`<html><body>${markup}</body></html>`);
  document.querySelector('#likes').dataset.endpoint = 'https://pb.example';
  const original = { document: globalThis.document, fetch: globalThis.fetch, FormData: globalThis.FormData };
  t.after(() => Object.assign(globalThis, original));
  globalThis.document = document;
  // Linkedom does not supply browser FormData or form.reset(). Honor disabled
  // controls and unchecked checkboxes so mutation tests exercise native semantics.
  globalThis.FormData = class {
    constructor(form) {
      this.fields = [...form.querySelectorAll('input,textarea')]
        .filter(el => !el.disabled && (el.type !== 'checkbox' || el.checked))
        .map(el => [el.name, el.value]);
    }
    get(name) { return this.fields.find(([key]) => key === name)?.[1]; }
    [Symbol.iterator]() { return this.fields[Symbol.iterator](); }
  };
  for (const form of document.querySelectorAll('form')) {
    form.reset = () => form.querySelectorAll('input,textarea').forEach(el => { el.value = ''; el.checked = false; });
  }
  return { document, window };
}
