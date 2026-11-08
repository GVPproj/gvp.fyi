import { test } from 'node:test';
import assert from 'node:assert/strict';
import { likeAssetKind, likeItemTitle, likesItemURL, webURL } from '../src/lib/likes.js';

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
  assert.equal(likeItemTitle({ media: { url: 'document.PDF' } }), 'PDF document');
  assert.equal(likeItemTitle({ media: { url: 'image.png' } }), 'Image');
  assert.equal(likeItemTitle({ url: 'https://example.com' }), 'Link');
});

test('asset classification uses the media URL', () => {
  assert.equal(likeAssetKind({ media: { url: 'document.PDF' } }), 'pdf');
  assert.equal(likeAssetKind({ media: { url: 'image.png' } }), 'image');
  assert.equal(likeAssetKind({}), null);
});

test('public item URLs use the readable slug and encode path segments', () => {
  assert.equal(likesItemURL({ slug: 'mutable-title' }), '/likes/mutable-title');
  assert.equal(likesItemURL({ slug: 'stable-slug', title: 'Mutable title', url: 'https://example.com' }), '/likes/stable-slug');
  assert.equal(likesItemURL({ slug: 'a/b?c#d &"' }), '/likes/a%2Fb%3Fc%23d%20%26%22');
});
