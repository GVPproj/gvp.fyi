import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { start } from './helpers/publishing-pocketbase.js';

const options = { skip: !process.env.POCKETBASE_BINARY && 'Set POCKETBASE_BINARY to the custom v0.40.4 server' };
const releases = 'collections/publishing_releases/records';
const source = JSON.parse(await readFile(new URL('../src/data/releases/miracle-fortress.json', import.meta.url), 'utf8')).at(-1);
const { artwork_url, ...metadata } = source;
const fields = { slug: 'watery-grave-ep', ...metadata };
const jpeg = await readFile(new URL('../public/images/music-releases/watery-grave.jpg', import.meta.url));
function upload(values) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  form.set('artwork', new Blob([jpeg], { type: 'image/jpeg' }), 'original.jpg');
  return form;
}

test('one release Save publishes JSON tracks and subsequent edits; withdrawal and failed saves retain coherent revisions', options, async (t) => {
  const { request, adminToken: token, base, restart } = await start(t);
  const write = async (route, body, method = 'POST') => {
    const response = await request(route, { token, method, body });
    assert.equal(response.status, 200, JSON.stringify(response));
    return response.data;
  };
  await write('collections/publishing_builds/records', { email: 'build@example.test', password: 'test-build-password', passwordConfirm: 'test-build-password' });
  const build = (await request('collections/publishing_builds/auth-with-password', { method: 'POST', body: { identity: 'build@example.test', password: 'test-build-password' } })).data.token;
  const endpoint = 'publishing/releases/watery-grave-ep';
  const current = async () => (await request(endpoint, { token: build })).data;
  const draft = await write(releases, upload(fields));
  assert.equal(draft.published, false);
  assert.deepEqual(draft.tracks, fields.tracks);
  assert.equal('publish' in draft, false);
  assert.equal('unpublish' in draft, false);
  const route = `${releases}/${draft.id}`;
  const draftArtwork = `${base}/api/files/publishing_releases/${draft.id}/${draft.artwork}`;
  const adminFileToken = await write('files/token', undefined);
  const buildFileAuth = await request('files/token', { token: build, method: 'POST' });
  assert.equal(buildFileAuth.status, 200);
  for (const thumbnail of ['', '&thumb=100x100']) {
    for (const identity of [undefined, build]) {
      const query = identity ? `token=${buildFileAuth.data.token}` : '';
      assert.equal((await fetch(`${draftArtwork}?${query}${thumbnail}`, {
        headers: identity ? { Authorization: identity } : {},
      })).status, 404, 'Draft working artwork must not be accessible anonymously or by the build identity');
    }
  }
  assert.equal((await request(endpoint, { token: build })).status, 404);
  await write(route, { title: 'Private draft' }, 'PATCH');
  assert.equal((await request(endpoint, { token: build })).status, 404);
  assert.equal((await write(route, { published: true }, 'PATCH')).published, true);
  const first = await current();
  assert.equal(first.release.title, 'Private draft');
  assert.deepEqual(first.release.tracks, fields.tracks);
  const revisedTracks = fields.tracks.map((track, i) => ({ ...track, ...(i === 0 && { title: 'Updated track' }) }));
  await write(route, { title: 'Updated release', tracks: revisedTracks }, 'PATCH');
  const second = await current();
  assert.notEqual(second.revision, first.revision);
  assert.equal(second.release.title, 'Updated release');
  assert.equal(second.release.tracks[0].title, 'Updated track');
  for (const invalid of [[], {}, [{ title: 'Bad order', track_num: 2 }], [{ title: '', track_num: 1 }], [{ title: '   ', track_num: 1 }], [{ title: 'Bad duration', track_num: 1, duration: -1 }], [{ title: 'Unknown', track_num: 1, secret: true }]]) {
    assert.equal((await request(route, { token, method: 'PATCH', body: { title: 'Must roll back', tracks: invalid } })).status, 400);
    assert.deepEqual(await current(), second);
    assert.equal((await request(route, { token })).data.title, 'Updated release');
  }
  assert.equal((await request(route, { token, method: 'PATCH', body: { artwork: '' } })).status, 400);
  assert.deepEqual(await current(), second);
  await write(route, { published: false, artwork: '' }, 'PATCH');
  const withdrawn = await current();
  assert.deepEqual(withdrawn, { revision: withdrawn.revision, slug: fields.slug, state: 'unpublished' });
  await write(route, { title: 'Private again' }, 'PATCH');
  await restart();
  assert.deepEqual(await current(), withdrawn);
  assert.equal((await request(route, { token, method: 'PATCH', body: { published: true } })).status, 400);
  assert.equal((await request(route, { token })).data.published, false);
  await write(route, upload({ published: true }), 'PATCH');
  const third = await current();
  assert.equal(third.release.title, 'Private again');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAyAAAAGQAQAAAAB+XjmZAAAAPklEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4NndAAAfVRSv0AAAAASUVORK5CYII=', 'base64');
  const replacement = new FormData();
  replacement.set('artwork', new Blob([png], { type: 'image/png' }), 'replacement.png');
  await write(route, replacement, 'PATCH');
  const fourth = await current();
  assert.notEqual(fourth.revision, third.revision);
  assert.equal(fourth.artwork.width, 800);
  assert.equal(fourth.artwork.height, 400);
  assert.deepEqual(Buffer.from(await (await fetch(base + fourth.artwork.path, { headers: { Authorization: build } })).arrayBuffer()), png);
  const webp = Buffer.from('UklGRjwAAABXRUJQVlA4IDAAAAAQAgCdASoNAAcAAUAmJaACdLoB+AH4AAPIAP7uCmf+rPpoRf2kf/rKr5Kj9swAAAA=', 'base64');
  replacement.set('artwork', new Blob([webp], { type: 'image/webp' }), 'replacement.webp');
  await write(route, replacement, 'PATCH');
  const fifth = await current();
  assert.equal(fifth.artwork.width, 13);
  assert.equal(fifth.artwork.height, 7);
  assert.deepEqual(Buffer.from(await (await fetch(base + fifth.artwork.path, { headers: { Authorization: build } })).arrayBuffer()), webp);
  const savedWorking = await request(route, { token });
  assert.equal(savedWorking.status, 200);
  const snapshotsBefore = await request('collections/publishing_snapshots/records', { token });
  assert.equal(snapshotsBefore.status, 200);
  const workingBytes = async () => {
    const response = await fetch(`${base}/api/files/publishing_releases/${draft.id}/${savedWorking.data.artwork}?token=${adminFileToken.token}`);
    assert.equal(response.status, 200);
    return Buffer.from(await response.arrayBuffer());
  };
  assert.deepEqual(await workingBytes(), webp);
  replacement.set('artwork', new Blob([png], { type: 'image/png' }), 'must-not-replace.png');
  for (const invalidTracks of ['{invalid JSON', JSON.stringify([])]) {
    replacement.set('tracks', invalidTracks);
    assert.equal((await request(route, { token, method: 'PATCH', body: replacement })).status, 400);
    const afterFailedSave = await request(route, { token });
    assert.equal(afterFailedSave.status, 200);
    assert.equal(afterFailedSave.data.artwork, savedWorking.data.artwork);
    assert.deepEqual(await workingBytes(), webp);
    assert.deepEqual(await current(), fifth);
    const snapshotsAfter = await request('collections/publishing_snapshots/records', { token });
    assert.equal(snapshotsAfter.status, 200);
    assert.equal(snapshotsAfter.data.totalItems, snapshotsBefore.data.totalItems);
  }
  replacement.delete('tracks');
  replacement.set('artwork', new Blob(['invalid image'], { type: 'image/png' }), 'invalid.png');
  assert.equal((await request(route, { token, method: 'PATCH', body: replacement })).status, 400);
  assert.deepEqual(await current(), fifth);
  assert.equal((await request(route, { token, method: 'DELETE' })).status, 204);
  assert.deepEqual(await current(), fifth);
  assert.deepEqual(Buffer.from(await (await fetch(base + first.artwork.path, { headers: { Authorization: build } })).arrayBuffer()), jpeg);
  for (const denied of [undefined, token]) {
    assert.equal((await request(endpoint, { token: denied })).status, 403);
    assert.equal((await fetch(base + first.artwork.path, { headers: denied ? { Authorization: denied } : {} })).status, 403);
  }
  for (const name of ['publishing_releases', 'publishing_snapshots', 'publishing_builds']) {
    assert.equal((await request(`collections/${name}/records`, { token: build })).status, 403);
    assert.equal((await request(`collections/${name}/records`, { token: build, method: 'POST', body: {} })).status, 403);
    const id = (await request(`collections/${name}/records`, { token })).data.items[0]?.id ?? draft.id;
    assert.equal((await request(`collections/${name}/records/${id}`, { token: build })).status, 403);
    for (const method of ['PATCH', 'DELETE']) assert.equal((await request(`collections/${name}/records/${id}`, { token: build, method, ...(method === 'PATCH' && { body: {} }) })).status, 403);
  }
  const internal = (await request('collections/publishing_snapshots/records', { token })).data.items.find(record => record.artwork);
  const fileToken = (await request('files/token', { token: build, method: 'POST' })).data.token;
  assert.equal((await fetch(`${base}/api/files/publishing_snapshots/${internal.id}/${internal.artwork}?token=${fileToken}`)).status, 404);
  assert.equal((await fetch(base + first.artwork.path, { headers: { Authorization: build } })).headers.get('cache-control'), 'no-store');
  for (const method of ['PATCH', 'DELETE']) assert.equal((await request(`collections/publishing_snapshots/records/${internal.id}`, { token, method, ...(method === 'PATCH' && { body: { payload: {} } }) })).status, 403);
  assert.equal((await request('collections/publishing_snapshots/records', { token, method: 'POST', body: internal })).status, 403);
  assert.equal((await request('collections/likes_items/records')).status, 200);
});
