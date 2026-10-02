import { test } from 'node:test';
import assert from 'node:assert/strict';
import { likesBrowser, settle } from './helpers/likes-browser.js';

async function editor(t) {
  const { document, window } = await likesBrowser(t);
  const state = { items: [], failSave: false, failDelete: false, failRead: false, deletes: 0, saveErrorStatus: 500 };
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes('auth-with-password')) return Response.json({ token: 'owner', record: { id: 'likesowner00001', collectionName: 'likes_owners' } });
    const id = new URL(url).pathname.split('/').at(-1);
    if (options.method === 'DELETE') {
      state.deletes++;
      if (state.failDelete) return new Response('', { status: 500 });
      state.items = state.items.filter(item => item.id !== id);
      return new Response(null, { status: 204 });
    }
    if (options.method === 'POST' || options.method === 'PATCH') {
      if (state.failSave) return new Response('', { status: state.saveErrorStatus });
      const item = { id: options.method === 'PATCH' ? id : String(state.items.length + 1), ...JSON.parse(options.body) };
      state.items = [...state.items.filter(existing => existing.id !== item.id), item];
      return Response.json(item);
    }
    if (state.failRead) throw new Error('offline');
    const draft = new URL(url).searchParams.get('filter') === 'published=false';
    assert.ok(!draft || options.headers.Authorization === 'owner');
    return Response.json({ items: state.items.filter(item => item.published !== draft), totalPages: 1 });
  };
  await import(`../src/scripts/likes.js?editor=${Date.now()}`);
  document.dispatchEvent(new window.Event('astro:page-load'));
  const find = selector => document.querySelector(selector);
  const submit = async selector => { find(selector).dispatchEvent(new window.Event('submit', { cancelable: true })); await settle(); };
  await submit('#owner-login');
  return { state, find, submit };
}

test('signing in again after authentication failure retains unsaved edits and selection', async t => {
  const { state, find, submit } = await editor(t);
  find('[name=url]').value = 'https://example.com';
  find('[name=title]').value = 'Original';
  await submit('#save-link');
  find('#likes-board button').click();
  find('[name=title]').value = 'Retained edit';
  state.failSave = true;
  state.saveErrorStatus = 403;
  await submit('#save-link');
  assert.match(find('#save-status').textContent, /Sign in.*fields have been kept/);
  find('#reauthenticate').click();
  assert.equal(find('#owner-login').hidden, false);
  await submit('#owner-login');
  assert.equal(find('[name=title]').value, 'Retained edit');
  state.failSave = false;
  await submit('#save-link');
  assert.equal(state.items.length, 1);
  assert.equal(find('#likes-board h2').textContent, 'Retained edit');
});

test('confirmed mutations update both boards even when subsequent reads fail', async t => {
  const { state, find, submit } = await editor(t);
  find('[name=url]').value = 'https://example.com';
  find('[name=title]').value = 'Private';
  find('[name=draft]').checked = true;
  await submit('#save-link');
  find('#drafts-board button').click();
  find('[name=draft]').checked = false;
  state.failRead = true;
  await submit('#save-link');
  assert.ok(!find('#drafts-board li'), 'Published item must leave the draft board even if reload fails');
  assert.equal(find('#likes-board h2').textContent, 'Private');
  assert.match(find('#read-status').textContent, /connection/);
  find('#likes-board button').click();
  assert.equal(find('[name=draft]').checked, false);
  find('[name=draft]').checked = true;
  await submit('#save-link');
  assert.equal(find('#likes-board li'), null);
  assert.equal(find('#drafts-board h2').textContent, 'Private');
  find('#drafts-board button').click();
  find('#delete-item').click();
  find('#confirm-delete').click();
  await settle();
  assert.equal(find('#drafts-board li'), null);
  assert.equal(find('#likes-board li'), null);
  assert.equal(find('#save-status').textContent, 'Permanently deleted.');
});

test('delete requires confirmation and failures preserve the selected item and edits', async t => {
  const { state, find, submit } = await editor(t);
  find('[name=url]').value = 'https://example.com';
  find('[name=title]').value = 'Keep me';
  await submit('#save-link');
  find('#likes-board button').click();
  find('[name=title]').value = 'Unsaved edit';
  state.failSave = true;
  await submit('#save-link');
  assert.equal(find('[name=title]').value, 'Unsaved edit');
  assert.match(find('#save-status').textContent, /fields have been kept/);
  find('#delete-item').click();
  assert.equal(state.deletes, 0);
  assert.equal(find('#delete-confirmation').hidden, false);
  assert.match(find('#delete-confirmation').textContent, /permanent.*no trash/i);
  find('#cancel-delete').click();
  assert.equal(find('#delete-confirmation').hidden, true);
  assert.equal(state.deletes, 0);
  find('#delete-item').click();
  state.failDelete = true;
  find('#confirm-delete').click();
  await settle();
  assert.equal(find('[name=title]').value, 'Unsaved edit');
  assert.equal(find('#likes-board h2').textContent, 'Keep me');
  assert.match(find('#save-status').textContent, /could not.*fields have been kept/);
  state.failDelete = false;
  find('#confirm-delete').click();
  await settle();
  assert.equal(find('#likes-board li'), null);
  assert.equal(find('[name=title]').value, '');
  assert.equal(find('#delete-item').hidden, true);
  assert.equal(find('#save-status').textContent, 'Permanently deleted.');
});

test('owner saves a private draft, edits it, publishes, and returns it to draft', async t => {
  const { find, submit } = await editor(t);
  find('[name=url]').value = 'https://example.com';
  find('[name=title]').value = 'Private find';
  find('[name=commentary]').value = 'Personal context';
  find('[name=draft]').checked = true;
  await submit('#save-link');
  assert.equal(find('#likes-board li'), null);
  assert.equal(find('#drafts-board h2').textContent, 'Private find');
  find('#drafts-board button').click();
  assert.equal(find('[name=commentary]').value, 'Personal context');
  assert.equal(find('[name=draft]').checked, true);
  find('[name=title]').value = 'Published find';
  find('[name=draft]').checked = false;
  await submit('#save-link');
  assert.equal(find('#drafts-board li'), null);
  assert.equal(find('#likes-board h2').textContent, 'Published find');
  find('#likes-board button').click();
  find('[name=draft]').checked = true;
  assert.match(find('#draft-warning').textContent, /cached.*cannot.*secret/i);
  await submit('#save-link');
  assert.equal(find('#likes-board li'), null);
  assert.equal(find('#drafts-board h2').textContent, 'Published find');
  find('#sign-out').click();
  assert.equal(find('#drafts-board li'), null);
  assert.equal(find('#draft-tools').hidden, true);
});
