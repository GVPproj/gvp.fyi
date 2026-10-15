import test from 'node:test';
import assert from 'node:assert/strict';
import { start } from './helpers/publishing-pocketbase.js';
import { seedEditorial } from './helpers/editorial.js';
import { preparePublishedContent } from '../src/integrations/published-content.mjs';
import { materializeSoftware } from '../src/lib/editorial-source.js';
import sharp from 'sharp';

const options = { skip: !process.env.POCKETBASE_BINARY && 'Set POCKETBASE_BINARY to the current custom server', timeout: 90000 };
test('editorial publishing retains snapshots and safely replaces uploaded media', options, async t => {
  const pb = await start(t);
  await seedEditorial(pb, { publish: true });
  const email = 'build@example.test', password = 'fixture-build-password';
  const build = await pb.request('collections/publishing_builds/records', { token: pb.adminToken, method: 'POST', body: { email, password, passwordConfirm: password } });
  assert.equal(build.status, 200);
  const env = { PUBLISHING_CONTENT: 'true', PUBLISHING_POCKETBASE_URL: pb.base, PUBLISHING_BUILD_EMAIL: email, PUBLISHING_BUILD_PASSWORD: password };
  const prepared = await preparePublishedContent(env);
  assert.equal(prepared.content.filter(entry => entry.kind === 'software').length, 1);
  assert.equal(prepared.content.filter(entry => entry.kind === 'blog').length, 1);
  assert.equal(prepared.content.filter(entry => entry.kind === 'settings').length, 1);
  assert.equal(prepared.content.reduce((n, entry) => n + entry.assets.length, 0), 2);
  assert.ok(prepared.files.length > 2);
  const project = prepared.content.find(entry => entry.slug === 'example-project');
  assert.equal(project.assets.length, 2);
  assert.equal(project.data.team.length, 1);
  for (const source of [project.data.screenshot, ...project.data.gallery.map(image => image.src)]) {
    const name = project.data.assetNames[source.split('/').at(-1)];
    assert.ok(project.assets.some(asset => asset.name === name));
  }
  const buildAuth = await pb.request('collections/publishing_builds/auth-with-password', { method: 'POST', body: { identity: email, password } });
  const identitiesRoute = 'publishing/editorial-identities';
  assert.equal((await pb.request(identitiesRoute)).status, 403);
  assert.equal((await pb.request(identitiesRoute, { token: buildAuth.data.token })).status, 403);
  const inventory = await pb.request(identitiesRoute, { token: pb.adminToken });
  assert.equal(inventory.status, 200);
  assert.equal(inventory.data.length, 3);
  for (const identity of inventory.data) assert.deepEqual(Object.keys(identity).sort(), ['kind', 'slug']);

  const working = await pb.request('collections/editorial_entries/records?perPage=100', { token: pb.adminToken });
  const record = working.data.items.find(entry => entry.slug === 'example-project');
  const route = `collections/editorial_entries/records/${record.id}`;
  const alias = project.data.screenshot.split('/').at(-1);
  const oldName = record.data.assetNames[alias];
  const oldAsset = project.assets.find(asset => asset.name === oldName);
  const replacement = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#12ab34' } }).png().toBuffer();
  const form = new FormData();
  form.append('assets-', oldName);
  form.append('assets+', new Blob([replacement]), 'totally-different-name.png');
  const replaced = await pb.request(route, { token: pb.adminToken, method: 'PATCH', body: form });
  assert.equal(replaced.status, 200, JSON.stringify(replaced.data));
  const newName = replaced.data.data.assetNames[alias];
  assert.notEqual(newName, oldName);
  assert.ok(replaced.data.assets.includes(newName));
  const saved = await pb.request(route, { token: pb.adminToken });
  assert.equal(saved.data.data.assetNames[alias], newName);
  const refreshed = await preparePublishedContent(env);
  const nextProject = refreshed.content.find(entry => entry.slug === 'example-project');
  const rendered = materializeSoftware(nextProject);
  const nextAsset = nextProject.assets.find(asset => asset.name === newName);
  assert.equal(rendered.screenshot, nextAsset.url);
  assert.deepEqual(refreshed.files.find(file => file.path === rendered.screenshot).bytes, replacement);
  assert.notEqual(nextAsset.sha256, oldAsset.sha256);
  const retainedAsset = await fetch(`${pb.base}${oldAsset.path}`, { headers: { Authorization: buildAuth.data.token } });
  assert.equal(retainedAsset.status, 200);
  assert.deepEqual(Buffer.from(await retainedAsset.arrayBuffer()), prepared.files.find(file => file.path === oldAsset.url).bytes);

  // Two differently named replacements are ambiguous: Save, files and revision roll back.
  const ambiguous = new FormData();
  for (const name of saved.data.assets.slice(0, 2)) ambiguous.append('assets-', name);
  ambiguous.append('assets+', new Blob([replacement]), 'unknown-one.png');
  ambiguous.append('assets+', new Blob([replacement]), 'unknown-two.png');
  const rejected = await pb.request(route, { token: pb.adminToken, method: 'PATCH', body: ambiguous });
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.message, /ambiguous replacements/);
  const afterFailure = await pb.request(route, { token: pb.adminToken });
  assert.deepEqual(afterFailure.data.assets, saved.data.assets);
  assert.deepEqual(afterFailure.data.data, saved.data.data);
  assert.equal((await preparePublishedContent(env)).content.find(entry => entry.slug === 'example-project').revision, nextProject.revision);
  // Republish without uploads proves failed Save preserved the working files too.
  assert.equal((await pb.request(route, { token: pb.adminToken, method: 'PATCH', body: { published: true } })).status, 200);
  const invalid = await pb.request(route, { token: pb.adminToken, method: 'PATCH', body: {
    data: { ...saved.data.data, assetNames: { ...saved.data.data.assetNames, missing: 'absent.png' } },
  } });
  assert.equal(invalid.status, 400);

  // Original upload names unambiguously identify multiple removed aliases.
  const matching = new FormData();
  const pairs = Object.entries(saved.data.data.assetNames).slice(0, 2);
  for (const [original, filename] of pairs) {
    matching.append('assets-', filename);
    matching.append('assets+', new Blob([replacement]), original);
  }
  const matched = await pb.request(route, { token: pb.adminToken, method: 'PATCH', body: matching });
  assert.equal(matched.status, 200, JSON.stringify(matched.data));
  for (const [original, filename] of pairs) {
    assert.notEqual(matched.data.data.assetNames[original], filename);
    assert.ok(matched.data.assets.includes(matched.data.data.assetNames[original]));
  }
  materializeSoftware((await preparePublishedContent(env)).content.find(entry => entry.slug === 'example-project'));

  // Deleting working records preserves published snapshots and withdrawals.
  const blog = working.data.items.find(entry => entry.kind === 'blog');
  const blogRoute = `collections/editorial_entries/records/${blog.id}`;
  assert.equal((await pb.request(blogRoute, { token: pb.adminToken, method: 'PATCH', body: { published: false } })).status, 200);
  const beforeDeletion = await preparePublishedContent(env);
  assert.equal(beforeDeletion.content.find(entry => entry.slug === 'example-project').state, 'published');
  assert.equal(beforeDeletion.content.find(entry => entry.slug === 'example-post').state, 'unpublished');
  for (const target of [route, blogRoute]) {
    assert.equal((await pb.request(target, { token: pb.adminToken, method: 'DELETE' })).status, 204);
  }
  assert.deepEqual((await preparePublishedContent(env)).content, beforeDeletion.content);
  assert.equal((await pb.request(route, { token: pb.adminToken })).status, 404);
  assert.equal((await pb.request(blogRoute, { token: pb.adminToken })).status, 404);

  const draft = await pb.request('collections/likes_items/records', { token: pb.adminToken, method: 'POST', body: { title: 'Private note', type: 'note', body: 'Do not leak this draft' } });
  assert.equal(draft.status, 200);
  assert.equal((await preparePublishedContent(env)).content.some(entry => entry.slug === draft.data.id), false);
  const published = await pb.request(`collections/likes_items/records/${draft.data.id}`, { token: pb.adminToken, method: 'PATCH', body: { title: 'Public note', body: 'Published body', published: true } });
  assert.equal(published.status, 200);
  assert.equal((await preparePublishedContent(env)).content.find(entry => entry.slug === draft.data.id).data.body, 'Published body');
  const withdrawn = await pb.request(`collections/likes_items/records/${draft.data.id}`, { token: pb.adminToken, method: 'PATCH', body: { published: false } });
  assert.equal(withdrawn.status, 200);
  assert.equal((await preparePublishedContent(env)).content.find(entry => entry.slug === draft.data.id).state, 'unpublished');
});
