import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

// Public seams only: native browser controls and external PocketBase HTTP.
import { ownerToken, login, logout } from './helpers/owner-session.js';
const image = { name: 'landscape.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64') };
const record = (overrides = {}) => ({ id: 'asset0000000001', collectionName: 'likes_items', title: 'Landscape', url: '', description: '', commentary: '', collections: [], published: true, asset: 'landscape_abc.png', ...overrides });

async function setup(t, initial = []) {
  const { base, context, page } = await realBrowser(t);
  const state = { items: initial, writes: [], files: [], tokens: [], unexpected: [], failWrite: false };
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === base) return route.continue();
    if (url.origin === 'https://pb.example') {
      const method = request.method();
      if (url.pathname === '/api/collections/likes_owners/auth-with-password' && method === 'POST') {
        return route.fulfill({ json: { token: ownerToken, record: { id: 'likesowner00001', collectionName: 'likes_owners' } } });
      }
      if (url.pathname === '/api/likes/duplicates' && method === 'POST') return route.fulfill({ json: { items: [] } });
      if (url.pathname === '/api/files/token' && method === 'POST') {
        state.tokens.push(request.headers().authorization);
        return route.fulfill({ json: { token: `short-file-token-${state.tokens.length}` } });
      }
      if (url.pathname.startsWith('/api/files/likes_items/') && method === 'GET') {
        state.files.push(url);
        return route.fulfill({ contentType: 'image/png', body: image.buffer });
      }
      if (url.pathname === '/api/collections/likes_collections/records' && method === 'GET') {
        return route.fulfill({ json: { items: [], totalPages: 1 } });
      }
      if (url.pathname.startsWith('/api/collections/likes_items/records')) {
        if (method === 'GET') {
          if (state.readGate) await state.readGate;
          const drafts = /published\s*=\s*false/.test(url.searchParams.get('filter') ?? '');
          return route.fulfill({ json: { items: state.items.filter(item => item.published !== drafts), totalPages: 1 } });
        }
        if (method === 'POST' || method === 'PATCH') {
          const type = request.headers()['content-type'];
          const body = type?.includes('multipart/form-data')
            ? await new Response(request.postDataBuffer(), { headers: { 'content-type': type } }).formData()
            : new Map(Object.entries(request.postDataJSON()));
          state.writes.push({ method, body, type, authorization: request.headers().authorization });
          if (state.failWrite) return route.fulfill({ status: 400, json: { message: 'Upload rejected: unsupported asset.' } });
          const previous = state.items.find(item => url.pathname.endsWith(`/${item.id}`));
          const file = body.get('asset');
          const item = record({ ...previous, title: body.get('title'), url: body.get('url') || '', published: String(body.get('published')) === 'true',
            asset: typeof file === 'object' && file?.name ? `${file.name.split('.')[0]}_stored.${file.name.split('.').pop()}` : file === '' ? '' : previous?.asset || '' });
          state.items = [...state.items.filter(existing => existing.id !== item.id), item];
          return route.fulfill({ json: item });
        }
      }
    }
    state.unexpected.push(`${request.method()} ${request.url()}`);
    await route.abort();
  });
  t.after(() => assert.deepEqual(state.unexpected, [], 'No unmocked external traffic'));
  await page.goto(`${base}/likes`);
  await page.getByRole('heading', { name: 'Likes', exact: true }).waitFor();
  return { page, state };
}

for (const action of ['logout', 'navigation']) {
  test(`${action} closes an application-opened private PDF viewer`, browserOptions, async t => {
    const { page } = await setup(t, [record({ published: false, asset: 'private.pdf' })]);
    await login(page);
    const opened = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Open PDF: Landscape', exact: true }).click();
    const viewer = await opened;
    await viewer.locator('iframe[src^="https://pb.example/api/files/"]').waitFor();
    assert.equal(await viewer.evaluate(() => window.opener), null);
    const closed = viewer.waitForEvent('close');
    if (action === 'logout') await logout(page);
    else await page.goto(new URL('/', page.url()).href);
    await closed;
    assert.equal(viewer.isClosed(), true);
  });
}

async function saved(page) {
  await page.waitForFunction(() => /^(Published\.|Saved as draft\.)$/.test(document.querySelector('#save-status').textContent));
}

