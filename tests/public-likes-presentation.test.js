import { test } from 'node:test';
import assert from 'node:assert/strict';
import { likeItemTitle, likesItemURL, webURL } from '../src/lib/likes.js';

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

test('public item URLs use only the stable record ID as an encoded path segment', () => {
  assert.equal(likesItemURL({ id: 'item00000000001', title: 'Mutable title', url: 'https://example.com' }), '/likes/item00000000001');
  assert.equal(likesItemURL({ id: 'a/b?c#d &"' }), '/likes/a%2Fb%3Fc%23d%20%26%22');
});
