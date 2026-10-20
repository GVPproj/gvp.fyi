import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedEntries, materializeSoftware } from '../src/lib/editorial-source.js';

test('published content excludes withdrawals, resolves renamed uploads and fails closed', () => {
  assert.deepEqual(publishedEntries([], 'software'), []);
  assert.deepEqual(publishedEntries([{ kind: 'software', slug: 'gone', state: 'unpublished' }], 'software'), []);
  const entry = { slug: 'example', data: { screenshot: '/images/original.png', assetNames: { 'original.png': 'original_random.png' }, gallery: [] }, assets: [{ name: 'original_random.png', url: '/published-content/hash.png' }] };
  assert.equal(materializeSoftware(entry).screenshot, '/published-content/hash.png');
  assert.throws(() => materializeSoftware({ ...entry, assets: [] }), /Missing software asset/);
});
