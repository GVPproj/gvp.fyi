import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

test('homepage testimonials work without JavaScript and follow the ambient player', browserOptions, async t => {
  const { context, base } = await realBrowser(t);
  const native = await context.browser().newContext({ javaScriptEnabled: false });
  t.after(() => native.close());
  const page = await native.newPage();
  await page.goto(base);
  const section = page.getByRole('region', { name: 'Testimonials', exact: true });
  const first = section.locator('figure').first();
  assert.match(await first.locator('figcaption').textContent(), /Milton Gonzalez/);
  assert.match(await first.locator('figcaption').textContent(), /Senior Software Engineer/);
  assert.deepEqual(await first.locator('blockquote p').allTextContents(), [
    'I had the pleasure of working with Graham, a highly skilled full stack developer who was always proactive in tackling challenges.',
    'His attention to detail ensured clean, efficient, and reliable solutions every time.',
    'Graham is a dedicated professional who would be an asset to any team.',
  ]);
  assert.equal(await section.evaluate(element => {
    const player = document.getElementById('ambient-pad');
    return Boolean(player.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
      && element.getBoundingClientRect().top >= player.getBoundingClientRect().bottom;
  }), true);
  assert.equal(await section.getByRole('heading').count(), 0);
  assert.equal(await page.locator('prototype-switcher, [data-prototype-variant]').count(), 0);
  assert.equal(await page.getByText('From the other side of the desk.', { exact: true }).count(), 0);
  await first.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#testimonials img')?.naturalWidth > 0);
  assert.equal(await first.locator('img').evaluate(image => getComputedStyle(image).imageRendering), 'pixelated');
});

test('testimonials reserve three desktop columns and stack without overflow on mobile', browserOptions, async t => {
  const { page, base } = await realBrowser(t);
  await page.goto(base);
  const section = page.getByRole('region', { name: 'Testimonials', exact: true });
  const columns = () => section.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await columns(), 3);
  const tops = await section.locator('figure').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().top));
  assert.ok(tops.every(top => top === tops[0]));

  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await columns(), 1);
    const rects = await section.locator('figure').evaluateAll(cards => cards.map(card => {
      const { top, bottom } = card.getBoundingClientRect();
      return { top, bottom };
    }));
    assert.ok(rects.every((rect, index) => index === 0 || rect.top >= rects[index - 1].bottom));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
});
