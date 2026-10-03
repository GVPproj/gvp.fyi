import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLikesAPI } from '../src/lib/likes.js';

test('public pages are bounded, credential-free and use an exclusive saved-time/ID cursor', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ id: String(99 - i), created: '2026-01-01 00:00:00.000Z' }));
  const requests = [];
  const api = createLikesAPI('https://pb.example', async (url, options) => {
    requests.push(new URL(url));
    assert.equal(options.headers, undefined);
    return Response.json({ items: requests.length === 1 ? rows : [rows[24]] });
  });
  const first = await api.listPage({ collection: 'reading' });
  assert.equal(first.items.length, 24);
  assert.deepEqual(first.nextCursor, { created: rows[23].created, id: '76' });
  const last = await api.listPage({ collection: 'reading', cursor: first.nextCursor });
  assert.deepEqual(last.items.map(item => item.id), ['75']);
  assert.equal(last.nextCursor, null);
  assert.equal(requests[0].searchParams.get('perPage'), '25');
  assert.equal(requests[0].searchParams.get('skipTotal'), 'true');
  assert.equal(requests[0].searchParams.get('sort'), '-created,-id');
  assert.equal(requests[0].searchParams.get('filter'), 'published=true && collections.id ?= "reading"');
  assert.equal(requests[1].searchParams.get('filter'), 'published=true && collections.id ?= "reading" && (created < "2026-01-01 00:00:00.000Z" || (created = "2026-01-01 00:00:00.000Z" && id < "76"))');
});
