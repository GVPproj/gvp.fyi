import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createBuildFixture } from './build-fixture.js';

let workspace, server, browser, origin;
before(async () => {
  if (process.env.LAYOUT_TEST_ORIGIN) {
    origin = process.env.LAYOUT_TEST_ORIGIN;
  } else {
    workspace = await createBuildFixture('detail-layout');
    await workspace.build();
    server = createServer(async (request, response) => {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      try {
        const file = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
        const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
        response.setHeader('Content-Type', type);
        response.end(await readFile(join(workspace.directory, 'dist', file)));
      } catch {
        response.writeHead(404).end();
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = `http://127.0.0.1:${server.address().port}`;
  }
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await workspace?.cleanup();
});

test('Nord cursors preserve interaction states and native fallbacks', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/`);
    const cursor = selector => page.locator(selector).first().evaluate(element => getComputedStyle(element).cursor);
    const expectCursor = async (selector, name, hotspot, fallback) => {
      assert.equal(await cursor(selector), `url("${origin}/cursors/nord/${name}.png") ${hotspot}, ${fallback}`);
    };
    await expectCursor('body', 'default', '0 0', 'default');
    await expectCursor('a[href]', 'pointer', '5 0', 'pointer');
    await expectCursor('button:enabled', 'pointer', '5 0', 'pointer');
    await expectCursor('.latest-post-card h3', 'pointer', '5 0', 'pointer');
    await expectCursor('.home-intro', 'text', '15 15', 'text');

    // Decode the actual assets, not just the CSS declarations.
    for (const name of ['default', 'pointer', 'text', 'ns-resize', 'progress']) {
      assert.deepEqual(await page.evaluate(async name => {
        const image = new Image();
        image.src = `/cursors/nord/${name}.png`;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      }, name), [32, 32]);
    }

    await page.evaluate(() => document.documentElement.setAttribute('data-navigation-loading', ''));
    await expectCursor('a[href]', 'progress', '0 8', 'progress');
    await expectCursor('.home-intro', 'progress', '0 8', 'progress');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectCursor('body', 'progress', '0 8', 'progress');
    await page.evaluate(() => document.documentElement.removeAttribute('data-navigation-loading'));

    await page.emulateMedia({ forcedColors: 'active' });
    assert.equal(await cursor('body'), 'default');
    assert.equal(await cursor('a[href]'), 'pointer');
    assert.equal(await cursor('.home-intro'), 'text');

    await page.emulateMedia({ forcedColors: 'none' });
    await expectCursor('.cd-player button:disabled', 'default', '0 0', 'default');
  } finally {
    await page.close();
  }

  const touch = await browser.newPage({ isMobile: true, hasTouch: true });
  try {
    await touch.goto(`${origin}/`);
    assert.equal(await touch.locator('body').evaluate(element => getComputedStyle(element).cursor), 'default');
    assert.equal(await touch.locator('a[href]').first().evaluate(element => getComputedStyle(element).cursor), 'pointer');
  } finally {
    await touch.close();
  }
});

test('detail articles fill the header/footer column without overflowing mobile', async () => {
  const page = await browser.newPage();
  // No external embeds are needed to measure the local layout.
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  try {
    for (const width of [1564, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const path of ['/likes/john-heward/', '/music/the-lookout/', '/software/tipbox/', '/radio/afw-2026-10-20/', '/blog/the-agent-shepherd/']) {
        await page.goto(`${origin}${path}`);
        await page.evaluate(() => document.fonts.ready);
        const boxes = await page.locator('.site-header, main article, .site-footer').evaluateAll(elements => elements.map(element => {
          const { x, width } = element.getBoundingClientRect();
          return { x, width };
        }));
        assert.equal(boxes.length, 3, path);
        const [header, article, footer] = boxes;
        if (width >= 768) {
          for (const reference of [header, footer]) {
            assert.ok(Math.abs(article.x - reference.x) < 1, `${path} at ${width}: left edge ${article.x} != ${reference.x}`);
            assert.ok(Math.abs(article.width - reference.width) < 1, `${path} at ${width}: width ${article.width} != ${reference.width}`);
          }
        } else {
          assert.ok(article.x >= 0 && article.x + article.width <= width, `${path}: mobile overflow`);
          assert.ok(Math.abs(article.width - (width - 48)) < 1, `${path}: preserve mobile gutters`);
        }
      }
    }
  } finally {
    await page.close();
  }
});

test('music journal cassette players fill the blog post width', async () => {
  const page = await browser.newPage();
  try {
    for (const width of [1564, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${origin}/blog/music-journal-nov-26-2026/`);
      const { bodyWidth, playerWidth, deckWidth, renderedRatio, originalRatio, frameHeight, deckHeight } = await page.locator('.post-body').evaluate(body => {
        const player = body.querySelector('.music-player');
        const frame = body.querySelector('[data-deck-scale]');
        const deck = body.querySelector('.deck');
        const deckBox = deck.getBoundingClientRect();
        return {
          bodyWidth: body.getBoundingClientRect().width,
          playerWidth: player.getBoundingClientRect().width,
          deckWidth: deckBox.width,
          deckHeight: deckBox.height,
          frameHeight: frame.getBoundingClientRect().height,
          renderedRatio: deckBox.width / deckBox.height,
          originalRatio: deck.offsetWidth / deck.offsetHeight,
        };
      });
      assert.ok(Math.abs(playerWidth - bodyWidth) < 1, `at ${width}px: player is ${playerWidth}px wide in a ${bodyWidth}px post`);
      assert.ok(Math.abs(deckWidth - bodyWidth) < 1, `at ${width}px: deck is ${deckWidth}px wide in a ${bodyWidth}px post`);
      assert.ok(Math.abs(renderedRatio - originalRatio) < 0.001, `at ${width}px: recorder should retain its aspect ratio`);
      assert.ok(Math.abs(frameHeight - deckHeight) < 1, `at ${width}px: frame should match the scaled recorder height`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
  } finally {
    await page.close();
  }
});

test('plain blog posts do not load cassette player styles', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/blog/the-agent-shepherd/`);
    assert.equal(await page.locator('music-deck').count(), 0);
    const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href));
    assert.equal(stylesheets.some(url => /music-?player/i.test(url)), false);
  } finally {
    await page.close();
  }
});

test('the homepage CD plays independently of the latest blog card', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
  try {
    await page.goto(`${origin}/`);
    const deck = page.locator('.cd-player');
    const second = deck.locator('[data-fallback] a').nth(1);
    const selected = await second.getAttribute('href');
    await deck.getByRole('button', { name: 'Next track' }).press('Space');
    assert.equal(await deck.getByRole('status').textContent(), await second.textContent());
    const play = deck.getByRole('button', { name: 'Play', exact: true });
    const playIcon = await play.locator('path').getAttribute('d');
    await play.press('Space');
    await page.waitForFunction(src => [...document.querySelectorAll('.cd-player audio')]
      .some(audio => audio.currentTime > 0 && new URL(audio.currentSrc).pathname === src), selected);
    assert.equal(await play.locator('path').getAttribute('d'), playIcon);
    const audio = deck.locator('audio').first();
    await play.press('Space');
    assert.equal(await audio.evaluate(el => el.paused), false);
    await deck.getByRole('button', { name: 'Pause', exact: true }).press('Space');
    assert.ok(await audio.evaluate(el => el.paused && el.currentTime > 0));
    await play.press('Space');
    assert.equal(await audio.evaluate(el => el.paused), false);
    assert.equal(page.url(), `${origin}/`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const card = page.locator('.latest-post-card');
    const href = await card.getAttribute('href');
    assert.match(href, /^\/blog\/(?!music-journal-).+\/$/);
    await card.click();
    await page.waitForURL(`${origin}${href}`);
    assert.equal(await page.locator('.post-body music-deck').count(), 0);
  } finally {
    await page.close();
  }

  const fallback = await browser.newPage({ javaScriptEnabled: false });
  try {
    await fallback.goto(`${origin}/`);
    assert.ok(await fallback.locator('.cd-player audio[controls][src="/audio/audio-journal/Nov-20-2026.mp3"]').isVisible());
    assert.ok(await fallback.locator('.cd-player a[href="/audio/audio-journal/Nov-20-2026.mp3"]').isVisible());
    for (const day of [20, 25, 26]) {
      const path = `/blog/music-journal-nov-${day}-2026/`;
      const mp3 = `/audio/audio-journal/Nov-${day}-2026.mp3`;
      await fallback.goto(`${origin}${path}`);
      const canonical = await fallback.locator('link[rel="canonical"]').getAttribute('href');
      assert.equal(new URL(canonical).pathname, path);
      const deck = fallback.locator('.post-body music-deck');
      const audio = deck.locator('audio[controls]');
      assert.ok(await audio.isVisible());
      assert.equal(await audio.getAttribute('src'), mp3);
      assert.ok(await deck.locator(`[data-fallback] a[download][href="${mp3}"]`).isVisible());
    }
  } finally {
    await fallback.close();
  }
});

test('cassette Stop rewinds and releases the keys without latching itself', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
  try {
    await page.goto(`${origin}/music/watery-grave-ep/#tape-deck`);
    const deck = page.locator('music-deck');
    await deck.getByRole('button', { name: 'Load Secret Passage Way' }).click();
    assert.equal(await deck.locator('[data-title]').innerText(), 'Secret Passage Way');
    assert.match(await deck.locator('[data-download]').getAttribute('href'), /03-secret-passage-way\.mp3$/);
    const play = deck.locator('[data-play]');
    const stop = deck.locator('[data-stop]');
    const position = key => key.evaluate(el => getComputedStyle(el).transform);
    await play.click();
    await page.waitForFunction(() => document.querySelector('music-deck audio').currentTime > 0);
    assert.notEqual(await position(play), 'none');
    await stop.focus();
    await stop.press('Space');
    await page.waitForFunction(() => document.querySelector('music-deck').dataset.state === 'stopped');
    assert.deepEqual(await deck.locator('audio').evaluate(el => [el.paused, el.currentTime]), [true, 0]);
    assert.equal(await position(play), 'none');
    assert.equal(await position(stop), 'none');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  } finally {
    await page.close();
  }
});

