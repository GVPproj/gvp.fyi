import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { preparePublishedContent } from '../src/integrations/published-content.mjs';

const env = { PUBLISHING_POCKETBASE_URL: 'http://127.0.0.1:8090', PUBLISHING_BUILD_EMAIL: 'build@example.test', PUBLISHING_BUILD_PASSWORD: 'secret-private' };
function fixture(snapshots, asset = null) {
  return async url => new Response(url.pathname.includes('auth-with-password')
    ? JSON.stringify({ token: 'private-token', record: { collectionName: 'publishing_builds' } })
    : url.pathname === '/api/publishing/content' ? JSON.stringify(snapshots) : asset);
}
const published = { revision: 'rev1', kind: 'like', slug: 'item1', state: 'published', data: { title: 'Public note', body: 'hello', type: 'note' }, assets: [] };
test('missing publishing credentials fail before making backend requests', async () => {
  let requests = 0;
  await assert.rejects(preparePublishedContent({}, () => { requests++; }), /Published content build failed/);
  assert.equal(requests, 0);
});

test('ignores legacy settings payloads and assets without fetching them', async () => {
  const requests = [];
  const snapshots = [published, { revision: 'settings1', kind: 'settings', slug: 'site', state: 'published',
    data: { url: 'javascript:unused()' },
    assets: [{ name: 'missing.png', path: '/api/publishing/content-assets/settings1/missing.png', sha256: 'a'.repeat(64) }] }];
  const respond = fixture(snapshots);
  const result = await preparePublishedContent(env, url => {
    requests.push(url.pathname);
    return respond(url);
  });
  assert.deepEqual(result.content, [published]);
  assert.deepEqual(result.files, []);
  assert.deepEqual(requests, ['/api/collections/publishing_builds/auth-with-password', '/api/publishing/content']);
});
test('materializes only explicit snapshot projection, retaining withdrawals', async () => {
  const result = await preparePublishedContent(env, fixture([{ ...published, privateToken: 'must-not-leak' }, { revision: 'rev2', kind: 'like', slug: 'item2', state: 'unpublished', data: { secret: 'draft' } }]));
  assert.equal(result.content.length, 2);
  assert.ok(!JSON.stringify(result).includes('must-not-leak'));
  assert.ok(!JSON.stringify(result).includes('draft'));
});
test('materializes intentional PDF downloads and verifies bytes', async () => {
  const bytes = Buffer.from('%PDF-1.7\nfixture');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const asset = { name: 'example.pdf', path: '/api/publishing/content-assets/rev1/example.pdf', sha256 };
  const result = await preparePublishedContent(env, fixture([{ ...published, assets: [asset] }], bytes));
  assert.equal(result.content[0].assets[0].url, `/published-content/${sha256}.pdf`);
  assert.deepEqual(result.files[0].bytes, bytes);
  await assert.rejects(preparePublishedContent(env, fixture([{ ...published, assets: [asset] }], Buffer.from('wrong'))), /Published content build failed/);
});
test('fails closed on partial config, duplicate identities, unsupported kinds, bad state, unauthorized paths and failures', async () => {
  for (const snapshots of [[published, published], [{ ...published, kind: 'blog' }],
    [{ ...published, kind: 'unknown' }], [{ ...published, state: 'draft' }], null,
    [{ ...published, assets: [{ name: 'x', path: '/api/collections/_superusers/records', sha256: 'a'.repeat(64) }] }]]) {
    await assert.rejects(preparePublishedContent(env, fixture(snapshots)), /Published content build failed/);
  }
  await assert.rejects(preparePublishedContent({ ...env, PUBLISHING_BUILD_PASSWORD: '' }, fixture([])), /Published content build failed/);
  await assert.rejects(preparePublishedContent(env, async () => new Response('private details', { status: 500 })), error => !error.message.includes('private details'));
});
