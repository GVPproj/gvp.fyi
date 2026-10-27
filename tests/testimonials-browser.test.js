import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

const names = ['Milton Gonzalez', 'Ben Frey', 'Jeff Stefani'];

async function assertSelected(section, name) {
  assert.equal(await section.getByRole('radio', { name, exact: true }).isChecked(), true);
  const visible = section.locator('figure:visible');
  assert.equal(await visible.count(), 1);
  assert.equal(await visible.locator('.person-name').textContent(), name);
}

test('homepage testimonials support native keyboard selection without JavaScript', browserOptions, async t => {
  const { context, base } = await realBrowser(t);
  const native = await context.browser().newContext({ javaScriptEnabled: false });
  t.after(() => native.close());
  const page = await native.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(base);
  const section = page.getByRole('region', { name: 'Testimonials:', exact: true });
  assert.equal(await section.getByRole('heading', { name: 'Testimonials:', level: 2 }).count(), 1);
  assert.equal(await section.getByRole('group', { name: 'Choose a testimonial' }).count(), 1);
  await assertSelected(section, names[0]);
  const first = section.locator('figure').first();
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
  await first.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#testimonials figure img')?.naturalWidth > 0);
  assert.equal(await first.locator('img').evaluate(image => getComputedStyle(image).imageRendering), 'pixelated');

  const radio = section.getByRole('radio', { name: names[0], exact: true });
  await radio.focus();
  await page.keyboard.press('ArrowRight');
  await assertSelected(section, names[1]);
  const focused = section.getByRole('radio', { name: names[1], exact: true });
  assert.equal(await focused.evaluate(input => input === document.activeElement && input.matches(':focus-visible')), true);
  assert.equal(await focused.evaluate(input => {
    const outline = getComputedStyle(input.nextElementSibling.querySelector('img'));
    return outline.outlineStyle === 'solid' && outline.outlineWidth === '3px'
      && outline.outlineOffset === '4px';
  }), true);
  await page.keyboard.press('ArrowRight');
  await assertSelected(section, names[2]);
  await page.keyboard.press('ArrowRight');
  await assertSelected(section, names[0]);
  await page.keyboard.press('ArrowLeft');
  await assertSelected(section, names[2]);
});

test('avatar selection shows one testimonial without overflow at desktop and mobile widths', browserOptions, async t => {
  const { page, base } = await realBrowser(t);
  await page.goto(base);
  const section = page.getByRole('region', { name: 'Testimonials:', exact: true });
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of names) {
      await section.locator('label').filter({ has: page.getByRole('img', { name, exact: true }) }).click();
      await assertSelected(section, name);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
  }
});
