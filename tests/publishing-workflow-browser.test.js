import assert from 'node:assert/strict';
import test from 'node:test';
import { accessSync, constants } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { start } from './helpers/publishing-pocketbase.js';
import { tracerRelease } from '../src/lib/release-source.js';

function unavailable() {
  for (const name of ['POCKETBASE_BINARY', 'PLAYWRIGHT_CHROMIUM_EXECUTABLE']) {
    if (!process.env[name]) return `Set ${name} to a local executable for the isolated dashboard workflow`;
    try { accessSync(process.env[name], constants.X_OK); }
    catch { return `${name} does not point to an executable`; }
  }
  return false;
}

const releases = 'collections/publishing_releases/records';
const publication = 'publishing/releases/watery-grave-ep';
const originalPath = fileURLToPath(new URL('../public/images/music-releases/watery-grave.jpg', import.meta.url));
const replacement = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAyAAAAGQAQAAAAB+XjmZAAAAPklEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4NndAAAfVRSv0AAAAASUVORK5CYII=', 'base64');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('one native release form saves private drafts, updates published revisions, withdraws and republishes', {
  skip: unavailable(), timeout: 90000,
}, async (t) => {
  const { request, base, adminToken } = await start(t);
  const form = new FormData();
  for (const key of ['title', 'artist', 'release_date', 'display_date', 'about']) form.set(key, tracerRelease[key] ?? '');
  form.set('slug', 'watery-grave-ep');
  form.set('tracks', JSON.stringify(tracerRelease.tracks));
  form.set('artwork', new Blob([await readFile(originalPath)], { type: 'image/jpeg' }), 'watery-grave.jpg');
  const created = await request(releases, { method: 'POST', token: adminToken, body: form });
  assert.equal(created.status, 200, 'Create a release with inline tracks in one Save');
  const draft = created.data;
  assert.equal(draft.published, false);
  assert.ok(Array.isArray(draft.tracks), 'Tracks belong to the release JSON field');
  assert.equal(Object.hasOwn(draft, 'publish'), false);
  assert.equal(Object.hasOwn(draft, 'unpublish'), false);
  assert.equal((await request('collections/publishing_tracks', { token: adminToken })).status, 404);

  // A distinct, narrowly scoped build identity; never expose credentials in diagnostics.
  const email = `${randomBytes(12).toString('hex')}@example.test`;
  const password = randomBytes(24).toString('hex');
  assert.equal((await request('collections/publishing_builds/records', {
    method: 'POST', token: adminToken, body: { email, password, passwordConfirm: password },
  })).status, 200);
  const buildAuth = await request('collections/publishing_builds/auth-with-password', {
    method: 'POST', body: { identity: email, password },
  });
  assert.equal(buildAuth.status, 200);
  const token = buildAuth.data.token;
  assert.equal((await request(publication, { token })).status, 404, 'New drafts are not build-visible');

  const auth = await request('collections/_superusers/auth-refresh', { method: 'POST', token: adminToken });
  assert.equal(auth.status, 200);
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  // The helper exposes a token, not login credentials. Seed the real v0.40.4
  // dashboard auth store with a refreshed server-issued superuser record.
  await context.addInitScript(({ origin, token, record }) => {
    if (location.origin === origin) localStorage.setItem('__pb_superusers__/_', JSON.stringify({ token, record }));
  }, { origin: base, token: auth.data.token, record: auth.data.record });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);

  async function openRecord(collection, title) {
    await page.goto(`${base}/_/#/collections?collection=${collection}`);
    await page.getByRole('cell', { name: title, exact: true }).click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).waitFor();
  }
  async function saveRecord(collection, id, expectedStatus = 200) {
    const saved = page.waitForResponse(response =>
      new URL(response.url()).pathname === `/api/collections/${collection}/records/${id}` &&
      response.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    assert.equal((await saved).status(), expectedStatus, 'Dashboard Save returns the expected status');
    if (expectedStatus === 200) {
      await page.getByRole('button', { name: 'Save changes', exact: true }).waitFor({ state: 'hidden' });
    }
  }
  async function setPublished(value) {
    const toggle = page.getByRole('checkbox', { name: 'published', exact: true });
    assert.equal(await toggle.evaluate(el => el.tagName === 'INPUT' && el.type === 'checkbox'), true);
    assert.equal(await toggle.isChecked(), !value, 'Published persists across form opens');
    await toggle.focus();
    await page.keyboard.press('Space');
    assert.equal(await toggle.isChecked(), value, 'Published is keyboard operable');
  }
  async function editTracks(tracks) {
    // Use the dashboard's native JSON editor, not a separate track record/API save.
    const editor = page.locator('.code-editor[name="tracks"]').getByRole('textbox');
    await editor.fill(JSON.stringify(tracks, null, 2));
  }
  async function publish(title) {
    await openRecord('publishing_releases', title);
    await setPublished(true);
    await saveRecord('publishing_releases', draft.id);
    const result = await request(publication, { token });
    assert.equal(result.status, 200);
    return result.data;
  }
  async function artwork(snapshot) {
    const url = new URL(snapshot.artwork.path, base);
    assert.equal(url.origin, base, 'Snapshot artwork stays on the isolated server');
    const response = await fetch(url, { headers: { Authorization: token }, redirect: 'error' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return Buffer.from(await response.arrayBuffer());
  }

  await openRecord('publishing_releases', 'Watery Grave EP');
  assert.equal(await page.getByRole('checkbox', { name: 'published', exact: true }).isChecked(), false);
  assert.equal(await page.getByRole('checkbox', { name: /^(publish|unpublish)$/ }).count(), 0);
  await page.getByRole('textbox', { name: /^title\s*\*?$/ }).fill('Watery Grave EP — dashboard edition');
  await page.getByRole('button', { name: 'Remove file', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(originalPath);
  await saveRecord('publishing_releases', draft.id);
  assert.equal((await request(publication, { token })).status, 404, 'Dashboard Save does not publish a draft');

  const first = await publish('Watery Grave EP — dashboard edition');
  assert.equal(first.release.slug, 'watery-grave-ep');
  assert.equal(first.release.title, 'Watery Grave EP — dashboard edition');
  assert.equal(first.release.artist, 'Miracle Fortress');
  assert.equal(first.release.release_date, '2005');
  assert.equal(first.release.display_date, 'Winter 2005, Self Released');
  assert.equal(first.release.about, 'A self-released EP from winter 2005.');
  assert.deepEqual(first.release.tracks, [
    { title: 'Watery Grave', track_num: 1, audio_url: '/audio/watery-grave/01-watery-grave.mp3' },
    { title: 'Forgiven', track_num: 2, audio_url: '/audio/watery-grave/02-forgiven.mp3' },
    { title: 'Secret Passage Way', track_num: 3, audio_url: '/audio/watery-grave/03-secret-passage-way.mp3' },
    { title: 'Eschatology', track_num: 4, audio_url: '/audio/watery-grave/04-eschatology.mp3' },
    { title: 'Sacred Flowers', track_num: 5, audio_url: '/audio/watery-grave/05-sacred-flowers.mp3' },
  ]);
  const original = await readFile(originalPath);
  assert.equal(first.artwork.width, 300);
  assert.equal(first.artwork.height, 283);
  assert.equal(first.artwork.sha256, hash(original));
  assert.deepEqual(await artwork(first), original);

  await openRecord('publishing_releases', 'Watery Grave EP — dashboard edition');
  assert.equal(await page.getByRole('checkbox', { name: 'published', exact: true }).isChecked(), true);
  await page.getByRole('textbox', { name: /^title\s*\*?$/ }).fill('Updated published release');
  await editTracks([{ ...first.release.tracks[0], title: 'Updated published track' }, ...first.release.tracks.slice(1)]);
  await page.getByRole('button', { name: 'Remove file', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'private-artwork.png', mimeType: 'image/png', buffer: replacement });
  await saveRecord('publishing_releases', draft.id);
  const updated = await request(publication, { token });
  assert.equal(updated.status, 200);
  const second = updated.data;
  // Repeated build reads see the same coherent revision until another Save.
  for (let build = 0; build < 2; build++) {
    assert.deepEqual((await request(publication, { token })).data, second);
    assert.deepEqual(await artwork(first), original, 'Saving retains earlier published artwork');
  }
  assert.notEqual(second.revision, first.revision);
  assert.equal(second.release.title, 'Updated published release');
  assert.equal(second.release.tracks[0].title, 'Updated published track');
  assert.deepEqual(second.release.tracks.slice(1), first.release.tracks.slice(1));
  assert.equal(second.artwork.sha256, hash(replacement));
  assert.equal(second.artwork.width, 800);
  assert.equal(second.artwork.height, 400);
  assert.deepEqual(await artwork(second), replacement);
  assert.deepEqual(await artwork(first), original, 'Previous revision remains downloadable after republishing');
  assert.equal((await request(`${releases}/${draft.id}`, { token: adminToken })).data.published, true);

  const snapshots = 'collections/publishing_snapshots/records';
  const beforeConflict = await request(`${releases}/${draft.id}`, { token: adminToken });
  const beforeSnapshots = await request(snapshots, { token: adminToken });
  assert.equal(beforeSnapshots.status, 200);
  await openRecord('publishing_releases', 'Updated published release');
  await page.getByRole('textbox', { name: /^title\s*\*?$/ }).fill('Invalid edit must roll back');
  await editTracks([]);
  await saveRecord('publishing_releases', draft.id, 400);
  assert.deepEqual(await request(`${releases}/${draft.id}`, { token: adminToken }), beforeConflict,
    'Invalid published Save atomically rolls back metadata, tracks and Published state');
  assert.deepEqual(await request(snapshots, { token: adminToken }), beforeSnapshots,
    'Invalid published Save creates no snapshot');
  assert.deepEqual((await request(publication, { token })).data, second);

  // Reload discards the rejected form; withdrawal uses only the native bool and Save.
  await openRecord('publishing_releases', 'Updated published release');
  await setPublished(false);
  await saveRecord('publishing_releases', draft.id);
  const withdrawn = await request(publication, { token });
  assert.equal(withdrawn.status, 200);
  assert.ok(withdrawn.data.revision);
  assert.notEqual(withdrawn.data.revision, second.revision);
  assert.deepEqual(withdrawn.data, {
    revision: withdrawn.data.revision, slug: 'watery-grave-ep', state: 'unpublished',
  });
  const working = await request(`${releases}/${draft.id}`, { token: adminToken });
  assert.equal(working.data.published, false, 'Published stays off after withdrawal');
  const afterWithdrawal = await request(snapshots, { token: adminToken });
  assert.equal(afterWithdrawal.status, 200);
  const added = afterWithdrawal.data.items.filter(item =>
    !beforeSnapshots.data.items.some(previous => previous.id === item.id));
  assert.equal(added.length, 1, 'Withdrawal creates one retained snapshot');
  const withdrawalRecord = `${snapshots}/${added[0].id}`;
  for (const method of ['PATCH', 'DELETE']) {
    assert.equal((await request(withdrawalRecord, {
      token: adminToken, method, ...(method === 'PATCH' && { body: { payload: {} } }),
    })).status, 403, 'Withdrawal snapshot is immutable even for the owner');
  }

  await openRecord('publishing_releases', 'Updated published release');
  assert.equal(await page.getByRole('checkbox', { name: 'published', exact: true }).isChecked(), false);
  await page.getByRole('textbox', { name: /^title\s*\*?$/ }).fill('Edited while withdrawn');
  const privateTracks = [{ ...second.release.tracks[0], title: 'Track edited while withdrawn' }, ...second.release.tracks.slice(1)];
  await editTracks(privateTracks);
  await saveRecord('publishing_releases', draft.id);
  assert.deepEqual(await request(publication, { token }), withdrawn, 'Save alone leaves the release unpublished');
  assert.deepEqual(await request(snapshots, { token: adminToken }), afterWithdrawal,
    'Save alone creates no new snapshot');
  assert.deepEqual(await artwork(second), replacement, 'Withdrawal retains previously published artwork');

  const restored = await publish('Edited while withdrawn');
  assert.notEqual(restored.revision, withdrawn.data.revision);
  assert.notEqual(restored.revision, second.revision);
  assert.deepEqual(restored.release, { ...second.release, title: 'Edited while withdrawn', tracks: privateTracks });
  assert.deepEqual(await artwork(restored), replacement);
  assert.deepEqual((await request(withdrawalRecord, { token: adminToken })).data, added[0],
    'Republishing does not rewrite the withdrawal snapshot');
  assert.equal((await request(`${releases}/${draft.id}`, { method: 'DELETE', token: adminToken })).status, 204);
  assert.deepEqual((await request(publication, { token })).data, restored,
    'Deleting the working release retains its last published snapshot');
  assert.deepEqual(await artwork(restored), replacement);
  assert.deepEqual(await artwork(first), original);

  assert.equal((await request(releases, { token })).status, 403, 'Build identity cannot browse private working records');
  assert.equal((await request(publication)).status, 403, 'Visitors cannot fetch private build metadata');
  assert.equal((await fetch(new URL(second.artwork.path, base))).status, 403, 'Visitors cannot download private artwork');
});
