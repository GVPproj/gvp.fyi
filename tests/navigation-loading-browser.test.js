import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

test('Slow client navigation shows a progress cursor, live status and top bar on desktop and mobile', browserOptions, async t => {
  const { base, context, page } = await realBrowser(t);
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());

  for (const mobile of [false, true]) {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: mobile ? 'reduce' : 'no-preference' });
    await page.goto(`${base}/film`);
    // Let Vite's initial dependency-discovery reloads settle before holding a
    // response; otherwise a native reload can replace the router mid-click.
    await page.waitForLoadState('networkidle');
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const holdBlog = async route => {
      const response = await route.fetch();
      await pending;
      await route.fulfill({ response });
    };
    await page.route(`${base}/blog`, holdBlog);
    try {
      await page.evaluate(() => {
        window.navigationLoaded = false;
        document.addEventListener('astro:page-load', () => { window.navigationLoaded = true; }, { once: true });
      });
      if (mobile) await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      const nav = page.getByRole('navigation', { name: mobile ? 'Mobile navigation' : 'Main navigation', exact: true });
      await nav.getByRole('link', { name: 'Blog', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-navigation-loading'));
      assert.equal(new URL(page.url()).pathname, '/film', 'The current page remains while the response is pending');
      assert.equal(await page.getByRole('status').textContent(), 'Loading page…');
      assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).cursor), 'progress');
      assert.equal(await page.locator('.desktop a[href="/likes"]').evaluate(el => getComputedStyle(el).cursor), 'progress');
      const bar = await page.locator('#navigation-status').evaluate(el => {
        const style = getComputedStyle(el, '::before');
        return { content: style.content, animation: style.animationName, width: style.width };
      });
      assert.equal(bar.content, '""');
      assert.equal(bar.animation, mobile ? 'none' : 'navigation-loading');
      if (mobile) assert.equal(bar.width, '390px', 'Reduced motion uses a static full-width bar');
      release();
      await page.waitForFunction(() => window.navigationLoaded);
      assert.equal(new URL(page.url()).pathname, '/blog');
      assert.equal(await page.locator('[data-navigation-loading]').count(), 0);
      assert.equal(await page.getByRole('status').textContent(), '');
      assert.notEqual(await page.locator('body').evaluate(el => getComputedStyle(el).cursor), 'progress');
      assert.equal(await page.locator('#navigation-status').evaluate(el => getComputedStyle(el, '::before').content), 'none');
    } finally {
      release();
      await page.unroute(`${base}/blog`, holdBlog);
    }
  }
});

test('Loading cleanup handles rejected loaders, cancellation, aborts and overlapping requests', browserOptions, async t => {
  const { base, page } = await realBrowser(t);
  await page.goto(`${base}/blog`);
  // Exercise the public Astro lifecycle seam without causing native-navigation
  // fallbacks to replace the document before its cleanup can be inspected.
  const results = await page.evaluate(async () => {
    const loading = () => document.documentElement.hasAttribute('data-navigation-loading');
    const prepare = loader => {
      const controller = new AbortController();
      const event = new Event('astro:before-preparation', { cancelable: true });
      Object.assign(event, { signal: controller.signal, loader });
      document.dispatchEvent(event);
      return { event, controller };
    };
    const observations = [];
    const failed = prepare(async () => { throw new Error('Offline'); });
    observations.push(loading());
    try { await failed.event.loader(); } catch {}
    observations.push(loading());

    document.addEventListener('astro:before-preparation', event => event.preventDefault(), { once: true });
    prepare(async () => {});
    await Promise.resolve();
    observations.push(loading());

    let release;
    const old = prepare(() => new Promise(resolve => { release = resolve; }));
    const oldLoad = old.event.loader();
    old.controller.abort();
    observations.push(loading());
    const current = prepare(async () => {});
    observations.push(loading());
    release();
    await oldLoad;
    observations.push(loading());
    await current.event.loader();
    observations.push(loading());

    prepare(async () => {});
    window.dispatchEvent(new Event('pagehide'));
    observations.push(loading());
    return observations;
  });
  assert.deepEqual(results, [true, false, false, false, true, true, false, false]);
  assert.equal(await page.getByRole('status').textContent(), '');
});
