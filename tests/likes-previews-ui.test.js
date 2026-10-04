import { test } from 'node:test';
import assert from 'node:assert/strict';
import { likesBrowser, settle, login, logout, ownerToken } from './helpers/likes-browser.js';

const metadata = (extra = {}) => ({ sourceURL: 'https://example.com/', finalURL: 'https://example.com/article',
  fetchedAt: '2026-01-01T00:00:00Z', title: 'Fetched title', description: 'Fetched description', image: null, warning: '', ...extra });
const image = { sourceURL: 'https://example.com/image.png', finalURL: 'https://cdn.example.com/image.png',
  name: 'preview.png', type: 'image/png', base64: 'aW1hZ2U=' };
const existing = { id: 'existing', url: 'https://example.com/', title: 'Existing title', description: 'Existing description', published: true };
let sequence = 0;
async function editor(t, items = []) {
  const NativeFormData = globalThis.FormData;
  const { document, window } = await likesBrowser(t);
  const BrowserFormData = globalThis.FormData;
  globalThis.FormData = class extends BrowserFormData {
    constructor(form) { if (!form) return new NativeFormData(); super(form); }
  };
  const state = { items, previews: [], writes: [], failSave: false };
  globalThis.fetch = async (url, options = {}) => {
    if (new URL(url).pathname === '/api/likes/duplicates' && options.method === 'POST') return Response.json({ items: [] });
    if (url.includes('preview')) {
      assert.equal(options.headers.Authorization, ownerToken);
      return new Promise(resolve => state.previews.push({ body: JSON.parse(options.body), resolve }));
    }
    if (options.method === 'POST' || options.method === 'PATCH') {
      const data = typeof options.body === 'string' ? JSON.parse(options.body) : Object.fromEntries(options.body);
      if (typeof data.previewProvenance === 'string') data.previewProvenance = JSON.parse(data.previewProvenance);
      state.writes.push(data);
      if (state.failSave) return new Response('', { status: 500 });
      return Response.json({ id: 'saved', ...data, asset: typeof data.asset === 'object' ? data.asset.name : data.asset });
    }
    if (url.includes('likes_collections')) return Response.json({ items: [], totalPages: 1 });
    const draft = new URL(url).searchParams.get('filter') === 'published=false';
    return Response.json({ items: state.items.filter(item => item.published !== draft), totalPages: 1 });
  };
  await import(`../src/scripts/likes.js?previews=${++sequence}`);
  document.dispatchEvent(new window.Event('astro:page-load'));
  const find = selector => document.querySelector(selector);
  const submit = async selector => { find(selector).dispatchEvent(new window.Event('submit', { cancelable: true })); await settle(); };
  const input = (name, value) => { const field = find(`[name=${name}]`); field.value = value; field.dispatchEvent(new window.Event('input')); };
  await login();
  return { state, find, submit, input, window };
}

test('manual fetch shows progress and fills empty metadata without blocking save', async t => {
  const { state, find, input } = await editor(t);
  input('url', 'https://example.com/');
  find('#fetch-preview').click();
  assert.match(find('#preview-status').textContent, /fetching/i);
  assert.equal(find('[name=title]').disabled, false);
  assert.equal(find('#save-link button:not([type])').disabled, false);
  state.previews[0].resolve(Response.json(metadata()));
  await settle();
  assert.equal(find('[name=title]').value, 'Fetched title');
  assert.equal(find('[name=description]').value, 'Fetched description');
  assert.match(find('#preview-status').textContent, /fetched/i);
});


