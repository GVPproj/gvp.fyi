import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

test('Blog index opens a readable post and returns to the index without JavaScript', browserOptions, async t => {
  const { base, context } = await realBrowser(t);
  const native = await context.browser().newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 700 } });
  t.after(() => native.close());
  await native.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await native.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(`${base}/blog/`);
  await page.getByRole('heading', { name: 'Blog', level: 1, exact: true }).waitFor();
  const post = page.getByRole('main').locator('a[href^="/blog/"]').first();
  const title = await post.textContent();
  const href = await post.getAttribute('href');
  await post.click();
  assert.equal(new URL(page.url()).pathname, href);
  const article = page.locator('article');
  await article.getByRole('heading', { name: title, level: 1, exact: true }).waitFor();
  assert.ok(await article.locator('.post-body > *').count() > 0, 'The post body renders');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await article.getByRole('link', { name: '← Blog', exact: true }).click();
  await page.getByRole('heading', { name: 'Blog', level: 1, exact: true }).waitFor();
  // A configured legacy URL is a compatibility contract, not a content snapshot.
  await page.goto(`${base}/blog/drawing-my-face/`);
  await page.waitForURL(`${base}/blog/the-animated-face/`);
  assert.equal(await page.locator('article h1').count(), 1);
});
