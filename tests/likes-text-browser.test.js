import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerToken, login } from './helpers/owner-session.js';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

async function setup(t, initial = []) {
  const { base, context, page } = await realBrowser(t);
  const state = { items: initial, writes: [], failSave: false };
  const unexpected = [];
  await context.route('**/*', async route => {
    const origin = new URL(route.request().url()).origin;
    if (origin === base) return route.continue();
    if (origin === 'https://pb.example') return route.fallback();
    unexpected.push(route.request().url());
    return route.abort();
  });
  t.after(() => assert.deepEqual(unexpected, []));
  await context.route('https://pb.example/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes('auth-with-password')) return route.fulfill({ json: {
      token: ownerToken, record: { id: 'likesowner00001', collectionName: 'likes_owners' },
    } });
    if (url.pathname === '/api/likes/duplicates' && request.method() === 'POST') return route.fulfill({ json: { items: [] } });
    if (url.pathname.includes('likes_collections')) return route.fulfill({ json: { items: [], totalPages: 1 } });
    if (request.method() === 'GET') {
      const draft = url.searchParams.get('filter') === 'published=false';
      return route.fulfill({ json: { items: state.items.filter(item => item.published !== draft), totalPages: 1 } });
    }
    const id = url.pathname.split('/').at(-1);
    if (request.method() === 'DELETE') {
      state.items = state.items.filter(item => item.id !== id);
      return route.fulfill({ status: 204 });
    }
    const data = request.postDataJSON();
    state.writes.push(data);
    if (state.failSave) return route.fulfill({ status: 500 });
    const item = { id: request.method() === 'PATCH' ? id : String(state.items.length + 1), ...data };
    state.items = [...state.items.filter(old => old.id !== item.id), item];
    return route.fulfill({ json: item });
  });
  await page.goto(`${base}/likes/manage`);
  await page.locator('#read-status').filter({ hasText: 'Loading' }).waitFor({ state: 'hidden' });
  return { page, state };
}
async function save(page) {
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.waitForFunction(() => /^(Published\.|Saved as draft\.)$/.test(document.querySelector('#save-status').textContent));
}

for (const type of ['quote', 'note']) {
  test(`${type} has a square bounded preview and safe, mobile-readable modal with keyboard close and focus return`, browserOptions, async t => {
    const body = '<img src=x onerror=alert(1)>\n' + 'Long text with line breaks.\n'.repeat(2000) + 'x'.repeat(1000) + '\nTHE END';
    const { page } = await setup(t, [{ id: 'text1', type, body, title: 'Reading', attribution: '<script>alert(1)</script>', url: 'javascript:alert(1)', published: true }]);
    await page.setViewportSize({ width: 390, height: 640 });
    const trigger = page.getByRole('button', { name: `Read ${type}: Reading` });
    const preview = trigger.locator('.like-preview');
    const size = await preview.boundingBox();
    assert.ok(Math.abs(size.width - size.height) < 2, 'Text does not stretch the square grid');
    assert.ok((await preview.textContent()).length <= 401);
    await trigger.focus();
    await page.keyboard.press('Enter');
    const viewer = page.getByRole('dialog', { name: 'Text reader' });
    await viewer.waitFor();
    assert.equal(await viewer.locator('.text-body').textContent(), body);
    assert.equal(await viewer.locator('img,script,a[href]').count(), 0, 'HTML and unsafe source URLs stay inert');
    const close = viewer.getByRole('button', { name: 'Close text' });
    assert.equal(await close.evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await viewer.evaluate(node => node.contains(document.activeElement)), true);
    const layout = await viewer.evaluate(node => {
      const rect = node.getBoundingClientRect();
      node.scrollTop = node.scrollHeight;
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        width: innerWidth, height: innerHeight, scroll: node.scrollTop, overflowX: node.scrollWidth > node.clientWidth };
    });
    assert.ok(layout.left >= 0 && layout.right <= layout.width && layout.top >= 0 && layout.bottom <= layout.height);
    assert.ok(layout.scroll > 0, 'Long content can scroll to the end');
    assert.equal(layout.overflowX, false, 'Long unbroken text wraps on mobile');
    await page.keyboard.press('Escape');
    await viewer.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('#text-reader .text-body').textContent === '');
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
    await trigger.click();
    await close.click();
    await viewer.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
    await page.waitForFunction(() => document.querySelector('#text-reader .text-body').textContent === '');
    assert.equal(await page.locator('#text-reader .text-body').textContent(), '', 'Closing releases reader content');
  });
}

