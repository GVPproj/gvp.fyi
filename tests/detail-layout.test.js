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

test('detail articles fill the header/footer column without overflowing mobile', async () => {
  const page = await browser.newPage();
  // No external embeds are needed to measure the local layout.
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  try {
    for (const width of [1564, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const path of ['/likes/john-heward/', '/music/the-lookout/', '/software/tipbox/', '/dj/afw-2026-10-20/', '/blog/the-agent-shepherd/']) {
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

test('content rows reveal batches of 14 and preserve keyboard access', async () => {
  const page = await browser.newPage();
  try {
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/dj/`);
      const row = page.locator('.content-row').filter({ has: page.getByRole('heading', { name: 'Island City', exact: true }) });
      const button = row.getByRole('button', { name: 'Load more Island City items' });
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
    await page.goto(`${origin}/dj/`);
    const row = page.locator('.content-row').filter({ has: page.getByRole('heading', { name: 'Island City', exact: true }) });
    assert.ok(await row.locator('li').count() > 14);
    assert.equal(await row.locator('li:visible').count(), await row.locator('li').count());
    assert.equal(await row.getByRole('button', { includeHidden: true }).isVisible(), false);
  } finally {
    await page.close();
  }
});
