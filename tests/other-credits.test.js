import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import otherCredits from '../src/data/releases/other-credits.json' with { type: 'json' };
import grahamVanPelt from '../src/data/releases/graham-van-pelt.json' with { type: 'json' };
import miracleFortress from '../src/data/releases/miracle-fortress.json' with { type: 'json' };
import thinkAboutLife from '../src/data/releases/think-about-life.json' with { type: 'json' };
import { realBrowser, browserOptions } from './helpers/real-browser.js';

const titleOf = release => release.display_title ?? release.title;
const slugOf = release => titleOf(release).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

test('Other Credits contains the eight selected releases with scoped contributions and unique routes', () => {
  assert.equal(otherCredits.length, 8);
  assert.deepEqual(otherCredits.map(release => release.artist).sort(), [
    'Dead Wife', 'Diamond Rings', 'Diamond Rings', 'Grand Trine', 'New Found Land',
    'Sing That Yell That Spell', 'Snow Patrol', 'Various Artists',
  ]);
  for (const release of otherCredits) {
    assert.ok(release.credit?.trim());
    assert.ok(release.about?.trim());
    assert.match(release.release_date, /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/);
    assert.ok(release.album_id && release.art_id && release.url || release.artwork_url);
    if (release.artwork_url?.startsWith('/')) {
      assert.ok(existsSync(new URL(`../public${release.artwork_url}`, import.meta.url)));
    }
  }
  const releases = [...grahamVanPelt, ...miracleFortress, ...thinkAboutLife, ...otherCredits];
  assert.equal(new Set(releases.map(slugOf)).size, releases.length);
});

test('Other Credits exposes artists and contributions on native, narrow-screen release pages', browserOptions, async t => {
  const { base, context } = await realBrowser(t);
  const native = await context.browser().newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 700 } });
  t.after(() => native.close());
  await native.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await native.newPage();
  await page.goto(`${base}/music-releases`);
  const category = page.getByRole('region', { name: 'Other Credits', exact: true });
  assert.equal(await category.getByRole('link').count(), 8);
  for (const release of otherCredits) {
    const link = category.locator(`a[href="/music-releases/${slugOf(release)}"]`);
    assert.ok((await link.textContent()).includes(release.artist));
    assert.ok((await link.textContent()).includes(release.credit));
    await link.click();
    const main = page.getByRole('main');
    await main.getByRole('heading', { name: titleOf(release), exact: true }).waitFor();
    assert.equal(await main.locator('header p').first().textContent(), release.artist);
    assert.equal(await main.locator('.release-credit').textContent(), `Graham Van Pelt — ${release.credit}`);
    assert.equal(await main.locator('time').getAttribute('datetime'), release.release_date);
    assert.equal(await main.locator('iframe').count(), release.album_id ? 1 : 0);
    if (release.album_id) assert.ok((await main.locator('iframe').getAttribute('src')).includes(`/album=${release.album_id}/`));
    if (release.url) assert.equal(await main.getByRole('link', { name: 'Bandcamp', exact: true }).getAttribute('href'), release.url);
    if (release.artwork_url?.startsWith('/')) {
      await main.getByRole('img').evaluate(img => img.decode());
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await main.getByRole('link', { name: '← Music Releases', exact: true }).click();
  }
});