for (const type of ['quote', 'note']) {
  test(`${type} edits survive failed saves, drafts publish and return to private, and deletion requires confirmation`, browserOptions, async t => {
    const { page, state } = await setup(t);
    await login(page);
    await page.getByLabel('Item type').selectOption(type);
    await page.getByLabel('Text', { exact: true }).fill('Private words');
    await page.locator('[name=draft]').check();
    await save(page);
    assert.equal(await page.locator('#likes-board li').count(), 0);
    await page.locator('#drafts-board').getByRole('button', { name: 'Edit', exact: true }).click();
    assert.equal(await page.getByLabel('Item type').inputValue(), type);
    assert.equal(await page.getByLabel('Text', { exact: true }).inputValue(), 'Private words');
    await page.getByLabel('Text', { exact: true }).fill('Revised words');
    await page.locator('[name=url]').fill('https://source.example/original');
    state.failSave = true;
    await page.getByRole('button', { name: 'Save item', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('fields have been kept'));
    assert.equal(await page.getByLabel('Text', { exact: true }).inputValue(), 'Revised words');
    assert.equal(await page.getByLabel('Item type').inputValue(), type);
    state.failSave = false;
    await page.locator('[name=draft]').uncheck();
    await save(page);
    assert.equal(await page.locator('#drafts-board li').count(), 0);
    await page.locator('#likes-board .text-card').click();
    const source = page.locator('#text-reader').getByRole('link', { name: 'Source', exact: true });
    assert.equal(await source.getAttribute('href'), 'https://source.example/original');
    assert.equal(await source.getAttribute('target'), '_blank');
    assert.equal(await source.getAttribute('rel'), 'noopener noreferrer');
    await page.getByRole('button', { name: 'Close text' }).click();
    await page.locator('#likes-board').getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('[name=draft]').check();
    await save(page);
    assert.equal(await page.locator('#likes-board li').count(), 0);
    await page.locator('#drafts-board').getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Delete item…', exact: true }).click();
    assert.equal(state.items.length, 1);
    await page.getByRole('button', { name: 'Keep item', exact: true }).click();
    assert.equal(state.items.length, 1);
    await page.getByRole('button', { name: 'Delete item…', exact: true }).click();
    await page.getByRole('button', { name: 'Permanently delete', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Permanently deleted.');
    assert.equal(state.items.length, 0);
    assert.equal(await page.locator('#drafts-board li').count(), 0);
  });
}

test('untitled text cards have distinct accessible names from their content', browserOptions, async t => {
  const { page } = await setup(t, [
    { id: 'quote1', type: 'quote', body: 'First quotation', published: true },
    { id: 'quote2', type: 'quote', body: 'Second quotation', published: true },
    { id: 'note1', type: 'note', body: 'First personal note', published: true },
    { id: 'note2', type: 'note', body: 'Second personal note', published: true },
  ]);
  for (const [type, text] of [['quote', 'First quotation'], ['quote', 'Second quotation'], ['note', 'First personal note'], ['note', 'Second personal note']]) {
    const card = page.getByRole('button', { name: `Read ${type}: ${text}`, exact: true });
    await card.click();
    assert.equal(await page.locator('#text-reader .text-body').textContent(), text);
    await page.getByRole('button', { name: 'Close text' }).click();
    assert.equal(await card.evaluate(node => node === document.activeElement), true);
  }
});

test('reader returns focus to a refreshed card and sign-out clears private text', browserOptions, async t => {
  const { page, state } = await setup(t, [{ id: 'text1', type: 'note', title: 'Saved note', body: 'Visible words', published: true }]);
  const original = await page.locator('#likes-board .text-card').elementHandle();
  await page.locator('#likes-board .text-card').click();
  // Refreshes can finish while a reader is open; exercise the public Retry control.
  await page.locator('#retry-read').dispatchEvent('click');
  await page.waitForFunction(node => !node.isConnected, original);
  await page.getByRole('button', { name: 'Close text' }).click();
  await page.waitForFunction(() => document.activeElement?.matches('#likes-board .text-card'));
  state.items.push({ id: 'text2', type: 'quote', body: 'Private words', published: false });
  await login(page);
  await page.locator('#drafts-board .text-card').click();
  assert.equal(await page.locator('#text-reader .text-body').textContent(), 'Private words');
  // A modal reader makes page chrome inert; dispatch logout without closing it
  // so the session transition itself must erase the private viewer.
  await page.getByRole('button', { name: 'Logged In', exact: true }).dispatchEvent('click');
  await page.getByRole('button', { name: 'Log out', exact: true }).dispatchEvent('click');
  await page.waitForFunction(() => !document.querySelector('#text-reader').open && !document.querySelector('#text-reader .text-body').textContent);
  assert.equal(await page.locator('#drafts-board li').count(), 0);
  assert.equal(await page.locator('[name=body]').inputValue(), '');
});

test('text editor rejects blank content and unsafe source URLs without losing text', browserOptions, async t => {
  const { page, state } = await setup(t);
  await login(page);
  await page.getByLabel('Item type').selectOption('quote');
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  assert.equal(await page.locator('[name=body]').evaluate(node => node.validity.valueMissing), true);
  assert.equal(state.writes.length, 0);
  await page.getByLabel('Text', { exact: true }).fill('Keep this text');
  await page.locator('[name=url]').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('http:// or https://'));
  assert.equal(state.writes.length, 0);
  assert.equal(await page.getByLabel('Text', { exact: true }).inputValue(), 'Keep this text');
});

test('owner saves a quote without title or URL, then a personal note with optional title', browserOptions, async t => {
  const { page, state } = await setup(t);
  await login(page);
  await page.getByLabel('Item type').selectOption('quote');
  await page.getByLabel('Text', { exact: true }).fill('A small observation.');
  await page.getByLabel('Attribution (optional)').fill('A writer');
  await save(page);
  assert.equal(state.items[0].type, 'quote');
  assert.equal(state.items[0].body, 'A small observation.');
  assert.equal(state.items[0].attribution, 'A writer');
  assert.equal(state.items[0].url, '');
  await page.locator('#likes-board').getByRole('button', { name: 'Read quote: A small observation.' }).waitFor();
  await page.getByLabel('Item type').selectOption('note');
  await page.getByLabel('Text', { exact: true }).fill('My own observation.');
  await page.locator('[name=title]').fill('Today');
  await save(page);
  assert.equal(state.items[1].type, 'note');
  assert.equal(state.items[1].body, 'My own observation.');
  assert.equal(state.items[1].title, 'Today');
  assert.equal(state.items[1].attribution, '');
  await page.locator('#likes-board').getByRole('button', { name: 'Read note: Today' }).waitFor();
});
