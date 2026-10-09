import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

test('Grouped navigation uses native desktop popovers and mobile disclosures', browserOptions, async (t) => {
  const { base, context, page } = await realBrowser(t);
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.goto(`${base}/blog`);
  const desktop = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  for (const [parent, children] of [['Music', ['Releases', 'Video', 'Film']]]) {
    for (const child of children) {
      await desktop.getByRole('button', { name: parent }).click();
      const menu = page.locator(`#${parent.toLowerCase()}-menu`);
      assert.equal(await menu.evaluate(el => el.matches(':popover-open')), true);
      await menu.getByRole('link', { name: child, exact: true }).click();
      const title = child === 'Releases' ? 'Music Releases' : child;
      const pathname = child === 'Releases' ? '/music-releases' : `/${child.toLowerCase()}`;
      await page.getByRole('heading', { name: title, exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, pathname);
      assert.equal(await desktop.getByRole('button', { name: parent }).getAttribute('class'), 'group-toggle current');
      assert.equal(await page.locator('.dropdown:popover-open').count(), 0);
    }
  }
  const music = desktop.getByRole('button', { name: 'Music' });
  await music.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), 'Releases');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.dropdown:popover-open').count(), 0);
  await music.click();
  const software = desktop.getByRole('link', { name: 'Software', exact: true });
  assert.equal(await software.locator('svg').count(), 0);
  assert.equal(await page.locator('#software-menu').count(), 0);
  await software.click();
  await page.getByRole('heading', { name: 'Software', exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/software');
  assert.equal(await software.getAttribute('aria-current'), 'page');
  assert.equal(await page.locator('.dropdown:popover-open').count(), 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const mobile = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
  const mobileSoftware = mobile.getByRole('link', { name: 'Software', exact: true });
  assert.equal(await mobileSoftware.getAttribute('href'), '/software');
  assert.equal(await mobileSoftware.getAttribute('aria-current'), 'page');
  assert.equal(await mobileSoftware.locator('svg, .chev').count(), 0);
  assert.equal(await mobile.locator('summary').filter({ hasText: 'Software' }).count(), 0);
  await mobile.locator('summary').filter({ hasText: 'Music' }).click();
  await mobile.getByRole('link', { name: 'Film', exact: true }).click();
  await page.getByRole('heading', { name: 'Film', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  assert.equal(await mobile.locator('summary.current').textContent(), 'Music');
  assert.equal(await mobile.getByRole('link', { name: 'Film', exact: true }).getAttribute('aria-current'), 'page');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.documentElement.style.overflow === '');
});
