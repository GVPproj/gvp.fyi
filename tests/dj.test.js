import assert from 'node:assert/strict';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { parseHTML } from 'linkedom';
import { createBuildFixture } from './build-fixture.js';
import sharp from 'sharp';
import { chromium } from 'playwright-core';
const listeningUrl = 'https://www.mixcloud.com/afriendlywave/graham-van-pelt-afw-live-on-chir-fm-101326/';
let fixture;
let workspace;
const build = () => workspace.build();

async function page(path) {
  return parseHTML(await readFile(join(fixture, 'dist', path, 'index.html'), 'utf8')).document;
}

before(async () => {
  workspace = await createBuildFixture('dj');
  fixture = workspace.directory;
  // Keep mutation/keyboard scenarios independent of the growing real catalogue.
  // dj-catalogue.test.js builds and checks every published recording.
  for (const name of await readdir(join(fixture, 'src/content/dj'))) {
    if (name !== 'afw-2026-10-20') await rm(join(fixture, 'src/content/dj', name), { recursive: true });
  }
  await build();
});

after(async () => {
  await workspace?.cleanup();
});

async function addEpisode(slug, data = {}) {
  const directory = join(fixture, 'src/content/dj', slug);
  await mkdir(directory, { recursive: true });
  await cp(join(fixture, 'src/content/dj/afw-2026-10-20/artwork.jpg'), join(directory, 'artwork.jpg'));
  await writeFile(join(directory, 'index.md'), `---\n${JSON.stringify({
    id: slug, slug, category: 'a-friendly-wave', title: slug,
    credit: 'Hosted by Graham Van Pelt', artwork: './artwork.jpg',
    broadcast: { status: 'verified', date: '2024-06-01', source: 'https://example.com/broadcast' },
    duration_seconds: 3600, mixcloud: `https://www.mixcloud.com/afriendlywave/${slug}/`,
    sources: [{ label: 'Programme archive', url: 'https://example.com/archive' }], ...data,
  })}\n---\n`);
  return directory;
}

test('navigation exposes DJ directly and leaves Now disabled in both menus', async () => {
  const document = await page('dj');
  for (const [selector, labels] of [
    ['.desktop > ul > li', ['Software', 'Music', 'DJ', 'Likes', 'Blog', 'Now']],
    ['#site-nav > ul > li', ['Home', 'Software', 'Music', 'DJ', 'Likes', 'Blog', 'Now']],
  ]) {
    const items = [...document.querySelectorAll(selector)];
    assert.deepEqual(items.map(item => item.textContent.trim()), labels);
    const now = items.at(-1).querySelector('[aria-disabled="true"]');
    assert.ok(now);
    assert.equal(now.hasAttribute('href'), false);
    assert.equal(now.tabIndex, -1);
    assert.equal(items.at(-1).querySelector('a, button'), null);
  }
  for (const link of document.querySelectorAll('nav a[href="/dj/"]')) {
    assert.equal(link.getAttribute('aria-current'), 'page');
  }
  assert.equal(document.querySelectorAll('nav a[href="/dj/"]').length, 2);
});

test('verified broadcasts sort newest first while uncertain dates stay explicit', async () => {
  const directories = [];
  try {
    directories.push(await addEpisode('older-uploaded-2099', {
      broadcast: { status: 'verified', date: '2025-01-02', source: 'https://example.com/older' },
    }));
    directories.push(await addEpisode('newer-uploaded-2000', {
      broadcast: { status: 'verified', date: '2026-11-02', source: 'https://example.com/newer' },
    }));
    directories.push(await addEpisode('uncertain-date', {
      broadcast: { status: 'uncertain', note: 'October 2026; exact day unverified' },
    }));
    directories.push(await addEpisode('unknown-date', { broadcast: { status: 'unknown' } }));
    await build();
    const overview = await page('dj');
    assert.deepEqual([...overview.querySelectorAll('.content-row a')].map(link => link.getAttribute('href')),
      ['/dj/newer-uploaded-2000', '/dj/afw-2026-10-20', '/dj/older-uploaded-2099', '/dj/uncertain-date', '/dj/unknown-date']);
    for (const [slug, message] of [
      ['uncertain-date', /Broadcast date uncertain.*October 2026; exact day unverified/],
      ['unknown-date', /Broadcast date unknown/],
    ]) {
      const detail = await page(`dj/${slug}`);
      assert.match(detail.querySelector('.broadcast-date').textContent, message);
      assert.equal(detail.querySelector('.broadcast-date time'), null);
      assert.match(overview.querySelector(`a[href="/dj/${slug}"]`).textContent, message);
    }
  } finally {
    for (const directory of directories) await rm(directory, { recursive: true, force: true });
    await build();
  }
});

test('a shared Island City recording stays in its programme regardless of uploader', async () => {
  const directory = await addEpisode('shared-island-city', {
    category: 'island-city', credit: 'Shared broadcast — Graham Van Pelt and Guest Presenter',
    duration_seconds: 7205,
  });
  await sharp({ create: { width: 640, height: 320, channels: 3, background: '#88c0d0' } })
    .jpeg().toFile(join(directory, 'artwork.jpg'));
  try {
    await build();
    const overview = await page('dj');
    const cards = [...overview.querySelectorAll('a[href="/dj/shared-island-city"]')];
    assert.equal(cards.length, 1);
    assert.equal(cards[0].closest('section').getAttribute('aria-labelledby'), 'programme-island-city-heading');
    const detail = await page('dj/shared-island-city');
    assert.match(detail.querySelector('main').textContent, /Shared broadcast — Graham Van Pelt and Guest Presenter/);
    assert.equal(detail.querySelector('.recording-duration time').textContent, '2:00:05');
    assert.equal(detail.querySelector('main img').getAttribute('width'), '640');
    assert.equal(detail.querySelector('main img').getAttribute('height'), '320');
    assert.equal(detail.querySelectorAll('main iframe, main audio, main video').length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await build();
  }
});

test('DJ rows lead to a verified local episode and external listening, never a player', async () => {
  const overview = await page('dj');
  assert.deepEqual([...overview.querySelectorAll('.content-row h2')].map(el => el.textContent),
    ['A Friendly Wave', 'Island City', 'Other Appearances']);
  assert.equal(overview.querySelectorAll('.empty-preview').length, 2);
  const card = overview.querySelector('.content-row a');
  assert.equal(card.getAttribute('href'), '/dj/afw-2026-10-20');
  assert.ok(card.querySelector('img'));
  const detail = await page(card.getAttribute('href'));
  assert.equal(detail.querySelector('main h1').textContent, 'Graham Van Pelt - AFW Live on CHIR FM - 10/20/26');
  assert.match(detail.querySelector('main').textContent, /Hosted by Graham Van Pelt/);
  assert.equal(detail.querySelector('.broadcast-date time').getAttribute('datetime'), '2026-10-20');
  assert.equal(detail.querySelector('.recording-duration time').textContent, '59:45');
  assert.equal(detail.querySelector('.recording-duration time').getAttribute('datetime'), 'PT3585S');
  const listen = [...detail.querySelectorAll('main a')].find(link => link.textContent === 'Listen on Mixcloud');
  assert.equal(listen.getAttribute('href'), listeningUrl);
  assert.ok(detail.querySelector(`a[href="https://api.mixcloud.com/afriendlywave/graham-van-pelt-afw-live-on-chir-fm-101326/"]`));
  assert.ok(detail.querySelector('a[href="https://afriendlywave.com/"]'));
  assert.equal(detail.querySelectorAll('main iframe, main audio, main video, main [download]').length, 0);
  const artwork = detail.querySelector('main img');
  assert.equal(artwork.getAttribute('width'), '1728');
  assert.equal(artwork.getAttribute('height'), '1728');
});

test('publication rejects repeated recording identities, local routes and Mixcloud URL aliases', async () => {
  for (const data of [
    { id: 'afw-2026-10-20', category: 'island-city' },
    { slug: 'afw-2026-10-20' },
    { mixcloud: 'https://mixcloud.com/AFRIENDLYWAVE/GRAHAM-VAN-PELT-AFW-LIVE-ON-CHIR-FM-101326' },
  ]) {
    const directory = await addEpisode('duplicate-recording', data);
    try {
      await assert.rejects(build(), error => {
        assert.match(error.stdout + error.stderr, /Duplicate DJ (id|slug|mixcloud)/);
        return true;
      }, JSON.stringify(data));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  await build();
});

test('publication rejects invalid recording metadata and non-recording listening links', async () => {
  for (const data of [
    { mixcloud: 'https://example.com/account/recording/' },
    { mixcloud: 'http://www.mixcloud.com/account/recording/' },
    { mixcloud: 'https://www.mixcloud.com/account/' },
    { mixcloud: 'https://www.mixcloud.com/account/playlists/' },
    { mixcloud: 'https://www.mixcloud.com/widget/iframe/' },
    { mixcloud: 'https://www.mixcloud.com/account/recording/?download=1' },
    { mixcloud: 'https://user:password@www.mixcloud.com/account/recording/' },
    { category: 'uploading-account' },
    { credit: '   ' },
    { duration_seconds: 0 },
    { duration_seconds: 3.5 },
    { artwork: 'https://example.com/artwork.jpg' },
    { sources: [] },
    { sources: [{ label: 'Unsafe source', url: 'javascript:alert(1)' }] },
    { broadcast: { status: 'verified', date: '2025-02-29', source: 'https://example.com/date' } },
    { broadcast: { status: 'verified', date: '2026-10-20' } },
    { broadcast: { status: 'uncertain', note: 'Not established', date: '2026-01-01' } },
  ]) {
    const directory = await addEpisode('invalid-recording', data);
    try {
      await assert.rejects(build(), error => {
        assert.match(error.stdout + error.stderr, /InvalidContentEntryDataError/);
        return true;
      }, JSON.stringify(data));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  await build();
});

test('desktop and mobile navigation support the published keyboard journey', { timeout: 60_000 }, async () => {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2' };
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = extname(path) ? path : join(path, 'index.html');
    try {
      response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(join(fixture, 'dist', file)));
    } catch {
      response.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const tab = await context.newPage();
    const errors = [];
    tab.on('pageerror', error => errors.push(error.message));
    await tab.goto(`${origin}/`);
    await tab.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'DJ', exact: true }).click();
    await tab.waitForURL('**/dj/');
    const items = tab.locator('.desktop > ul > li');
    for (const width of [1440, 768]) {
      await tab.setViewportSize({ width, height: 1000 });
      const boxes = await items.evaluateAll(elements => elements.map(element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }));
      assert.equal(boxes[0].y, boxes[1].y);
      assert.equal(boxes[1].y, boxes[2].y);
      assert.equal(boxes[3].y, boxes[4].y);
      assert.equal(boxes[4].y, boxes[5].y);
      assert.ok(boxes[3].y > boxes[0].y);
      assert.ok(boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x);
      const header = await tab.locator('.site-header').boundingBox();
      const footer = await tab.locator('.footer-content').boundingBox();
      assert.ok(Math.abs(header.x - footer.x) < 1);
      assert.ok(Math.abs(header.width - footer.width) < 1);
      assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await tab.locator('.site-header .home').focus();
    for (const href of ['/software', '/music', '/dj/']) {
      await tab.keyboard.press('Tab');
      assert.equal(await tab.evaluate(() => document.activeElement.getAttribute('href')), href);
    }
    assert.equal(await tab.locator('.desktop a[href="/dj/"]').evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
    for (const href of ['/likes', '/blog', '/dj/afw-2026-10-20']) {
      await tab.keyboard.press('Tab');
      assert.equal(await tab.evaluate(() => document.activeElement.getAttribute('href')), href);
    }
    await tab.keyboard.press('Enter');
    await tab.waitForURL('**/dj/afw-2026-10-20');
    assert.equal(await tab.locator('.desktop a[href="/dj/"]').getAttribute('aria-current'), 'page');
    const image = tab.locator('main img');
    await image.evaluate(element => element.decode());
    assert.equal(await image.evaluate(element => Math.abs(element.clientWidth / element.clientHeight - element.naturalWidth / element.naturalHeight) < .01), true);
    await tab.getByText('Sources', { exact: true }).click();
    assert.equal(await tab.locator('details').evaluate(element => element.open), true);
    assert.equal(await tab.getByRole('link', { name: 'Listen on Mixcloud', exact: true }).getAttribute('href'), listeningUrl);

    await tab.setViewportSize({ width: 390, height: 844 });
    await tab.getByRole('button', { name: 'Open menu', exact: true }).click();
    const drawer = tab.locator('#site-nav');
    assert.deepEqual(await drawer.locator(':scope > ul > li').allTextContents(), ['Home', 'Software', 'Music', 'DJ', 'Likes', 'Blog', 'Now']);
    const mobileBoxes = await drawer.locator(':scope > ul > li').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().y));
    assert.ok(mobileBoxes.every((y, index) => index === 0 || y > mobileBoxes[index - 1]));
    assert.equal(await drawer.locator('[aria-disabled="true"]').evaluate(element => element.tabIndex), -1);
    assert.equal(await drawer.evaluate(element => getComputedStyle(element).transitionDuration), '0s');
    await tab.keyboard.press('Escape');
    assert.equal(await drawer.evaluate(element => element.matches(':popover-open')), false);
    assert.equal(await tab.getByRole('button', { name: 'Open menu', exact: true }).evaluate(element => element === document.activeElement), true);
    await tab.getByRole('button', { name: 'Open menu', exact: true }).click();
    await drawer.getByRole('link', { name: 'DJ', exact: true }).click();
    await tab.waitForURL('**/dj/');
    assert.equal(await tab.locator('#site-nav').evaluate(element => element.matches(':popover-open')), false);
    assert.equal(await tab.evaluate(() => document.documentElement.style.overflow), '');
    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const preview = await tab.locator('.content-preview').first().boundingBox();
    assert.ok(Math.abs(preview.width - preview.height) < 1);
    await tab.locator('.content-row a').click();
    await tab.waitForURL('**/dj/afw-2026-10-20');
    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await tab.route(listeningUrl, route => route.fulfill({ contentType: 'text/html', body: '<title>Mixcloud boundary</title>' }));
    await tab.getByRole('link', { name: 'Listen on Mixcloud', exact: true }).click();
    await tab.waitForURL(listeningUrl);
    assert.deepEqual(errors, []);

    const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const native = await noScript.newPage();
    await native.goto(`${origin}/`);
    await native.getByRole('button', { name: 'Open menu', exact: true }).click();
    // Poll from Node: page-side timers are disabled in this no-JS context.
    const nativeDrawer = native.locator('#site-nav');
    const deadline = Date.now() + 5000;
    while (await nativeDrawer.evaluate(element => getComputedStyle(element).transform) !== 'none' && Date.now() < deadline) {
      await setTimeout(50);
    }
    assert.equal(await nativeDrawer.evaluate(element => getComputedStyle(element).transform), 'none');
    await native.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('link', { name: 'DJ', exact: true }).click();
    await native.waitForURL('**/dj/');
    await native.locator('.content-row a').click();
    await native.waitForURL('**/dj/afw-2026-10-20');
    assert.equal(await native.getByRole('link', { name: 'Listen on Mixcloud', exact: true }).getAttribute('href'), listeningUrl);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