test('owner uploads a standalone image as multipart asset without a destination URL', browserOptions, async t => {
  const { page, state } = await setup(t);
  await login(page);
  await page.locator('#save-link [name=title]').fill('Landscape');
  await page.locator('#save-link [name=asset]').setInputFiles(image);
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await saved(page);
  assert.equal(state.writes.length, 1);
  const upload = state.writes[0];
  assert.match(upload.type, /^multipart\/form-data; boundary=/);
  assert.equal(upload.authorization, ownerToken);
  assert.equal(upload.body.get('asset').name, 'landscape.png');
  assert.deepEqual(Buffer.from(await upload.body.get('asset').arrayBuffer()), image.buffer);
  assert.equal(upload.body.get('url'), '');
  await page.getByRole('button', { name: 'View image: Landscape', exact: true }).waitFor();
  assert.equal(await page.locator('[name=asset]').evaluate(input => input.files.length), 0);
});

async function assertViewer(page, title) {
  const viewer = page.locator('#image-viewer');
  await viewer.waitFor({ state: 'visible' });
  assert.equal(await viewer.evaluate(node => node instanceof HTMLDialogElement && node.open && node.matches(':modal')), true);
  const close = viewer.getByRole('button', { name: 'Close image', exact: true });
  assert.equal(await close.evaluate(node => node === document.activeElement), true, 'Opening moves focus into the dialog');
  await viewer.locator('img').evaluate(img => img.decode());
  const dimensions = await viewer.locator('img').evaluate(img => {
    const rect = img.getBoundingClientRect();
    return { alt: img.alt, fit: getComputedStyle(img).objectFit, width: rect.width, height: rect.height,
      naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
      left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  assert.equal(dimensions.alt, title);
  assert.equal(dimensions.fit, 'contain');
  assert.ok(dimensions.width > 0 && dimensions.height > 0);
  assert.equal(dimensions.naturalWidth / dimensions.naturalHeight, 2, 'Fixture must be landscape, not square');
  assert.ok(Math.abs(dimensions.width / dimensions.height - 2) < 0.02, 'Viewer preserves the landscape proportions instead of stretching to a square');
  assert.ok(dimensions.left >= 0 && dimensions.top >= 0 && dimensions.right <= dimensions.viewportWidth && dimensions.bottom <= dimensions.viewportHeight, 'Entire image fits inside viewport');
  return { viewer, close };
}

test('published image opens a native modal viewer, contains the image, and restores focus on Escape and Close', browserOptions, async t => {
  const { page, state } = await setup(t, [record()]);
  const trigger = page.getByRole('button', { name: 'View image: Landscape', exact: true });
  await trigger.waitFor();
  assert.equal(await trigger.getAttribute('aria-label'), 'View image: Landscape');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const { viewer, close } = await assertViewer(page, 'Landscape');
  await page.keyboard.press('Tab');
  assert.equal(await viewer.evaluate(node => document.activeElement === document.body || node.contains(document.activeElement)), true, 'Tab cannot focus inert background controls (Chromium may focus browser chrome)');
  await page.keyboard.press('Escape');
  await viewer.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate(node => document.activeElement === node), true);
  await page.setViewportSize({ width: 390, height: 640 });
  await trigger.click();
  await assertViewer(page, 'Landscape');
  await close.click();
  await viewer.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate(node => document.activeElement === node), true);
  assert.deepEqual(state.tokens, [], 'Published images need no owner file token');
});

test('closing a viewer after an in-flight board refresh focuses the replacement image button', browserOptions, async t => {
  const { page, state } = await setup(t, [record()]);
  const trigger = page.getByRole('button', { name: 'View image: Landscape', exact: true });
  await trigger.waitFor();
  const original = await trigger.elementHandle();
  let release;
  state.readGate = new Promise(resolve => { release = resolve; });
  await page.getByRole('button', { name: 'Reload Likes', exact: true }).click();
  await trigger.click();
  await assertViewer(page, 'Landscape');
  release();
  await page.waitForFunction(node => !node.isConnected, original);
  // Removing `open` hides the dialog synchronously; its close event is queued.
  await page.evaluate(() => {
    window.viewerClosed = new Promise(resolve => document.querySelector('#image-viewer')
      .addEventListener('close', () => resolve(), { once: true }));
  });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.viewerClosed);
  await page.locator('#image-viewer').waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate(node => document.activeElement === node), true);
});

for (const source of ['', 'https://source.example/original']) {
  test(`published PDF links to its stored file in a new tab ${source ? 'with' : 'without'} source attribution`, browserOptions, async t => {
    const { page, state } = await setup(t, [record({ title: 'Field guide', asset: 'guide_stored.pdf', url: source })]);
    const card = page.locator('#likes-board li').filter({ has: page.getByRole('heading', { name: 'Field guide' }) });
    const link = card.getByRole('link', { name: /Field guide/ });
    await link.waitFor();
    assert.equal(await link.getAttribute('href'), 'https://pb.example/api/files/likes_items/asset0000000001/guide_stored.pdf');
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.match(await link.getAttribute('rel'), /\bnoopener\b/);
    assert.equal(await card.getByRole('link').count(), source ? 2 : 1);
    if (source) {
      const attribution = card.getByRole('link', { name: /Source:/ });
      assert.equal(await attribution.getAttribute('href'), source);
    }
    assert.deepEqual(state.tokens, []);
  });
}

