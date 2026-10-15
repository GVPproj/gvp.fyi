import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDevLikes } from '../scripts/dev-likes.mjs';

const env = { PUBLIC_POCKETBASE_URL: 'https://pb.example' };
test('dev loads every public Likes page without credentials and projects collection membership', async () => {
  const calls = [];
  const result = await loadDevLikes(env, 'dev', async (url, options) => {
    const query = new URL(url).searchParams;
    calls.push(query.get('page'));
    assert.equal(query.get('filter'), 'published=true');
    assert.equal(query.get('expand'), 'collections');
    assert.equal(options.headers, undefined);
    return Response.json({ totalPages: 2, items: [{ id: `item${query.get('page')}`, published: true,
      title: 'Public', asset: 'image.png', privateField: 'not projected',
      expand: { collections: [{ id: 'group1', name: 'Reading', privateField: 'not projected' }] } },
    { id: 'draft', published: false }] });
  });
  assert.deepEqual(calls, ['1', '2']);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].data.collections, [{ id: 'group1', name: 'Reading' }]);
  assert.equal(result[0].assets[0].url, 'https://pb.example/api/files/likes_items/item1/image.png');
  assert.doesNotMatch(JSON.stringify(result), /not projected|draft/);
});
test('builds and configured publishing never use the dev fallback', async () => {
  const never = () => assert.fail('unexpected fetch');
  for (const command of ['build', 'preview']) assert.deepEqual(await loadDevLikes(env, command, never), []);
  assert.deepEqual(await loadDevLikes({ ...env, PUBLISHING_CONTENT: 'true' }, 'dev', never), []);
  assert.deepEqual(await loadDevLikes({}, 'dev', never), []);
});
test('dev fetch failures are explicit and do not expose backend diagnostics', async () => {
  await assert.rejects(loadDevLikes(env, 'dev', async () => new Response('private', { status: 500 })), /Development Likes fetch failed/);
});
