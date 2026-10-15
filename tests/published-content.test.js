import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import publishedContent, { preparePublishedContent } from '../scripts/published-content.mjs';

const env = { PUBLISHING_CONTENT: 'true', PUBLISHING_POCKETBASE_URL: 'http://127.0.0.1:8090', PUBLISHING_BUILD_EMAIL: 'build@example.test', PUBLISHING_BUILD_PASSWORD: 'secret-private' };
function fixture(snapshots, asset = null) {
  return async url => new Response(url.pathname.includes('auth-with-password')
    ? JSON.stringify({ token: 'private-token', record: { collectionName: 'publishing_builds' } })
    : url.pathname === '/api/publishing/content' ? JSON.stringify(snapshots) : asset);
}
const published = { revision: 'rev1', kind: 'like', slug: 'item1', state: 'published', data: { title: 'Public note', body: 'hello', type: 'note' }, assets: [] };
test('Likes routes always prerender, independent of content mode', () => {
  const setup = publishedContent().hooks['astro:route:setup'];
  for (const component of ['src/pages/likes.astro', 'src/pages/likes/[slug].astro']) {
    const route = { component, prerender: false };
    setup({ route });
    assert.equal(route.prerender, true);
  }
  const unrelated = { component: 'src/pages/blog.astro', prerender: false };
  setup({ route: unrelated });
  assert.equal(unrelated.prerender, false);
});

test('disabled mode does not make backend requests', async () => {
  assert.deepEqual(await preparePublishedContent({}, () => { throw Error('called'); }), { content: null, files: [] });
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
test('fails closed on partial config, duplicate identities, bad state, unauthorized paths and failures', async () => {
  for (const snapshots of [[published, published], [{ ...published, state: 'draft' }], null,
    [{ ...published, assets: [{ name: 'x', path: '/api/collections/_superusers/records', sha256: 'a'.repeat(64) }] }]]) {
    await assert.rejects(preparePublishedContent(env, fixture(snapshots)), /Published content build failed/);
  }
  await assert.rejects(preparePublishedContent({ ...env, PUBLISHING_CONTENT: 'TRUE' }, fixture([])), /PUBLISHING_CONTENT must/);
  await assert.rejects(preparePublishedContent({ ...env, PUBLISHING_BUILD_PASSWORD: '' }, fixture([])), /Published content build failed/);
  await assert.rejects(preparePublishedContent(env, async () => new Response('private details', { status: 500 })), error => !error.message.includes('private details'));
});