test('editing an uploaded item retains its asset unless a replacement is selected', browserOptions, async t => {
  const { page, state } = await setup(t, [record()]);
  await login(page);
  await page.locator('#likes-board').getByRole('button', { name: 'Edit', exact: true }).click();
  assert.equal(await page.locator('[name=asset]').evaluate(input => input.files.length), 0);
  await page.locator('#save-link [name=title]').fill('Retained landscape');
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await saved(page);
  assert.equal(state.writes[0].method, 'PATCH');
  assert.equal(state.writes[0].body.has('asset'), false, 'Retaining a file must omit asset from the update');
  await page.getByRole('button', { name: 'View image: Retained landscape', exact: true }).waitFor();
  await page.locator('#likes-board').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('[name=asset]').setInputFiles({ ...image, name: 'replacement.png' });
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await saved(page);
  assert.equal(state.writes.length, 2);
  const replacement = state.writes[1];
  assert.equal(replacement.method, 'PATCH');
  assert.equal(replacement.authorization, ownerToken);
  assert.match(replacement.type, /^multipart\/form-data; boundary=/);
  assert.equal(replacement.body.get('asset').name, 'replacement.png');
  await page.waitForFunction(() => document.querySelector('#likes-board img')?.src.endsWith('/replacement_stored.png'));
  assert.equal(await page.locator('[name=asset]').evaluate(input => input.files.length), 0);
});

test('server upload rejection keeps selected file and fields for retry; cancel clears the selection', browserOptions, async t => {
  const { page, state } = await setup(t);
  await login(page);
  state.failWrite = true;
  await page.locator('#save-link [name=title]').fill('Retry landscape');
  await page.locator('#save-link [name=commentary]').fill('Keep my commentary');
  await page.locator('[name=asset]').setInputFiles(image);
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.waitForFunction(() => /kept/i.test(document.querySelector('#save-status').textContent));
  assert.equal(state.writes.length, 1, 'Rejection must come from the server');
  assert.equal(await page.locator('#save-link [name=title]').inputValue(), 'Retry landscape');
  assert.equal(await page.locator('#save-link [name=commentary]').inputValue(), 'Keep my commentary');
  assert.equal(await page.locator('[name=asset]').evaluate(input => input.files[0]?.name), 'landscape.png');
  state.failWrite = false;
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await saved(page);
  assert.equal(state.writes.length, 2);
  assert.deepEqual(Buffer.from(await state.writes[1].body.get('asset').arrayBuffer()), image.buffer);
  await page.locator('#likes-board').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('[name=asset]').setInputFiles({ ...image, name: 'cancelled.png' });
  await page.getByRole('button', { name: 'Cancel / new item', exact: true }).click();
  assert.equal(await page.locator('[name=asset]').evaluate(input => input.files.length), 0);
  assert.equal(await page.locator('#save-link [name=title]').inputValue(), '');
  assert.equal(await page.locator('#current-asset').textContent(), '');
  assert.equal(state.writes.length, 2, 'Cancel does not upload');
});

test('draft image is never requested before clicking and each opening obtains a fresh authenticated file token', browserOptions, async t => {
  const { page, state } = await setup(t, [record({ published: false })]);
  await login(page);
  const trigger = page.locator('#drafts-board').getByRole('button', { name: 'View image: Landscape', exact: true });
  await trigger.waitFor();
  await trigger.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.deepEqual(state.tokens, [], 'Rendering drafts must not mint file tokens');
  assert.deepEqual(state.files, [], 'Rendering drafts must not fetch private images, including lazy previews');
  for (let opening = 1; opening <= 2; opening++) {
    await trigger.click();
    const { viewer, close } = await assertViewer(page, 'Landscape');
    assert.deepEqual(state.tokens, Array(opening).fill(ownerToken), 'Every click must POST files/token with current owner Authorization');
    assert.equal(state.files.length, opening);
    assert.equal(state.files.at(-1).pathname, '/api/files/likes_items/asset0000000001/landscape_abc.png');
    assert.equal(state.files.at(-1).searchParams.get('token'), `short-file-token-${opening}`);
    await close.click();
    await viewer.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate(node => document.activeElement === node), true);
  }
});
