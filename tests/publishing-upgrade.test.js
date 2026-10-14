import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { start } from './helpers/publishing-pocketbase.js';

const workingTrackTitle = 'é'.repeat(300); // Valid under the legacy 500-character text limit.
const options = { skip: !(process.env.POCKETBASE_BINARY && process.env.OLD_POCKETBASE_BINARY) && 'Set old and new PocketBase binaries to test upgrade' };
for (const state of ['draft', 'published', 'withdrawn']) {
  test(`upgrade preserves ${state} state, private edits and retained media without creating revisions`, options, async (t) => {
    const { request, adminToken: token, restart, base } = await start(t, { binaryPath: process.env.OLD_POCKETBASE_BINARY, omitMigrations: ['1782259200_release_toggle.js'] });
    const write = async (route, body, method = 'POST') => {
      const response = await request(route, { token, method, body });
      assert.equal(response.status, 200, JSON.stringify(response));
      return response.data;
    };
    await write('collections/publishing_builds/records', { email: 'build@example.test', password: 'test-build-password', passwordConfirm: 'test-build-password' });
    const build = (await request('collections/publishing_builds/auth-with-password', { method: 'POST', body: { identity: 'build@example.test', password: 'test-build-password' } })).data.token;
    const form = new FormData();
    for (const [key, value] of Object.entries({ slug: 'watery-grave-ep', title: 'Public title', artist: 'Artist', release_date: '2005' })) form.set(key, value);
    const jpeg = await readFile(new URL('../public/images/music-releases/watery-grave.jpg', import.meta.url));
    form.set('artwork', new Blob([jpeg], { type: 'image/jpeg' }), 'cover.jpg');
    const release = await write('collections/publishing_releases/records', form);
    const route = `collections/publishing_releases/records/${release.id}`;
    const track = await write('collections/publishing_tracks/records', { release: release.id, title: 'Public track', track_num: 1, duration: 123, audio_url: '/audio/track.mp3' });
    const endpoint = 'publishing/releases/watery-grave-ep';
    if (state !== 'draft') await write(route, { publish: true }, 'PATCH');
    const publicRevision = (await request(endpoint, { token: build })).data;
    if (state === 'withdrawn') await write(route, { unpublish: true }, 'PATCH');
    await write(route, { title: 'Private working title' }, 'PATCH');
    await write(`collections/publishing_tracks/records/${track.id}`, { title: workingTrackTitle }, 'PATCH');
    const before = await request(endpoint, { token: build });
    const snapshots = (await request('collections/publishing_snapshots/records', { token })).data;
    await restart(process.env.POCKETBASE_BINARY);
    assert.deepEqual(await request(endpoint, { token: build }), before);
    assert.deepEqual((await request('collections/publishing_snapshots/records', { token })).data, snapshots);
    const upgraded = (await request(route, { token })).data;
    assert.equal(upgraded.published, state === 'published');
    assert.equal(upgraded.title, 'Private working title');
    assert.deepEqual(upgraded.tracks, [{ title: workingTrackTitle, track_num: 1, duration: 123, audio_url: '/audio/track.mp3' }]);
    assert.equal('publish' in upgraded, false);
    assert.equal('unpublish' in upgraded, false);
    assert.equal((await request('collections/publishing_tracks/records', { token })).status, 404);
    if (state !== 'draft') assert.deepEqual(Buffer.from(await (await fetch(base + publicRevision.artwork.path, { headers: { Authorization: build } })).arrayBuffer()), jpeg);
    await write(route, { about: 'First post-upgrade save' }, 'PATCH');
    if (state === 'published') assert.equal((await request(endpoint, { token: build })).data.release.tracks[0].title, workingTrackTitle);
    else assert.deepEqual(await request(endpoint, { token: build }), before);
    if (state === 'published') {
      assert.equal((await request(route, { token, method: 'DELETE' })).status, 204);
      // Recreating the retained slug with Published off is an explicit withdrawal,
      // not a requirement to reconstruct and republish deleted artwork/tracks.
      await write('collections/publishing_releases/records', { slug: 'watery-grave-ep', title: 'Withdraw retained release', artist: 'Artist', release_date: '2005', published: false });
      assert.equal((await request(endpoint, { token: build })).data.state, 'unpublished');
    }
  });
}
