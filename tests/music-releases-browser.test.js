import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

async function blockExternalRequests(context, base) {
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
}

test('Music Releases presents six linked covers in a horizontally browsable category', browserOptions, async (t) => {
  const { base, context, page } = await realBrowser(t);
  await blockExternalRequests(context, base);
  await page.goto(`${base}/music-releases`);
  await page.getByRole('heading', { name: 'Music Releases', exact: true }).waitFor();
  const category = page.getByRole('region', { name: 'as Graham Van Pelt', exact: true });
  assert.deepEqual(await category.getByRole('link').allTextContents(), [
    'The Lookout', 'Atlantis Tapes', 'Under The Heat Dome',
    'Salt Spring: Sun and Shadow', 'Sense Appeal EP', 'Time Travel',
  ]);
  assert.deepEqual(await category.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href'))), [
    '/music-releases/the-lookout', '/music-releases/atlantis-tapes',
    '/music-releases/under-the-heat-dome', '/music-releases/salt-spring-sun-and-shadow',
    '/music-releases/sense-appeal-ep', '/music-releases/time-travel',
  ]);
  assert.equal(await category.locator('img').count(), 6);
  await page.setViewportSize({ width: 320, height: 700 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const last = category.getByRole('link', { name: 'Time Travel', exact: true });
  await last.focus();
  assert.equal(await last.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth;
  }), true);
});

test('Every cover opens a release detail page with artwork, metadata and listening links', browserOptions, async (t) => {
  const { base, context, page } = await realBrowser(t);
  await blockExternalRequests(context, base);
  const examples = [
    { title: 'The Lookout', date: 'July 2023, Self Released', albumId: '1133752224', streamingCount: 0, description: 'Hello listeners.' },
    { title: 'Atlantis Tapes', date: 'February 2023, Self Released', albumId: '2547459725', streamingCount: 0, description: 'early-morning loop improvisations' },
    { title: 'Under The Heat Dome', date: 'August 2022, Self Released', albumId: '4102581361', streamingCount: 3, description: 'Western North American Heat Dome' },
    { title: 'Salt Spring: Sun and Shadow', date: '2021, Arbutus Records', albumId: '2354237612', streamingCount: 3, description: 'early 2017' },
    { title: 'Sense Appeal EP', date: '2020, No Bad Days / Arbutus Records', albumId: '2329153476', streamingCount: 3, description: 'To order the physical vinyl' },
    { title: 'Time Travel', date: '2018, Arbutus Records', albumId: '1538922128', streamingCount: 3, description: null },
  ];
  await page.goto(`${base}/music-releases`);
  for (const { title, date, albumId, streamingCount, description } of examples) {
    await page.getByRole('region', { name: 'as Graham Van Pelt', exact: true }).getByRole('link', { name: title, exact: true }).click();
    await page.getByRole('heading', { name: title, level: 1, exact: true }).waitFor();
    const main = page.getByRole('main');
    assert.equal(await main.getByRole('img', { name: `${title} album cover`, exact: true }).count(), 1);
    assert.equal(await main.getByText(date, { exact: true }).count(), 1);
    assert.equal(await main.getByText('Graham Van Pelt', { exact: true }).count(), 1);
    const player = main.locator('iframe');
    assert.match(await player.getAttribute('title'), /Bandcamp/);
    assert.ok((await player.getAttribute('src')).includes(`/album=${albumId}/`));
    const bandcamp = main.getByRole('link', { name: 'Bandcamp', exact: true });
    assert.match(await bandcamp.getAttribute('href'), /^https:\/\/grahamvanpelt.bandcamp.com\/album\//);
    assert.equal(await main.getByRole('link', { name: /^(Spotify|Apple Music|Tidal)$/ }).count(), streamingCount);
    if (description) assert.ok((await main.textContent()).includes(description));
    await page.setViewportSize({ width: 320, height: 700 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await main.getByRole('link', { name: '← Music Releases', exact: true }).click();
    await page.getByRole('heading', { name: 'Music Releases', exact: true }).waitFor();
  }
  // Static content and cover navigation also work with JavaScript disabled.
  const native = await context.browser().newContext({ javaScriptEnabled: false });
  t.after(() => native.close());
  await blockExternalRequests(native, base);
  const nativePage = await native.newPage();
  await nativePage.goto(`${base}/music-releases`);
  await nativePage.getByRole('link', { name: 'The Lookout', exact: true }).click();
  await nativePage.getByRole('heading', { name: 'The Lookout', exact: true }).waitFor();
  assert.equal((await nativePage.goto(`${base}/music-releases/not-a-release`)).status(), 404);
});
