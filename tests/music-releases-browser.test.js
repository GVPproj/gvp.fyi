import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

test('Music Releases presents six linked covers in a horizontally browsable category', browserOptions, async (t) => {
  const { base, context, page } = await realBrowser(t);
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
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
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const examples = [
    ['The Lookout', 'July 2023, Self Released', '1133752224', 0, 'Hello listeners.'],
    ['Atlantis Tapes', 'February 2023, Self Released', '2547459725', 0, 'early-morning loop improvisations'],
    ['Under The Heat Dome', 'August 2022, Self Released', '4102581361', 3, 'Western North American Heat Dome'],
    ['Salt Spring: Sun and Shadow', '2021, Arbutus Records', '2354237612', 3, 'early 2017'],
    ['Sense Appeal EP', '2020, No Bad Days / Arbutus Records', '2329153476', 3, 'To order the physical vinyl'],
    ['Time Travel', '2018, Arbutus Records', '1538922128', 3, null],
  ];
  await page.goto(`${base}/music-releases`);
  for (const [title, date, albumId, streamingCount, description] of examples) {
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
  await native.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const nativePage = await native.newPage();
  await nativePage.goto(`${base}/music-releases`);
  await nativePage.getByRole('link', { name: 'The Lookout', exact: true }).click();
  await nativePage.getByRole('heading', { name: 'The Lookout', exact: true }).waitFor();
  assert.equal((await nativePage.goto(`${base}/music-releases/not-a-release`)).status(), 404);
});
