import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { parseHTML } from 'linkedom';

const removedViews = '#collection-filters, #all-items, #likes-board, .likes-grid, nav[aria-label="Likes pagination"]';
function assertStaticRows(document) {
  assert.equal(document.querySelector(removedViews), null, 'no collection navigation or alternate grids');
  assert.equal(document.querySelector('#collection-rows h2 a'), null, 'collection headings are not navigation');
  assert.equal(document.querySelector('a[href*="?collection="], a[href*="?view="], a[href^="#collection-"], a[href="#all-items"]'), null);
  assert.equal(document.querySelectorAll('#collection-rows .content-row').length, 1);
  assert.ok(document.querySelector('#collection-rows a[href="/likes/publicnote00001"]'));
  assert.equal(document.querySelectorAll('#collection-rows .content-row li').length, 10, 'rows include all items, not only the former eight previews');
}

// Real Astro build: the public Likes output must not need a running backend.
test('full-content mode emits static Likes and ignores draft/withdrawn items', { timeout: 90000 }, async t => {
  const settings = JSON.parse(await readFile(new URL('../src/config/site-settings.json', import.meta.url)));
  const image = await sharp({ create: { width: 320, height: 320, channels: 3, background: '#336699' } }).png().toBuffer();
  const entries = [
    { revision: 'settings1', kind: 'settings', slug: 'site', state: 'published', data: settings, assets: [] },
    { revision: 'note1', kind: 'like', slug: 'publicnote00001', state: 'published', data: { title: 'Static publication fixture', type: 'note', body: 'Works with the backend offline.', collections: [{ id: 'group1', name: 'Reading' }] }, assets: [] },
    { revision: 'note2', kind: 'like', slug: 'withdrawn000001', state: 'unpublished' },
    { revision: 'image1', kind: 'like', slug: 'publicimage001', state: 'published', data: { title: 'Published image fixture', type: 'image', collections: [{ id: 'group1', name: 'Reading' }] }, assets: [{ name: 'fixture.png', path: '/api/publishing/content-assets/image1/fixture.png', sha256: createHash('sha256').update(image).digest('hex') }] },
  ];
  for (let i = 0; i < 8; i++) entries.push({
    revision: `extra${i}`, kind: 'like', slug: `extra-note-${i}`, state: 'published',
    data: { title: `Extra note ${i}`, type: 'note', body: 'More row content', collections: [{ id: 'group1', name: 'Reading' }] }, assets: [],
  });
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('auth-with-password')) return res.end(JSON.stringify({ token: 'private-fixture-token', record: { collectionName: 'publishing_builds' } }));
    if (req.headers.authorization !== 'private-fixture-token') return res.writeHead(403).end('{}');
    if (req.url === '/api/publishing/content-assets/image1/fixture.png') { res.setHeader('Content-Type', 'image/png'); return res.end(image); }
    if (req.url === '/api/publishing/content') return res.end(JSON.stringify(entries));
    if (req.url === '/api/publishing/releases') return res.end('[]');
    res.writeHead(404).end('{}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const dir = await mkdtemp(fileURLToPath(new URL('../.astro/content-build-', import.meta.url)));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const child = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', dir], {
    env: { ...process.env, PUBLISHING_POCKETBASE_URL: `http://127.0.0.1:${server.address().port}`, PUBLISHING_BUILD_EMAIL: 'build@example.test', PUBLISHING_BUILD_PASSWORD: 'private-fixture-password', ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
  const [code] = await once(child, 'exit'); assert.equal(code, 0, output);
  server.closeAllConnections(); server.close();
  const overview = await readFile(join(dir, 'likes/index.html'), 'utf8');
  const detail = await readFile(join(dir, 'likes/publicnote00001/index.html'), 'utf8');
  assert.match(overview, /Static publication fixture/);
  assert.match(overview, /Reading/);
  assert.match(overview, /id="collection-rows"/, 'Static Likes must reuse the shared collection overview');
  assert.match(overview, /class="content-row"/, 'Static Likes must use the same ContentRow presentation as other pages');
  assert.match(detail, /Works with the backend offline/);
  assertStaticRows(parseHTML(overview).document);
  for (const html of [overview, detail]) {
    assert.doesNotMatch(html, /private-fixture|withdrawn000001|api\/files/);
  }
  await assert.rejects(readFile(join(dir, 'likes/withdrawn000001/index.html')));
  await assert.rejects(readFile(join(dir, 'likes/manage/index.html')));
  await assert.rejects(readFile(join(dir, 'login/index.html')));
  assert.doesNotMatch(overview, /id="owner-session"|id="manage-likes"/);
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    const staticServer = createServer(async (req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname.includes('..')) return res.writeHead(400).end();
      const file = pathname.endsWith('/') ? `${pathname}index.html` : pathname.includes('.') ? pathname : `${pathname}/index.html`;
      try {
        const bytes = await readFile(join(dir, file));
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
        res.end(bytes);
      } catch { res.writeHead(404).end(); }
    });
    staticServer.listen(0, '127.0.0.1'); await once(staticServer, 'listening');
    t.after(() => { staticServer.closeAllConnections(); staticServer.close(); });
    const origin = `http://127.0.0.1:${staticServer.address().port}`;
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const apiRequests = [];
    page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(`${origin}/likes/`);
    assert.equal(await page.locator('#collection-rows').isVisible(), true);
    assert.equal(await page.locator('#collection-rows .content-row').count(), 1);
    const preview = page.locator('#collection-rows img');
    assert.match(await preview.getAttribute('src'), /^\/published-content\//);
    await preview.evaluate(image => image.decode());
    assert.ok(await preview.evaluate(image => image.naturalWidth > 0));
    assert.equal(await page.locator('#collection-rows').getByRole('link', { name: /Static publication fixture/ }).count(), 1);
    for (const suffix of ['?collection=group1', '?view=all', '#collection-group1', '#all-items']) {
      await page.goto(`${origin}/likes/${suffix}`);
      assert.equal(await page.locator('#collection-rows').isVisible(), true);
      assert.equal(await page.locator(removedViews).count(), 0);
      assertStaticRows(parseHTML(await page.content()).document);
    }
    await page.locator('#collection-rows').getByRole('link', { name: /Static publication fixture/ }).click();
    await page.locator('#like-detail').getByText('Works with the backend offline.', { exact: true }).waitFor();
    assert.deepEqual(apiRequests, []);

    // Native links and shared rows must work with both the CMS and JavaScript offline.
    const noScript = await browser.newPage({ javaScriptEnabled: false });
    await noScript.goto(`${origin}/likes/`);
    assert.equal(await noScript.locator('#collection-rows').isVisible(), true);
    assertStaticRows(parseHTML(await noScript.content()).document);
    await noScript.locator('#collection-rows').getByRole('link', { name: /Static publication fixture/ }).click();
    assert.equal(await noScript.locator('#like-detail').isVisible(), true);
    assert.match(await noScript.locator('#like-detail').textContent(), /Works with the backend offline/);
    await noScript.reload();
    assert.equal(await noScript.locator('#like-detail').isVisible(), true);
    await noScript.goBack();
    assert.equal(await noScript.locator('#collection-rows').isVisible(), true);
  }
});
