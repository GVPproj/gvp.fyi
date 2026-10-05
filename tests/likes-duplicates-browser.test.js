import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerToken, login, logout } from './helpers/owner-session.js';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

const url = 'https://example.com/shared';
const matches = [
  { id: 'existing1', title: 'Published original', url, commentary: 'First perspective', published: true, collections: [] },
  { id: 'existing2', type: 'quote', title: 'Private quotation', url, body: 'Private words', attribution: 'A writer', commentary: 'Second perspective', published: false, collections: ['reading'] },
];

async function setup(t) {
  const { base, context, page } = await realBrowser(t);
  const state = { items: structuredClone(matches), writes: [], lookups: [], lookupStatus: 200 };
  await context.route('**/*', async route => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.origin === base) return route.continue();
    assert.equal(target.origin, 'https://pb.example', 'No unexpected external requests');
    if (target.pathname.includes('auth-with-password')) return route.fulfill({ json: {
      token: ownerToken, record: { id: 'likesowner00001', collectionName: 'likes_owners' },
    } });
    if (target.pathname === '/api/likes/preview') return route.fulfill({ json: { url: request.postDataJSON().url, title: '', description: '' } });
    if (target.pathname === '/api/likes/duplicates') {
      assert.equal(request.method(), 'POST');
      assert.equal(request.headers().authorization, ownerToken);
      const data = request.postDataJSON();
      state.lookups.push(data);
      return route.fulfill({ status: state.lookupStatus, json: { items: state.items.filter(item => item.url === data.url) } });
    }
    if (target.pathname.includes('likes_collections')) return route.fulfill({ json: {
      items: [{ id: 'reading', name: 'Reading' }, { id: 'research', name: 'Research' }], totalPages: 1,
    } });
    if (request.method() === 'GET') {
      const draft = target.searchParams.get('filter') === 'published=false';
      return route.fulfill({ json: { items: state.items.filter(item => item.published !== draft), totalPages: 1 } });
    }
    assert.ok(['POST', 'PATCH'].includes(request.method()));
    assert.match(target.pathname, /\/collections\/likes_items\/records/);
    const data = request.postDataJSON();
    const id = request.method() === 'PATCH' ? target.pathname.split('/').at(-1) : 'new-item';
    state.writes.push({ method: request.method(), id, data });
    const item = { id, ...data };
    state.items = [...state.items.filter(old => old.id !== id), item];
    return route.fulfill({ json: item });
  });
  await page.goto(`${base}/likes/manage`);
  await login(page);
  return { page, state };
}

test('choosing the second match opens that existing item and adds membership without creating an item', browserOptions, async t => {
  const { page, state } = await setup(t);
  await review(page);
  const rows = page.locator('#duplicate-items li');
  assert.equal(await rows.count(), 2);
  const selected = rows.filter({ hasText: 'Private quotation' });
  assert.match(await selected.textContent(), /Private words/);
  await selected.getByRole('button', { name: 'Open existing item', exact: true }).click();
  assert.equal(await page.locator('[name=title]').inputValue(), 'Private quotation');
  assert.equal(await page.locator('[name=body]').inputValue(), 'Private words');
  assert.equal(await page.locator('[name=commentary]').inputValue(), 'Second perspective');
  assert.equal(await page.locator('[name=draft]').isChecked(), true);
  assert.equal(await page.getByLabel('Reading', { exact: true }).isChecked(), true);
  await page.getByLabel('Research', { exact: true }).check();
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await saved(page);
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].method, 'PATCH');
  assert.equal(state.writes[0].id, 'existing2');
  assert.deepEqual(state.writes[0].data.collections, ['reading', 'research']);
  assert.equal(state.items.length, 2);
  await page.locator('#drafts-board').getByRole('button', { name: 'Read quote: Private quotation', exact: true }).waitFor();
});

test('URL edits and sign-out remove private duplicate results', browserOptions, async t => {
  const { page, state } = await setup(t);
  await review(page);
  assert.match(await page.locator('#duplicate-items').textContent(), /Private words/);
  await page.locator('[name=url]').fill('https://example.com/different');
  assert.equal(await page.locator('#duplicate-review').isVisible(), false);
  assert.equal(await page.locator('#duplicate-items').textContent(), '');
  await review(page);
  await logout(page);
  assert.equal(await page.locator('#duplicate-review').isVisible(), false);
  assert.equal(await page.locator('#duplicate-items').textContent(), '');
  assert.equal(await page.locator('[name=commentary]').inputValue(), '');
  assert.deepEqual(state.writes, []);
});

