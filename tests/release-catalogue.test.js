import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { start } from './helpers/publishing-pocketbase.js';
import { preparePublishedRelease } from '../src/integrations/published-release.mjs';

const options = { skip: !process.env.POCKETBASE_BINARY && 'Set POCKETBASE_BINARY' };

test('release builds require CMS configuration regardless of the old mode flag', async () => {
  for (const env of [{}, { PUBLISHING_CONTENT: 'true' }, { PUBLISHING_CONTENT: 'false' }]) {
    await assert.rejects(preparePublishedRelease(env), /Incomplete publishing configuration/);
  }
});

test('catalogue lists latest immutable revisions, empty tracks and withdrawals; full builds have no fallback', options, async t => {
  const { request, adminToken: token, base } = await start(t);
  async function write(route, body, method = 'POST') {
    const response = await request(route, { token, method, body });
    assert.equal(response.status, 200, JSON.stringify(response));
    return response.data;
  }
  await write('collections/publishing_builds/records', { email: 'catalogue@example.test', password: 'test-build-password', passwordConfirm: 'test-build-password' });
  const env = { PUBLISHING_CONTENT: 'true', PUBLISHING_POCKETBASE_URL: base, PUBLISHING_BUILD_EMAIL: 'catalogue@example.test', PUBLISHING_BUILD_PASSWORD: 'test-build-password' };
  const build = (await request('collections/publishing_builds/auth-with-password', { method: 'POST', body: { identity: env.PUBLISHING_BUILD_EMAIL, password: env.PUBLISHING_BUILD_PASSWORD } })).data.token;
  assert.deepEqual((await preparePublishedRelease(env)).release, []);
  for (const denied of [undefined, token]) assert.equal((await request('publishing/releases', { token: denied })).status, 403);
  const artwork = await sharp({ create: { width: 24, height: 16, channels: 3, background: '#123456' } }).jpeg().toBuffer();
  const ids = [];
  for (const [slug, tracks] of [['catalogue-a', []], ['catalogue-b', null]]) {
    const form = new FormData();
    const fields = { slug, title: slug, artist: 'Artist', release_date: '2020', category: 'other-credits', credit: 'Mixing', display_title: 'Display', album_id: 123, art_id: 456, youtube_video_id: 'abc123', player_height: 400, published: true, ...(tracks && { tracks: JSON.stringify(tracks) }) };
    for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
    form.set('artwork', new Blob([artwork], { type: 'image/jpeg' }), 'artwork.jpg');
    ids.push((await write('collections/publishing_releases/records', form)).id);
  }
  const listing = async () => (await request('publishing/releases', { token: build })).data;
  const first = await listing();
  assert.equal(first.length, 2);
  const a = first.find(s => s.release.slug === 'catalogue-a');
  assert.deepEqual(a.release.tracks, []);
  for (const key of ['category', 'credit', 'display_title', 'album_id', 'art_id', 'youtube_video_id', 'player_height']) assert.ok(a.release[key]);
  const route = `collections/publishing_releases/records/${ids[0]}`;
  assert.equal((await request(route, { token, method: 'PATCH', body: { slug: 'renamed' } })).status, 400);
  await write(route, { title: 'Edited' }, 'PATCH');
  assert.equal((await listing()).length, 2);
  assert.equal((await preparePublishedRelease(env)).release.length, 2);
  await write(route, { published: false }, 'PATCH');
  const withdrawn = (await listing()).find(s => s.slug === 'catalogue-a');
  assert.equal(withdrawn.state, 'unpublished');
  const prepared = await preparePublishedRelease(env);
  assert.deepEqual(prepared.release.map(r => r.slug), ['catalogue-b']);
  assert.equal(prepared.release[0].album_id, 123);
  assert.ok(prepared.release[0].publishedArtwork.src.startsWith('/published-releases/'));
  assert.equal('artwork_url' in prepared.release[0], false);
  assert.equal((await fetch(base + a.artwork.path, { headers: { Authorization: build } })).status, 200);
  await request(`collections/publishing_releases/records/${ids[1]}`, { token, method: 'DELETE' });
  assert.deepEqual((await preparePublishedRelease(env)).release.map(r => r.slug), ['catalogue-b']);
});