test('cassette keys play local sounds except when latched or muted', async () => {
  const page = await browser.newPage({ acceptDownloads: true });
  try {
    await page.addInitScript(() => {
      window.transportSamples = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        const [, offset] = args;
        if (offset > 0) window.transportSamples.push({ offset, rate: this.playbackRate });
        return start.apply(this, args);
      };
    });
    const sprite = page.waitForResponse(response => response.url() === `${origin}/audio/transport/iidx.mp3`);
    await page.goto(`${origin}/music/watery-grave-ep/#tape-deck`);
    assert.equal((await sprite).ok(), true);
    const deck = page.locator('music-deck');
    const play = deck.getByRole('button', { name: 'Play', exact: true });
    const pause = deck.getByRole('button', { name: 'Pause' });
    const mute = deck.getByRole('button', { name: 'Mute' });
    const stop = deck.getByRole('button', { name: 'Stop' });
    const download = deck.getByRole('link', { name: /^Download .* \(MP3\)$/ });
    const waitForState = state => page.waitForFunction(state => document.querySelector('music-deck').dataset.state === state, state);
    const waitForSamples = count => page.waitForFunction(count => window.transportSamples.length >= count, count);

    await play.hover();
    await page.mouse.down();
    await waitForSamples(1);
    assert.deepEqual(await page.evaluate(() => window.transportSamples.map(sample => sample.offset % 1)), [0]);
    await page.mouse.up();
    await waitForSamples(2);
    await waitForState('playing');
    await play.click();
    await play.press('Enter');

    await pause.press('Space');
    await waitForSamples(4);
    await waitForState('paused');
    await pause.click();
    await pause.press('Space');

    await mute.click();
    await waitForSamples(6);
    await play.click();
    await stop.press('Enter');
    await Promise.all([page.waitForEvent('download'), download.click()]);

    await mute.press('Enter');
    await waitForSamples(8);
    await deck.getByRole('button', { name: 'Load Secret Passage Way' }).click();
    const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
    assert.equal(file.suggestedFilename(), '03-secret-passage-way.mp3');
    await waitForSamples(10);
    await stop.click();
    await waitForSamples(12);

    const samples = await page.evaluate(() => window.transportSamples.map(({ offset, rate }) => [offset, rate.value]));
    assert.deepEqual(samples.map(([offset]) => Math.round(offset * 1000) % 1000), Array.from({ length: 6 }, () => [0, 200]).flat());
    assert.ok(samples.every(([offset, rate]) => offset >= 1 && offset <= 4.2 && rate >= 0.899 && rate <= 1.101));
  } finally {
    await page.close();
  }
});

