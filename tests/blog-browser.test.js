import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

test('Blog links to an MDX post with Markdown and the Astro face animation', browserOptions, async (t) => {
  const { base, context, page } = await realBrowser(t);
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.goto(`${base}/blog/`);
  await page.getByRole('link', { name: 'The animated face', exact: true }).click();
  await page.getByRole('heading', { name: 'The animated face', level: 1, exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/blog/the-animated-face/');
  const article = page.locator('article');
  await article.getByRole('heading', { name: 'The animated face', level: 2, exact: true }).waitFor();
  assert.equal(await article.locator('p').count(), 8);
  const source = await readFile(new URL('../src/components/Face.astro', import.meta.url), 'utf8');
  const displayedSource = await article.locator('pre code').textContent();
  const pathData = source.match(/    d="([^"]*)"/)[1];
  assert.ok(!displayedSource.includes(pathData));
  assert.match(await article.textContent(), /path data omitted for readability/);
  assert.match(displayedSource, /d="…"/);
  assert.ok(displayedSource.trimEnd().endsWith(source.slice(source.indexOf('<style>')).trimEnd()));
  assert.equal(await article.locator('pre').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(46, 52, 64)');
  assert.match(await article.textContent(), /done by my partner Sophia/);
  assert.equal(await article.locator('code').first().textContent(), 'pathLength="1"');
  const path = article.locator('svg.face path');
  assert.equal(await path.getAttribute('pathLength'), '1');
  const animation = await path.evaluate(el => {
    const style = getComputedStyle(el);
    return { duration: style.animationDuration, easing: style.animationTimingFunction };
  });
  assert.deepEqual(animation, { duration: '4s', easing: 'ease-out' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.deepEqual(await path.evaluate(el => {
    const style = getComputedStyle(el);
    return { animation: style.animationName, offset: style.strokeDashoffset };
  }), { animation: 'none', offset: '0px' });
  await page.setViewportSize({ width: 320, height: 700 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await article.getByRole('link', { name: '← Blog', exact: true }).click();
  await page.getByRole('heading', { name: 'Blog', exact: true }).waitFor();
  await page.goto(`${base}/blog/drawing-my-face/`);
  await page.waitForURL(`${base}/blog/the-animated-face/`);
  await page.getByRole('heading', { name: 'The animated face', level: 2, exact: true }).waitFor();
});
