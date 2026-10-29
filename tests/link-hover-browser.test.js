import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

async function assertTextShadow(link) {
  await link.page().evaluate(() => document.fonts.ready);
  await link.page().waitForFunction(() => [...document.querySelectorAll('.site-header a')]
    .filter(el => el.checkVisibility() && el.textContent.trim())
    .every(el => el.style.getPropertyValue('--link-text-width')));
  const geometry = await link.evaluate(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const rects = [];
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent;
      if (!text.trim()) continue;
      const range = document.createRange();
      range.setStart(walker.currentNode, text.search(/\S/));
      range.setEnd(walker.currentNode, text.trimEnd().length);
      rects.push(...[...range.getClientRects()].filter(r => r.width && r.height));
    }
    const left = Math.min(...rects.map(r => r.left));
    const right = Math.max(...rects.map(r => r.right));
    const shadow = getComputedStyle(el, '::before');
    return {
      centerError: el.getBoundingClientRect().left + el.clientLeft + parseFloat(shadow.left) - (left + right) / 2,
      widthError: parseFloat(shadow.width) - (right - left),
    };
  });
  assert.ok(Math.abs(geometry.centerError) < 1, JSON.stringify(geometry));
  assert.ok(Math.abs(geometry.widthError) < 1, JSON.stringify(geometry));
}

test('link shadows track text across header layout, navigation and reduced motion', browserOptions, async t => {
  const { base, page } = await realBrowser(t);
  await page.goto(base);
  assert.equal(await page.locator('#hover-prototype').count(), 0);
  const desktop = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  for (const label of ['Software', 'Music', 'Likes', 'Blog']) {
    await assertTextShadow(desktop.getByRole('link', { name: label, exact: true }));
  }
  const blog = desktop.getByRole('link', { name: 'Blog', exact: true });
  await blog.hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.desktop a[href="/blog"]')).translate === '0px -2px');
  await assertTextShadow(blog);
  assert.equal(await blog.evaluate(el => getComputedStyle(el, '::before').translate), '0px 2px');
  await page.mouse.move(0, 0);
  await blog.focus();
  await page.waitForFunction(() => getComputedStyle(document.activeElement, '::before').opacity === '1');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await blog.evaluate(el => getComputedStyle(el).translate), '0px');
  assert.equal(await blog.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/blog');
  await assertTextShadow(desktop.getByRole('link', { name: 'Likes', exact: true }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const mobile = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
  await assertTextShadow(mobile.getByRole('link', { name: 'Likes', exact: true }));
});
