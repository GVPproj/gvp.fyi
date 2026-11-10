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
