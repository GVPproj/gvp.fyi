import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';
import { ownerResult, login, logout } from './helpers/owner-session.js';

// Agreed seams: rendered pages/native navigation and the external PocketBase API.
async function setup(t) {
  const browser = await realBrowser(t);
  const state = { auth: ownerResult(), rejectLogin: false, rejectSave: false, writes: [], authRequests: [] };
  await browser.context.route('https://pb.example/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/auth-refresh')) {
      assert.equal(request.headers().authorization, state.auth.token);
      return route.fulfill({ json: state.auth });
    }
    if (url.pathname.endsWith('/auth-with-password')) {
      state.authRequests.push(request.postDataJSON());
      return route.fulfill(state.rejectLogin ? { status: 400, json: { message: 'Invalid credentials.' } } : { json: state.auth });
    }
    if (url.pathname.endsWith('/auth-refresh')) return route.fulfill({ json: state.auth });
    if (url.pathname === '/api/likes/duplicates') return route.fulfill({ json: { items: [] } });
    if (url.pathname.includes('/likes_items/records') && request.method() !== 'GET') {
      state.writes.push({ data: request.postDataJSON(), authorization: request.headers().authorization, method: request.method(), path: url.pathname });
      return route.fulfill(state.rejectSave ? { status: 401, json: { message: 'Expired authentication.' } } : { json: { id: 'saved', ...request.postDataJSON() } });
    }
    if (url.pathname.endsWith('/records') && request.method() === 'GET') {
      const drafts = url.searchParams.get('filter') === 'published=false';
      if (drafts) assert.equal(request.headers().authorization, state.auth.token);
      return route.fulfill({ json: { items: drafts ? [{ id: 'private', title: 'Private draft', type: 'note', body: 'Private body', published: false }] : [], totalPages: 1 } });
    }
    assert.fail(`Unexpected request: ${request.method()} ${url.href}`);
  });
  return { ...browser, state };
}
async function submitLogin(page) {
  await page.locator('[name=email]').fill('owner@example.test');
  await page.locator('[name=password]').fill('owner-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
const indicator = page => page.getByRole('button', { name: 'Logged In', exact: true });
async function assertAnonymous(page) {
  assert.equal(await indicator(page).isVisible(), false);
  assert.equal(await page.locator('a[href="/login"], #owner-login').count(), 0);
}

test('direct login rejects bad credentials/non-owner identity, redirects home on success, and is undiscoverable anonymously', browserOptions, async t => {
  const { page, base, state } = await setup(t);
  for (const path of ['/', '/blog', '/likes']) {
    await page.goto(`${base}${path}`);
    assert.equal(await page.locator('#owner-login').count(), 0);
    assert.equal(await page.locator('a[href="/login"]:visible').count(), 0);
    assert.equal(await indicator(page).isVisible(), false);
  }
  await page.goto(`${base}/login`);
  state.rejectLogin = true;
  await submitLogin(page);
  await page.locator('#auth-status').filter({ hasText: /failed|credentials|sign in/i }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/login');
  assert.equal(await page.locator('#auth-status').getAttribute('role'), 'alert');
  assert.equal(await indicator(page).isVisible(), false);
  assert.equal(await page.locator('[name=password]').inputValue(), '');
  state.rejectLogin = false;
  state.auth = { ...ownerResult(), record: { id: 'another-owner', collectionName: 'likes_owners' } };
  await submitLogin(page);
  await page.locator('#auth-status').filter({ hasText: /owner/i }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/login');
  assert.equal(await indicator(page).isVisible(), false);
  state.auth = ownerResult();
  await submitLogin(page);
  await page.waitForURL(`${base}/`);
  await indicator(page).waitFor();
  assert.deepEqual(state.authRequests.at(-1), { identity: 'owner@example.test', password: 'owner-password' });
  const storage = await page.evaluate(() => ({ session: JSON.stringify(sessionStorage), local: JSON.stringify(localStorage) }));
  assert.ok(storage.session.includes(state.auth.token));
  assert.ok(!storage.session.includes('owner-password'));
  assert.ok(!storage.local.includes(state.auth.token));
  assert.ok(!page.url().includes('owner-password'));
  const count = state.authRequests.length;
  await page.goto(`${base}/login`);
  await page.waitForURL(`${base}/`);
  assert.equal(state.authRequests.length, count, 'An existing session does not resubmit credentials');
});

test('session survives full navigation/refresh; native popover supports keyboard dismissal and logout reconciles history', browserOptions, async t => {
  const { page, base, context } = await setup(t);
  await page.goto(`${base}/likes`);
  await login(page);
  assert.equal(await page.locator('#owner-login').count(), 0);
  await page.locator('#drafts-board').getByText('Private draft', { exact: true }).waitFor();
  for (const path of ['/', '/blog', '/likes']) {
    await page.goto(`${base}${path}`);
    await indicator(page).waitFor();
    await page.reload();
    await indicator(page).waitFor();
  }
  const separateTab = await context.newPage();
  await separateTab.goto(`${base}/`);
  await assertAnonymous(separateTab);
  await separateTab.close();
  await indicator(page).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[popover]:popover-open').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[popover]:popover-open').count(), 0);
  assert.equal(await indicator(page).evaluate(el => el === document.activeElement), true);
  await page.goto(`${base}/blog`);
  await logout(page);
  await page.goBack();
  await indicator(page).waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#drafts-board li').count(), 0);
  assert.equal(await page.locator('#save-link').isVisible(), false);
  await page.goForward();
  await assertAnonymous(page);
  await page.reload();
  await assertAnonymous(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const box = await indicator(page).boundingBox();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844);
  assert.ok(box.x > 195 && box.y > 422, 'Indicator stays in the bottom-right on mobile');
  await logout(page);
});

for (const cause of ['expiry', 'rejection']) {
  test(`${cause} preserves a private edit through failed reauthentication and home without automatically saving`, browserOptions, async t => {
    const { page, base, state } = await setup(t);
    await page.clock.install();
    if (cause === 'expiry') state.auth = ownerResult(Math.floor(Date.now() / 1000) + 120);
    await page.goto(`${base}/likes`);
    await login(page);
    await page.locator('#drafts-board').getByRole('button', { name: /edit/i }).click();
    await page.locator('[name=title]').fill('Unsaved private edit');
    await page.locator('[name=body]').fill('Keep these private words');
    if (cause === 'expiry') await page.clock.fastForward(121000);
    else {
      state.rejectSave = true;
      await page.getByRole('button', { name: 'Save item', exact: true }).click();
    }
    await page.locator('#session-expired').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#session-expired').getAttribute('role'), 'alert');
    assert.equal(await page.locator('#save-link').isVisible(), false);
    assert.equal(await indicator(page).isVisible(), false);
    assert.equal(await page.locator('#drafts-board li').count(), 0);
    assert.equal(await page.locator('#owner-login').count(), 0);
    const writes = state.writes.length;
    await page.locator('#session-expired a[href="/login"]').click();
    state.rejectLogin = true;
    await submitLogin(page);
    await page.locator('#auth-status').filter({ hasText: /failed|credentials|sign in/i }).waitFor();
    await page.goto(`${base}/likes`);
    assert.equal(await page.locator('#save-link').isVisible(), false);
    assert.equal(await page.locator('[name=body]').inputValue(), '', 'Recovery is not exposed anonymously');
    state.rejectLogin = false;
    state.rejectSave = false;
    state.auth = ownerResult(Math.floor(Date.now() / 1000) + 3600);
    await login(page);
    assert.equal(await page.locator('[name=title]').inputValue(), 'Unsaved private edit');
    assert.equal(await page.locator('[name=body]').inputValue(), 'Keep these private words');
    assert.equal(await page.locator('[name=draft]').isChecked(), true);
    assert.equal(state.writes.length, writes, 'Restoring must not save or publish');
    await page.getByRole('button', { name: 'Save item', exact: true }).click();
    await page.locator('#save-status').filter({ hasText: 'Saved as draft.' }).waitFor();
    assert.equal(state.writes.at(-1).method, 'PATCH', 'Recovery retains the selected item, not a new copy');
    assert.ok(state.writes.at(-1).path.endsWith('/private'));
    assert.equal(state.writes.at(-1).data.published, false);
    await page.reload();
    assert.equal(await page.locator('[name=title]').inputValue(), '', 'Successful save clears recovery');
  });
}

for (const cleanup of ['logout', 'discard']) {
  test(`explicit ${cleanup} clears saved recovery so later login cannot resurrect the edit`, browserOptions, async t => {
  const { page, base, state } = await setup(t);
  await page.goto(`${base}/likes`);
  await login(page);
  await page.locator('[name=title]').fill('Discard on logout');
  await page.locator('[name=url]').fill('https://example.com/private');
  state.rejectSave = true;
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.locator('#session-expired').waitFor();
  await login(page);
  assert.equal(await page.locator('[name=title]').inputValue(), 'Discard on logout');
  if (cleanup === 'discard') {
    await page.getByRole('button', { name: 'Cancel / new item', exact: true }).click();
    await page.reload();
    assert.equal(await page.locator('[name=title]').inputValue(), '', 'Discard must clear persisted recovery before logout');
  }
  await logout(page);
  assert.equal(await page.locator('[name=title]').inputValue(), '');
  await login(page);
  assert.equal(await page.locator('[name=title]').inputValue(), '');
  assert.equal(await page.locator('#session-expired').isVisible(), false);
  });
}
