import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';
import { releases, slugOf } from './helpers/release-catalog.js';

test('Release details match blog width and stack players below full-width covers', browserOptions, async (t) => {
  const { base, context, page } = await realBrowser(t);
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());

  await page.goto(`${base}/blog/`);
  const post = await page.getByRole('main').locator('a[href^="/blog/"]').first().getAttribute('href');
  const examples = [releases.find(release => release.album_id), releases.find(release => !release.album_id)].filter(Boolean);
  assert.ok(examples.length > 0);

  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${base}${post}`);
    await page.evaluate(() => document.fonts.ready);
    const blog = await page.locator('article').boundingBox();

    for (const release of examples) {
      await page.goto(`${base}/music-releases/${slugOf(release)}`);
      await page.evaluate(() => document.fonts.ready);
      const article = await page.locator('article').boundingBox();
      const cover = await page.locator('.release-media img').boundingBox();
      assert.ok(Math.abs(article.width - blog.width) < 1, 'Release and blog widths match');
      assert.ok(Math.abs(cover.width - article.width) < 1, 'Cover fills the article width');
      if (release.album_id) {
        const player = await page.locator('iframe').boundingBox();
        assert.ok(player.y >= cover.y + cover.height, 'Player appears below the cover');
        assert.ok(Math.abs(player.x - cover.x) < 1);
        assert.ok(Math.abs(player.width - cover.width) < 1);
      } else {
        assert.equal(await page.locator('iframe').count(), 0);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
  }
});
