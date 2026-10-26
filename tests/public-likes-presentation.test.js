import { test } from 'node:test';
import assert from 'node:assert/strict';
import { likeAssetKind, likeItemTitle, likesItemURL, webURL } from '../src/lib/likes.js';
import { collectionRows } from '../src/lib/likes-presentation.ts';

test('Likes destinations accept only credential-free web URLs', () => {
  assert.equal(webURL('https://example.com/path'), 'https://example.com/path');
  for (const value of ['', null, 'javascript:alert(1)', 'data:text/html,test', 'https://user:secret@example.com']) {
    assert.equal(webURL(value), null);
  }
});

test('public titles consistently cover links, images, PDFs, notes and quotes', () => {
  assert.equal(likeItemTitle({ title: 'Saved title', type: 'quote' }), 'Saved title');
  assert.equal(likeItemTitle({ type: 'quote' }), 'Quote');
  assert.equal(likeItemTitle({ type: 'note' }), 'Personal note');
  assert.equal(likeItemTitle({ asset: 'document.PDF' }), 'PDF document');
  assert.equal(likeItemTitle({ asset: 'image.png' }), 'Image');
  assert.equal(likeItemTitle({ url: 'https://example.com' }), 'Link');
});

test('asset classification retains source filename fallback for unmaterialized items', () => {
  assert.equal(likeAssetKind({ asset: 'document.PDF' }), 'pdf');
  assert.equal(likeAssetKind({ asset: 'image.png' }), 'image');
  assert.equal(likeAssetKind({}), null);
});

for (const { asset, url, kind, title } of [
  { asset: 'scan.png', url: '/published-assets/verified.pdf', kind: 'pdf', title: 'PDF document' },
  { asset: 'document.pdf', url: '/published-assets/verified.png', kind: 'image', title: 'Image' },
  { asset: undefined, url: '/published-assets/verified.pdf', kind: 'pdf', title: 'PDF document' },
]) {
  test(`materialized ${kind} overrides source filename ${asset} in titles and rows`, () => {
    const item = { id: 'media1', asset, publishedAsset: { url } };
    assert.equal(likeAssetKind(item), kind);
    assert.equal(likeItemTitle(item), title);
    assert.equal(likeItemTitle({ ...item, title: 'Saved title' }), 'Saved title');
    const [row] = collectionRows([{ id: 'all', name: 'Likes', items: [item], totalItems: 1 }]);
    assert.equal(row.items[0].title, title);
    if (kind === 'pdf') {
      assert.equal(row.items[0].image, undefined);
      assert.equal(row.items[0].label, 'PDF document');
    } else {
      assert.equal(row.items[0].image.src, url);
      assert.equal(row.items[0].label, 'Link unavailable');
    }
  });
}

test('public item URLs use only the stable record ID as an encoded path segment', () => {
  assert.equal(likesItemURL({ id: 'item00000000001', title: 'Mutable title', url: 'https://example.com' }), '/likes/item00000000001');
  assert.equal(likesItemURL({ id: 'a/b?c#d &"' }), '/likes/a%2Fb%3Fc%23d%20%26%22');
});
