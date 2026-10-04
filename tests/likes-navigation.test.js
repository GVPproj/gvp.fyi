import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';
import { ownerResult, login } from './helpers/owner-session.js';

test('Likes named filters survive refresh, Blog navigation, and browser Back/Forward', browserOptions, async (t) => {
  const { base, context, page } = await realBrowser(t);
  const unexpected = [];
  const groups = [{ id: 'music0000000001', name: 'Music' }, { id: 'books0000000001', name: 'Books' }];
  const items = [
    { id: 'item00000000001', title: 'Music find', collections: [groups[0].id] },
    { id: 'item00000000002', title: 'Book find', collections: [groups[1].id] },
    { id: 'item00000000003', title: 'Ungrouped find', collections: [] },
  ].map((item) => ({ ...item, published: true, url: 'https://example.test/find', description: '' }));
  // Real application and router; only the external backend is simulated.
  // Abort every other external request, including accidental production traffic.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.origin === 'https://pb.example' && url.pathname.endsWith('/auth-with-password')) return route.fulfill({ json: ownerResult() });
    if (url.searchParams.get('filter') === 'published=false') return route.fulfill({ json: { items: [], totalPages: 1 } });
    if (url.origin === 'https://pb.example' && route.request().method() === 'GET') {
      const records = url.pathname === '/api/collections/likes_collections/records' ? groups
        : url.pathname === '/api/collections/likes_items/records' ? items : null;
      if (records) return route.fulfill({ json: { page: 1, perPage: 200, totalPages: 1, totalItems: records.length, items: records } });
    }
    unexpected.push(route.request().url());
    await route.abort();
  });
  const namedURL = (id) => `${base}/likes?collection=${id}`;
  async function expectFilter(name, titles) {
    await page.getByRole('heading', { name: 'Likes', exact: true }).waitFor();
    await page.locator('#collection-filters').getByRole('link', { name, exact: true }).and(
      page.locator('[aria-current="page"]'),
    ).waitFor();
    await page.waitForFunction((expected) => JSON.stringify([...document.querySelectorAll('#likes-board h2')]
      .map((heading) => heading.textContent)) === JSON.stringify(expected), titles);
    assert.equal(new URL(page.url()).pathname, '/likes');
    assert.equal(new URL(page.url()).searchParams.get('collection'), groups.find((group) => group.name === name)?.id ?? null);
  }
  async function expectBlog() {
    await page.getByRole('main', { name: 'Blog', exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/blog');
  }

  await page.goto(namedURL(groups[0].id));
  await login(page);
  await expectFilter('Music', ['Music find']);
  await page.reload();
  await expectFilter('Music', ['Music find']);
  // Unsaved input must survive local filter changes (no document reload).
  await page.locator('.owner-tools').evaluate(element => { element.open = true; });
  await page.locator('#save-link [name=title]').fill('Unsaved collection item');
  await page.locator('#collection-filters').getByRole('link', { name: 'Books', exact: true }).click();
  await expectFilter('Books', ['Book find']);
  assert.equal(await page.locator('#save-link [name=title]').inputValue(), 'Unsaved collection item');
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Blog', exact: true }).click();
  await expectBlog();
  await page.goBack();
  assert.equal(page.url(), namedURL(groups[1].id));
  await expectFilter('Books', ['Book find']);
  await page.goForward();
  await expectBlog();
  await page.goBack();
  await expectFilter('Books', ['Book find']);
  await page.goBack();
  await expectFilter('Music', ['Music find']);
  await page.goForward();
  await expectFilter('Books', ['Book find']);
  // Entering Likes from a router-enabled page must also initialize correctly.
  await page.goForward();
  await expectBlog();
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Likes', exact: true }).click();
  await expectFilter('All', ['Music find', 'Book find', 'Ungrouped find']);
  assert.deepEqual(unexpected, [], 'No unmocked backend or external requests');
});
