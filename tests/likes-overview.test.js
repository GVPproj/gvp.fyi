import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLikesAPI, MISC_COLLECTION } from '../src/lib/likes.js';

const endpoint = 'https://pb.example';
const isCollections = url => url.pathname.endsWith('/likes_collections/records');

function checkPreviewQuery(url, options) {
  assert.equal(url.pathname, '/api/collections/likes_items/records');
  assert.deepEqual(options, {}, 'Public reads never send owner authorization');
  assert.equal(url.searchParams.get('perPage'), '8');
  assert.equal(url.searchParams.get('page'), '1');
  assert.equal(url.searchParams.get('sort'), '-updated,-id');
  assert.notEqual(url.searchParams.get('skipTotal'), 'true', 'PocketBase must compute totals');
  assert.match(url.searchParams.get('filter'), /^published=true && /);
}

test('overview lists every named collection alphabetically, then Misc., with bounded previews and backend totals', async () => {
  const collections = [{ id: 'art', name: 'Art' }, { id: 'books', name: 'Books' }, { id: 'empty', name: 'Empty' }];
  const art = Array.from({ length: 8 }, (_, n) => ({ id: `art${8 - n}`, published: true,
    updated: '2026-02-02 00:00:00.000Z', created: '2026-01-01 00:00:00.000Z' }));
  const books = [{ id: 'book', published: true, created: '2026-01-01 00:00:00.000Z' }];
  const misc = [{ id: 'ungrouped', published: true, updated: '', created: '2026-01-02 00:00:00.000Z' }];
  const responses = new Map([
    ['published=true && collections.id ?= "art"', { items: art, totalItems: 123, totalPages: 16 }],
    ['published=true && collections.id ?= "books"', { items: books, totalItems: 1 }],
    ['published=true && collections.id ?= "empty"', { items: [], totalItems: 0 }],
    ['published=true && collections:length = 0', { items: misc, totalItems: 1 }],
  ]);
  const requests = [];
  const api = createLikesAPI(endpoint, async (value, options) => {
    const url = new URL(value);
    requests.push(url);
    assert.deepEqual(options, {});
    if (isCollections(url)) {
      assert.equal(url.searchParams.get('sort'), 'name,id');
      assert.equal(url.searchParams.get('perPage'), '200');
      const page = Number(url.searchParams.get('page'));
      return Response.json({ items: page === 1 ? collections.slice(0, 2) : collections.slice(2), totalPages: 2 });
    }
    checkPreviewQuery(url, options);
    const response = responses.get(url.searchParams.get('filter'));
    assert.ok(response, 'Every row is restricted to published current members');
    return Response.json(response);
  });
  assert.deepEqual(await api.listCollectionOverview(), [
    { ...collections[0], items: art, totalItems: 123, updated: art[0].updated },
    { ...collections[1], items: books, totalItems: 1, updated: books[0].created },
    { ...collections[2], items: [], totalItems: 0, updated: null },
    { id: MISC_COLLECTION, name: 'Misc.', items: misc, totalItems: 1, updated: misc[0].created },
  ]);
  assert.equal(requests.length, 6, 'Two catalog pages and one bounded request per row, never the entire item library');
});

test('empty library still has an empty Misc. row', async () => {
  assert.equal(MISC_COLLECTION, 'misc');
  const api = createLikesAPI(endpoint, async (value, options) => {
    const url = new URL(value);
    if (isCollections(url)) return Response.json({ items: [], totalPages: 0 });
    checkPreviewQuery(url, options);
    assert.equal(url.searchParams.get('filter'), 'published=true && collections:length = 0');
    return Response.json({ items: [], totalItems: 0 });
  });
  assert.deepEqual(await api.listCollectionOverview(), [
    { id: 'misc', name: 'Misc.', items: [], totalItems: 0, updated: null },
  ]);
});

