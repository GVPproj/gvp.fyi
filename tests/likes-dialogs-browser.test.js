import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';
import { login, ownerResult } from './helpers/owner-session.js';

async function setup(t) {
  const { base, context, page } = await realBrowser(t);
  const state = { items: [], groups: [], writes: [] };
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === base && !url.pathname.startsWith('/api/likes/')) return route.continue();
    if (url.pathname === '/api/likes/duplicates') return route.fulfill({ json: { items: [] } });
    if (url.origin !== 'https://pb.example') return route.abort();
    if (url.pathname.endsWith('/auth-with-password')) return route.fulfill({ json: ownerResult() });
    const records = url.pathname === '/api/collections/likes_items/records' ? state.items
      : url.pathname === '/api/collections/likes_collections/records' ? state.groups : null;
    if (!records) return route.abort();
    if (request.method() === 'POST') {
      const record = { id: `record${records.length}`, ...request.postDataJSON() };
      state.writes.push(record);
      records.push(record);
      return route.fulfill({ json: record });
    }
    const items = records === state.items && url.searchParams.get('filter') === 'published=false' ? [] : records;
    return route.fulfill({ json: { items, totalPages: 1 } });
  });
  await page.goto(`${base}/likes/manage`);
  await login(page);
  return { page, state };
}

async function assertModal(dialog) {
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await dialog.evaluate(node => node instanceof HTMLDialogElement && node.open && node.matches(':modal')), true);
  assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'Opening focuses inside the dialog');
}

for (const kind of ['item-editor', 'collections']) {
  test(`${kind} opens by keyboard; Escape and Close retain fields and restore trigger focus`, browserOptions, async t => {
    const { page, state } = await setup(t);
    const trigger = page.locator(`#open-${kind}`);
    const dialog = page.locator(`#${kind}-dialog`);
    const field = dialog.locator(kind === 'item-editor' ? '[name=title]' : '[name=name]');
    assert.equal(await page.locator('.owner-tools').evaluate(node => node.tagName), 'SECTION');
    assert.equal(await dialog.isVisible(), false);
    for (const dismissal of ['Escape', 'Close']) {
      await trigger.focus();
      await page.keyboard.press('Enter');
      await assertModal(dialog);
      if (dismissal === 'Close') assert.equal(await field.inputValue(), 'Retain this unfinished work');
      await field.fill('Retain this unfinished work');
      await dialog.locator('[data-close-dialog]').focus();
      await page.keyboard.press('Shift+Tab');
      assert.equal(await dialog.evaluate(node => document.activeElement === document.body || node.contains(document.activeElement)), true, 'Keyboard focus cannot enter inert background controls');
      if (dismissal === 'Escape') await page.keyboard.press('Escape');
      else await dialog.locator('[data-close-dialog]').click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
      assert.equal(await field.inputValue(), 'Retain this unfinished work');
      assert.deepEqual(state.writes, [], 'Dismissal must not submit or save');
    }
  });
}

test('Cancel resets and closes the item editor; saving stays open and Edit opens the saved item', browserOptions, async t => {
  const { page, state } = await setup(t);
  const dialog = page.locator('#item-editor-dialog');
  const trigger = page.locator('#open-item-editor');
  await trigger.click();
  await page.getByLabel('Item type').selectOption('note');
  await dialog.locator('[name=title]').fill('Discard this');
  await dialog.locator('[name=body]').fill('Discard these words');
  await dialog.locator('[name=draft]').check();
  await page.locator('#new-item').click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
  await trigger.click();
  assert.equal(await dialog.locator('[name=title]').inputValue(), '');
  assert.equal(await dialog.locator('[name=body]').inputValue(), '');
  assert.equal(await dialog.locator('[name=draft]').isChecked(), false);
  assert.deepEqual(state.writes, []);
  await page.getByLabel('Item type').selectOption('note');
  await dialog.locator('[name=title]').fill('Saved note');
  await dialog.locator('[name=body]').fill('Words worth keeping');
  await dialog.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.locator('#save-status').filter({ hasText: 'Published.' }).waitFor();
  assert.equal(await dialog.evaluate(node => node.open && node.matches(':modal')), true, 'Successful save does not dismiss the editor');
  assert.equal(state.writes.length, 1);
  await dialog.locator('[data-close-dialog]').click();
  const edit = page.locator('#likes-board').getByRole('button', { name: 'Edit', exact: true });
  await edit.click();
  await assertModal(dialog);
  assert.equal(await dialog.locator('[name=title]').inputValue(), 'Saved note');
  assert.equal(await dialog.locator('[name=body]').inputValue(), 'Words worth keeping');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await edit.evaluate(node => node === document.activeElement), true);
});

test('named collection creation remains usable inside its own modal', browserOptions, async t => {
  const { page, state } = await setup(t);
  await page.locator('#open-collections').click();
  const dialog = page.locator('#collections-dialog');
  await assertModal(dialog);
  await dialog.getByLabel('New collection name').fill('Reading');
  await dialog.getByRole('button', { name: 'Create collection', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#collection-list input')?.value === 'Reading');
  assert.equal(state.groups[0].name, 'Reading');
  await dialog.locator('[data-close-dialog]').click();
  await page.locator('#open-item-editor').click();
  await page.locator('#item-editor-dialog').getByLabel('Reading', { exact: true }).check();
  assert.equal(await page.locator('#item-editor-dialog').getByLabel('Reading', { exact: true }).isChecked(), true);
});
