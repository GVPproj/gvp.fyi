import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { fixtureSite, staticServer } from './helpers/fixture-site.js';

const release = { id: 'release-one', slug: 'file-authored-release', order: 0, category: 'other-credits',
  title: 'File-authored release', artist: 'An artist', release_date: '2020', artwork: './cover.png',
  about: 'A release authored as repository files.', tracks: [], album_id: 123, player_height: 400, credit: 'Mixing' };

// Schema, metadata and responsive-variant cases live in music-content.test.js.
// This covers successive deployments and static serving of the real site config.
test('file-authored music builds, serves native artwork offline, and disappears when removed', { timeout: 180000 }, async t => {
  const site = await fixtureSite(t);
  await site.collections([]);
  const artwork = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#369' } }).png().toBuffer();
  await site.entry('music', 'independent-folder', release, { 'cover.png': artwork });
  const initial = await site.build();
  assert.equal(initial.code, 0, initial.logs);
  const html = await initial.html('music/file-authored-release');
  const detail = parseHTML(html).document;
  assert.match(detail.querySelector('.description').textContent, /authored as repository files/);
  assert.equal(detail.querySelector('iframe').getAttribute('height'), '400');
  assert.match(detail.querySelector('iframe').getAttribute('src'), /album=123/);
  assert.equal(detail.querySelector('audio'), null);
  assert.match(detail.querySelector('.release-credit').textContent, /Mixing/);
  const imageURL = detail.querySelector('.release-media img').getAttribute('src');
  assert.match(imageURL, /^\/_astro\//);
  assert.equal((await sharp(await readFile(join(initial.dir, imageURL))).metadata()).width, 300);
  await assert.rejects(initial.html('music/independent-folder'));
  await assert.rejects(initial.html('music/atlantis-tapes'));

  await t.test('deployed artwork and navigation need neither the source checkout nor JavaScript', {
    skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE && 'Set PLAYWRIGHT_CHROMIUM_EXECUTABLE for browser checks',
  }, async () => {
    const origin = await staticServer(t, initial.dir);
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
    t.after(() => browser.close());
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const outgoing = [];
    page.on('request', request => outgoing.push(request.url()));
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${origin}/music/file-authored-release/`);
      await page.locator('.release-media img').evaluate(image => image.decode());
      assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'File-authored release');
      assert.ok(await page.locator('.release-media img').evaluate(image => image.naturalWidth > 0));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByRole('link', { name: '← Music', exact: true }).focus();
      assert.equal(await page.getByRole('link', { name: '← Music', exact: true }).evaluate(link => link === document.activeElement), true);
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'Music', exact: true }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Music', exact: true }).isVisible(), true);
    }
    assert.ok(!outgoing.some(url => /\/api\/|\.mp3(?:\?|$)/.test(url)), 'no backend requests or audio preloading');
  });

  await site.remove('music', 'independent-folder');
  const removed = await site.build();
  assert.equal(removed.code, 0, removed.logs);
  await assert.rejects(removed.html('music/file-authored-release'));
  await assert.rejects(readFile(join(removed.dir, imageURL)));
  const overview = parseHTML(await removed.html('music')).document;
  assert.equal(overview.querySelectorAll('.music-releases li a').length, 0, 'no fallback to historical releases');
  assert.equal(overview.querySelectorAll('.music-releases section').length, 4, 'empty music categories stay visible');
  assert.equal(await initial.html('music/file-authored-release'), html, 'removing source files does not change the previous deployment');
});

test('missing and corrupt required artwork fail a build rather than publish a partial catalogue', { timeout: 180000 }, async t => {
  const site = await fixtureSite(t);
  await site.collections([]);
  const artwork = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#369' } }).png().toBuffer();
  const directory = await site.entry('music', 'required-artwork', release, { 'cover.png': artwork });
  const successful = await site.build();
  assert.equal(successful.code, 0, successful.logs);
  const previous = await successful.html('music/file-authored-release');
  await rm(join(directory, 'cover.png'));
  const missing = await site.build();
  assert.notEqual(missing.code, 0, missing.logs);
  assert.match(missing.logs, /cover\.png|artwork/i);
  await writeFile(join(directory, 'cover.png'), 'not an image');
  const corrupt = await site.build();
  assert.notEqual(corrupt.code, 0, corrupt.logs);
  assert.match(corrupt.logs, /cover\.png|artwork/i);
  assert.equal(await successful.html('music/file-authored-release'), previous);
});
