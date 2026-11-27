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
  workspace = await createBuildFixture('radio');
  fixture = workspace.directory;
  // Keep mutation/keyboard scenarios independent of the growing real catalogue.
  // radio-catalogue.test.js builds and checks every published recording.
  for (const name of await readdir(join(fixture, 'src/content/radio'))) {
    if (name !== 'afw-2026-10-20') await rm(join(fixture, 'src/content/radio', name), { recursive: true });
  }
  await build();
});

after(async () => {
  await workspace?.cleanup();
});

async function addEpisode(slug, data = {}) {
  const directory = join(fixture, 'src/content/radio', slug);
  await mkdir(directory, { recursive: true });
  await cp(join(fixture, 'src/content/radio/afw-2026-10-20/artwork.jpg'), join(directory, 'artwork.jpg'));
  await writeFile(join(directory, 'index.md'), `---\n${JSON.stringify({
    id: slug, slug, publishedAt: '2026-11-09', category: 'a-friendly-wave', title: slug,
    credit: 'Hosted by Graham Van Pelt', artwork: './artwork.jpg',
    broadcast: { status: 'verified', date: '2024-06-01', source: 'https://example.com/broadcast' },
    duration_seconds: 3600, mixcloud: `https://www.mixcloud.com/afriendlywave/${slug}/`,
    sources: [{ label: 'Programme archive', url: 'https://example.com/archive' }], ...data,
  })}\n---\n`);
  return directory;
}

const desktopLinks = [
  ['Music', '/music'],
  ['Radio', '/radio/'],
  ['Software', '/software'],
  ['Likes', '/likes'],
  ['Blog', '/blog'],
];
const mobileLinks = [['Home', '/'], ...desktopLinks];

test('navigation exposes Radio as a direct, current link in both menus', async () => {
  const document = await page('radio');
  assert.equal(document.querySelector('main h1').textContent, 'Radio');
  for (const [selector, expected] of [
    ['nav[aria-label="Main navigation"] > ul > li', desktopLinks],
    ['nav[aria-label="Mobile navigation"] > .drawer-panel > ul > li', mobileLinks],
  ]) {
    const items = [...document.querySelectorAll(selector)];
    const links = items.map(item => {
      const link = item.querySelector(':scope > a[href]');
      assert.ok(link, `${item.textContent.trim()} must be a direct link`);
      return link;
    });
    assert.deepEqual(links.map(link => [link.textContent.trim(), link.getAttribute('href')]), expected);
    for (const link of links) {
      assert.equal(link.getAttribute('aria-current'), link.getAttribute('href') === '/radio/' ? 'page' : null);
    }
  }
});

test('verified broadcasts sort newest first with uncertain and unknown dates last', async () => {
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
    const overview = await page('radio');
    assert.deepEqual([...overview.querySelectorAll('.content-row a')].map(link => link.getAttribute('href')),
      ['/radio/newer-uploaded-2000', '/radio/afw-2026-10-20', '/radio/older-uploaded-2099', '/radio/uncertain-date', '/radio/unknown-date']);
  } finally {
    for (const directory of directories) await rm(directory, { recursive: true, force: true });
    await build();
  }
});

test('an AFW shared recording keeps its category and original artwork proportions', async () => {
  const directory = await addEpisode('shared-island-city', {
    category: 'a-friendly-wave', credit: 'Shared broadcast — Graham Van Pelt and Guest Presenter',
    duration_seconds: 7205,
  });
  await sharp({ create: { width: 640, height: 320, channels: 3, background: '#88c0d0' } })
    .jpeg().toFile(join(directory, 'artwork.jpg'));
  try {
    await build();
    const overview = await page('radio');
    const cards = [...overview.querySelectorAll('a[href="/radio/shared-island-city"]')];
    assert.equal(cards.length, 1);
    assert.equal(cards[0].closest('section').getAttribute('aria-labelledby'), 'programme-a-friendly-wave-heading');
    const detail = await page('radio/shared-island-city');
    assert.equal(detail.querySelector('main img').getAttribute('width'), '640');
    assert.equal(detail.querySelector('main img').getAttribute('height'), '320');
    assert.equal(detail.querySelectorAll('main iframe, main audio, main video').length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await build();
  }
});

test('Radio rows lead to a verified local episode and external listening, never a player', async () => {
  const overview = await page('radio');
  assert.deepEqual([...overview.querySelectorAll('.content-row h2')].map(el => el.textContent),
    ['A Friendly Wave', 'on FSR.live', 'Other Appearances']);
  assert.equal(overview.querySelectorAll('.empty-preview').length, 2);
  const card = overview.querySelector('.content-row a');
  assert.equal(card.getAttribute('href'), '/radio/afw-2026-10-20');
  assert.ok(card.querySelector('img'));
  const detail = await page(card.getAttribute('href'));
  assert.equal(detail.querySelector('main h1').textContent, 'Graham Van Pelt - AFW Live on CHIR FM - 10/20/26');
  assert.equal(detail.querySelectorAll('main header p').length, 1);
  assert.equal(detail.querySelectorAll('main dl, main time, main details').length, 0);
  const listen = [...detail.querySelectorAll('main a')].find(link => link.textContent === 'Listen on Mixcloud');
  assert.equal(listen.getAttribute('href'), listeningUrl);
  assert.equal(detail.querySelectorAll('main a').length, 2);
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
        assert.match(error.stdout + error.stderr, /Duplicate Radio (id|slug|mixcloud)/);
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
    // The root must retain its explicit name for the global wipe selectors.
    assert.equal(await tab.evaluate(() => getComputedStyle(document.documentElement).viewTransitionName), 'root');
    assert.equal(await tab.evaluate(() => getComputedStyle(document.documentElement, '::view-transition-new(root)').animationName), 'none');
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    assert.equal(await tab.evaluate(() => getComputedStyle(document.documentElement, '::view-transition-new(root)').animationName), 'random-dissolve');
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await tab.locator('meta[name="astro-view-transitions-fallback"]').getAttribute('content'), 'swap');
    const home = tab.getByRole('link', { name: 'Go back to the homepage', exact: true });
    const desktop = tab.getByRole('navigation', { name: 'Main navigation', exact: true });
    const namedLink = (nav, name) => nav.getByRole('link', { name, exact: true });
    const assertFocused = async target => {
      assert.equal(await target.evaluate(element => element === document.activeElement), true, `${target} should have focus`);
    };
    const tabTo = async target => {
      await tab.keyboard.press('Tab');
      await assertFocused(target);
    };
    const assertFocusOutline = async target => {
      assert.equal(await target.evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
    };
    const desktopRadio = namedLink(desktop, 'Radio');
    await tabTo(home);
    await tabTo(namedLink(desktop, 'Music'));
    await tabTo(desktopRadio);
    await assertFocusOutline(desktopRadio);
    await tab.keyboard.press('Enter');
    await tab.waitForURL('**/radio/');
    assert.equal(await desktopRadio.getAttribute('aria-current'), 'page');

    const items = desktop.getByRole('link');
    for (const width of [1440, 768]) {
      await tab.setViewportSize({ width, height: 1000 });
      await tab.evaluate(() => document.fonts.ready);
      const boxes = await items.evaluateAll(elements => elements.map(element => {
        const { left, top, right, width, height } = element.getBoundingClientRect();
        return { left, top, right, width, height };
      }));
      assert.equal(boxes.length, desktopLinks.length);
      const header = await tab.locator('.site-header').boundingBox();
      const footer = await tab.locator('.footer-content').boundingBox();
      for (const [index, box] of boxes.entries()) {
        assert.ok(box.width > 0 && box.height > 0);
        assert.ok(Math.abs(box.top - boxes[0].top) < 1, `desktop links share one row at ${width}px`);
        assert.ok(index === 0 || box.left >= boxes[index - 1].right, `desktop links do not overlap at ${width}px`);
        assert.ok(box.left >= header.x && box.right <= header.x + header.width, `desktop links fit inside the header at ${width}px`);
      }
      assert.ok(Math.abs(header.x - footer.x) < 1);
      assert.ok(Math.abs(header.width - footer.width) < 1);
      assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    const episodeLink = tab.locator('.content-row a');
    await home.focus();
    for (const [name] of desktopLinks) await tabTo(namedLink(desktop, name));
    await tabTo(tab.getByRole('button', { name: /^Switch to (light|dark) theme$/ }));
    await tabTo(episodeLink);
    await tab.keyboard.press('Enter');
    await tab.waitForURL('**/radio/afw-2026-10-20');
    assert.equal(await desktopRadio.getAttribute('aria-current'), 'page');
    const image = tab.locator('main img');
    await image.evaluate(element => element.decode());
    assert.equal(await image.evaluate(element => Math.abs(element.clientWidth / element.clientHeight - element.naturalWidth / element.naturalHeight) < .01), true);
    assert.equal(await tab.getByText('Sources', { exact: true }).count(), 0);
    assert.equal(await tab.getByRole('link', { name: 'Listen on Mixcloud', exact: true }).getAttribute('href'), listeningUrl);

    await tab.setViewportSize({ width: 390, height: 844 });
    const openMenu = tab.getByRole('button', { name: 'Open menu', exact: true });
    const drawer = tab.locator('#site-nav');
    const mobile = tab.getByRole('navigation', { name: 'Mobile navigation', exact: true });
    const closeMenu = mobile.getByRole('button', { name: 'Close menu', exact: true });
    const mobileRadio = namedLink(mobile, 'Radio');
    const isDrawerOpen = () => drawer.evaluate(element => element.matches(':popover-open'));
    const scrollLock = () => tab.evaluate(() => document.documentElement.style.overflow);
    assert.equal(await desktop.isVisible(), false);
    assert.equal(await mobile.isVisible(), false);
    await home.focus();
    await tabTo(tab.getByRole('button', { name: /^Switch to (light|dark) theme$/ }));
    await tabTo(openMenu);
    await assertFocusOutline(openMenu);
    await tab.keyboard.press('Enter');
    assert.equal(await isDrawerOpen(), true);
    assert.equal(await scrollLock(), 'hidden');
    assert.equal(await drawer.evaluate(element => getComputedStyle(element).transitionDuration), '0s');
    assert.equal(await drawer.locator('.drawer-panel').evaluate(element => getComputedStyle(element).transitionDuration), '0s');
    const mobileBoxes = await mobile.getByRole('link').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
    assert.equal(mobileBoxes.length, mobileLinks.length);
    assert.ok(mobileBoxes.every((y, index) => index === 0 || y > mobileBoxes[index - 1]));
    await tabTo(closeMenu);
    for (const [name] of mobileLinks) await tabTo(namedLink(mobile, name));
    await tab.keyboard.press('Escape');
    assert.equal(await isDrawerOpen(), false);
    assert.equal(await scrollLock(), '');
    await assertFocused(openMenu);

    await tab.keyboard.press('Enter');
    await tabTo(closeMenu);
    await tabTo(namedLink(mobile, 'Home'));
    await tabTo(namedLink(mobile, 'Music'));
    await tabTo(mobileRadio);
    await assertFocusOutline(mobileRadio);
    assert.equal(await mobileRadio.getAttribute('aria-current'), 'page');
    await tab.keyboard.press('Enter');
    await tab.waitForURL('**/radio/');
    assert.equal(await isDrawerOpen(), false);
    assert.equal(await scrollLock(), '');
    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const preview = await tab.locator('.content-preview').first().boundingBox();
    assert.ok(Math.abs(preview.width - preview.height) < 1);
    await openMenu.focus();
    await tabTo(episodeLink);
    await tab.keyboard.press('Enter');
    await tab.waitForURL('**/radio/afw-2026-10-20');
    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await tab.route(listeningUrl, route => route.fulfill({ contentType: 'text/html', body: '<title>Mixcloud boundary</title>' }));
    await tab.locator('main a[href="/radio/"]').focus();
    await tabTo(tab.getByRole('link', { name: 'Listen on Mixcloud', exact: true }));
    await tab.keyboard.press('Enter');
    await tab.waitForURL(listeningUrl);
    assert.deepEqual(errors, []);

    const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const native = await noScript.newPage();
    await native.goto(`${origin}/`);
    await native.getByRole('button', { name: 'Open menu', exact: true }).click();
    // Poll from Node: page-side timers are disabled in this no-JS context.
    const nativePanel = native.locator('#site-nav:popover-open .drawer-panel');
    const panelTransform = () => nativePanel.evaluate(element => getComputedStyle(element).transform);
    const deadline = Date.now() + 5000;
    while (await panelTransform() !== 'none' && Date.now() < deadline) await setTimeout(50);
    assert.equal(await panelTransform(), 'none');
    await native.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('link', { name: 'Radio', exact: true }).click();
    await native.waitForURL('**/radio/');
    await native.locator('.content-row a').click();
    await native.waitForURL('**/radio/afw-2026-10-20');
    assert.equal(await native.getByRole('link', { name: 'Listen on Mixcloud', exact: true }).getAttribute('href'), listeningUrl);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
