import assert from 'node:assert/strict';
import test from 'node:test';
import { createLikesAPI } from '../src/lib/likes.js';

test('owner requests a preview without creating or saving an item', async () => {
  const fixture = { sourceURL: 'https://example.com/', finalURL: 'https://example.com/',
    fetchedAt: '2026-10-01T00:00:00Z', title: 'A useful title', description: '', image: null, warning: '' };
  const api = createLikesAPI('https://pb.example', async (url, options) => {
    assert.equal(url, 'https://pb.example/api/likes/preview');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'owner-token');
    assert.deepEqual(JSON.parse(options.body), { url: 'https://example.com/' });
    return Response.json(fixture);
  });
  assert.deepEqual(await api.preview('owner-token', 'https://example.com'), fixture);
});

test('preview rejects credentials and unsupported schemes before making a request', () => {
  const api = createLikesAPI('https://pb.example', () => assert.fail('must not send unsafe URL'));
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:pass@example.com/']) {
    assert.throws(() => api.preview('owner', url), /http.*without credentials/);
  }
});

test('preview rate limits give actionable feedback without preventing a subsequent manual save', async () => {
  const api = createLikesAPI('https://pb.example', async url => url.endsWith('/preview')
    ? Response.json({}, { status: 429 }) : Response.json({ id: 'manual000000001', title: 'Manual title' }));
  await assert.rejects(api.preview('owner', 'https://example.com'), /Too many preview requests.*manually/);
  assert.equal((await api.save('owner', { url: 'https://example.com', title: 'Manual title' })).title, 'Manual title');
});

test('saving reviewed metadata preserves fetched provenance separately from owner overrides, with and without an image', async () => {
  const previewProvenance = { fetched: { sourceURL: 'https://example.com/', finalURL: 'https://example.com/page',
    fetchedAt: '2026-10-01T00:00:00Z', title: 'Fetched title', description: 'Fetched summary', image: null },
    overrides: { title: true, description: false, image: false } };
  for (const asset of [undefined, new File(['image'], 'preview.png', { type: 'image/png' })]) {
    const api = createLikesAPI('https://pb.example', async (url, options) => {
      assert.equal(url, 'https://pb.example/api/collections/likes_items/records');
      const fields = asset ? Object.fromEntries(options.body) : JSON.parse(options.body);
      assert.equal(fields.title, 'Owner title');
      assert.deepEqual(asset ? JSON.parse(fields.previewProvenance) : fields.previewProvenance, previewProvenance);
      if (asset) assert.equal(fields.asset.name, 'preview.png');
      return Response.json({ id: 'item00000000001', ...fields });
    });
    await api.save('owner', { url: 'https://example.com/', title: 'Owner title',
      description: 'Fetched summary', previewProvenance, asset });
  }
});
