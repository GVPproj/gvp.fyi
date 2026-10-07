import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

async function blockExternalRequests(context, base) {
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
}

test('Music Releases presents linked covers in horizontally browsable artist categories', browserOptions, async (t) => {
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
  const miracleFortress = page.getByRole('region', { name: 'as Miracle Fortress', exact: true });
  assert.deepEqual(await miracleFortress.getByRole('link').allTextContents(), [
    'Even In America', 'Let Me Be the 1', "Here's To Feeling Good All the Time", 'Everything Works EP',
    'Was I the Wave?', 'Miscalculations (Promo)', 'Raw Spectacle (Pantha du Prince Remix)', 'Maybe Lately',
    'Five Roses', 'Have You Seen In Your Dreams', 'Poetaster (Promo)', 'Watery Grave EP',
  ]);
  assert.deepEqual(await miracleFortress.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href'))), [
    '/music-releases/even-in-america', '/music-releases/let-me-be-the-1',
    '/music-releases/here-s-to-feeling-good-all-the-time', '/music-releases/everything-works-ep',
    '/music-releases/was-i-the-wave', '/music-releases/miscalculations-promo', '/music-releases/raw-spectacle-pantha-du-prince-remix',
    '/music-releases/maybe-lately', '/music-releases/five-roses',
    '/music-releases/have-you-seen-in-your-dreams', '/music-releases/poetaster-promo', '/music-releases/watery-grave-ep',
  ]);
  assert.equal(await miracleFortress.locator('img').count(), 12);
  await page.setViewportSize({ width: 320, height: 700 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const last = category.getByRole('link', { name: 'Time Travel', exact: true });
  await last.focus();
  assert.equal(await last.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth;
  }), true);
});

