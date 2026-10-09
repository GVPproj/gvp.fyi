import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLikesAPI, likeItemTitle, likesItemURL } from '../src/lib/likes.js';

test('published item lookup is a single bounded anonymous records query', async () => {
  const item = { id: 'item00000000001', published: true, title: 'A find' };
  const requests = [];
  const api = createLikesAPI('https://pb.example', async (url, options) => {
    requests.push({ url: new URL(url), options });
    return Response.json({ items: [item], totalPages: 100 });
  });
  assert.deepEqual(await api.getPublishedItem(item.id), item);
  assert.equal(requests.length, 1, 'never enumerate other records or pages');
  const { url, options } = requests[0];
  assert.equal(url.pathname, '/api/collections/likes_items/records');
  assert.equal(url.searchParams.get('filter'), 'published=true && id="item00000000001"');
  assert.equal(url.searchParams.get('perPage'), '1');
  assert.equal(url.searchParams.get('skipTotal'), 'true');
  assert.equal(options.headers, undefined);
  assert.equal(options.method, undefined, 'use the default GET');
  assert.equal(options.body, undefined);
});

test('IDs are JSON escaped in the filter, never interpolated as query syntax or a record path', async () => {
  const id = 'id" || published=false || id="\\\n&perPage=200#';
  const api = createLikesAPI('https://pb.example', async (value, options) => {
    const url = new URL(value);
    assert.equal(url.pathname, '/api/collections/likes_items/records');
    assert.equal(url.searchParams.get('filter'), `published=true && id=${JSON.stringify(id)}`);
    assert.equal(url.searchParams.get('perPage'), '1');
    assert.equal(url.searchParams.getAll('perPage').length, 1);
    assert.equal(url.hash, '');
    assert.equal(options.headers, undefined);
    return Response.json({ items: [] });
  });
  assert.equal(await api.getPublishedItem(id), null);
});

test('missing, draft, wrong-ID and non-boolean publication results are never exposed', async () => {
  for (const items of [
    [],
    [{ id: 'wanted', published: false, body: 'PRIVATE' }],
    [{ id: 'other', published: true }],
    [{ id: 'wanted' }],
    [{ id: 'wanted', published: 'true' }],
    [{ id: 'wanted', published: 1 }],
    [null],
  ]) {
    const api = createLikesAPI('https://pb.example', async () => Response.json({ items }));
    assert.equal(await api.getPublishedItem('wanted'), null);
  }
});

test('lookup does not search beyond the bounded first result when the backend ignores the filter', async () => {
  const api = createLikesAPI('https://pb.example', async () => Response.json({ items: [
    { id: 'other', published: true }, { id: 'wanted', published: true },
  ] }));
  assert.equal(await api.getPublishedItem('wanted'), null);
});

test('missing IDs cannot accidentally fetch a published record', async () => {
  const api = createLikesAPI('https://pb.example', () => assert.fail('no lookup without an ID'));
  for (const id of [undefined, null, '', 123]) assert.equal(await api.getPublishedItem(id), null);
});

test('backend failures reject rather than masquerading as missing items', async () => {
  for (const status of [400, 401, 403, 404, 429, 500, 503]) {
    const api = createLikesAPI('https://pb.example', async () => Response.json({ message: 'PRIVATE diagnostic' }, { status }));
    await assert.rejects(api.getPublishedItem('wanted'), error => {
      assert.doesNotMatch(error.message, /PRIVATE diagnostic/);
      return true;
    });
  }
  await assert.rejects(createLikesAPI('').getPublishedItem('wanted'), /not configured/);
  await assert.rejects(createLikesAPI('https://pb.example', async () => {
    throw new Error('PRIVATE network diagnostic');
  }).getPublishedItem('wanted'), /connection/);
  await assert.rejects(createLikesAPI('https://pb.example', async () => new Response('not JSON')).getPublishedItem('wanted'));
  await assert.rejects(createLikesAPI('https://pb.example', async () => Response.json({})).getPublishedItem('wanted'));
});

test('public titles consistently cover links, images, PDFs, notes and quotes', () => {
  assert.equal(likeItemTitle({ title: 'Saved title', type: 'quote' }), 'Saved title');
  assert.equal(likeItemTitle({ type: 'quote' }), 'Quote');
  assert.equal(likeItemTitle({ type: 'note' }), 'Personal note');
  assert.equal(likeItemTitle({ asset: 'document.PDF' }), 'PDF document');
  assert.equal(likeItemTitle({ asset: 'image.png' }), 'Image');
  assert.equal(likeItemTitle({ url: 'https://example.com' }), 'Link');
});

test('public item URLs use only the stable record ID as an encoded path segment', () => {
  assert.equal(likesItemURL({ id: 'item00000000001', title: 'Mutable title', url: 'https://example.com' }), '/likes/item00000000001');
  assert.equal(likesItemURL({ id: 'a/b?c#d &"' }), '/likes/a%2Fb%3Fc%23d%20%26%22');
});
