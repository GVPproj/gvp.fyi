import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { preparePublishedContent } from '../src/integrations/published-content.mjs';
import { currentLike } from './helpers/current-likes.js';

const env = { PUBLISHING_POCKETBASE_URL: 'http://127.0.0.1:8090', PUBLISHING_BUILD_EMAIL: 'build@example.test', PUBLISHING_BUILD_PASSWORD: 'secret-private' };
function fixture(items, asset = null) {
  return async url => {
    if (url.pathname.endsWith('auth-with-password')) return Response.json({ token: 'private-token', record: { collectionName: 'publishing_builds' } });
    if (url.pathname === '/api/publishing/current/likes') return Response.json(items);
    if (url.pathname === '/api/publishing/current/likes-assets/item1/example.pdf') return new Response(asset);
    return new Response(null, { status: 404 });
  };
}
const published = currentLike('item1', { title: 'Public note', body: 'hello', type: 'note' });

test('missing publishing credentials fail before making backend requests', async () => {
  let requests = 0;
  await assert.rejects(preparePublishedContent({}, () => { requests++; }), /Published content build failed/);
  assert.equal(requests, 0);
});

test('materializes intentional PDF downloads and verifies bytes', async () => {
  const bytes = Buffer.from('%PDF-1.7\nfixture');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const asset = { name: 'example.pdf', path: '/api/publishing/current/likes-assets/item1/example.pdf', sha256 };
  const item = { ...published, data: { ...published.data, type: '', asset: 'example.pdf' }, assets: [asset] };
  const result = await preparePublishedContent(env, fixture([item], bytes));
  assert.equal(result.content[0].assets[0].url, `/published-content/${sha256}.pdf`);
  assert.deepEqual(result.files[0].bytes, bytes);
  await assert.rejects(preparePublishedContent(env, fixture([item], Buffer.from('wrong'))), /Published content build failed/);
});

test('fails closed on duplicate identities, legacy snapshots, unauthorized paths and fetch failures', async () => {
  for (const items of [[published, published], [{ revision: 'rev1', kind: 'like', slug: 'item1', state: 'published', data: published.data, assets: [] }],
    [{ ...published, state: 'draft' }], null,
    [{ ...published, assets: [{ name: 'x', path: '/api/collections/_superusers/records', sha256: 'a'.repeat(64) }] }]]) {
    await assert.rejects(preparePublishedContent(env, fixture(items)), /Published content build failed/);
  }
  await assert.rejects(preparePublishedContent({ ...env, PUBLISHING_BUILD_PASSWORD: '' }, fixture([])), /Published content build failed/);
  await assert.rejects(preparePublishedContent(env, async () => new Response('private details', { status: 500 })), error => !error.message.includes('private details'));
});
