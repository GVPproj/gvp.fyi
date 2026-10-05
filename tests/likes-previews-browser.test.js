import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

// Agreed seams: native editor interactions and the external HTTP contract.
import { ownerToken, login, logout } from './helpers/owner-session.js';
const sourceURL = 'https://source.example/article';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64');
const metadata = () => ({
  sourceURL, finalURL: 'https://source.example/final', fetchedAt: '2026-06-19T12:00:00Z',
  title: 'Fetched landscape', description: 'Fetched description', warning: '',
  image: { sourceURL: 'https://images.example/original.png', finalURL: 'https://images.example/final.png',
    name: 'landscape.png', type: 'image/png', base64: png.toString('base64') },
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function setup(t, result = metadata()) {
  const { base, context, page } = await realBrowser(t);
  const gate = deferred();
  const arrived = deferred();
  const state = { previews: [], writes: [], files: [], items: [], unexpected: [] };
  t.after(() => gate.resolve());
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === base) return route.continue();
    const method = request.method();
    if (url.origin === 'https://pb.example') {
      if (url.pathname === '/api/collections/likes_owners/auth-with-password' && method === 'POST') {
        return route.fulfill({ json: { token: ownerToken, record: { id: 'likesowner00001', collectionName: 'likes_owners' } } });
      }
      if (url.pathname === '/api/likes/duplicates' && method === 'POST') return route.fulfill({ json: { items: [] } });
      if (url.pathname === '/api/likes/preview' && method === 'POST') {
        state.previews.push({ body: request.postDataJSON(), authorization: request.headers().authorization });
        arrived.resolve();
        await gate.promise;
        return route.fulfill({ json: result });
      }
      if (url.pathname === '/api/collections/likes_collections/records' && method === 'GET') {
        return route.fulfill({ json: { items: [], totalPages: 1 } });
      }
      if (url.pathname === '/api/collections/likes_items/records') {
        if (method === 'GET') {
          const drafts = /published\s*=\s*false/.test(url.searchParams.get('filter') ?? '');
          return route.fulfill({ json: { items: state.items.filter(item => item.published !== drafts), totalPages: 1 } });
        }
        if (method === 'POST') {
          const type = request.headers()['content-type'];
          const body = type?.includes('multipart/form-data')
            ? await new Response(request.postDataBuffer(), { headers: { 'content-type': type } }).formData()
            : new Map(Object.entries(request.postDataJSON()));
          state.writes.push({ type, body, authorization: request.headers().authorization });
          const provenance = body.get('previewProvenance');
          const item = { id: 'preview00000001', collectionName: 'likes_items', collections: [],
            title: body.get('title'), description: body.get('description'), commentary: body.get('commentary'),
            url: body.get('url'), published: String(body.get('published')) === 'true',
            asset: body.get('asset')?.name ? 'landscape_durable.png' : '',
            previewProvenance: typeof provenance === 'string' ? JSON.parse(provenance) : provenance };
          state.items = [item];
          return route.fulfill({ json: item });
        }
      }
      if (url.pathname === '/api/files/likes_items/preview00000001/landscape_durable.png' && method === 'GET') {
        state.files.push(url.href);
        return route.fulfill({ contentType: 'image/png', body: png });
      }
    }
    state.unexpected.push(`${method} ${url.href}`);
    return route.abort();
  });
  t.after(() => assert.deepEqual(state.unexpected, [], 'Every external request must use a controlled HTTP fixture'));
  await page.goto(`${base}/likes/manage`);
  await login(page);
  async function paste() {
    await page.evaluate(text => navigator.clipboard.writeText(text), sourceURL);
    await page.locator('#save-link [name=url]').focus();
    await page.keyboard.press('Control+V');
    await page.waitForFunction(() => /fetching|loading/i.test(document.querySelector('#preview-status').textContent));
    await arrived.promise;
    assert.deepEqual(state.previews, [{ body: { url: sourceURL }, authorization: ownerToken }]);
    assert.equal(await page.locator('#save-link [name=url]').inputValue(), sourceURL);
  }
  async function release() {
    const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/likes/preview');
    gate.resolve();
    await (await response).finished();
    // Allow response.json() and any DOM updates to settle, including stale completions.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  return { page, state, paste, release };
}

async function save(page) {
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Published.' && !document.querySelector('#save-link [name=title]').disabled);
}

