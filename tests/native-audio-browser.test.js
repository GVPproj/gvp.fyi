import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

import { releases, titleOf, slugOf } from './helpers/release-catalog.js';

const release = releases.find(release => release.tracks.some(track => track.audio_url));
assert.ok(release, 'Keep an audio-bearing release to exercise native playback');
const tracks = release.tracks.filter(track => track.audio_url).map(track => ({ title: track.title, src: track.audio_url }));

async function blockExternalRequests(context, base) {
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
}

for (const javaScriptEnabled of [true, false]) {
  test(`Native audio is accessible and avoids initial downloads (JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'})`, browserOptions, async (t) => {
    const { base, context } = await realBrowser(t);
    const native = await context.browser().newContext({ javaScriptEnabled, viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    t.after(() => native.close());
    await blockExternalRequests(native, base);
    const requests = [];
    native.on('request', request => {
      if (request.resourceType() === 'media' || /\/audio\/|\.mp3(?:\?|$)/.test(request.url())) requests.push(request.url());
    });
    const page = await native.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(`${base}/music-releases/${slugOf(release)}`);
    await page.waitForLoadState('networkidle');
    const main = page.getByRole('main');
    await main.getByRole('heading', { name: titleOf(release), exact: true }).waitFor();
    assert.equal(await main.locator('audio').count(), tracks.length);
    const list = main.locator('ol').filter({ has: page.locator('audio') });
    assert.equal(await list.count(), 1);
    assert.equal(await list.locator('li').count(), tracks.length);
    assert.equal(await list.locator('audio[controls][preload="none"]').count(), tracks.length);
    assert.deepEqual(await list.locator('audio').evaluateAll(players => players.map(audio => ({
      src: audio.getAttribute('src'),
      title: (audio.getAttribute('aria-labelledby') ?? '').trim().split(/\s+/)
        .map(id => document.getElementById(id)?.textContent.trim() ?? '').join(' '),
    }))), tracks.map(({ title, src }) => ({ src, title })));
    for (const [index, { title }] of tracks.entries()) {
      const item = list.locator('li').nth(index);
      const audio = item.locator('audio');
      assert.equal(await audio.count(), 1);
      assert.equal(await item.getByText(title, { exact: true }).count(), 1);
      assert.equal(await audio.evaluate(el => el.controls && el.preload === 'none' && !el.autoplay && !el.hasAttribute('autoplay') && el.paused), true);
      // Focus remains reachable without a custom JavaScript player.
      await audio.focus();
      assert.equal(await audio.evaluate(el => document.activeElement === el), true);
    }
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await list.locator('audio').evaluateAll(players => players.every(audio => {
        const rect = audio.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= innerWidth;
      })), true, `All native controls fit at ${width}px`);
    }
    assert.deepEqual(requests, [], 'No audio is requested before user interaction');
  });
}

test('Local audio supports byte-range responses', browserOptions, async (t) => {
  const { base } = await realBrowser(t);
  for (const { src } of tracks.slice(0, 1)) {
    const response = await fetch(`${base}${src}`, { headers: { Range: 'bytes=0-1023' } });
    assert.equal(response.status, 206, src);
    assert.match(response.headers.get('content-type') ?? '', /^audio\/mpeg(?:;|$)/i, src);
    assert.match(response.headers.get('content-range') ?? '', /^bytes 0-1023\/\d+$/, src);
    assert.equal(response.headers.get('accept-ranges'), 'bytes', src);
    assert.equal((await response.arrayBuffer()).byteLength, 1024, src);
  }
});

test('Native audio loads metadata, seeks and plays', browserOptions, async (t) => {
  const { base, context, page } = await realBrowser(t);
  await blockExternalRequests(context, base);
  await page.goto(`${base}/music-releases/${slugOf(release)}`);
  await page.getByRole('heading', { name: titleOf(release), exact: true }).waitFor();
  const players = page.getByRole('main').locator('ol audio');
  assert.equal(await players.count(), tracks.length);
  if (!await page.evaluate(() => document.createElement('audio').canPlayType('audio/mpeg'))) {
    t.skip('This Chromium build does not support MP3 decoding');
    return;
  }
  for (const [index, { title }] of tracks.slice(0, 1).entries()) {
    const audio = players.nth(index);
    // Explicit loading starts only here, after the separate preload regression check.
    await audio.evaluate(el => el.load());
    await page.waitForFunction(index => {
      const audio = document.querySelectorAll('main ol audio')[index];
      return audio.error || (audio.readyState >= 1 && Number.isFinite(audio.duration) && audio.duration > 0);
    }, index);
    const metadata = await audio.evaluate(el => ({ duration: el.duration, error: el.error?.message ?? null }));
    assert.equal(metadata.error, null, title);
    assert.ok(metadata.duration > 0 && Number.isFinite(metadata.duration), title);
    const target = Math.min(10, metadata.duration / 2);
    await audio.evaluate((el, time) => { el.currentTime = time; }, target);
    await page.waitForFunction(({ index, target }) => {
      const audio = document.querySelectorAll('main ol audio')[index];
      return !audio.seeking && Math.abs(audio.currentTime - target) < 0.5;
    }, { index, target });
    // Playwright evaluation supplies user activation, avoiding autoplay-policy dependencies.
    await audio.evaluate(el => el.play());
    await page.waitForFunction(({ index, target }) => {
      const audio = document.querySelectorAll('main ol audio')[index];
      return !audio.paused && audio.currentTime > target + 0.1;
    }, { index, target });
    assert.equal(await audio.evaluate(el => el.error), null, title);
    await audio.evaluate(el => el.pause());
  }
});
