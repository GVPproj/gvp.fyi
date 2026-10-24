import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import sharp from 'sharp';
import { preparePublishedRelease } from '../src/integrations/published-release.mjs';

test('release builds require CMS configuration', async () => {
  await assert.rejects(preparePublishedRelease({}), /Incomplete publishing configuration/);
});

test('fixture catalogue projects metadata and artwork, normalizes empty tracks and excludes withdrawals without fallback', async t => {
  const artwork = await sharp({ create: { width: 24, height: 16, channels: 3, background: '#123456' } }).jpeg().toBuffer();
  const snapshot = tracks => ({
    revision: 'fixture-revision',
    release: { slug: 'catalogue-b', title: 'Catalogue B', artist: 'Artist', release_date: '2020', about: null,
      category: 'other-credits', credit: 'Mixing', display_title: 'Display', album_id: 123,
      art_id: 456, youtube_video_id: 'abc123', player_height: 400, artwork_url: 'https://example.test/private.jpg', tracks },
    artwork: { path: '/api/publishing/artwork/fixture-revision', width: 24, height: 16,
      sha256: createHash('sha256').update(artwork).digest('hex') },
  });
  let catalogue = [];
  const server = createServer((req, res) => {
    if (req.url === '/api/collections/publishing_builds/auth-with-password') {
      res.end(JSON.stringify({ token: 'fixture-token', record: { collectionName: 'publishing_builds' } }));
    } else if (req.headers.authorization !== 'fixture-token') {
      res.writeHead(403).end('{}');
    } else if (req.url === '/api/publishing/releases') {
      res.end(JSON.stringify(catalogue));
    } else if (req.url === '/api/publishing/artwork/fixture-revision') {
      res.end(artwork);
    } else res.writeHead(404).end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const env = { PUBLISHING_POCKETBASE_URL: `http://127.0.0.1:${server.address().port}`,
    PUBLISHING_BUILD_EMAIL: 'fixture@example.test', PUBLISHING_BUILD_PASSWORD: 'fixture-password' };
  assert.deepEqual((await preparePublishedRelease(env)).release, []);
  for (const tracks of [[], null]) {
    catalogue = [{ revision: 'withdrawn-revision', slug: 'catalogue-a', state: 'unpublished' }, snapshot(tracks)];
    const prepared = await preparePublishedRelease(env);
    assert.deepEqual(prepared.release.map(release => release.slug), ['catalogue-b']);
    const release = prepared.release[0];
    assert.deepEqual(release.tracks, []);
    for (const key of ['credit', 'display_title', 'album_id', 'youtube_video_id', 'player_height']) {
      assert.equal(release[key], catalogue[1].release[key]);
    }
    assert.ok(release.publishedArtwork.src.startsWith('/published-releases/'));
    assert.ok(prepared.files.some(file => file.path === release.publishedArtwork.src));
    assert.equal('artwork_url' in release, false);
  }
});
