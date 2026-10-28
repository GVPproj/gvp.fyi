import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

test('Home shows the latest blog post above Testimonials', browserOptions, async t => {
  const { page, base } = await realBrowser(t);
  await page.goto(`${base}/blog/`);
  const latest = page.getByRole('main').locator('li').first();
  const title = await latest.locator('a').textContent();
  const href = await latest.locator('a').getAttribute('href');
  const date = await latest.locator('time').getAttribute('datetime');

  await page.goto(base);
  const card = page.getByRole('region', { name: 'Latest blog post', exact: true });
  assert.equal(await card.getByRole('link', { name: title, exact: true }).getAttribute('href'), href);
  assert.equal(await card.locator('time').getAttribute('datetime'), date);
  assert.equal(await card.evaluate(element => element.classList.contains('pixel-box')), true);
  assert.equal(await card.evaluate(element => Boolean(
    element.compareDocumentPosition(document.getElementById('testimonials')) & Node.DOCUMENT_POSITION_FOLLOWING
  )), true);
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await card.getByRole('link', { name: title, exact: true }).click();
  await page.getByRole('heading', { name: title, level: 1, exact: true }).waitFor();
});

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
  assert.equal(await article.getByRole('img', { name: 'A one-line portrait of my face' }).count(), 1);
  assert.match(await article.locator('pre code').textContent(), /<svg/);
  await article.getByRole('link', { name: 'Sophia', exact: true }).waitFor();
});
