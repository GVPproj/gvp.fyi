import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { editorialFixtures } from './helpers/editorial.js';

test('Published-content build keeps presentation repo-owned despite stale CMS settings', { timeout: 90000 }, async t => {
  const fixtures = await editorialFixtures();
  const files = new Map();
  const entries = [];
  for (const entry of fixtures) {
    const assets = [];
    for (const file of entry.assets) {
      const { bytes } = file;
      const path = `/api/publishing/content-assets/fixture/${file.name}`;
      files.set(path, bytes);
      assets.push({ name: file.name, path, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    entries.push({ ...entry, revision: 'fixture', state: 'published', assets });
  }
  const staleSettings = entries.find(entry => entry.kind === 'settings').data;
  staleSettings.description = 'Snapshot-only description';
  staleSettings.navigation = [{ id: 'music', label: 'Music', children: [{ label: 'Releases', href: '/music-releases' }] }];
  staleSettings.categories.software = [];
  staleSettings.placeholders = [{ slug: 'cms-only-page', title: 'CMS page', body: 'Stale placeholder' }];
  entries.push({ kind: 'software', slug: 'biolink', revision: 'withdrawn', state: 'unpublished' });
  const server = createServer((req, res) => {
    if (req.url.endsWith('auth-with-password')) return res.end(JSON.stringify({ token: 'fixture', record: { collectionName: 'publishing_builds' } }));
    if (req.headers.authorization !== 'fixture') return res.writeHead(403).end();
    if (req.url === '/api/publishing/content') return res.end(JSON.stringify(entries));
    if (req.url === '/api/publishing/releases') return res.end('[]');
    if (files.has(req.url)) return res.end(files.get(req.url));
    res.writeHead(404).end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const dir = await mkdtemp(new URL('../.astro/editorial-build-', import.meta.url));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const child = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', dir], {
    env: { ...process.env, PUBLISHING_POCKETBASE_URL: `http://127.0.0.1:${server.address().port}`,
      PUBLISHING_BUILD_EMAIL: 'build@example.test', PUBLISHING_BUILD_PASSWORD: 'fixture', ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
  const [code] = await once(child, 'exit'); assert.equal(code, 0, output);
  const software = await readFile(`${dir}/software/example-project/index.html`, 'utf8');
  assert.match(software, /Project gallery detail/);
  assert.match(software, /Example teammate/);
  assert.match(software, /Built for a rendering test/);
  assert.match(software, /\/published-content\//);
  assert.doesNotMatch(software, /\/images\/fixture\//);
  assert.doesNotMatch(software, /Snapshot-only description/);
  assert.match(software, /href="\/music"[^>]*>Music<\/a>/);
  assert.match(software, /href="\/software"/);
  assert.doesNotMatch(software, /id="music-menu"|<summary[^>]*>Music/);
  await assert.rejects(readFile(`${dir}/cms-only-page/index.html`));
  assert.match(await readFile(`${dir}/video/index.html`, 'utf8'), /Coming soon/);
  const blog = await readFile(`${dir}/blog/the-animated-face/index.html`, 'utf8');
  assert.match(blog, /<h1\b[^>]*>Animating My Face<\/h1>/);
  assert.match(blog, /class="face"/);
  assert.match(blog, /data-language="astro"/);
  const blogIndex = await readFile(`${dir}/blog/index.html`, 'utf8');
  assert.match(blogIndex, /href="\/blog\/the-animated-face\/?"/);
  assert.match(blogIndex, /Animating My Face/);
  await assert.rejects(readFile(`${dir}/software/biolink/index.html`));
  await assert.rejects(readFile(`${dir}/software/tenzies/index.html`));
});
