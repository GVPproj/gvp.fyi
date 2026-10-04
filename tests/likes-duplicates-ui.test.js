import assert from 'node:assert/strict';
import test from 'node:test';
import { likesBrowser, settle, login, logout, ownerToken } from './helpers/likes-browser.js';

async function setup(t) {
  const { document, window } = await likesBrowser(t);
  const state = { items: [
    { id: 'first', url: 'https://example.com/', title: 'First find', commentary: 'Original commentary', published: true, collections: ['old'] },
    { id: 'second', url: 'https://example.com/', title: 'Private excerpt', body: 'Different words', type: 'quote', published: false, collections: [] },
  ], writes: [], lookup: null };
  globalThis.fetch = async (value, options = {}) => {
    const url = new URL(value);
    if (url.pathname.endsWith('/duplicates')) {
      assert.equal(options.headers.Authorization, ownerToken);
      if (state.lookup) return state.lookup();
      return Response.json({ items: state.items.filter(item => item.url === JSON.parse(options.body).url) });
    }
    if (url.pathname.includes('likes_collections')) return Response.json({ items: [{ id: 'old', name: 'Old' }, { id: 'new', name: 'New' }], totalPages: 1 });
    if (options.method) {
      const item = { id: options.method === 'PATCH' ? url.pathname.split('/').at(-1) : 'another', ...JSON.parse(options.body) };
      state.writes.push(item);
      state.items = [...state.items.filter(old => old.id !== item.id), item];
      return Response.json(item);
    }
    return Response.json({ items: state.items.filter(item => item.published === (url.searchParams.get('filter') !== 'published=false')), totalPages: 1 });
  };
  await import(`../src/scripts/likes.js?duplicates=${Math.random()}`);
  document.dispatchEvent(new window.Event('astro:page-load'));
  const find = selector => document.querySelector(selector);
  const submit = async selector => { find(selector).dispatchEvent(new window.Event('submit', { cancelable: true })); await settle(); };
  await login();
  find('[name=url]').value = 'https://example.com/';
  find('[name=title]').value = 'Unsaved new title';
  return { state, find, submit, window };
}

test('pasting a source URL checks duplicates for text items and ignores stale private results', async t => {
  const { state, find, window } = await setup(t);
  find('[name=type]').value = 'quote';
  const paste = () => {
    const event = new window.Event('paste', { cancelable: true });
    event.clipboardData = { getData: () => 'https://example.com/' };
    find('[name=url]').dispatchEvent(event);
  };
  paste();
  await settle();
  assert.equal(find('#duplicate-review').hidden, false);
  let resolve;
  state.lookup = () => new Promise(done => { resolve = done; });
  paste();
  logout();
  resolve(Response.json({ items: state.items }));
  await settle();
  assert.equal(find('#duplicate-review').hidden, true);
  assert.equal(find('#duplicate-items').textContent, '');
});

test('failed duplicate lookup keeps fields and blocks creation until a successful nonmatch', async t => {
  const { state, find, submit } = await setup(t);
  state.lookup = () => new Response(null, { status: 403 });
  await submit('#save-link');
  assert.equal(state.writes.length, 0);
  assert.equal(find('#save-link').hidden, true);
  assert.equal(find('#session-expired').hidden, false);
  assert.match(find('#session-expired').textContent, /Sign in again.*recover your unsaved edit/);
  state.lookup = null;
  await login();
  assert.equal(find('[name=title]').value, 'Unsaved new title');
  find('[name=url]').value = 'https://different.example/';
  await submit('#save-link');
  assert.equal(state.writes.length, 1);
  assert.equal(state.items.length, 3);
});

test('matching URL offers distinguishable existing items and reuse adds membership without duplicating', async t => {
  const { state, find, submit, window } = await setup(t);
  await submit('#save-link');
  assert.equal(state.writes.length, 0);
  assert.equal(find('#duplicate-review').hidden, false);
  assert.match(find('#duplicate-review').textContent, /First find.*Original commentary/s);
  assert.match(find('#duplicate-review').textContent, /Private excerpt.*Draft.*Different words/s);
  find('#duplicate-items button').click();
  assert.equal(find('[name=title]').value, 'First find');
  assert.equal(find('[name=commentary]').value, 'Original commentary');
  const membership = find('[name=collections][value=new]');
  membership.checked = true;
  membership.dispatchEvent(new window.Event('change'));
  await submit('#save-link');
  assert.equal(state.items.length, 2);
  assert.deepEqual(state.items.find(item => item.id === 'first').collections, ['old', 'new']);
});
