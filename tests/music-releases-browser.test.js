import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

// Public titles/categories are the migration contract; the server loads actual
// repository releases and their own artwork, never historical API fixtures.
const categories = [
  { name: 'as Graham Van Pelt', titles: ['The Lookout', 'Atlantis Tapes', 'Under The Heat Dome', 'Salt Spring: Sun and Shadow', 'Sense Appeal EP', 'Time Travel'] },
  { name: 'as Miracle Fortress', titles: ['Even In America', 'Let Me Be the 1', "Here's To Feeling Good All the Time", 'Everything Works EP', 'Was I the Wave?', 'Miscalculations (Promo)', 'Raw Spectacle (Pantha du Prince Remix)', 'Maybe Lately', 'Five Roses', 'Have You Seen In Your Dreams', 'Poetaster (Promo)', 'Watery Grave EP'] },
  { name: 'with Think About Life', titles: ['HBO', 'Family (Japanese Edition)', 'Family', 'Sweet Sixteen', 'Think About Life (Japanese Edition)', 'Black Champagne EP', 'Presents: Miracle Fortress Remixes 2 HITS!', 'Think About Life', 'Paul Cries'] },
  { name: 'Other Credits', titles: ['New Found Land', 'Free Dimensional', 'Fallen Empires (Japanese Edition)', 'National Parks Project', 'Sunglasses EP', 'Show Me Your Stuff (12-inch)', 'No Joy 7"', 'Subterranean Megazit', 'Sing That Yell That Spell'] },
];

async function blockExternalRequests(context, base) {
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
}

test('Music links the real 36-release catalogue and remains keyboard-browsable on mobile', browserOptions, async t => {
  const { base, context, page } = await realBrowser(t);
  await blockExternalRequests(context, base);
  await page.goto(`${base}/music`);
  await page.getByRole('heading', { name: 'Music', exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 700 });
  const artwork = new Set();
  assert.equal(await page.locator('main .content-row li a').count(), 36);
  for (const { name, titles } of categories) {
    const category = page.getByRole('region', { name, exact: true });
    assert.equal(await category.getByRole('link').count(), titles.length);
    for (const title of titles) {
      const link = category.getByRole('link').filter({ has: page.getByText(title, { exact: true }) });
      assert.equal(await link.count(), 1);
      assert.match(await link.getAttribute('href'), /^\/music\/[a-z0-9-]+$/);
      const image = link.locator('img');
      assert.equal(await image.count(), 1);
      assert.equal(new URL(await image.getAttribute('src'), base).origin, base);
      artwork.add(await image.getAttribute('src'));
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(img => img.decode());
    }
    const last = category.getByRole('link').last();
    await last.focus();
    assert.equal(await last.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth;
    }), true);
  }
  assert.ok(artwork.size > 30, 'real releases must not all use a shared sample cover');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('Representative release pages render metadata, listening options and back navigation without JavaScript', browserOptions, async t => {
  const { base, context } = await realBrowser(t);
  const native = await context.browser().newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 700 } });
  t.after(() => native.close());
  await blockExternalRequests(native, base);
  const page = await native.newPage();
  page.setDefaultTimeout(5000);
  // Cover rendering variants and original date precision, not every editorial field.
  const examples = [
    { slug: 'atlantis-tapes', title: 'Atlantis Tapes', artist: 'Graham Van Pelt', date: '2023-02-23', album_id: 2547459725, url: 'https://grahamvanpelt.bandcamp.com/album/atlantis-tapes' },
    { slug: 'even-in-america', title: 'Even In America', artist: 'Miracle Fortress', date: '2014-09-16', streaming: { apple: 'https://music.apple.com/us/album/even-in-america-single/911392433' } },
    { slug: 'miscalculations-promo', title: 'Miscalculations (Promo)', artist: 'Miracle Fortress', date: '2011' },
    { slug: 'no-joy-7', title: 'No Joy 7"', artist: 'No Joy', date: '2009-12-15', album_id: 225174049, url: 'https://nojoy.bandcamp.com/album/no-joy-7', credit: 'Recording, mixing & mastering' },
    { slug: 'family-japanese-edition', title: 'Family (Japanese Edition)', artist: 'Think About Life', date: '2009-10' },
  ];
  for (const release of examples) {
    await page.goto(`${base}/music`);
    await page.getByRole('main').locator(`a[href="/music/${release.slug}"]`).click();
    const main = page.getByRole('main');
    await main.getByRole('heading', { name: release.title, level: 1, exact: true }).waitFor();
    assert.equal(await main.locator('header p').first().textContent(), release.artist);
    assert.equal(await main.locator('time').getAttribute('datetime'), release.date);
    const image = main.getByRole('img');
    assert.equal(new URL(await image.getAttribute('src'), base).origin, base);
    await image.evaluate(img => img.decode());
    assert.equal(await main.locator('iframe').count(), release.album_id ? 1 : 0);
    if (release.album_id) assert.ok((await main.locator('iframe').getAttribute('src')).includes(`/album=${release.album_id}/`));
    if (release.url) assert.equal(await main.getByRole('link', { name: 'Bandcamp', exact: true }).getAttribute('href'), release.url);
    for (const [key, label] of [['spotify', 'Spotify'], ['apple', 'Apple Music'], ['tidal', 'Tidal']]) {
      if (release.streaming?.[key]) assert.equal(await main.getByRole('link', { name: label, exact: true }).getAttribute('href'), release.streaming[key]);
    }
    const listeningLinks = Number(Boolean(release.url)) + Object.values(release.streaming ?? {}).filter(Boolean).length;
    assert.equal(await main.getByRole('navigation', { name: 'Listen to this release' }).count(), listeningLinks ? 1 : 0);
    if (release.credit) assert.ok((await main.locator('.release-credit').textContent()).includes(release.credit));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await main.getByRole('link', { name: '← Music', exact: true }).click();
    await page.getByRole('heading', { name: 'Music', exact: true }).waitFor();
  }
  assert.equal((await page.goto(`${base}/music/not-a-release`)).status(), 404);
});
