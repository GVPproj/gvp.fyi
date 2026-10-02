import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright-core';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startAstro(t) {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [
    fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url)),
    // Leave any developer server and its Astro lock untouched.
    'dev', '--ignore-lock', '--host', '127.0.0.1', '--port', String(port),
  ], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, PUBLIC_POCKETBASE_URL: 'https://pb.example', ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '', spawnError;
  const exited = new Promise((resolve) => {
    child.once('exit', resolve);
    child.once('error', (error) => { spawnError = error; resolve(); });
  });
  child.stdout.on('data', (data) => { logs += data; });
  child.stderr.on('data', (data) => { logs += data; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null && !spawnError) {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 3000);
      await exited;
      clearTimeout(force);
    }
  });
  for (let attempt = 0; attempt < 200; attempt++) {
    if (spawnError || child.exitCode !== null) break;
    try {
      if ((await fetch(`${base}/likes`, { signal: AbortSignal.timeout(1000) })).ok) return base;
    } catch {}
    await pause(100);
  }
  assert.fail(`Temporary Astro server failed to start: ${spawnError ?? ''}\n${logs}`);
}

test('Likes named filters survive refresh, Blog navigation, and browser Back/Forward', {
  skip: !executablePath && 'Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to a local Chromium executable',
  timeout: 60000,
}, async (t) => {
  const base = await startAstro(t);
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
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
    if (url.origin === 'https://pb.example' && route.request().method() === 'GET') {
      const records = url.pathname === '/api/collections/likes_collections/records' ? groups
        : url.pathname === '/api/collections/likes_items/records' ? items : null;
      if (records) return route.fulfill({ json: { page: 1, perPage: 200, totalPages: 1, totalItems: records.length, items: records } });
    }
    unexpected.push(route.request().url());
    await route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
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
  await expectFilter('Music', ['Music find']);
  await page.reload();
  await expectFilter('Music', ['Music find']);
  // Unsaved input must survive local filter changes (no document reload).
  await page.locator('.owner-tools summary').click();
  await page.locator('#owner-login [name=email]').fill('owner@example.test');
  await page.locator('#collection-filters').getByRole('link', { name: 'Books', exact: true }).click();
  await expectFilter('Books', ['Book find']);
  assert.equal(await page.locator('#owner-login [name=email]').inputValue(), 'owner@example.test');
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
