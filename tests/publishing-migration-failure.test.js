import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { start } from './helpers/publishing-pocketbase.js';

const toggleMigration = '1782259200_release_toggle.js';
const options = { skip: !(process.env.OLD_POCKETBASE_BINARY && process.env.POCKETBASE_BINARY) && 'Set old and new PocketBase binaries to test migration rollback' };

test('refused upgrade rolls back schema and preserves old commands, tracks, snapshots and protected artwork', options, async (t) => {
  const { request, adminToken: token, restart, base, dir } = await start(t, {
    binaryPath: process.env.OLD_POCKETBASE_BINARY, omitMigrations: [toggleMigration],
  });
  const write = async (route, body, method = 'POST') => {
    const response = await request(route, { token, method, body });
    assert.equal(response.status, 200, JSON.stringify(response));
    return response.data;
  };
  const get = async (route) => {
    const response = await request(route, { token });
    assert.equal(response.status, 200, JSON.stringify(response));
    return response.data;
  };
  await write('collections/publishing_builds/records', { email: 'build@example.test', password: 'test-build-password', passwordConfirm: 'test-build-password' });
  const auth = await request('collections/publishing_builds/auth-with-password', { method: 'POST', body: { identity: 'build@example.test', password: 'test-build-password' } });
  assert.equal(auth.status, 200);
  const build = auth.data.token;
  const jpeg = await readFile(new URL('./fixtures/artwork/watery-grave.jpg', import.meta.url));
  const form = new FormData();
  for (const [key, value] of Object.entries({ slug: 'watery-grave-ep', title: 'Public title', artist: 'Artist', release_date: '2005' })) form.set(key, value);
  form.set('artwork', new Blob([jpeg], { type: 'image/jpeg' }), 'cover.jpg');
  const release = await write('collections/publishing_releases/records', form);
  const releaseRoute = `collections/publishing_releases/records/${release.id}`;
  const track = await write('collections/publishing_tracks/records', { release: release.id, title: 'Public track', track_num: 1, duration: 123, audio_url: '/audio/track.mp3' });
  await write(releaseRoute, { publish: true }, 'PATCH');
  const revision = await request('publishing/releases/watery-grave-ep', { token: build });
  assert.equal(revision.status, 200);
  const artworkPath = revision.data.artwork.path;
  await write(releaseRoute, { title: 'Private working title' }, 'PATCH');
  await write(`collections/publishing_tracks/records/${track.id}`, { title: 'Private working track' }, 'PATCH');

  // Snapshot APIs deliberately forbid mutation. Only this temporary fixture gets
  // an internal migration simulating an unknown historical payload format.
  await writeFile(path.join(dir, 'migrations', '1782259199_invalid_snapshot_fixture.js'), `
    migrate((app) => {
      const snapshot = app.findRecordsByFilter('publishing_snapshots', 'slug = "watery-grave-ep"', '-sequence', 1, 0)[0];
      snapshot.set('payload', { state: 'unknown-fixture-format' });
      app.save(snapshot);
    }, () => {});
  `);
  await restart();
  const schema = await get('collections/publishing_releases');
  const working = await get(releaseRoute);
  const tracks = await get('collections/publishing_tracks/records');
  const snapshots = await get('collections/publishing_snapshots/records');
  assert.equal(tracks.totalItems, 1);
  assert.equal(snapshots.totalItems, 1);
  assert.deepEqual(snapshots.items[0].payload, { state: 'unknown-fixture-format' });
  for (const name of ['publish', 'unpublish']) assert.ok(schema.fields.some(field => field.name === name));

  await assert.rejects(restart(process.env.POCKETBASE_BINARY), /Unrecognized publishing snapshot; migration refused/);
  // Restore code, not a backup: the failed migration itself must be atomic.
  await rm(path.join(dir, 'migrations', toggleMigration));
  await restart(process.env.OLD_POCKETBASE_BINARY, { copyMigrations: false });
  assert.deepEqual(await get('collections/publishing_releases'), schema);
  assert.deepEqual(await get(releaseRoute), working);
  assert.deepEqual(await get('collections/publishing_tracks/records'), tracks);
  assert.deepEqual(await get('collections/publishing_snapshots/records'), snapshots);
  assert.equal((await fetch(base + artworkPath)).status, 403);
  const artwork = await fetch(base + artworkPath, { headers: { Authorization: build } });
  assert.equal(artwork.status, 200);
  assert.deepEqual(Buffer.from(await artwork.arrayBuffer()), jpeg);

  // The restored command fields still work, not merely appear in the schema.
  await write(releaseRoute, { unpublish: true }, 'PATCH');
  assert.equal((await request('publishing/releases/watery-grave-ep', { token: build })).data.state, 'unpublished');
  await write(releaseRoute, { publish: true }, 'PATCH');
  const republished = await request('publishing/releases/watery-grave-ep', { token: build });
  assert.equal(republished.status, 200);
  assert.equal(republished.data.release.title, 'Private working title');
  assert.equal(republished.data.release.tracks[0].title, 'Private working track');
});
