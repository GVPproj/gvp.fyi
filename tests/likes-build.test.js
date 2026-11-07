import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { parseHTML } from 'linkedom';
import { fixtureSite, staticServer } from './helpers/fixture-site.js';

const removedViews = '#collection-filters, #all-items, #likes-board, .likes-grid, nav[aria-label="Likes pagination"]';
function assertStaticRows(document) {
  assert.equal(document.querySelector(removedViews), null, 'no collection navigation or alternate grids');
  assert.equal(document.querySelector('#collection-rows h2 a'), null, 'collection headings are not navigation');
  assert.equal(document.querySelector('a[href*="?collection="], a[href*="?view="], a[href^="#collection-"], a[href="#all-items"]'), null);
  assert.equal(document.querySelectorAll('#collection-rows .content-row').length, 1);
  assert.ok(document.querySelector('#collection-rows a[href="/likes/static-publication-fixture"]'));
  assert.equal(document.querySelectorAll('#collection-rows .content-row li').length, 10, 'rows include all items, not only the former eight previews');
}

test('repository content builds static Likes without credentials, a backend or JavaScript', { timeout: 120000 }, async t => {
  const site = await fixtureSite(t);
  await site.collections([{ id: 'group1', name: 'Reading' }]);
  const note = { id: 'publicnote00001', slug: 'static-publication-fixture', title: 'Static publication fixture', type: 'note',
    body: 'Works with the backend offline.', created: '2026-01-01 12:00:00Z', collections: ['group1'] };
  await site.entry('likes', 'a-note-folder', note);
  const image = await sharp({ create: { width: 320, height: 320, channels: 3, background: '#336699' } }).png().toBuffer();
  await site.entry('likes', 'an-image-folder', { id: 'publicimage001', slug: 'published-image-fixture', title: 'Published image fixture',
    image: './fixture.png', created: note.created, collections: ['group1'] }, { 'fixture.png': image });
  for (let i = 0; i < 8; i++) await site.entry('likes', `extra-${i}`, { ...note, id: `extra-id-${i}`, slug: `extra-note-${i}`, title: `Extra note ${i}`, body: 'More row content' });
  const result = await site.build();
  assert.equal(result.code, 0, result.logs);
  const overview = await result.html('likes');
  const detail = await result.html('likes/static-publication-fixture');
  assert.match(await result.html('likes/publicnote00001'), /url=\/likes\/static-publication-fixture/i);
  assert.match(await result.html('links'), /url=\/likes/i);
  const imageDetail = await result.html('likes/published-image-fixture');
  assert.doesNotMatch(imageDetail, /Open original image/);
  assert.match(overview, /Static publication fixture/);
  assert.match(overview, /Reading/);
  assert.match(detail, /Works with the backend offline/);
  assertStaticRows(parseHTML(overview).document);
  const imageURL = parseHTML(imageDetail).document.querySelector('#like-detail img').getAttribute('src');
  assert.match(imageURL, /^\/_astro\//);
  assert.equal((await sharp(await readFile(join(result.dir, imageURL))).metadata()).width, 320);
  for (const html of [overview, detail, imageDetail]) assert.doesNotMatch(html, /api\/files|api\/publishing|owner-session|manage-likes/);
  for (const route of ['likes/withdrawn000001', 'likes/manage', 'login']) await assert.rejects(result.html(route));

  await t.test('static rows and native navigation work on desktop/mobile with external requests blocked', {
    skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE && 'Set PLAYWRIGHT_CHROMIUM_EXECUTABLE for browser checks',
  }, async () => {
    const origin = await staticServer(t, result.dir);
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
    t.after(() => browser.close());
    for (const javaScriptEnabled of [true, false]) {
      const context = await browser.newContext({ javaScriptEnabled });
      const page = await context.newPage();
      const apiRequests = [];
      page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(`${origin}/likes/`);
        assert.equal(await page.locator('#collection-rows').isVisible(), true);
        const preview = page.locator('#collection-rows img');
        assert.match(await preview.getAttribute('src'), /^\/_astro\//);
        await preview.scrollIntoViewIfNeeded();
        await preview.evaluate(image => image.decode());
        assert.ok(await preview.evaluate(image => image.naturalWidth > 0));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        for (const suffix of ['?collection=group1', '?view=all', '#collection-group1', '#all-items']) {
          await page.goto(`${origin}/likes/${suffix}`);
          assertStaticRows(parseHTML(await page.content()).document);
        }
        await page.locator('#collection-rows').getByRole('link', { name: /Static publication fixture/ }).click();
        await page.waitForURL(/\/likes\/static-publication-fixture\/?$/);
        assert.match(await page.locator('#like-detail').textContent(), /Works with the backend offline/);
        await page.reload();
        assert.equal(await page.locator('#like-detail').isVisible(), true);
        if (javaScriptEnabled) await page.getByRole('link', { name: '← Likes', exact: true }).click();
        else await page.goBack();
        await page.locator('#collection-rows').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#collection-rows').isVisible(), true);
        await page.goto(`${origin}/likes/publicnote00001/`);
        await page.waitForURL(/\/likes\/static-publication-fixture\/?$/);
        assert.equal(await page.locator('#like-detail').isVisible(), true);
      }
      assert.deepEqual(apiRequests, []);
      await context.close();
    }
  });
});
