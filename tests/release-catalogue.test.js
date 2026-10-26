import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import sharp from 'sharp';
import { preparePublishedRelease } from '../src/integrations/published-release.mjs';

const env = { PUBLISHING_POCKETBASE_URL: 'https://publishing.example.test',
  PUBLISHING_BUILD_EMAIL: 'fixture@example.test', PUBLISHING_BUILD_PASSWORD: 'private-fixture-password' };
const token = 'private-fixture-token';
const withdrawal = { revision: 'abc123def456ghi', slug: 'catalogue-b', state: 'unpublished' };
const artwork = await sharp({ create: { width: 24, height: 16, channels: 3, background: '#123456' } }).jpeg().toBuffer();
const snapshot = {
  revision: 'fixture-revision',
  release: { slug: 'catalogue-b', title: 'Private fixture title', artist: 'Artist', release_date: '2020',
    about: null, category: 'other-credits', tracks: [] },
  artwork: { path: '/api/publishing/artwork/fixture-revision', width: 24, height: 16,
    sha256: createHash('sha256').update(artwork).digest('hex') },
};

function transport(catalogue, { status = 200, bytes = artwork } = {}) {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push(url.pathname);
    if (url.pathname === '/api/collections/publishing_builds/auth-with-password') {
      return Response.json({ token, record: { collectionName: 'publishing_builds' } });
    }
    assert.equal(options.headers.Authorization, token);
    if (url.pathname === '/api/publishing/releases') return Response.json(catalogue, { status });
    assert.equal(url.pathname, snapshot.artwork.path);
    return new Response(bytes);
  };
  return { fetcher, requests };
}

async function assertFails(catalogue, options) {
  const fixture = transport(catalogue, options);
  await assert.rejects(preparePublishedRelease(env, fixture.fetcher), error => {
    assert.match(error.message, /^Published release build failed:/);
    for (const secret of [token, ...Object.values(env), snapshot.release.title, 'Mixed private title']) {
      assert.ok(!error.stack.includes(secret), `error must not expose ${secret}`);
    }
    return true;
  });
  return fixture.requests;
}

test('unset and partial CMS configuration fail before authentication', async t => {
  for (const [name, config] of [
    ['unset', {}],
    ['empty', Object.fromEntries(Object.keys(env).map(key => [key, '']))],
    ...Object.keys(env).map(key => [key, { ...env, [key]: '' }]),
  ]) {
    await t.test(name, async () => {
      const { fetcher, requests } = transport([]);
      await assert.rejects(preparePublishedRelease(config, fetcher), /Incomplete publishing configuration/);
      assert.deepEqual(requests, [], 'incomplete configuration must fail before authentication');
    });
  }
});

test('empty catalogue and withdrawal return no releases or artwork without fallback', async () => {
  for (const catalogue of [[], [withdrawal]]) {
    const { fetcher, requests } = transport(catalogue);
    assert.deepEqual(await preparePublishedRelease(env, fetcher), { release: [], files: [] });
    assert.deepEqual(requests, ['/api/collections/publishing_builds/auth-with-password', '/api/publishing/releases']);
  }
});

test('malformed snapshots and mixed withdrawals fail closed', async t => {
  const cases = [
    null, {}, { ...withdrawal, revision: '' }, { ...withdrawal, revision: '   ' },
    { ...withdrawal, revision: 123 }, { ...withdrawal, slug: 'invalid/slug' },
    { ...withdrawal, state: 'draft' }, { revision: withdrawal.revision, slug: withdrawal.slug },
    { ...withdrawal, release: snapshot.release }, { ...withdrawal, artwork: {} },
    { ...withdrawal, title: 'Mixed private title' },
  ];
  for (const value of cases) {
    await t.test(JSON.stringify(value), async () => {
      const requests = await assertFails([value]);
      assert.ok(!requests.some(route => route.startsWith('/api/publishing/artwork/')));
    });
  }
  for (const value of [null, {}]) await assertFails(value);
});

test('missing and unavailable snapshots fail closed without exposing secrets', async () => {
  for (const status of [404, 503]) await assertFails({}, { status });
});

test('invalid published tracks fail before fetching artwork', async t => {
  for (const tracks of [
    {}, [{ title: 'Track', track_num: 2 }], [{ title: '', track_num: 1 }],
    [{ title: 'Track', track_num: 1, duration: -1 }],
    [{ title: 'Track', track_num: 1, audio_url: 'https://example.test/private.mp3' }],
  ]) {
    await t.test(JSON.stringify(tracks), async () => {
      const requests = await assertFails([{ ...snapshot, release: { ...snapshot.release, tracks } }]);
      assert.ok(!requests.some(route => route.startsWith('/api/publishing/artwork/')));
    });
  }
});

test('corrupt artwork fails closed without exposing secrets', async t => {
  const corrupt = Buffer.from('not an image');
  for (const [name, metadata, bytes] of [
    ['checksum mismatch', { sha256: '0'.repeat(64) }, artwork],
    ['undecodable image', { sha256: createHash('sha256').update(corrupt).digest('hex') }, corrupt],
    ['dimension mismatch', { width: 25 }, artwork],
  ]) {
    await t.test(name, async () => {
      const requests = await assertFails([{ ...snapshot, artwork: { ...snapshot.artwork, ...metadata } }], { bytes });
      assert.ok(requests.includes(snapshot.artwork.path), 'must validate the fetched artwork');
    });
  }
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