test('pasting a URL fetches automatically and outdated completions cannot change the editor', async t => {
  const { state, find, input, window, submit } = await editor(t, [existing]);
  const paste = new window.Event('paste', { cancelable: true });
  paste.clipboardData = { getData: () => 'https://example.com/' };
  find('[name=url]').dispatchEvent(paste);
  await settle();
  assert.equal(state.previews.length, 1);
  assert.equal(find('[name=url]').value, 'https://example.com/');
  input('url', 'https://example.com/new');
  state.previews[0].resolve(Response.json(metadata()));
  await settle();
  assert.equal(find('[name=title]').value, '');
  for (const action of ['switch', 'cancel', 'signout', 'save']) {
    if (action === 'save') await login();
    input('url', 'https://example.com/');
    find('#fetch-preview').click();
    const pending = state.previews.at(-1);
    if (action === 'switch') find('#likes-board button').click();
    if (action === 'cancel') find('#new-item').click();
    if (action === 'signout') logout();
    if (action === 'save') {
      input('title', 'Manual save');
      state.failSave = true;
      await submit('#save-link');
    }
    const title = find('[name=title]').value;
    const description = find('[name=description]').value;
    pending.resolve(Response.json(metadata({ image })));
    await settle();
    assert.equal(find('[name=title]').value, title, action);
    assert.equal(find('[name=description]').value, description, action);
    assert.doesNotMatch(find('#preview-status').textContent, /fetched/i, action);
    assert.equal(find('#preview-image').hasAttribute('src'), false, action);
  }
  assert.equal(state.writes[0].description, '');
  assert.equal(state.writes[0].previewProvenance, null);
});

test('fetched image is reviewed locally and explicitly chosen for the normal asset upload', async t => {
  const { state, find, input, submit } = await editor(t);
  input('url', 'https://example.com/');
  find('#fetch-preview').click();
  state.previews[0].resolve(Response.json(metadata({ image })));
  await settle();
  assert.equal(find('#preview-image-review').hidden, false);
  assert.equal(find('#preview-image').getAttribute('src'), 'data:image/png;base64,aW1hZ2U=');
  assert.equal(find('#preview-image').getAttribute('src').includes('cdn.example'), false);
  find('#use-preview-image').click();
  await submit('#save-link');
  assert.ok(state.writes[0].asset instanceof File);
  assert.equal(state.writes[0].asset.name, 'preview.png');
  assert.equal(await state.writes[0].asset.text(), 'image');
  const provenance = state.writes[0].previewProvenance;
  assert.equal(provenance.overrides.image, false);
  assert.deepEqual(provenance.fetched.image, { sourceURL: image.sourceURL, finalURL: image.finalURL, name: 'preview.png', type: 'image/png' });
  assert.equal(JSON.stringify(provenance).includes('base64'), false);
  assert.equal(find('#preview-image').hasAttribute('src'), false);
});

test('image review preserves existing assets; discard, upload and removal are owner overrides', async t => {
  const { state, find, submit, window } = await editor(t, [{ ...existing, asset: 'original.png' }]);
  find('#likes-board li > button:last-child').click();
  find('#fetch-preview').click();
  state.previews[0].resolve(Response.json(metadata({ image })));
  await settle();
  state.failSave = true;
  await submit('#save-link');
  assert.equal(state.writes[0].asset, undefined, 'Review alone never replaces the existing upload');
  find('#discard-preview-image').click();
  await submit('#save-link');
  assert.equal(state.writes[1].asset, undefined);
  assert.equal(state.writes[1].previewProvenance.overrides.image, true);
  assert.equal(find('#preview-image').hasAttribute('src'), false);
  find('#fetch-preview').click();
  state.previews[1].resolve(Response.json(metadata({ image })));
  await settle();
  find('#use-preview-image').click();
  const upload = new File(['owner bytes'], 'owner.png', { type: 'image/png' });
  find('[name=asset]').files = [upload];
  find('[name=asset]').dispatchEvent(new window.Event('change'));
  await submit('#save-link');
  assert.equal(state.writes[2].asset.name, 'owner.png');
  assert.equal(state.writes[2].previewProvenance.overrides.image, true);
  find('[name=asset]').files = [];
  find('#use-preview-image').click();
  find('[name=removeAsset]').checked = true;
  find('[name=removeAsset]').dispatchEvent(new window.Event('change'));
  await submit('#save-link');
  assert.equal(state.writes[3].asset, '');
  assert.equal(state.writes[3].previewProvenance.overrides.image, true);
});

