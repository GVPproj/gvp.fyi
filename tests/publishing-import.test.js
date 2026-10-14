import assert from 'node:assert/strict';
import test from 'node:test';
import { start } from './helpers/publishing-pocketbase.js';
import { importRelease } from '../scripts/import-release.mjs';

const options = { skip: !process.env.POCKETBASE_BINARY && 'Set POCKETBASE_BINARY to the custom v0.40.4 server' };

test('isolated import preserves Watery Grave metadata, ordered MP3s and artwork without publishing or adopting collisions', options, async t => {
  const { base, request, adminToken } = await start(t);
  const imported = await importRelease({ endpoint: base, token: adminToken });
  assert.equal(imported.slug, 'watery-grave-ep');
  assert.equal(imported.title, 'Watery Grave EP');
  assert.equal(imported.artist, 'Miracle Fortress');
  assert.equal(imported.release_date, '2005');
  assert.equal(imported.display_date, 'Winter 2005, Self Released');
  assert.equal(imported.about, 'A self-released EP from winter 2005.');
  assert.equal(imported.published, false);
  assert.equal(Object.hasOwn(imported, 'publish'), false);
  assert.equal(Object.hasOwn(imported, 'unpublish'), false);
  assert.ok(imported.artwork.endsWith('.jpg'));
  assert.deepEqual(imported.tracks.map(track => [track.title, track.track_num, track.audio_url]), [
    ['Watery Grave', 1, '/audio/watery-grave/01-watery-grave.mp3'],
    ['Forgiven', 2, '/audio/watery-grave/02-forgiven.mp3'],
    ['Secret Passage Way', 3, '/audio/watery-grave/03-secret-passage-way.mp3'],
    ['Eschatology', 4, '/audio/watery-grave/04-eschatology.mp3'],
    ['Sacred Flowers', 5, '/audio/watery-grave/05-sacred-flowers.mp3'],
  ]);
  await assert.rejects(importRelease({ endpoint: base, token: adminToken }), /already exists/);
  assert.equal((await request('collections/publishing_releases/records', { token: adminToken })).data.totalItems, 1);
  assert.equal((await request('collections/publishing_tracks/records', { token: adminToken })).status, 404);
  assert.equal((await request('collections/publishing_snapshots/records', { token: adminToken })).data.totalItems, 0);
  const route = `collections/publishing_releases/records/${imported.id}`;
  assert.equal((await request(route, { token: adminToken, method: 'PATCH', body: { published: true } })).status, 200);
  assert.equal((await request(route, { token: adminToken, method: 'DELETE' })).status, 204);
  const snapshots = (await request('collections/publishing_snapshots/records', { token: adminToken })).data;
  await assert.rejects(importRelease({ endpoint: base, token: adminToken }), /already exists/);
  assert.deepEqual((await request('collections/publishing_snapshots/records', { token: adminToken })).data, snapshots);
});

test('tracer importer rejects non-loopback targets before sending any credentials', async () => {
  await assert.rejects(importRelease({ endpoint: 'https://production.example', token: 'not-a-real-token' }), /loopback/);
});
