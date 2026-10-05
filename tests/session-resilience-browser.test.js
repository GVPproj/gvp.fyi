import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';
import { ownerResult, login } from './helpers/owner-session.js';

async function setup(t) {
  const browser = await realBrowser(t);
  const state = { refresh: 200, save: 401 };
  await browser.context.route('https://pb.example/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('auth-with-password')) return route.fulfill({ json: ownerResult() });
    if (path.endsWith('auth-refresh')) return state.refresh === 0 ? route.abort() : route.fulfill({ status: state.refresh, json: ownerResult() });
    if (path === '/api/likes/duplicates') return route.fulfill({ json: { items: [] } });
    if (route.request().method() !== 'GET') {
      const request = route.request();
      if (request.headers()['content-type']?.includes('multipart/form-data')) {
        const data = await new Response(request.postDataBuffer(), { headers: { 'content-type': request.headers()['content-type'] } }).formData();
        state.upload = data.get('asset');
      }
      return route.fulfill({ status: state.save, json: { id: 'saved', title: 'Recovered upload', published: true } });
    }
    return route.fulfill({ json: { items: [], totalPages: 1 } });
  });
  await browser.page.goto(`${browser.base}/likes/manage`);
  await login(browser.page);
  return { ...browser, state };
}

test('login validates existing authentication; rejection permits reauthentication while network errors do not log out', browserOptions, async t => {
  const { page, base, state } = await setup(t);
  state.refresh = 0;
  await page.goto(`${base}/login`);
  await page.locator('#auth-status').filter({ hasText: /connection/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Logged In', exact: true }).isVisible(), true);
  state.refresh = 401;
  await page.reload();
  await page.locator('#auth-status').filter({ hasText: /owner account/ }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/login');
  assert.equal(await page.getByRole('button', { name: 'Logged In', exact: true }).isVisible(), false);
  await page.locator('[name=email]').fill('owner@example.test');
  await page.locator('[name=password]').fill('owner-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(`${base}/`);
});

test('storage failure offers the retained private edit as a downloadable backup without exposing the editor anonymously', browserOptions, async t => {
  const { page } = await setup(t);
  await page.locator('#open-item-editor').click();
  await page.locator('[name=title]').fill('Irreplaceable unsaved text');
  await page.locator('[name=url]').fill('https://example.com');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.locator('#recovery-status').filter({ hasText: /storage is full or unavailable/ }).waitFor();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download unsaved edit backup' }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(backup.title, 'Irreplaceable unsaved text');
  assert.equal(await page.locator('[name=title]').inputValue(), '', 'Anonymous editor is cleared despite retaining a backup');
});

test('a recovered upload survives subsequent navigation without dropping its bytes', browserOptions, async t => {
  const { page, base, state } = await setup(t);
  const bytes = Buffer.from('private upload fixture');
  await page.locator('#open-item-editor').click();
  await page.locator('[name=title]').fill('Recovered upload');
  await page.locator('[name=asset]').setInputFiles({ name: 'private.png', mimeType: 'image/png', buffer: bytes });
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.locator('#session-expired a').click();
  state.save = 200;
  await login(page);
  assert.equal(await page.locator('[name=title]').inputValue(), 'Recovered upload');
  await page.goto(`${base}/`);
  await page.goto(`${base}/likes/manage`);
  if (!await page.locator('#item-editor-dialog').evaluate(dialog => dialog.open)) {
    await page.locator('#open-item-editor').click();
  }
  await page.locator('#save-link').waitFor({ state: 'visible' });
  state.upload = null;
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.locator('#save-status').filter({ hasText: 'Published.' }).waitFor();
  assert.equal(state.upload.name, 'private.png');
  assert.deepEqual(Buffer.from(await state.upload.arrayBuffer()), bytes);
});