test('later metadata fetches keep the chosen image and its original source across B and no-image results', async t => {
  const { state, find, input, submit } = await editor(t);
  input('url', 'https://example.com/');
  find('#fetch-preview').click();
  state.previews[0].resolve(Response.json(metadata({ image })));
  await settle();
  find('#use-preview-image').click();
  find('#fetch-preview').click();
  state.failSave = true;
  const imageB = { ...image, sourceURL: 'https://other.example/b.png', name: 'b.png', base64: 'Qg==' };
  for (const [index, nextImage] of [imageB, null].entries()) {
    if (index) find('#fetch-preview').click();
    state.previews[index + 1].resolve(Response.json(metadata({ image: nextImage, finalURL: 'https://other.example/page', fetchedAt: '2026-02-01T00:00:00Z' })));
    await settle();
    assert.match(find('#preview-image-status').textContent, /previously selected image is kept/i);
    await submit('#save-link');
    const write = state.writes[index];
    assert.equal(write.asset.name, 'preview.png');
    assert.equal(await write.asset.text(), 'image');
    assert.equal(write.previewProvenance.fetched.image?.name ?? null, nextImage?.name ?? null);
    assert.equal(write.previewProvenance.overrides.image, true);
    assert.deepEqual(write.previewProvenance.assetSource, {
      sourceURL: 'https://example.com/image.png', finalURL: 'https://cdn.example.com/image.png',
      name: 'preview.png', type: 'image/png', fetchedAt: '2026-01-01T00:00:00Z', pageURL: 'https://example.com/article',
    });
  }
});

test('existing fetched asset attribution survives editing, refetch and selected-image discard; upload and removal clear it', async t => {
  const assetSource = { sourceURL: 'https://original.example/a.png', finalURL: 'https://original.example/final.png',
    name: 'a.png', type: 'image/png', fetchedAt: '2025-12-01T00:00:00Z', pageURL: 'https://original.example/page' };
  const provenance = { fetched: metadata(), assetSource, overrides: { title: false, description: false, image: false } };
  const { state, find, submit, window } = await editor(t, [{ ...existing, asset: 'saved-a.png', previewProvenance: provenance }]);
  find('#likes-board li > button:last-child').click();
  state.failSave = true;
  await submit('#save-link');
  assert.deepEqual(state.writes.at(-1).previewProvenance.assetSource, assetSource);
  for (const nextImage of [null, image]) {
    find('#fetch-preview').click();
    state.previews.at(-1).resolve(Response.json(metadata({ image: nextImage })));
    await settle();
    await submit('#save-link');
    assert.equal(state.writes.at(-1).asset, undefined);
    assert.deepEqual(state.writes.at(-1).previewProvenance.assetSource, assetSource);
  }
  find('#use-preview-image').click();
  find('#discard-preview-image').click();
  await submit('#save-link');
  assert.equal(state.writes.at(-1).asset, undefined);
  assert.deepEqual(state.writes.at(-1).previewProvenance.assetSource, assetSource);
  find('[name=asset]').files = [new File(['owner'], 'owner.png', { type: 'image/png' })];
  find('[name=asset]').dispatchEvent(new window.Event('change'));
  await submit('#save-link');
  assert.equal(state.writes.at(-1).asset.name, 'owner.png');
  assert.equal(state.writes.at(-1).previewProvenance.assetSource, null);
  find('[name=asset]').files = [];
  find('[name=removeAsset]').checked = true;
  find('[name=removeAsset]').dispatchEvent(new window.Event('change'));
  await submit('#save-link');
  assert.equal(state.writes.at(-1).asset, '');
  assert.equal(state.writes.at(-1).previewProvenance.assetSource, null);
});

test('switching items, cancel and sign out clear adopted files and their attribution together', async t => {
  const { state, find, input, submit } = await editor(t, [existing]);
  for (const action of ['switch', 'cancel', 'signout']) {
    input('url', 'https://example.com/');
    find('#fetch-preview').click();
    state.previews.at(-1).resolve(Response.json(metadata({ image })));
    await settle();
    find('#use-preview-image').click();
    if (action === 'switch') find('#likes-board button').click();
    if (action === 'cancel') find('#new-item').click();
    if (action === 'signout') {
      logout();
      await login();
    }
    input('title', 'Manual item');
    await submit('#save-link');
    assert.equal(state.writes.at(-1).asset, undefined, action);
    assert.equal(state.writes.at(-1).previewProvenance, null, action);
  }
});

