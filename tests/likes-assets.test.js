import assert from 'node:assert/strict';
import test from 'node:test';
import { createLikesAPI } from '../src/lib/likes.js';

test('upload validation provides supported formats and size limits before sending bytes', () => {
  const api = createLikesAPI('https://pb.example', () => assert.fail('invalid upload must not be sent'));
  for (const asset of [new File([], 'empty.png', { type: 'image/png' }), new File(['bad'], 'script.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })]) {
    assert.throws(() => api.save('owner', { title: 'Invalid', asset }), /JPEG.*PNG.*GIF.*WebP.*PDF.*10 MiB/);
  }
});

test('server upload validation failures expose field messages rather than generic credential errors', async () => {
  const api = createLikesAPI('https://pb.example', async () => Response.json({ data: {
    asset: { message: 'File exceeds the maximum allowed size.' },
  } }, { status: 400 }));
  await assert.rejects(api.save('owner', { title: 'Image', asset: new File(['x'], 'a.png', { type: 'image/png' }) }), /asset: File exceeds/);
});

test('standalone upload saves the file and item together through the HTTP boundary', async () => {
  const api = createLikesAPI('https://pb.example', async (url, options) => {
    assert.equal(url, 'https://pb.example/api/collections/likes_items/records');
    assert.equal(options.headers.Authorization, 'owner-token');
    assert.equal(options.headers['Content-Type'], undefined, 'browser supplies multipart boundary');
    assert.ok(options.body instanceof FormData);
    assert.equal(options.body.get('asset').name, 'picture.png');
    assert.equal(options.body.get('url'), '');
    assert.equal(options.body.get('title'), 'Picture');
    assert.equal(options.body.get('published'), 'false');
    assert.equal(options.body.get('collections'), '["collection00001"]');
    return Response.json({ id: 'item00000000001', asset: 'picture_abc.png', published: false });
  });
  const item = await api.save('owner-token', { title: ' Picture ', url: '', published: false,
    asset: new File(['image'], 'picture.png', { type: 'image/png' }), collections: ['collection00001'] });
  assert.equal(item.asset, 'picture_abc.png');
});
