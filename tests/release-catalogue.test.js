import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { preparePublishedRelease } from '../src/integrations/published-release.mjs';

const env = { PUBLISHING_POCKETBASE_URL: 'https://publishing.example.test',
  PUBLISHING_BUILD_EMAIL: 'fixture@example.test', PUBLISHING_BUILD_PASSWORD: 'private-fixture-password' };
const token = 'private-fixture-token';
const artwork = await sharp({ create: { width: 24, height: 16, channels: 3, background: '#123456' } }).jpeg().toBuffer();
const item = {
  id: 'music1',
  release: { slug: 'catalogue-b', title: 'Private fixture title', artist: 'Artist', release_date: '2020',
    about: null, category: 'other-credits', tracks: [] },
  artwork: { path: '/api/publishing/current/music-assets/music1/cover.jpg', width: 24, height: 16,
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
    if (url.pathname === '/api/publishing/current/music') return Response.json(catalogue, { status });
    assert.equal(url.pathname, item.artwork.path);
    return new Response(bytes);
  };
  return { fetcher, requests };
}

async function assertFails(catalogue, options) {
  const fixture = transport(catalogue, options);
  await assert.rejects(preparePublishedRelease(env, fixture.fetcher), error => {
    assert.match(error.message, /^Published release build failed:/);
    for (const secret of [token, ...Object.values(env), item.release.title, 'Mixed private title']) {
      assert.ok(!error.stack.includes(secret), `error must not expose ${secret}`);
    }
    return true;
  });
  return fixture.requests;
}

test('unset and partial CMS configuration fail before authentication', async () => {
  for (const config of [{}, ...Object.keys(env).map(key => ({ ...env, [key]: '' }))]) {
    const { fetcher, requests } = transport([]);
    await assert.rejects(preparePublishedRelease(config, fetcher), /Incomplete publishing configuration/);
    assert.deepEqual(requests, []);
  }
});

test('empty current catalogue returns no releases or artwork without fallback', async () => {
  const { fetcher, requests } = transport([]);
  assert.deepEqual(await preparePublishedRelease(env, fetcher), { release: [], files: [] });
  assert.deepEqual(requests, ['/api/collections/publishing_builds/auth-with-password', '/api/publishing/current/music']);
});

test('malformed current records and legacy snapshots fail closed', async () => {
  const withdrawal = { revision: 'old-revision', slug: 'catalogue-b', state: 'unpublished' };
  for (const value of [null, {}, { ...item, id: '' }, { ...item, id: 'bad/id' },
    { ...item, artwork: { ...item.artwork, path: '/api/publishing/artwork/old-revision' } },
    withdrawal, { revision: 'old-revision', release: item.release, artwork: item.artwork },
    { ...item, state: 'draft' }]) {
    const requests = await assertFails([value]);
    assert.ok(!requests.includes(item.artwork.path));
  }
  for (const catalogue of [null, {}, [item, item]]) await assertFails(catalogue);
});

test('missing and unavailable current catalogue fails closed without exposing secrets', async () => {
  for (const status of [401, 404, 503]) await assertFails({}, { status });
});

test('invalid published tracks fail before fetching artwork', async () => {
  for (const tracks of [
    {}, [{ title: 'Track', track_num: 2 }], [{ title: '', track_num: 1 }],
    [{ title: 'Track', track_num: 1, duration: -1 }],
    [{ title: 'Track', track_num: 1, audio_url: 'https://example.test/private.mp3' }],
  ]) {
    const requests = await assertFails([{ ...item, release: { ...item.release, tracks } }]);
    assert.ok(!requests.includes(item.artwork.path));
  }
});

test('corrupt or changed artwork fails closed without exposing secrets', async () => {
  const corrupt = Buffer.from('not an image');
  for (const [metadata, bytes] of [
    [{ sha256: '0'.repeat(64) }, artwork],
    [{ sha256: createHash('sha256').update(corrupt).digest('hex') }, corrupt],
    [{ width: 25 }, artwork],
  ]) {
    const requests = await assertFails([{ ...item, artwork: { ...item.artwork, ...metadata } }], { bytes });
    assert.ok(requests.includes(item.artwork.path));
  }
});
