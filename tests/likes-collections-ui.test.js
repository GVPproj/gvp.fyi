import { test } from 'node:test';
import assert from 'node:assert/strict';
import { likesBrowser, settle } from './helpers/likes-browser.js';

test('owner manages collections and optional memberships without deleting items', async t => {
  const { document, window } = await likesBrowser(t);
  let groups = [], records = [{ ...items[0] }], deletionCount = 0, fail = false;
  globalThis.fetch = async (url, options) => {
    if (url.includes('auth-with-password')) return Response.json({ token: 'owner', record: { id: 'likesowner00001', collectionName: 'likes_owners' } });
    if (new URL(url).pathname === '/api/likes/duplicates' && options.method === 'POST') return Response.json({ items: [] });
    const isGroup = url.includes('likes_collections');
    if (options.method) {
      assert.equal(options.headers.Authorization, 'owner');
      if (fail) return new Response(null, { status: 403 });
      if (isGroup && options.method === 'DELETE') {
        deletionCount++;
        groups = groups.filter(g => !url.endsWith(g.id));
        records = records.map(item => ({ ...item, collections: item.collections.filter(id => groups.some(g => g.id === id)) }));
        return new Response(null, { status: 204 });
      }
      const data = JSON.parse(options.body);
      if (isGroup) {
        const group = { id: options.method === 'PATCH' ? url.split('/').at(-1) : `collection0000${groups.length + 1}`, ...data };
        groups = [...groups.filter(g => g.id !== group.id), group];
        return Response.json(group);
      }
      records = [{ ...records[0], ...data }];
      return Response.json(records[0]);
    }
    return Response.json({ items: isGroup ? groups.toSorted((a, b) => a.name.localeCompare(b.name)) : new URL(url).searchParams.get('filter') === 'published=false' ? [] : records, totalPages: 1 });
  };
  await import('../src/scripts/likes.js?collections-owner');
  document.dispatchEvent(new window.Event('astro:page-load'));
  await settle();
  const submit = async form => { form.dispatchEvent(new window.Event('submit', { cancelable: true })); await settle(); };
  assert.equal(document.querySelector('#collection-tools').hidden, true);
  await submit(document.querySelector('#owner-login'));
  assert.equal(document.querySelector('#collection-tools').hidden, false);
  const create = document.querySelector('#create-collection');
  for (const name of ['Reading', 'Research']) {
    create.querySelector('input').value = name;
    await submit(create);
  }
  document.querySelector('#likes-board button').click();
  const save = document.querySelector('#save-link');
  for (const input of save.querySelectorAll('[name=collections]')) { input.checked = true; input.dispatchEvent(new window.Event('change')); }
  await submit(save);
  assert.deepEqual(records[0].collections, ['collection00001', 'collection00002']);
  document.querySelector('#collection-filters [data-collection="collection00001"]').click();
  const shareURL = window.location.href;
  const rename = document.querySelector('#collection-list form');
  rename.querySelector('input').value = 'Renamed';
  fail = true;
  await submit(rename);
  assert.equal(rename.querySelector('input').value, 'Renamed');
  assert.match(document.querySelector('#collection-status').textContent, /owner/);
  fail = false;
  await submit(rename);
  assert.equal(window.location.href, shareURL);
  assert.equal(document.querySelector('#collection-filters [aria-current]').textContent, 'Renamed');
  assert.equal(document.querySelectorAll('#likes-board li').length, 1);
  const row = document.querySelector('#collection-list li');
  row.querySelector('[data-delete]').click();
  assert.equal(deletionCount, 0);
  row.querySelector('[data-cancel]').click();
  assert.equal(deletionCount, 0);
  row.querySelector('[data-delete]').click();
  row.querySelector('[data-confirm]').click();
  await settle();
  assert.equal(deletionCount, 1);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].collections, ['collection00002']);
  assert.match(document.querySelector('#read-status').textContent, /collection is unavailable/);
  document.querySelector('#collection-filters [data-collection=""]').click();
  await settle();
  document.querySelector('#likes-board button').click();
  const remaining = save.querySelector('[name=collections]');
  assert.equal(remaining.checked, true);
  remaining.checked = false;
  remaining.dispatchEvent(new window.Event('change'));
  await submit(save);
  assert.deepEqual(records[0].collections, []);
  document.querySelector('#sign-out').click();
  assert.equal(document.querySelector('#collection-tools').hidden, true);
});

