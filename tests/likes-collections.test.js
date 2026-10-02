import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLikesAPI } from '../src/lib/likes.js';

test('saving allows multiple memberships, removing all, or leaving existing memberships unchanged', async () => {
  const bodies = [];
  const api = createLikesAPI('https://pb.example', async (_, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    return Response.json({ id: 'item00000000001', ...body });
  });
  const data = { url: 'https://example.com', title: 'Find' };
  await api.save('owner', { ...data, collections: ['collection00001', 'collection00002'] });
  await api.save('owner', { ...data, collections: [] }, 'item00000000001');
  await api.save('owner', data, 'item00000000001');
  assert.deepEqual(bodies[0].collections, ['collection00001', 'collection00002']);
  assert.deepEqual(bodies[1].collections, []);
  assert.equal(Object.hasOwn(bodies[2], 'collections'), false);
});

test('owner creates, renames and deletes stable named collections; public listing includes every page', async () => {
  const requests = [];
  const api = createLikesAPI('https://pb.example', async (url, options) => {
    requests.push([new URL(url), options]);
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    if (options.method) return Response.json({ id: 'collection00001', ...JSON.parse(options.body) });
    return Response.json({ items: [{ id: `collection0000${requests.length}` }], totalPages: 2 });
  });
  assert.deepEqual(await api.listCollections(), [{ id: 'collection00001' }, { id: 'collection00002' }]);
  assert.equal(requests[0][1].headers, undefined);
  assert.equal(requests[1][0].searchParams.get('page'), '2');
  const created = await api.saveCollection('owner', ' Reading ');
  assert.equal(created.name, 'Reading');
  const renamed = await api.saveCollection('owner', 'Research', created.id);
  assert.equal(renamed.id, created.id);
  assert.equal(renamed.name, 'Research');
  await api.removeCollection('owner', created.id);
  for (const [url, options] of requests.slice(2)) {
    assert.match(url.pathname, /\/collections\/likes_collections\/records/);
    assert.equal(options.headers.Authorization, 'owner');
  }
  assert.equal(requests[3][1].method, 'PATCH');
  assert.equal(requests[4][1].method, 'DELETE');
  assert.throws(() => api.saveCollection('owner', '  '), /name/i);
});
