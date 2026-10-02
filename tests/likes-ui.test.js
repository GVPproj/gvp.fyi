import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';

const settle = () => new Promise(resolve => setTimeout(resolve, 10));

test('board states, owner save, failed-save retention, and sign out', async () => {
  const source = await readFile(new URL('../src/pages/likes.astro', import.meta.url), 'utf8');
  const markup = source.slice(source.indexOf('<section'), source.indexOf('</section>') + 10);
  const { document, window } = parseHTML(`<html><body>${markup}</body></html>`);
  document.querySelector('#likes').dataset.endpoint = 'https://pb.example';
  const original = { document: globalThis.document, fetch: globalThis.fetch, FormData: globalThis.FormData };
  globalThis.document = document;
  globalThis.FormData = class {
    constructor(form) { this.fields = [...form.querySelectorAll('input,textarea')].map(el => [el.name, el.value]); }
    get(name) { return this.fields.find(([key]) => key === name)?.[1]; }
    [Symbol.iterator]() { return this.fields[Symbol.iterator](); }
  };
  for (const form of document.querySelectorAll('form')) {
    form.reset = () => form.querySelectorAll('input,textarea').forEach(el => { el.value = ''; });
  }
  let items = [], failRead = false, failSave = false;
  globalThis.fetch = async (url, options) => {
    if (url.includes('auth-with-password')) return Response.json({ token: 'owner' });
    if (options.method === 'POST') {
      if (failSave) return new Response('', { status: 403 });
      items = [{ id: 'saved', ...JSON.parse(options.body) }];
      return Response.json(items[0]);
    }
    if (failRead) throw new Error('offline');
    return Response.json({ items, totalPages: 1 });
  };
  try {
    await import('../src/scripts/likes.js');
    document.dispatchEvent(new window.Event('astro:page-load'));
    assert.equal(document.querySelector('#read-status').textContent, 'Loading Likes…');
    await settle();
    assert.equal(document.querySelector('#read-status').textContent, 'No likes yet.');
    failRead = true;
    document.querySelector('#retry-read').click();
    await settle();
    assert.match(document.querySelector('#read-status').textContent, /connection.*Retry/);
    failRead = false;
    document.querySelector('#owner-login').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await settle();
    const save = document.querySelector('#save-link');
    assert.equal(save.hidden, false);
    save.querySelector('[name=url]').value = 'https://example.com';
    save.querySelector('[name=title]').value = 'My like';
    save.querySelector('[name=description]').value = 'A description';
    failSave = true;
    save.dispatchEvent(new window.Event('submit', { cancelable: true }));
    await settle();
    assert.equal(save.querySelector('[name=title]').value, 'My like');
    assert.match(document.querySelector('#save-status').textContent, /fields have been kept/);
    failSave = false;
    save.dispatchEvent(new window.Event('submit', { cancelable: true }));
    await settle();
    assert.equal(document.querySelector('#likes-board h2').textContent, 'My like');
    assert.equal(save.querySelector('[name=title]').value, '');
    document.querySelector('#sign-out').click();
    assert.equal(save.hidden, true);
    assert.equal(document.querySelector('#owner-login').hidden, false);
  } finally { Object.assign(globalThis, original); }
});
