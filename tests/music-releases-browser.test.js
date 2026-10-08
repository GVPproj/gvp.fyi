import assert from 'node:assert/strict';
import test from 'node:test';
import { categories, releases, titleOf, slugOf, dateOf } from './helpers/release-catalog.js';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

async function blockExternalRequests(context, base) {
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
}

test('Music Releases links the current catalogue and remains keyboard-browsable on mobile', browserOptions, async t => {
  const { base, context, page } = await realBrowser(t);
  await blockExternalRequests(context, base);
  await page.goto(`${base}/music-releases`);
  await page.getByRole('heading', { name: 'Music Releases', exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 700 });
  for (const { name, releases } of categories) {
    const category = page.getByRole('region', { name, exact: true });
    assert.equal(await category.getByRole('link').count(), releases.length);
    for (const release of releases) {
      const link = category.locator(`a[href="/music-releases/${slugOf(release)}"]`);
      assert.equal(await link.count(), 1);
      assert.ok((await link.textContent()).includes(titleOf(release)));
      assert.equal(await link.locator('img').count(), 1);
    }
    if (releases.length) {
      const last = category.getByRole('link').last();
      await last.focus();
      assert.equal(await last.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      }), true);
    }
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('Representative release pages render metadata, listening options and back navigation without JavaScript', browserOptions, async t => {
  const { base, context } = await realBrowser(t);
  const native = await context.browser().newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 700 } });
  t.after(() => native.close());
  await blockExternalRequests(native, base);
  const page = await native.newPage();
  page.setDefaultTimeout(5000);
  // Cover rendering variants, not every editorial entry.
  const examples = [...new Set([
    releases.find(release => release.album_id),
    releases.find(release => !release.album_id && release.streaming),
    releases.find(release => !release.album_id && !release.url && !release.streaming && !release.tracks.some(track => track.audio_url)),
    releases.find(release => release.credit),
  ].filter(Boolean))];
  assert.ok(examples.length > 0);
  for (const release of examples) {
    await page.goto(`${base}/music-releases`);
    await page.getByRole('main').locator(`a[href="/music-releases/${slugOf(release)}"]`).click();
    const main = page.getByRole('main');
    await main.getByRole('heading', { name: titleOf(release), level: 1, exact: true }).waitFor();
    assert.equal(await main.locator('header p').first().textContent(), release.artist);
    assert.equal(await main.locator('time').getAttribute('datetime'), dateOf(release));
    const image = main.getByRole('img');
    assert.equal(await image.getAttribute('src'), release.artwork_url ?? `https://f4.bcbits.com/img/a${release.art_id}_16.jpg`);
    if (release.artwork_url?.startsWith('/')) await image.evaluate(img => img.decode());
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
    await main.getByRole('link', { name: '← Music Releases', exact: true }).click();
    await page.getByRole('heading', { name: 'Music Releases', exact: true }).waitFor();
  }
  assert.equal((await page.goto(`${base}/music-releases/not-a-release`)).status(), 404);
});