test('Every cover opens a release detail page with artwork, metadata and available listening links', browserOptions, async (t) => {
  const { base, context, page } = await realBrowser(t);
  await blockExternalRequests(context, base);
  const examples = [
    { title: 'The Lookout', date: 'July 2023, Self Released', albumId: '1133752224', streamingCount: 0, description: 'Hello listeners.' },
    { title: 'Atlantis Tapes', date: 'February 2023, Self Released', albumId: '2547459725', streamingCount: 0, description: 'early-morning loop improvisations' },
    { title: 'Under The Heat Dome', date: 'August 2022, Self Released', albumId: '4102581361', streamingCount: 3, description: 'Western North American Heat Dome' },
    { title: 'Salt Spring: Sun and Shadow', date: '2021, Arbutus Records', albumId: '2354237612', streamingCount: 3, description: 'early 2017' },
    { title: 'Sense Appeal EP', date: '2020, No Bad Days / Arbutus Records', albumId: '2329153476', streamingCount: 3, description: 'To order the physical vinyl' },
    { title: 'Time Travel', date: '2018, Arbutus Records', albumId: '1538922128', streamingCount: 3, description: null },
    { title: 'Was I the Wave?', artist: 'Miracle Fortress', date: '2011, Secret City Records', albumId: '2176362726', streamingCount: 1, description: 'The second Miracle Fortress album' },
    { title: 'Five Roses', artist: 'Miracle Fortress', date: '2007, Secret City Records', albumId: '3809650388', streamingCount: 1, description: 'The debut Miracle Fortress album' },
  ];
  await page.goto(`${base}/music-releases`);
  for (const { title, artist = 'Graham Van Pelt', date, albumId, streamingCount, description } of examples) {
    await page.getByRole('region', { name: `as ${artist}`, exact: true }).getByRole('link', { name: title, exact: true }).click();
    await page.getByRole('heading', { name: title, level: 1, exact: true }).waitFor();
    const main = page.getByRole('main');
    assert.equal(await main.getByRole('img', { name: `${title} album cover`, exact: true }).count(), 1);
    assert.equal(await main.getByText(date, { exact: true }).count(), 1);
    assert.equal(await main.getByText(artist, { exact: true }).count(), 1);
    const player = main.locator('iframe');
    assert.match(await player.getAttribute('title'), /Bandcamp/);
    assert.ok((await player.getAttribute('src')).includes(`/album=${albumId}/`));
    const bandcamp = main.getByRole('link', { name: 'Bandcamp', exact: true });
    const bandcampArtist = artist === 'Miracle Fortress' ? 'miraclefortress' : 'grahamvanpelt';
    assert.ok((await bandcamp.getAttribute('href')).startsWith(`https://${bandcampArtist}.bandcamp.com/album/`));
    assert.equal(await main.getByRole('link', { name: /^(Spotify|Apple Music|Tidal)$/ }).count(), streamingCount);
    if (description) assert.ok((await main.textContent()).includes(description));
    await page.setViewportSize({ width: 320, height: 700 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await main.getByRole('link', { name: '← Music Releases', exact: true }).click();
    await page.getByRole('heading', { name: 'Music Releases', exact: true }).waitFor();
  }
  for (const title of ['Even In America', 'Let Me Be the 1', "Here's To Feeling Good All the Time", 'Everything Works EP', 'Raw Spectacle (Pantha du Prince Remix)']) {
    await page.getByRole('region', { name: 'as Miracle Fortress', exact: true }).getByRole('link', { name: title, exact: true }).click();
    await page.getByRole('heading', { name: title, level: 1, exact: true }).waitFor();
    const main = page.getByRole('main');
    assert.equal(await main.getByRole('img', { name: `${title} album cover`, exact: true }).count(), 1);
    const date = title === 'Everything Works EP' ? '2011, Secret City Records / Republic of Music'
      : title === 'Raw Spectacle (Pantha du Prince Remix)' ? '2011, Secret City Records / RCRD LBL'
      : '2014, Secret City Records';
    if (title === 'Raw Spectacle (Pantha du Prince Remix)') {
      assert.equal(await main.locator('time').getAttribute('datetime'), '2011');
    }
    assert.equal(await main.getByText(date, { exact: true }).count(), 1);
    assert.equal(await main.locator('iframe').count(), 0);
    assert.equal(await main.getByRole('link', { name: 'Bandcamp', exact: true }).count(), 0);
    assert.match(await main.getByRole('link', { name: 'Apple Music', exact: true }).getAttribute('href'), /^https:\/\/music\.apple\.com\/(us|gb)\/album\//);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await main.getByRole('link', { name: '← Music Releases', exact: true }).click();
  }
  for (const [title, date] of [
    ['Watery Grave EP', '2005'], ['Maybe Lately', '2008'], ['Have You Seen In Your Dreams', '2007-03-13'],
    ['Poetaster (Promo)', '2007'], ['Miscalculations (Promo)', '2011'],
  ]) {
    await page.getByRole('region', { name: 'as Miracle Fortress', exact: true }).getByRole('link', { name: title, exact: true }).click();
    const main = page.getByRole('main');
    await main.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.equal(await main.locator('time').getAttribute('datetime'), date);
    const image = main.getByRole('img', { name: `${title} album cover`, exact: true });
    await image.evaluate(img => img.decode());
    assert.ok(await image.evaluate(img => img.naturalWidth > 0));
    assert.match(await image.getAttribute('src'), /^\/images\/music-releases\//);
    assert.equal(await main.locator('iframe').count(), 0);
    assert.equal(await main.getByRole('navigation', { name: 'Listen to this release' }).count(), 0);
    assert.equal(await main.getByText('No listening link is currently available for this release.', { exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await main.getByRole('link', { name: '← Music Releases', exact: true }).click();
  }
  // Static content and cover navigation also work with JavaScript disabled.
  const native = await context.browser().newContext({ javaScriptEnabled: false });
  t.after(() => native.close());
  await blockExternalRequests(native, base);
  const nativePage = await native.newPage();
  await nativePage.goto(`${base}/music-releases`);
  await nativePage.getByRole('link', { name: 'The Lookout', exact: true }).click();
  await nativePage.getByRole('heading', { name: 'The Lookout', exact: true }).waitFor();
  await nativePage.getByRole('link', { name: '← Music Releases', exact: true }).click();
  await nativePage.getByRole('link', { name: 'Five Roses', exact: true }).click();
  await nativePage.getByRole('heading', { name: 'Five Roses', exact: true }).waitFor();
  await nativePage.getByRole('link', { name: '← Music Releases', exact: true }).click();
  await nativePage.getByRole('link', { name: 'Watery Grave EP', exact: true }).click();
  await nativePage.getByRole('heading', { name: 'Watery Grave EP', exact: true }).waitFor();
  assert.equal(await nativePage.locator('time').getAttribute('datetime'), '2005');
  assert.equal((await nativePage.goto(`${base}/music-releases/not-a-release`)).status(), 404);
});
