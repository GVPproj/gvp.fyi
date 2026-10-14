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
import { randomBytes } from 'node:crypto';
import { start } from './helpers/publishing-pocketbase.js';


const root = fileURLToPath(new URL('../', import.meta.url));
const artwork = await readFile(path.join(root, 'public/images/music-releases/watery-grave.jpg'));
const catalogue = JSON.parse(await readFile(path.join(root, 'src/data/releases/miracle-fortress.json'), 'utf8'));
const original = catalogue.find(release => release.title === 'Watery Grave EP');

async function createDraft(pb) {
  const form = new FormData();
  for (const key of ['title', 'artist', 'release_date', 'display_date', 'about']) form.set(key, original[key] ?? '');
  form.set('slug', 'watery-grave-ep');
  form.set('tracks', JSON.stringify(original.tracks));
  form.set('artwork', new Blob([artwork], { type: 'image/jpeg' }), 'watery-grave.jpg');
  const result = await pb.request('collections/publishing_releases/records', {
    method: 'POST', token: pb.adminToken, body: form,
  });
  assert.equal(result.status, 200, 'Create the complete release in one Save');
  assert.equal(result.data.published, false, 'New releases default to private');
  return result.data;
}

async function build(t, { broken = false, incomplete = false, badArtwork = false, backend, snapshot, status = 200, local = false, env = {} } = {}) {
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
    if (req.url === '/api/publishing/releases/watery-grave-ep') {
      if (broken || status !== 200) { res.writeHead(broken ? 503 : status).end('{}'); return; }
      if (snapshot !== undefined) { res.end(JSON.stringify(snapshot)); return; }
      res.end(JSON.stringify({ revision: 'revision-one', release: { ...original, slug: 'watery-grave-ep', about: 'Published snapshot from PocketBase.', ...(incomplete && { tracks: [] }) },
        artwork: { path: '/api/publishing/artwork/revision-one', width: 300, height: 283,
          sha256: badArtwork ? '0'.repeat(64) : createHash('sha256').update(artwork).digest('hex') } }));
    } else if (req.url === '/api/publishing/artwork/revision-one') {
      res.setHeader('Content-Type', 'image/jpeg'); res.end(artwork);
    } else { res.writeHead(404).end('{}'); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const child = spawn(process.execPath, [path.join(root, 'node_modules/astro/bin/astro.mjs'), 'build', '--outDir', path.join(dir, 'dist')], {
    cwd: root, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', PUBLISHING_POCKETBASE_URL: local ? '' : backend?.base ?? endpoint,
      PUBLISHING_BUILD_EMAIL: local ? '' : backend?.email ?? 'build@example.test', PUBLISHING_BUILD_PASSWORD: local ? '' : backend?.password ?? 'private-build-password-never-public', ...env },
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
  assert.ok(result.requests.includes('/api/publishing/releases/watery-grave-ep'), 'build must read the published snapshot');
  const output = path.join(result.dir, 'dist');
  const all = await files(output);
  const htmlPath = all.find(file => file.endsWith('/music-releases/watery-grave-ep/index.html'));
  assert.ok(htmlPath, 'preserve the existing public URL');
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
  assert.ok(all.some(file => file.endsWith('/music-releases/atlantis-tapes/index.html')), 'unmigrated releases remain');
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
      await page.goto(`${base}/music-releases/watery-grave-ep/`);
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

const withdrawal = { revision: 'abc123def456ghi', slug: 'watery-grave-ep', state: 'unpublished' };

async function assertWithdrawn(result) {
  assert.equal(result.code, 0, result.logs);
  const all = await files(path.join(result.dir, 'dist'));
  assert.ok(!all.some(file => file.includes('/music-releases/watery-grave-ep/')));
  assert.ok(!all.some(file => file.includes('/published-releases/')), 'withdrawal needs no generated artwork');
  const overview = await readFile(all.find(file => file.endsWith('/music-releases/index.html')), 'utf8');
  assert.ok(!overview.includes('watery-grave-ep') && !overview.includes('Watery Grave EP'));
  assert.ok(overview.includes('atlantis-tapes'));
  assert.ok(all.some(file => file.endsWith('/music-releases/atlantis-tapes/index.html')));
}

test('explicit withdrawal removes the tracer; unset configuration retains the local fallback', { timeout: 120000 }, async t => {
  const withdrawn = await build(t, { snapshot: withdrawal });
  await assertWithdrawn(withdrawn);
  assert.ok(!withdrawn.requests.some(route => route.startsWith('/api/publishing/artwork/')));
  const local = await build(t, { local: true });
  assert.equal(local.code, 0, local.logs);
  assert.equal(local.requests.length, 0);
  assert.match(await readFile(path.join(local.dir, 'dist/music-releases/watery-grave-ep/index.html'), 'utf8'), /Watery Grave EP/);
});

test('partial publishing configuration fails rather than restoring local content', { timeout: 120000 }, async t => {
  for (const env of [
    { PUBLISHING_POCKETBASE_URL: '' },
    { PUBLISHING_BUILD_EMAIL: '' },
    { PUBLISHING_BUILD_PASSWORD: '' },
  ]) {
    const result = await build(t, { snapshot: withdrawal, env });
    assert.notEqual(result.code, 0);
    assert.match(result.logs, /Incomplete publishing configuration|Published release build failed/);
    assert.equal(result.requests.length, 0, 'incomplete configuration must fail before authentication');
  }
});

test('malformed or mixed withdrawals and missing snapshots fail closed', { timeout: 240000 }, async t => {
  for (const snapshot of [
    null, {}, { ...withdrawal, revision: '' }, { ...withdrawal, revision: '   ' },
    { ...withdrawal, revision: 123 }, { ...withdrawal, slug: 'other-release' },
    { ...withdrawal, state: 'draft' }, { revision: withdrawal.revision, slug: withdrawal.slug },
    { ...withdrawal, release: original }, { ...withdrawal, artwork: {} },
    { ...withdrawal, title: 'Mixed private title' },
  ]) {
    const result = await build(t, { snapshot });
    assert.notEqual(result.code, 0, JSON.stringify(snapshot));
    assert.match(result.logs, /Published release build failed/);
    assert.ok(!result.logs.includes('Mixed private title'));
  }
  const missing = await build(t, { status: 404 });
  assert.notEqual(missing.code, 0);
  assert.match(missing.logs, /Published release build failed/);
});

test('real PocketBase withdrawal removes static routes and republish restores them', {
  skip: !process.env.POCKETBASE_BINARY && 'Set POCKETBASE_BINARY to the custom v0.40.4 server', timeout: 240000,
}, async t => {
  const pb = await start(t);
  const draft = await createDraft(pb);
  const email = 'withdrawal-build@example.test';
  const password = randomBytes(24).toString('hex');
  assert.equal((await pb.request('collections/publishing_builds/records', {
    method: 'POST', token: pb.adminToken, body: { email, password, passwordConfirm: password },
  })).status, 200);
  const backend = { base: pb.base, email, password };
  const recordPath = `collections/publishing_releases/records/${draft.id}`;
  const save = body => pb.request(recordPath, { method: 'PATCH', token: pb.adminToken, body });
  const missing = await build(t, { backend });
  assert.notEqual(missing.code, 0, 'no snapshot is not withdrawal');
  assert.equal(draft.published, false);
  assert.ok(Array.isArray(draft.tracks));
  assert.equal((await save({ published: true })).status, 200);
  const published = await build(t, { backend });
  assert.equal(published.code, 0, published.logs);
  const initialFiles = await files(path.join(published.dir, 'dist'));
  assert.ok(initialFiles.some(file => file.endsWith('/music-releases/watery-grave-ep/index.html')));
  const withdrawn = await save({ published: false });
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.data.published, false, 'Published remains off');
  const removed = await build(t, { backend });
  await assertWithdrawn(removed);
  const detailRoutes = resultFiles => resultFiles.filter(file => file.includes('/music-releases/') && file.endsWith('/index.html'))
    .map(file => file.split('/dist/')[1]).sort();
  assert.deepEqual(detailRoutes(await files(path.join(removed.dir, 'dist'))),
    detailRoutes(initialFiles).filter(route => !route.includes('/watery-grave-ep/')));
  assert.equal((await save({ title: 'Private withdrawn edit' })).status, 200);
  await assertWithdrawn(await build(t, { backend }));
  const unauthorized = await build(t, { backend: { ...backend, password: 'wrong-password' } });
  assert.notEqual(unauthorized.code, 0, 'authentication failure is not withdrawal');
  assert.equal((await save({ title: 'Republished Watery Grave', published: true })).status, 200);
  const republished = await build(t, { backend });
  assert.equal(republished.code, 0, republished.logs);
  assert.match(await readFile(path.join(republished.dir, 'dist/music-releases/watery-grave-ep/index.html'), 'utf8'), /Republished Watery Grave/);
  assert.match(await readFile(path.join(republished.dir, 'dist/music-releases/index.html'), 'utf8'), /Republished Watery Grave/);
});

test('an incomplete published snapshot fails the build instead of dropping the track list', { timeout: 120000 }, async t => {
  const result = await build(t, { incomplete: true });
  assert.notEqual(result.code, 0);
  assert.match(result.logs, /Published release build failed/);
});

test('failed snapshot fetch and corrupt artwork fail closed without logging secrets', { timeout: 120000 }, async t => {
  for (const options of [{ broken: true }, { badArtwork: true }]) {
    const result = await build(t, options);
    assert.notEqual(result.code, 0);
    assert.match(result.logs, /Published release build failed/);
    assert.ok(!result.logs.includes(result.token) && !result.logs.includes('private-build-password-never-public'));
  }
});

test('real PocketBase published Saves update static metadata and tracks while failed Saves retain the last revision', {
  skip: !process.env.POCKETBASE_BINARY && 'Set POCKETBASE_BINARY to the custom v0.40.4 server', timeout: 120000,
}, async t => {
  const pb = await start(t);
  const draft = await createDraft(pb);
  const email = 'build@example.test';
  const password = randomBytes(24).toString('hex');
  assert.equal((await pb.request('collections/publishing_builds/records', {
    method: 'POST', token: pb.adminToken, body: { email, password, passwordConfirm: password },
  })).status, 200);
  const backend = { base: pb.base, email, password };
  const unpublished = await build(t, { backend });
  assert.notEqual(unpublished.code, 0, 'a draft cannot replace the local release');
  const recordPath = `collections/publishing_releases/records/${draft.id}`;
  assert.equal((await pb.request(recordPath, { method: 'PATCH', token: pb.adminToken,
    body: { title: 'Published backend title', published: true } })).status, 200);
  const published = await build(t, { backend });
  assert.equal(published.code, 0, published.logs);
  const outputPath = path.join(published.dir, 'dist/music-releases/watery-grave-ep/index.html');
  const initialHTML = await readFile(outputPath, 'utf8');
  assert.match(initialHTML, /Published backend title/);
  assert.match(initialHTML, /Winter 2005, Self Released/);
  const tracks = [{ ...original.tracks[0], title: 'Saved published track' }, ...original.tracks.slice(1)];
  const saved = await pb.request(recordPath, { method: 'PATCH', token: pb.adminToken,
    body: { title: 'Saved published title', about: 'Saved published copy', tracks } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.published, true, 'Save does not reset the Published toggle');
  const rebuilt = await build(t, { backend });
  assert.equal(rebuilt.code, 0, rebuilt.logs);
  const html = await readFile(path.join(rebuilt.dir, 'dist/music-releases/watery-grave-ep/index.html'), 'utf8');
  assert.match(html, /Saved published title/);
  assert.match(html, /Saved published copy/);
  assert.match(html, /Saved published track/);
  assert.ok(!html.includes('Published backend title'));
  assert.deepEqual([...parseHTML(html).document.querySelectorAll('audio')].map(audio => audio.getAttribute('src')),
    original.tracks.map(track => track.audio_url));
  const overview = await readFile(path.join(rebuilt.dir, 'dist/music-releases/index.html'), 'utf8');
  assert.match(overview, /Saved published title/);
  const firstImage = parseHTML(initialHTML).document.querySelector('.release-media img').getAttribute('src');
  const retainedImage = parseHTML(html).document.querySelector('.release-media img').getAttribute('src');
  assert.equal(retainedImage, firstImage, 'unchanged artwork retains its content-hashed public URL');
  assert.ok((await readFile(path.join(rebuilt.dir, 'dist', retainedImage))).length > 0);
  assert.equal((await pb.request(recordPath, { method: 'PATCH', token: pb.adminToken,
    body: { title: 'UNPUBLISHED PRIVATE TITLE', about: 'UNPUBLISHED PRIVATE COPY', tracks: [] } })).status, 400);
  const afterFailure = await build(t, { backend });
  assert.equal(afterFailure.code, 0, afterFailure.logs);
  const retainedHTML = await readFile(path.join(afterFailure.dir, 'dist/music-releases/watery-grave-ep/index.html'), 'utf8');
  assert.match(retainedHTML, /Saved published title/);
  assert.match(retainedHTML, /Saved published track/);
  assert.ok(!retainedHTML.includes('UNPUBLISHED PRIVATE'));
  // Already-generated output is immutable; Save is not deployment.
  assert.equal(await readFile(outputPath, 'utf8'), initialHTML);
  for (const file of (await files(path.join(afterFailure.dir, 'dist'))).filter(file => /\.(html|js|json)$/.test(file))) {
    const text = await readFile(file, 'utf8');
    assert.ok(!text.includes(password) && !text.includes(pb.adminToken) && !text.includes('UNPUBLISHED PRIVATE'));
  }
});