test('creating a collection during the initial read replaces the superseded read', async t => {
  const { document, window } = await likesBrowser(t);
  let finishInitialRead, reads = 0, groups = [];
  globalThis.fetch = async (url, options) => {
    if (url.includes('auth-with-password')) return Response.json({ token: 'owner', record: { id: 'likesowner00001', collectionName: 'likes_owners' } });
    if (new URL(url).pathname === '/api/likes/duplicates' && options.method === 'POST') return Response.json({ items: [] });
    if (url.includes('likes_collections')) {
      if (options.method === 'POST') {
        groups = [{ id: 'collection00001', name: JSON.parse(options.body).name }];
        return Response.json(groups[0]);
      }
      return Response.json({ items: groups, totalPages: 1 });
    }
    if (new URL(url).searchParams.get('filter') === 'published=false') return Response.json({ items: [], totalPages: 1 });
    if (++reads === 1) return new Promise(resolve => { finishInitialRead = resolve; });
    return Response.json({ items, totalPages: 1 });
  };
  await import('../src/scripts/likes.js?collections-loading');
  document.dispatchEvent(new window.Event('astro:page-load'));
  const submit = async form => { form.dispatchEvent(new window.Event('submit', { cancelable: true })); await settle(); };
  await submit(document.querySelector('#owner-login'));
  document.querySelector('#create-collection input').value = 'New collection';
  await submit(document.querySelector('#create-collection'));
  finishInitialRead(Response.json({ items: [], totalPages: 1 }));
  await settle();
  assert.equal(document.querySelectorAll('#likes-board li').length, 3);
  assert.equal(document.querySelector('#read-status').textContent, 'All likes loaded.');
  assert.equal(document.querySelector('#collection-filters [data-collection="collection00001"]').textContent, 'New collection');
});

const collections = [{ id: 'collection00001', name: 'Reading' }, { id: 'collection00002', name: 'Research' }];
const items = [
  { id: 'item00000000003', title: 'Ungrouped', published: true, collections: [] },
  { id: 'item00000000002', title: 'Both', published: true, collections: collections.map(c => c.id) },
  { id: 'item00000000001', title: 'Reading only', published: true, collections: [collections[0].id] },
].map(item => ({ ...item, url: 'https://example.com', description: '' }));

test('direct collection URLs, All, and browser navigation retain saved ordering and multiple memberships', async t => {
  const { document, window } = await likesBrowser(t, 'https://site.example/likes?collection=collection00001');
  let offline = false;
  globalThis.fetch = async url => {
    if (offline) throw new Error('offline');
    return Response.json({ items: url.includes('likes_collections') ? collections : items, totalPages: 1 });
  };
  await import('../src/scripts/likes.js?collections-filter');
  document.dispatchEvent(new window.Event('astro:page-load'));
  await settle();
  const titles = () => [...document.querySelectorAll('#likes-board h2')].map(el => el.textContent);
  assert.deepEqual(titles(), ['Both', 'Reading only']);
  const filter = id => document.querySelector(`#collection-filters a[data-collection="${id}"]`);
  assert.equal(new URL(filter('collection00002').href).searchParams.get('collection'), 'collection00002');
  filter('collection00002').click();
  await settle();
  assert.deepEqual(titles(), ['Both']);
  assert.equal(window.location.search, '?collection=collection00002');
  filter('').click();
  await settle();
  assert.deepEqual(titles(), ['Ungrouped', 'Both', 'Reading only']);
  assert.equal(window.location.search, '');
  window.history.back();
  await settle();
  assert.deepEqual(titles(), ['Both']);
  window.history.back();
  await settle();
  assert.deepEqual(titles(), ['Both', 'Reading only']);
  window.history.forward();
  await settle();
  assert.deepEqual(titles(), ['Both']);
  window.history.pushState(null, '', '?collection=deleted');
  window.dispatchEvent(new window.Event('popstate'));
  await settle();
  assert.deepEqual(titles(), []);
  assert.match(document.querySelector('#read-status').textContent, /collection.*(unavailable|not found)/i);
  filter('').click();
  await settle();
  assert.deepEqual(titles(), ['Ungrouped', 'Both', 'Reading only']);
  offline = true;
  document.querySelector('#retry-read').click();
  await settle();
  assert.match(document.querySelector('#read-status').textContent, /Cannot reach Likes/);
  filter('collection00002').click();
  await settle();
  assert.deepEqual(titles(), []);
  assert.match(document.querySelector('#read-status').textContent, /Cannot reach Likes/);
  window.history.back();
  await settle();
  assert.match(document.querySelector('#read-status').textContent, /Cannot reach Likes/);
  offline = false;
  document.querySelector('#retry-read').click();
  await settle();
  assert.equal(document.querySelector('#read-status').textContent, 'All likes loaded.');
});
