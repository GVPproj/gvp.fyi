import assert from 'node:assert/strict';
import test from 'node:test';
import { accessSync, constants } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { start } from './helpers/publishing-pocketbase.js';

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

test('owner dashboard Save keeps release, tracks and artwork private until keyboard Publish', {
  skip: unavailable(), timeout: 90000,
}, async (t) => {
  const { importRelease } = await import('../scripts/import-release.mjs');
  const { request, base, adminToken } = await start(t);
  const draft = await importRelease({ endpoint: base, token: adminToken });
  assert.equal(draft.publish, false);

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
  assert.equal((await request(publication, { token })).status, 404, 'Imported drafts are not build-visible');

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
  async function saveRecord(collection, id) {
    const saved = page.waitForResponse(response =>
      new URL(response.url()).pathname === `/api/collections/${collection}/records/${id}` &&
      response.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    assert.equal((await saved).status(), 200, 'Dashboard Save succeeds');
    await page.getByRole('button', { name: 'Save changes', exact: true }).waitFor({ state: 'hidden' });
  }
  async function publish(title) {
    await openRecord('publishing_releases', title);
    const command = page.getByRole('checkbox', { name: 'publish', exact: true });
    assert.equal(await command.isChecked(), false, 'Publish command resets after every publication');
    await command.focus();
    await page.keyboard.press('Space');
    assert.equal(await command.isChecked(), true, 'Publish is keyboard operable');
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

  const tracks = await request('collections/publishing_tracks/records?sort=track_num', { token: adminToken });
  assert.equal(tracks.status, 200);
  await openRecord('publishing_tracks', 'Watery Grave');
  await page.getByRole('textbox', { name: /^title\s*\*?$/ }).fill('Private track edit');
  await saveRecord('publishing_tracks', tracks.data.items[0].id);
  assert.deepEqual((await request(publication, { token })).data, first, 'Track Save leaves the publication untouched');

  await openRecord('publishing_releases', 'Watery Grave EP — dashboard edition');
  await page.getByRole('textbox', { name: /^title\s*\*?$/ }).fill('Private release edit');
  await page.getByRole('button', { name: 'Remove file', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'private-artwork.png', mimeType: 'image/png', buffer: replacement });
  await saveRecord('publishing_releases', draft.id);
  // Repeated reads represent separate build fetches, not cached dashboard state.
  for (let build = 0; build < 2; build++) {
    assert.deepEqual((await request(publication, { token })).data, first, 'Unrelated builds see only the last publication');
    assert.deepEqual(await artwork(first), original, 'Working artwork replacement cannot change published bytes');
  }
  const second = await publish('Private release edit');
  assert.notEqual(second.revision, first.revision);
  assert.equal(second.release.title, 'Private release edit');
  assert.equal(second.release.tracks[0].title, 'Private track edit');
  assert.deepEqual(second.release.tracks.slice(1), first.release.tracks.slice(1));
  assert.equal(second.artwork.sha256, hash(replacement));
  assert.equal(second.artwork.width, 800);
  assert.equal(second.artwork.height, 400);
  assert.deepEqual(await artwork(second), replacement);
  assert.deepEqual(await artwork(first), original, 'Previous revision remains downloadable after republishing');
  assert.equal((await request(`${releases}/${draft.id}`, { token: adminToken })).data.publish, false);
  assert.equal((await request(releases, { token })).status, 403, 'Build identity cannot browse private working records');
  assert.equal((await request(publication)).status, 403, 'Visitors cannot fetch private build metadata');
  assert.equal((await fetch(new URL(second.artwork.path, base))).status, 403, 'Visitors cannot download private artwork');
});
