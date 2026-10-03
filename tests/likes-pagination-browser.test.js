import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

const items = Array.from({ length: 25 }, (_, index) => ({
  id: `item${String(100 - index).padStart(11, '0')}`,
  created: '2026-01-01 00:00:00.000Z',
  title: `Saved find ${index + 1}`,
  url: `https://example.test/find/${index + 1}`,
  description: `Original description ${index + 1}`,
  published: true,
  collections: [],
}));
const records = items => ({ page: 1, perPage: 25, totalPages: 1, totalItems: items.length, items });

test('retrying an initial failure keeps usable keyboard focus during loading and success', browserOptions, async t => {
  const { base, context, page } = await realBrowser(t);
  let attempts = 0, release, gateReady;
  const pendingResponse = new Promise(resolve => { gateReady = resolve; });
  await context.route('https://pb.example/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('likes_collections')) return route.fulfill({ json: records([]) });
    if (++attempts === 1) return route.fulfill({ status: 500, json: {} });
    await new Promise(resolve => { release = resolve; gateReady(); });
    return route.fulfill({ json: records([]) });
  });
  await page.goto(`${base}/likes`);
  const retry = page.getByRole('button', { name: 'Retry', exact: true });
  await retry.waitFor();
  const button = page.locator('#retry-read');
  await retry.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#likes-board').getAttribute('aria-busy') === 'true');
  await pendingResponse;
  try {
    assert.equal(await button.isVisible(), true);
    assert.equal(await button.evaluate(node => document.activeElement === node), true);
    assert.equal(await button.getAttribute('aria-disabled'), 'true');
    release();
    await page.waitForFunction(() => document.querySelector('#read-status').textContent === 'No likes yet.');
    assert.equal(await button.evaluate(node => document.activeElement === node), true);
    assert.equal(await button.getAttribute('aria-disabled'), 'false');
  } finally { release?.(); }
});

// Allow layout and native scroll anchoring to run before measuring, without sleeps.
async function paint(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('Load more preserves cards and scroll, retains button focus, and respects focus moved during the request', browserOptions, async t => {
  const { base, context, page } = await realBrowser(t);
  const unexpected = [];
  const scrollChanges = [];
  let release, nextRequests = 0;
  // Real application, layout, and keyboard; simulate only the external PocketBase API.
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === base) return route.continue();
    if (url.origin === 'https://pb.example' && request.method() === 'GET') {
      if (url.pathname === '/api/collections/likes_collections/records') {
        return route.fulfill({ json: records([]) });
      }
      if (url.pathname === '/api/collections/likes_items/records') {
        assert.equal(url.searchParams.get('perPage'), '25');
        const filter = url.searchParams.get('filter');
        assert.match(filter, /published=true/);
        if (filter.includes('created <')) {
          nextRequests++;
          assert.ok(filter.includes(items[23].id), 'Cursor follows the last visible item, not the lookahead');
          await new Promise(resolve => { release = resolve; });
          return route.fulfill({ json: records([items[24]]) });
        }
        return route.fulfill({ json: records(items) });
      }
    }
    unexpected.push(request.url());
    return route.abort();
  });

  for (const moveFocus of [false, true]) {
    await page.goto(`${base}/likes`);
    await page.waitForFunction(() => document.querySelectorAll('#likes-board > li').length === 24
      && document.querySelector('#load-more').getAttribute('aria-disabled') === 'false');
    await page.evaluate(() => document.fonts.ready);
    const more = page.locator('#load-more');
    const lastLink = page.locator('#likes-board > li').last().getByRole('link');
    // Reach Load more using actual sequential keyboard navigation.
    await lastLink.focus();
    await page.keyboard.press('Tab');
    assert.equal(await more.evaluate(node => document.activeElement === node), true);
    await paint(page);
    const before = await page.evaluateHandle(() => ({
      cards: [...document.querySelectorAll('#likes-board > li')],
      content: [...document.querySelectorAll('#likes-board > li')].map(node => node.outerHTML),
      button: document.querySelector('#load-more'),
      scroll: window.scrollY,
    }));
    assert.ok(await before.evaluate(state => state.scroll > 0), 'Exercise a genuinely scrolled board');
    const requestCount = nextRequests;
    release = undefined;
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#load-more').textContent === 'Loading more…');
    // waitForRequest alone can fire before the route handler installs the response gate.
    await page.waitForFunction(() => document.querySelector('#likes-board').getAttribute('aria-busy') === 'true');
    try {
      await paint(page);
      assert.equal(nextRequests, requestCount + 1);
      assert.equal(typeof release, 'function');
      assert.equal(await more.getAttribute('aria-disabled'), 'true');
      assert.equal(await more.evaluate(node => node.disabled), false, 'aria-disabled must not remove keyboard focus');
      assert.equal(await more.evaluate(node => document.activeElement === node), true, 'Button retains focus while loading');
      assert.equal(await page.locator('#likes-board > li').count(), 24);
      await assertPreserved();

      if (moveFocus) {
        await page.keyboard.press('Shift+Tab');
        assert.equal(await lastLink.evaluate(node => document.activeElement === node), true, 'User can return to an existing item while waiting');
        await paint(page);
      }
      const responseScroll = await page.evaluate(() => window.scrollY);
      const focused = await page.evaluateHandle(() => document.activeElement);
      release();
      await page.waitForFunction(() => document.querySelector('#load-more').textContent === 'All likes loaded'
        && document.querySelector('#likes-board').getAttribute('aria-busy') === 'false');
      await paint(page);
      assert.equal(await page.locator('#likes-board > li').count(), 25);
      assert.deepEqual(await page.locator('#likes-board h2').allTextContents(), items.map(item => item.title));
      await assertPreserved(false);
      const appendDelta = Math.abs(await page.evaluate(() => window.scrollY) - responseScroll);
      if (appendDelta > 1) scrollChanges.push({ moveFocus, phase: 'append', delta: appendDelta });
      assert.equal(await focused.evaluate(node => node === document.activeElement), true,
        moveFocus ? 'Completion must not steal existing item focus' : 'Exhaustion retains button focus');
      assert.equal(await more.isVisible(), true);
      assert.equal(await more.getAttribute('aria-disabled'), 'true');
      assert.equal(await more.evaluate(node => node.disabled), false);
      assert.match(await page.locator('#read-status').textContent(), /All likes loaded/);
      await focused.dispose();
    } finally {
      release?.();
      await before.dispose();
    }

    async function assertPreserved(checkScroll = true) {
      const result = await before.evaluate(state => {
        const current = [...document.querySelectorAll('#likes-board > li')];
        return {
          sameNodes: state.cards.every((node, index) => node.isConnected && current[index] === node),
          sameContent: state.cards.every((node, index) => node.outerHTML === state.content[index]),
          sameButton: state.button === document.querySelector('#load-more'),
          scrollDelta: Math.abs(window.scrollY - state.scroll),
        };
      });
      assert.equal(result.sameNodes, true, 'Every existing card node survives');
      assert.equal(result.sameContent, true, 'Existing card content remains intact');
      assert.equal(result.sameButton, true, 'Keep the original Load more control');
      if (checkScroll && result.scrollDelta > 1) {
        scrollChanges.push({ moveFocus, phase: 'loading', delta: result.scrollDelta });
      }
    }
  }
  assert.deepEqual(unexpected, [], 'No unmocked backend or external requests');
  // Report scroll regressions after exercising both focus paths.
  assert.deepEqual(scrollChanges, [], 'Loading and appending must preserve scroll (within one CSS pixel)');
});
