import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { start } from './helpers/publishing-pocketbase.js';

const options = { skip: !process.env.POCKETBASE_BINARY && 'Set POCKETBASE_BINARY to the custom v0.40.4 server' };
const releases = 'collections/publishing_releases/records';
const tracks = 'collections/publishing_tracks/records';
const source = JSON.parse(await readFile(new URL('../src/data/releases/miracle-fortress.json', import.meta.url), 'utf8')).at(-1);
const { artwork_url, tracks: originalTracks, ...metadata } = source;
const fields = { slug: 'watery-grave-ep', ...metadata };
const jpeg = await readFile(new URL('../public/images/music-releases/watery-grave.jpg', import.meta.url));

test('dashboard/API saves private releases and ordered tracks without changing Likes', options, async (t) => {
  const { request, adminToken: token, base } = await start(t);
  assert.equal((await fetch(`${base}/_/`)).status, 200);
  const saved = await request(releases, { method: 'POST', token, body: fields });
  assert.equal(saved.status, 200, JSON.stringify(saved));
  assert.equal(saved.data.publish, false);
  for (const n of [2, 1]) {
    assert.equal((await request(tracks, { method: 'POST', token, body: { release: saved.data.id, title: `Track ${n}`, track_num: n, duration: 272, audio_url: `/audio/watery-grave/${n}.mp3` } })).status, 200);
  }
  const listed = await request(`${tracks}?sort=track_num`, { token });
  assert.deepEqual(listed.data.items.map(x => x.title), ['Track 1', 'Track 2']);
  assert.equal((await request(releases)).status, 403);
  assert.equal((await request(tracks)).status, 403);
  assert.equal((await request('collections/likes_items/records')).status, 200);
});

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAyAAAAGQAQAAAAB+XjmZAAAAPklEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4NndAAAfVRSv0AAAAASUVORK5CYII=', 'base64');
const webp = Buffer.from('UklGRjwAAABXRUJQVlA4IDAAAAAQAgCdASoNAAcAAUAmJaACdLoB+AH4AAPIAP7uCmf+rPpoRf2kf/rKr5Kj9swAAAA=', 'base64');
function upload(fields, bytes = jpeg) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  const [type, filename] = bytes === jpeg ? ['image/jpeg', 'original.jpg'] : bytes === webp ? ['image/webp', 'replacement.webp'] : ['image/png', 'replacement.png'];
  form.set('artwork', new Blob([bytes], { type }), filename);
  return form;
}
test('explicit dashboard Publish creates a build-only retained revision; Save never publishes', options, async (t) => {
  const { request, adminToken: token, base, restart } = await start(t);
  async function write(route, body, method = 'POST') {
    const result = await request(route, { method, token, body });
    assert.equal(result.status, 200, JSON.stringify(result));
    return result.data;
  }
  await write('collections/publishing_builds/records', { email: 'build@example.test', password: 'test-build-password', passwordConfirm: 'test-build-password' });
  const auth = await request('collections/publishing_builds/auth-with-password', { method: 'POST', body: { identity: 'build@example.test', password: 'test-build-password' } });
  assert.equal(auth.status, 200);
  const build = auth.data.token;
  await write('collections/likes_owners/records', { id: 'likesowner00001', email: 'owner@example.test', password: 'test-owner-password', passwordConfirm: 'test-owner-password' });
  const ownerAuth = await request('collections/likes_owners/auth-with-password', { method: 'POST', body: { identity: 'owner@example.test', password: 'test-owner-password' } });
  assert.equal(ownerAuth.status, 200);
  const endpoint = 'publishing/releases/watery-grave-ep';
  assert.equal((await request(endpoint, { token: build })).status, 404);
  const draft = await write(releases, fields);
  await write(`${releases}/${draft.id}`, upload({}), 'PATCH');
  for (const track of [...originalTracks].reverse()) await write(tracks, { release: draft.id, ...track });
  assert.equal((await request(endpoint, { token: build })).status, 404);
  const published = await write(`${releases}/${draft.id}`, { publish: true }, 'PATCH');
  assert.equal(published.publish, false);
  const first = await request(endpoint, { token: build });
  assert.equal(first.status, 200, JSON.stringify(first));
  assert.deepEqual(first.data.release, { ...fields, tracks: originalTracks });
  assert.equal(first.data.release.title, 'Watery Grave EP');
  assert.equal(first.data.release.display_date, 'Winter 2005, Self Released');
  assert.deepEqual(first.data.release.tracks.map(track => track.audio_url), [
    '/audio/watery-grave/01-watery-grave.mp3', '/audio/watery-grave/02-forgiven.mp3',
    '/audio/watery-grave/03-secret-passage-way.mp3', '/audio/watery-grave/04-eschatology.mp3',
    '/audio/watery-grave/05-sacred-flowers.mp3',
  ]);
  assert.equal(first.data.artwork.width, 300);
  assert.equal(first.data.artwork.height, 283);
  assert.equal(first.data.artwork.sha256, createHash('sha256').update(jpeg).digest('hex'));
  const internal = (await request('collections/publishing_snapshots/records', { token })).data.items[0];
  for (const method of ['PATCH', 'DELETE']) {
    assert.equal((await request(`collections/publishing_snapshots/records/${internal.id}`, { token, method, ...(method === 'PATCH' && { body: { payload: {} } }) })).status, 403);
  }
  assert.equal((await request('collections/publishing_snapshots/records', { token, method: 'POST', body: internal })).status, 403);
  const fileToken = (await request('files/token', { token: build, method: 'POST' })).data.token;
  for (const [collection, record] of [['publishing_releases', draft], ['publishing_snapshots', internal]]) {
    const actual = (await request(`collections/${collection}/records/${record.id}`, { token })).data;
    assert.equal((await fetch(`${base}/api/files/${collection}/${record.id}/${actual.artwork}?token=${fileToken}`)).status, 404);
  }
  assert.equal((await fetch(base + first.data.artwork.path, { headers: { Authorization: build } })).headers.get('cache-control'), 'no-store');
  const download = () => fetch(base + first.data.artwork.path, { headers: { Authorization: build } });
  assert.deepEqual(Buffer.from(await (await download()).arrayBuffer()), jpeg);
  const savedTracks = (await request(`${tracks}?sort=track_num`, { token })).data.items;
  await write(`${tracks}/${savedTracks[0].id}`, { title: 'Private track edit' }, 'PATCH');
  await write(`${releases}/${draft.id}`, { title: 'Private edit', artwork: '' }, 'PATCH');
  assert.deepEqual((await request(endpoint, { token: build })).data, first.data);
  assert.deepEqual(Buffer.from(await (await download()).arrayBuffer()), jpeg);
  assert.equal((await request(`${releases}/${draft.id}`, { method: 'PATCH', token, body: { title: 'Must roll back', publish: true } })).status, 400);
  assert.equal((await request(`${releases}/${draft.id}`, { token })).data.title, 'Private edit');
  assert.deepEqual((await request(endpoint, { token: build })).data, first.data);
  await write(`${releases}/${draft.id}`, upload({ publish: true }, png), 'PATCH');
  const second = await request(endpoint, { token: build });
  assert.notEqual(second.data.revision, first.data.revision);
  assert.equal(second.data.artwork.width, 800);
  assert.equal(second.data.artwork.height, 400);
  assert.deepEqual(Buffer.from(await (await fetch(base + second.data.artwork.path, { headers: { Authorization: build } })).arrayBuffer()), png);
  assert.equal(second.data.release.title, 'Private edit');
  assert.equal(second.data.release.tracks[0].title, 'Private track edit');
  await restart();
  assert.deepEqual((await request(endpoint, { token: build })).data, second.data);
  await write(`${releases}/${draft.id}`, upload({ publish: true }, webp), 'PATCH');
  const third = await request(endpoint, { token: build });
  assert.equal(third.data.artwork.width, 13);
  assert.equal(third.data.artwork.height, 7);
  assert.deepEqual(Buffer.from(await (await fetch(base + third.data.artwork.path, { headers: { Authorization: build } })).arrayBuffer()), webp);
  assert.equal((await request(`${releases}/${draft.id}`, { method: 'DELETE', token })).status, 204);
  assert.deepEqual(Buffer.from(await (await download()).arrayBuffer()), jpeg);
  for (const denied of [undefined, token, ownerAuth.data.token]) {
    assert.equal((await request(endpoint, { token: denied })).status, 403);
    assert.equal((await fetch(base + first.data.artwork.path, { headers: denied ? { Authorization: denied } : {} })).status, 403);
  }
  for (const name of ['publishing_releases', 'publishing_tracks', 'publishing_snapshots', 'publishing_builds']) {
    assert.equal((await request(`collections/${name}/records`, { token: build })).status, 403);
    assert.equal((await request(`collections/${name}/records`, { token: build, method: 'POST', body: {} })).status, 403);
    const record = (await request(`collections/${name}/records`, { token })).data.items[0];
    const id = record?.id ?? draft.id;
    assert.equal((await request(`collections/${name}/records/${id}`, { token: build })).status, 403);
    for (const method of ['PATCH', 'DELETE']) {
      assert.equal((await request(`collections/${name}/records/${id}`, { token: build, method, ...(method === 'PATCH' && { body: {} }) })).status, 403);
    }
  }
});