test('native URL paste fetches automatically; owner edits survive loading and preview image becomes a durable multipart asset', browserOptions, async t => {
  const { page, state, paste, release } = await setup(t);
  await paste();
  assert.equal(await page.getByRole('button', { name: 'Save item', exact: true }).isEnabled(), true);
  await page.locator('#save-link [name=title]').fill('Owner title');
  await page.locator('#save-link [name=description]').fill('Owner description');
  await page.locator('#save-link [name=commentary]').fill('Personal commentary');
  await release();
  await page.waitForFunction(() => /fetched/i.test(document.querySelector('#preview-status').textContent));
  assert.equal(await page.locator('#save-link [name=title]').inputValue(), 'Owner title');
  assert.equal(await page.locator('#save-link [name=description]').inputValue(), 'Owner description');
  const preview = page.locator('#save-link img');
  await preview.waitFor({ state: 'visible' });
  const previewSource = await preview.getAttribute('src');
  await preview.evaluate(img => img.decode());
  assert.equal(await preview.evaluate(img => img.naturalWidth), 2);
  assert.equal(state.writes.length, 0, 'Fetching does not upload an item');
  assert.deepEqual(state.files, [], 'Unsaved preview uses local bytes, not a remote file');
  await page.getByRole('button', { name: 'Use fetched image', exact: true }).click();
  await save(page);
  assert.equal(state.writes.length, 1);
  const upload = state.writes[0];
  assert.match(upload.type, /^multipart\/form-data; boundary=/);
  assert.equal(upload.authorization, ownerToken);
  const file = upload.body.get('asset');
  assert.equal(file.name, 'landscape.png');
  assert.equal(file.type, 'image/png');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), png);
  assert.equal(upload.body.get('title'), 'Owner title');
  assert.equal(upload.body.get('description'), 'Owner description');
  assert.equal(upload.body.get('commentary'), 'Personal commentary');
  assert.equal(upload.body.get('url'), sourceURL);
  assert.deepEqual(JSON.parse(upload.body.get('previewProvenance')), {
    fetched: { sourceURL, finalURL: 'https://source.example/final', fetchedAt: '2026-06-19T12:00:00Z',
      title: 'Fetched landscape', description: 'Fetched description',
      image: { sourceURL: 'https://images.example/original.png', finalURL: 'https://images.example/final.png', name: 'landscape.png', type: 'image/png' } },
    assetSource: { sourceURL: 'https://images.example/original.png', finalURL: 'https://images.example/final.png',
      name: 'landscape.png', type: 'image/png', fetchedAt: '2026-06-19T12:00:00Z', pageURL: 'https://source.example/final' },
    overrides: { title: true, description: true, image: false },
  });
  const stored = page.locator('#likes-board img');
  await stored.scrollIntoViewIfNeeded();
  await stored.evaluate(img => img.decode());
  assert.equal(await stored.getAttribute('src'), 'https://pb.example/api/files/likes_items/preview00000001/landscape_durable.png');
  assert.ok(state.files.length > 0, 'Published card reads the durable file endpoint');
  assert.match(previewSource, /^(?:blob:http:\/\/127\.0\.0\.1:|data:image\/png;base64,)/, 'Fetched image is reviewed from local bytes, never an upstream URL');
});

for (const action of ['cancel', 'sign out']) {
  test(`${action} ignores a late preview response, including image bytes and provenance`, browserOptions, async t => {
    const { page, state, paste, release } = await setup(t);
    await paste();
    if (action === 'cancel') await page.getByRole('button', { name: 'Cancel / new item', exact: true }).click();
    else await logout(page);
    await release();
    for (const name of ['url', 'title', 'description']) {
      assert.equal(await page.locator(`#save-link [name=${name}]`).inputValue(), '', `${name} stays cleared`);
    }
    assert.equal(await page.locator('#preview-status').textContent(), '');
    assert.equal(await page.locator('#save-link img:visible').count(), 0);
    assert.equal(await page.locator('#save-link img[src]').count(), 0);
    assert.deepEqual(state.writes, [], 'Late completion cannot save anything');
    if (action === 'sign out') {
      assert.equal(await page.locator('#save-link').isVisible(), false);
      await login(page);
    }
    await page.locator('#save-link [name=url]').fill('https://manual.example/new');
    await page.locator('#save-link [name=title]').fill('New manual item');
    await save(page);
    const body = state.writes[0].body;
    assert.equal(body.has('asset'), false, 'Discarded image cannot leak into the next save');
    assert.equal(body.get('previewProvenance'), null, 'Discarded provenance cannot leak into the next save');
  });
}

test('remote HTML in preview metadata stays inert text in the editor and published card', browserOptions, async t => {
  const hostile = '<script>window.previewScriptRan=true</script><img src="https://attacker.example/pixel" onerror="window.previewScriptRan=true">';
  const result = { ...metadata(), title: hostile, description: hostile, warning: hostile, image: null };
  const { page, state, paste, release } = await setup(t, result);
  await paste();
  await release();
  await page.waitForFunction(() => /fetched/i.test(document.querySelector('#preview-status').textContent));
  assert.equal(await page.locator('#save-link [name=title]').inputValue(), hostile);
  assert.equal(await page.locator('#save-link [name=description]').inputValue(), hostile);
  assert.ok((await page.locator('#preview-status').textContent()).includes(hostile));
  assert.equal(await page.locator('#preview-status script, #preview-status img').count(), 0);
  await save(page);
  assert.equal(await page.locator('#likes-board h2').textContent(), hostile);
  assert.equal(await page.locator('#likes-board li p').textContent(), hostile);
  assert.equal(await page.locator('#likes-board script, #likes-board img, #likes iframe').count(), 0);
  assert.equal(await page.evaluate(() => window.previewScriptRan), undefined);
  assert.equal(state.writes[0].body.get('title'), hostile);
  assert.deepEqual(state.unexpected, [], 'HTML must not initiate remote subresource requests');
});
