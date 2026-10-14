import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { start } from './helpers/publishing-pocketbase.js';
import { repositoryCatalogue, captureArtwork, importCatalogue } from '../scripts/import-catalogue.mjs';
import { preparePublishedRelease } from '../scripts/published-release.mjs';

const options = { skip: !process.env.POCKETBASE_BINARY && 'Set POCKETBASE_BINARY' };

test('repository catalogue retains stable identities, categories and local originals', async () => {
  const rows = await repositoryCatalogue();
  assert.equal(rows.length, 36);
  assert.equal(new Set(rows.map(row => row.slug)).size, 36);
  assert.equal(rows.filter(row => row.category === 'other-credits').length, 9);
  const tracer = rows.find(row => row.slug === 'watery-grave-ep');
  assert.deepEqual((await captureArtwork(tracer)).bytes, await readFile(new URL('../public/images/music-releases/watery-grave.jpg', import.meta.url)));
  await assert.rejects(captureArtwork({ artwork_url: 'http://127.0.0.1/private' }));
  await assert.rejects(importCatalogue({ endpoint: 'https://production.example', token: 'unused' }));
  await assert.rejects(preparePublishedRelease({ PUBLISHING_CONTENT: 'true' }));
  assert.equal((await preparePublishedRelease({})).release, null);
});

test('catalogue importer captures all artwork additively and publishes only explicitly', options, async t => {
  const realFetch = globalThis.fetch;
  const jpeg = await readFile(new URL('../public/images/music-releases/watery-grave.jpg', import.meta.url));
  let captures = 0;
  globalThis.fetch = (url, options) => {
    if (new URL(url).protocol === 'https:') {
      captures++;
      return Promise.resolve(new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } }));
    }
    return realFetch(url, options);
  };
  t.after(() => { globalThis.fetch = realFetch; });
  for (const publish of [false, true]) {
    const { request, adminToken: token, base: endpoint } = await start(t);
    const result = await importCatalogue({ endpoint, token, publish });
    assert.equal(result.imported.length, 36);
    const working = (await request('collections/publishing_releases/records?perPage=100', { token })).data.items;
    assert.equal(working.length, 36);
    assert.ok(working.every(row => row.published === publish && row.artwork));
    const snapshots = (await request('collections/publishing_snapshots/records?perPage=100', { token })).data;
    assert.equal(snapshots.totalItems, publish ? 36 : 0);
    const again = await importCatalogue({ endpoint, token, publish: true });
    assert.equal(again.imported.length, 0);
    assert.equal(again.skipped.length, 36);
    assert.equal((await request('collections/publishing_snapshots/records', { token })).data.totalItems, publish ? 36 : 0);
  }
  assert.equal(captures, 44);
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
  const rows = await repositoryCatalogue();
  const art = await captureArtwork(rows.find(row => row.slug === 'watery-grave-ep'));
  const ids = [];
  for (const [slug, tracks] of [['catalogue-a', []], ['catalogue-b', null]]) {
    const form = new FormData();
    const fields = { slug, title: slug, artist: 'Artist', release_date: '2020', category: 'other-credits', credit: 'Mixing', display_title: 'Display', album_id: 123, art_id: 456, youtube_video_id: 'abc123', player_height: 400, published: true, ...(tracks && { tracks: JSON.stringify(tracks) }) };
    for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
    form.set('artwork', new Blob([art.bytes], { type: art.type }), art.name);
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
  assert.ok(prepared.release[0].artwork_url.startsWith('/published-releases/'));
  assert.equal((await fetch(base + a.artwork.path, { headers: { Authorization: build } })).status, 200);
  await request(`collections/publishing_releases/records/${ids[1]}`, { token, method: 'DELETE' });
  assert.deepEqual((await preparePublishedRelease(env)).release.map(r => r.slug), ['catalogue-b']);
});