test('failed metadata and image fetches still allow manual saves and warn without losing edits', async t => {
  const { state, find, input, submit } = await editor(t);
  input('url', 'https://example.com/');
  find('#fetch-preview').click();
  state.previews[0].resolve(new Response('', { status: 500 }));
  await settle();
  assert.match(find('#preview-status').textContent, /unavailable.*still.*save/i);
  input('title', 'Manual title');
  await submit('#save-link');
  assert.equal(state.writes[0].title, 'Manual title');
  assert.match(find('#save-status').textContent, /Published/);
  input('url', 'https://example.com/');
  find('#fetch-preview').click();
  state.previews[1].resolve(Response.json(metadata({ warning: 'Image download failed.' })));
  await settle();
  assert.match(find('#preview-status').textContent, /Image download failed/);
  await submit('#save-link');
  assert.equal(state.writes[1].title, 'Fetched title');
  assert.equal(state.writes[1].asset, undefined);
});

test('the latest fetch wins and only untouched fetched values refresh', async t => {
  const { state, find, input } = await editor(t);
  input('url', 'https://example.com/');
  find('#fetch-preview').click();
  find('#fetch-preview').click();
  state.previews[1].resolve(Response.json(metadata()));
  await settle();
  state.previews[0].resolve(new Response('', { status: 500 }));
  await settle();
  assert.match(find('#preview-status').textContent, /fetched/i);
  find('#fetch-preview').click();
  input('description', 'Fetched description'); // Same text is still an explicit owner edit.
  state.previews[2].resolve(Response.json(metadata({ title: 'Refreshed title', description: 'Refreshed description' })));
  await settle();
  assert.equal(find('[name=title]').value, 'Refreshed title');
  assert.equal(find('[name=description]').value, 'Fetched description');
});

test('editing protects existing metadata and retains saved provenance until an explicit override', async t => {
  const provenance = { fetched: { ...metadata(), image: null }, assetSource: null, overrides: { title: false, description: false, image: false } };
  delete provenance.fetched.warning;
  const { state, find, submit, input } = await editor(t, [{ ...existing, title: 'Fetched title', previewProvenance: provenance }]);
  find('#likes-board button').click();
  find('#fetch-preview').click();
  state.previews[0].resolve(Response.json(metadata({ title: 'New title', description: 'New description' })));
  await settle();
  assert.equal(find('[name=title]').value, 'Fetched title');
  assert.equal(find('[name=description]').value, 'Existing description');
  assert.equal(find('#preview-metadata-review').hidden, false);
  assert.equal(find('#preview-title').textContent, 'New title');
  assert.equal(find('#preview-description').textContent, 'New description');
  input('title', 'Owner revision');
  await submit('#save-link');
  assert.equal(state.writes[0].previewProvenance.overrides.title, true);
  assert.equal(find('#preview-metadata-review').hidden, true);
  assert.equal(find('#preview-title').textContent, '');
  find('#likes-board button').click();
  await submit('#save-link');
  assert.deepEqual(state.writes[1].previewProvenance, provenance);
});

test('pending fetch preserves explicit owner input and saves fetched provenance without payload bytes', async t => {
  const { state, find, input, submit } = await editor(t);
  input('url', 'https://example.com/');
  find('#fetch-preview').click();
  input('title', 'My title');
  input('description', ''); // Even an explicit empty edit belongs to the owner.
  state.previews[0].resolve(Response.json(metadata()));
  await settle();
  assert.equal(find('[name=title]').value, 'My title');
  assert.equal(find('[name=description]').value, '');
  await submit('#save-link');
  assert.deepEqual(state.writes[0].previewProvenance, {
    fetched: { sourceURL: 'https://example.com/', finalURL: 'https://example.com/article', fetchedAt: '2026-01-01T00:00:00Z',
      title: 'Fetched title', description: 'Fetched description', image: null },
    assetSource: null,
    overrides: { title: true, description: true, image: false },
  });
});
