import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const artwork = await readFile(path.join(root, 'tests/fixtures/artwork/watery-grave.jpg'));
const catalogue = JSON.parse(await readFile(path.join(root, 'tests/fixtures/releases/miracle-fortress.json'), 'utf8'));
const original = catalogue.find(release => release.title === 'Watery Grave EP');

async function build(t, { broken = false, snapshot } = {}) {
  await mkdir(path.join(root, '.astro'), { recursive: true });
  const dir = await mkdtemp(path.join(root, '.astro/publishing-build-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const token = 'private-build-token-never-public';
  const requests = [];
  const server = createServer(async (req, res) => {
    requests.push(req.url);
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/collections/publishing_builds/auth-with-password') {
      res.end(JSON.stringify({ token, record: { collectionName: 'publishing_builds' } }));
      return;
    }
    if (req.headers.authorization !== token) { res.writeHead(401).end('{}'); return; }
    if (req.url === '/api/publishing/content') { res.end('[]'); return; }
    if (req.url === '/api/publishing/releases') {
      if (broken) { res.writeHead(503).end('{}'); return; }
      if (snapshot !== undefined) { res.end(JSON.stringify(Array.isArray(snapshot) ? snapshot : [snapshot])); return; }
      res.end(JSON.stringify([{ revision: 'revision-one', release: { ...original, category: 'miracle-fortress', slug: 'watery-grave-ep', about: 'Published snapshot from PocketBase.' },
        artwork: { path: '/api/publishing/artwork/revision-one', width: 300, height: 283,
          sha256: createHash('sha256').update(artwork).digest('hex') } }]));
    } else if (req.url === '/api/publishing/artwork/revision-one') {
      res.setHeader('Content-Type', 'image/jpeg'); res.end(artwork);
    } else { res.writeHead(404).end('{}'); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const child = spawn(process.execPath, [path.join(root, 'node_modules/astro/bin/astro.mjs'), 'build', '--outDir', path.join(dir, 'dist')], {
    cwd: root, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', PUBLISHING_POCKETBASE_URL: endpoint,
      PUBLISHING_BUILD_EMAIL: 'build@example.test', PUBLISHING_BUILD_PASSWORD: 'private-build-password-never-public' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 3000);
      await exited;
      clearTimeout(force);
    }
  });
  const [code] = await exited;
  return { dir, code, logs, requests, endpoint, token, stopBackend: () => { server.closeAllConnections(); server.close(); } };
}

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}

test('Astro builds one published snapshot and deploys responsive artwork without backend credentials', { timeout: 120000 }, async t => {
  const result = await build(t);
  assert.equal(result.code, 0, result.logs);
  assert.ok(result.requests.includes('/api/publishing/releases'), 'build must read the published snapshot');
  const output = path.join(result.dir, 'dist');
  const all = await files(output);
  const htmlPath = all.find(file => file.endsWith('/music/watery-grave-ep/index.html'));
  assert.ok(htmlPath, 'emit the release at its public Music URL');
  const html = await readFile(htmlPath, 'utf8');
  const { document } = parseHTML(html);
  assert.match(html, /Published snapshot from PocketBase\./);
  const img = document.querySelector('.release-media img');
  assert.match(img.getAttribute('src'), /^\/published-releases\/[a-f0-9]+-\d+\.webp$/);
  assert.match(img.getAttribute('srcset'), /160w/);
  assert.equal(img.getAttribute('width'), '300');
  assert.equal(img.getAttribute('height'), '283');
  assert.equal(img.getAttribute('alt'), 'Watery Grave EP album cover');
  assert.deepEqual([...document.querySelectorAll('audio')].map(audio => [audio.getAttribute('src'), audio.getAttribute('preload'), audio.hasAttribute('controls')]),
    original.tracks.map(track => [track.audio_url, 'none', true]));
  const media = all.filter(file => file.includes('/published-releases/'));
  assert.ok(media.length >= 2);
  assert.ok((await readFile(media[0])).length < artwork.length, 'optimized image is smaller than the source');
  assert.ok(!all.some(file => file.endsWith('/music/atlantis-tapes/index.html')), 'omitted releases must not return from fixtures');
  for (const file of all.filter(file => /\.(html|js|json)$/.test(file))) {
    const text = await readFile(file, 'utf8');
    assert.ok(!text.includes(result.token) && !text.includes('private-build-password-never-public'), `no secrets in ${file}`);
    if (file.endsWith('.html')) assert.ok(!text.includes(result.endpoint), 'no live backend image URLs');
  }
  result.stopBackend();
  await t.test('deployed page artwork stays available offline on mobile and desktop', {
    skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE && 'Set PLAYWRIGHT_CHROMIUM_EXECUTABLE for browser checks',
  }, async () => {
    const server = createServer(async (req, res) => {
      try {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        const file = all.find(file => path.relative(output, file) === pathname.slice(1) || path.relative(output, file) === `${pathname.slice(1).replace(/\/$/, '')}/index.html`);
        if (!file) { res.writeHead(404).end(); return; }
        const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[path.extname(file)] ?? 'application/octet-stream';
        res.setHeader('Content-Type', type); res.end(await readFile(file));
      } catch { res.writeHead(500).end(); }
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const outgoing = [];
    page.on('request', request => outgoing.push(request.url()));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${base}/music/watery-grave-ep/`);
      await page.locator('.release-media img').evaluate(image => image.decode());
      assert.equal(await page.locator('h1').textContent(), 'Watery Grave EP');
      assert.equal(await page.locator('audio[controls][preload="none"]').count(), 5);
      assert.ok(await page.locator('.release-media img').evaluate(image => image.naturalWidth > 0));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.locator('.release-detail > a').focus();
      assert.equal(await page.locator('.release-detail > a').evaluate(link => link === document.activeElement), true);
    }
    assert.ok(!outgoing.some(url => url.startsWith(result.endpoint) || url.endsWith('.mp3')), 'no backend requests or audio preloading');
  });
});

test('CMS catalogue builds arbitrary releases across categories without the tracer', { timeout: 120000 }, async t => {
  const snapshot = ['other-credits', 'think-about-life'].map((category, index) => ({
    revision: 'revision-one',
    release: { ...original, slug: `cms-release-${index}`, category, title: `CMS release ${index}`, tracks: [] },
    artwork: { path: '/api/publishing/artwork/revision-one', width: 300, height: 283,
      sha256: createHash('sha256').update(artwork).digest('hex') },
  }));
  const result = await build(t, { snapshot });
  assert.equal(result.code, 0, result.logs);
  const all = await files(path.join(result.dir, 'dist'));
  for (const index of [0, 1]) assert.ok(all.some(file => file.endsWith(`/music/cms-release-${index}/index.html`)));
  assert.ok(!all.some(file => file.includes('/music/watery-grave-ep/')));
  assert.ok(!result.requests.some(route => route.startsWith('/api/publishing/releases/')));
});

const withdrawal = { revision: 'abc123def456ghi', slug: 'watery-grave-ep', state: 'unpublished' };

async function assertWithdrawn(result) {
  assert.equal(result.code, 0, result.logs);
  const all = await files(path.join(result.dir, 'dist'));
  assert.ok(!all.some(file => file.includes('/music/watery-grave-ep/')));
  assert.ok(!all.some(file => file.includes('/published-releases/')), 'withdrawal needs no generated artwork');
  const overview = await readFile(all.find(file => file.endsWith('/music/index.html')), 'utf8');
  assert.ok(!overview.includes('watery-grave-ep') && !overview.includes('Watery Grave EP'));
  assert.ok(!overview.includes('atlantis-tapes'));
  assert.ok(!all.some(file => file.endsWith('/music/atlantis-tapes/index.html')));
}

test('withdrawal removes routes and generated artwork without fallback', { timeout: 120000 }, async t => {
  const withdrawn = await build(t, { snapshot: withdrawal });
  await assertWithdrawn(withdrawn);
  assert.ok(!withdrawn.requests.some(route => route.startsWith('/api/publishing/artwork/')));
});

// Real-server withdrawal/republish scenarios live in the backend's optional
// FRONTEND_CHECKOUT integration suite. This suite only consumes wire fixtures.

test('failed snapshot fetch fails the build without logging secrets', { timeout: 120000 }, async t => {
  const result = await build(t, { broken: true });
  assert.notEqual(result.code, 0);
  assert.match(result.logs, /Published release build failed/);
  assert.ok(!result.logs.includes(result.token) && !result.logs.includes('private-build-password-never-public'));
});