test('blog images scale to the post width without overflowing', async () => {
  const page = await browser.newPage();
  try {
    for (const width of [1564, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${origin}/blog/how-to-mute-password-managers-on-internal-email-fields/`);
      const { bodyWidth, imageWidth, imageHeight, naturalWidth, naturalHeight } = await page
        .locator('.post-body img').evaluate(async image => {
          await image.decode();
          const { width, height } = image.getBoundingClientRect();
          return {
            bodyWidth: image.closest('.post-body').getBoundingClientRect().width,
            imageWidth: width,
            imageHeight: height,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
          };
        });
      assert.ok(Math.abs(imageWidth - Math.min(bodyWidth, naturalWidth)) < 1,
        `at ${width}px: image is ${imageWidth}px wide in a ${bodyWidth}px post`);
      assert.ok(Math.abs(imageHeight - imageWidth * naturalHeight / naturalWidth) < 1,
        `at ${width}px: image should retain its aspect ratio`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
  } finally {
    await page.close();
  }
});

test('content rows reveal batches of 14 and preserve keyboard access', async () => {
  const page = await browser.newPage();
  try {
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/radio/`);
      const row = page.locator('.content-row').filter({ has: page.getByRole('heading', { name: 'on FSR.live', exact: true }) });
      const button = row.getByRole('button', { name: 'Load more on FSR.live items' });
      await button.waitFor({ state: 'visible' });
      const total = await row.locator('li').count();
      assert.ok(total > 14);
      assert.equal(await row.locator('li:visible').count(), 14);
      let visible = 14;
      while (visible < total) {
        await button.focus();
        await page.keyboard.press('Enter');
        assert.equal(await row.locator('li').nth(visible).locator('a').evaluate(link => link === document.activeElement), true);
        visible = Math.min(visible + 14, total);
        assert.equal(await row.locator('li:visible').count(), visible);
      }
      assert.equal(await button.isVisible(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('.content-row').first().getByRole('button').count(), 0);
    }
  } finally {
    await page.close();
  }
});

test('content rows keep every card accessible without JavaScript', async () => {
  const page = await browser.newPage({ javaScriptEnabled: false });
  try {
    await page.goto(`${origin}/radio/`);
    const row = page.locator('.content-row').filter({ has: page.getByRole('heading', { name: 'on FSR.live', exact: true }) });
    assert.ok(await row.locator('li').count() > 14);
    assert.equal(await row.locator('li:visible').count(), await row.locator('li').count());
    assert.equal(await row.getByRole('button', { includeHidden: true }).isVisible(), false);
  } finally {
    await page.close();
  }
});