for (const status of [401, 403, 500]) {
  test(`failed duplicate lookup (${status}) preserves fields and blocks writes`, browserOptions, async t => {
    const { page, state } = await setup(t);
    state.lookupStatus = status;
    await page.getByLabel('Item type').selectOption('quote');
    await page.locator('[name=body]').fill('Keep my quotation');
    await page.locator('[name=attribution]').fill('Keep attribution');
    await page.locator('[name=url]').fill(url);
    await page.locator('[name=title]').fill('Keep title');
    await page.locator('[name=commentary]').fill('Keep commentary');
    await page.getByLabel('Research', { exact: true }).check();
    await page.locator('[name=draft]').check();
    await page.getByRole('button', { name: 'Save item', exact: true }).click();
    if (status === 401 || status === 403) await page.locator('#session-expired').waitFor();
    else await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('fields have been kept'));
    assert.deepEqual(state.lookups.at(-1), { url });
    assert.deepEqual(state.writes, []);
    if (status === 401 || status === 403) {
      assert.equal(await page.locator('#save-link').isVisible(), false);
      await page.locator('#session-expired a[href="/login"]').waitFor();
      await login(page);
      assert.deepEqual(state.writes, [], 'Reauthentication restores fields without saving');
    } else {
      assert.equal(await page.locator('#save-link').isVisible(), true, 'Server errors must not log out the owner');
    }
    for (const [name, value] of Object.entries({ url, title: 'Keep title', body: 'Keep my quotation', attribution: 'Keep attribution', commentary: 'Keep commentary' })) {
      assert.equal(await page.locator(`[name=${name}]`).inputValue(), value);
    }
    assert.equal(await page.getByLabel('Research', { exact: true }).isChecked(), true);
    assert.equal(await page.locator('[name=draft]').isChecked(), true);
    assert.equal(await page.locator('#duplicate-review').isVisible(), false);
  });
}

async function pasteURL(page, value) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(value => navigator.clipboard.writeText(value), value);
  await page.locator('[name=url]').focus();
  await page.keyboard.press('Control+V');
}

async function review(page) {
  await page.locator('[name=url]').fill(url);
  await page.locator('[name=title]').fill('Another perspective');
  await page.locator('[name=commentary]').fill('Different commentary');
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.locator('#duplicate-review').waitFor();
}

async function saved(page) {
  await page.waitForFunction(() => /^(Published\.|Saved as draft\.)$/.test(document.querySelector('#save-status').textContent));
}

test('Save another respects native validity and creates the same URL with different commentary', browserOptions, async t => {
  const { page, state } = await setup(t);
  await review(page);
  assert.deepEqual(state.writes, []);
  await page.locator('[name=title]').fill('');
  await page.locator('#save-another').click();
  assert.equal(await page.locator('[name=title]').evaluate(node => node.validity.valueMissing), true);
  assert.deepEqual(state.writes, []);
  await page.locator('[name=title]').fill('Another perspective');
  await page.locator('#save-another').click();
  await saved(page);
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].method, 'POST');
  assert.equal(state.writes[0].data.url, url);
  assert.equal(state.writes[0].data.commentary, 'Different commentary');
  assert.equal(state.items.find(item => item.id === 'existing1').commentary, 'First perspective');
  await page.locator('#likes-board').getByRole('heading', { name: 'Another perspective' }).waitFor();
});

for (const type of ['link', 'quote', 'note']) {
  test(`pasting a matching URL prompts before saving a ${type}`, browserOptions, async t => {
    const { page, state } = await setup(t);
    if (type !== 'link') {
      await page.getByLabel('Item type').selectOption(type);
      await page.getByLabel('Text', { exact: true }).fill('Unsaved words');
    }
    await pasteURL(page, url);
    await page.locator('#duplicate-review').waitFor();
    assert.equal(await page.locator('#duplicate-items li').count(), 2);
    assert.deepEqual(state.lookups.at(-1), { url });
    assert.deepEqual(state.writes, []);
    assert.equal(await page.locator('[name=url]').inputValue(), url);
    if (type !== 'link') assert.equal(await page.locator('[name=body]').inputValue(), 'Unsaved words');
  });
}
