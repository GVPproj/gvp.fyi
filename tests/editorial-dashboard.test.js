import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { start } from './helpers/publishing-pocketbase.js';
import { importEditorial } from '../scripts/import-editorial.mjs';
import { preparePublishedContent } from '../scripts/published-content.mjs';
import { materializeSoftware } from '../src/lib/editorial-source.js';

test('native dashboard publishes software JSON, replaces its image and publishes a quote', {
  skip: !(process.env.POCKETBASE_BINARY && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) && 'Set PocketBase and Chromium paths', timeout: 90000,
}, async t => {
  const pb = await start(t);
  await importEditorial({ endpoint: pb.base, token: pb.adminToken });
  const records = await pb.request('collections/editorial_entries/records?perPage=100', { token: pb.adminToken });
  const project = records.data.items.find(record => record.slug === 'tipbox');
  const quote = await pb.request('collections/likes_items/records', { token: pb.adminToken, method: 'POST', body: { title: 'Quote fixture', type: 'quote', body: 'A fixture quotation.', attribution: 'Test author' } });
  assert.equal(quote.status, 200);
  const email = 'build@example.test', password = 'fixture-build-password';
  assert.equal((await pb.request('collections/publishing_builds/records', { token: pb.adminToken, method: 'POST', body: { email, password, passwordConfirm: password } })).status, 200);
  const env = { PUBLISHING_CONTENT: 'true', PUBLISHING_POCKETBASE_URL: pb.base, PUBLISHING_BUILD_EMAIL: email, PUBLISHING_BUILD_PASSWORD: password };
  const auth = await pb.request('collections/_superusers/auth-refresh', { method: 'POST', token: pb.adminToken });
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(({ origin, token, record }) => {
    if (location.origin === origin) localStorage.setItem('__pb_superusers__/_', JSON.stringify({ token, record }));
  }, { origin: pb.base, token: auth.data.token, record: auth.data.record });
  await context.route('**/*', route => new URL(route.request().url()).origin === pb.base ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  async function open(collection, label) {
    await page.goto(`${pb.base}/_/#/collections?collection=${collection}`);
    await page.getByRole('cell', { name: label, exact: true }).click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).waitFor();
  }
  async function save(collection, id) {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === `/api/collections/${collection}/records/${id}` && response.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    assert.equal((await pending).status(), 200);
    await page.getByRole('button', { name: 'Save changes', exact: true }).waitFor({ state: 'hidden' });
  }
  await open('editorial_entries', 'tipbox');
  await page.locator('.code-editor[name="data"]').getByRole('textbox').fill(JSON.stringify({ ...project.data, title: 'Dashboard-edited project' }, null, 2));
  const toggle = page.getByRole('checkbox', { name: 'published', exact: true });
  await toggle.focus(); await page.keyboard.press('Space');
  await save('editorial_entries', project.id);
  const before = (await preparePublishedContent(env)).content.find(entry => entry.slug === 'tipbox');
  assert.equal(materializeSoftware(before).title, 'Dashboard-edited project');
  await open('editorial_entries', 'tipbox');
  await page.getByRole('button', { name: 'Remove file', exact: true }).first().click();
  const buffer = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#123456' } }).png().toBuffer();
  await page.locator('input[type="file"]').setInputFiles({ name: 'new-screenshot.png', mimeType: 'image/png', buffer });
  await save('editorial_entries', project.id);
  const after = (await preparePublishedContent(env)).content.find(entry => entry.slug === 'tipbox');
  assert.notEqual(after.revision, before.revision);
  assert.notEqual(materializeSoftware(after).screenshot, materializeSoftware(before).screenshot);
  assert.equal(materializeSoftware(after).screenshotWidth, 20);
  await open('likes_items', 'Quote fixture');
  await page.getByRole('textbox', { name: /^body\s*\*?$/ }).fill('Updated in the native dashboard.');
  await page.getByRole('checkbox', { name: 'published', exact: true }).check();
  await save('likes_items', quote.data.id);
  const snapshot = (await preparePublishedContent(env)).content.find(entry => entry.slug === quote.data.id);
  assert.equal(snapshot.data.body, 'Updated in the native dashboard.');
  assert.equal(snapshot.data.type, 'quote');
});