test('overview uses at most four concurrent item requests and preserves catalog order on out-of-order completion', async () => {
  const collections = Array.from({ length: 10 }, (_, n) => ({ id: `group${n}`, name: `Group ${n}` }));
  const pending = [];
  let active = 0, peak = 0, count = 0;
  const api = createLikesAPI(endpoint, async (value, options) => {
    const url = new URL(value);
    if (isCollections(url)) return Response.json({ items: collections, totalPages: 1 });
    checkPreviewQuery(url, options);
    active++;
    count++;
    peak = Math.max(peak, active);
    await new Promise(resolve => pending.push(resolve));
    active--;
    return Response.json({ items: [], totalItems: 0 });
  });
  const overview = api.listCollectionOverview();
  // Resolve each batch in reverse order; workers must keep their row indexes.
  const tick = () => new Promise(resolve => setImmediate(resolve));
  await tick();
  assert.equal(active, 4);
  while (pending.length) {
    for (const resolve of pending.splice(0).reverse()) resolve();
    await tick();
  }
  assert.deepEqual((await overview).map(row => row.id), [...collections.map(row => row.id), MISC_COLLECTION]);
  assert.equal(peak, 4);
  assert.equal(count, 11);
});

test('overview never exposes more than eight previews even if a response exceeds the requested bound', async () => {
  const items = Array.from({ length: 9 }, (_, n) => ({ id: String(n), updated: `date${n}` }));
  const api = createLikesAPI(endpoint, async value => Response.json(isCollections(new URL(value))
    ? { items: [], totalPages: 0 } : { items, totalItems: 99 }));
  const [row] = await api.listCollectionOverview();
  assert.deepEqual(row.items, items.slice(0, 8));
  assert.equal(row.updated, items[0].updated);
  assert.equal(row.totalItems, 99);
});

test('Misc. pages share the published empty-membership filter without changing saved-order pagination', async () => {
  const requests = [];
  const api = createLikesAPI(endpoint, async (value, options) => {
    assert.deepEqual(options, {});
    requests.push(new URL(value));
    return Response.json({ items: [] });
  });
  const cursor = { created: '2026-01-01 00:00:00.000Z', id: 'item' };
  assert.deepEqual(await api.listPage({ collection: MISC_COLLECTION, cursor }), { items: [], nextCursor: null });
  assert.equal(requests[0].searchParams.get('filter'),
    'published=true && collections:length = 0 && (created < "2026-01-01 00:00:00.000Z" || (created = "2026-01-01 00:00:00.000Z" && id < "item"))');
  for (const collection of ['', 'reading', 'miscellaneous', '" || published=false || id="']) {
    await api.listPage({ collection });
    assert.equal(requests.at(-1).searchParams.get('filter'),
      `published=true${collection ? ` && collections.id ?= ${JSON.stringify(collection)}` : ''}`);
  }
  for (const url of requests) {
    assert.equal(url.searchParams.get('sort'), '-created,-id');
    assert.equal(url.searchParams.get('perPage'), '25');
    assert.equal(url.searchParams.get('skipTotal'), 'true');
  }
});

test('overview rejects catalog and preview failures rather than returning misleading empty or partial rows', async t => {
  for (const stage of ['catalog', 'preview']) {
    for (const failure of ['network', 400, 403, 500]) {
      await t.test(`${stage}: ${failure}`, async () => {
        const api = createLikesAPI(endpoint, async value => {
          if (stage === 'preview' && isCollections(new URL(value))) {
            return Response.json({ items: [{ id: 'reading', name: 'Reading' }], totalPages: 1 });
          }
          if (failure === 'network') throw new Error('offline');
          return Response.json({}, { status: failure });
        });
        const message = failure === 'network' ? /Cannot reach Likes/ : failure === 400 ? /Check your credentials/ :
          failure === 403 ? /Sign in/ : /could not complete/;
        await assert.rejects(api.listCollectionOverview(), message);
      });
    }
  }
  await assert.rejects(createLikesAPI('').listCollectionOverview(), /not configured/);
});
