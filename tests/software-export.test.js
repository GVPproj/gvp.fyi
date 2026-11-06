import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { editorialFixtures } from './helpers/editorial.js';

async function runExport(env, destination) {
  const child = spawn(process.execPath, ['scripts/export-software.mjs', destination], {
    env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => output += chunk);
  child.stderr.on('data', chunk => output += chunk);
  const [code] = await once(child, 'exit');
  return { code, output };
}

test('export CLI preserves published software data and original media using restricted authentication', async t => {
  await mkdir(new URL('../.astro/', import.meta.url), { recursive: true });
  const root = await mkdtemp(new URL('../.astro/software-export-', import.meta.url));
  t.after(() => rm(root, { recursive: true, force: true }));
  const [project] = await editorialFixtures();
  Object.assign(project.data, {
    slug: project.slug, repo: 'https://example.test/repository', tagline: 'A project tagline',
    assetNames: { 'screenshot.png': 'renamed_screenshot.png' },
  });
  project.assets[0].name = 'renamed_screenshot.png';
  const files = new Map();
  const assets = project.assets.map(({ name, bytes }) => {
    const path = `/api/publishing/content-assets/revision/${name}`;
    files.set(path, bytes);
    return { name, path, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const snapshot = { ...project, revision: 'revision', state: 'published', assets };
  const entries = [snapshot, { kind: 'software', slug: 'withdrawn', state: 'unpublished' },
    { kind: 'like', slug: 'not-software', state: 'published', data: {}, assets: [] }];
  let corrupt = false;
  const server = createServer(async (req, res) => {
    if (req.url === '/api/collections/publishing_builds/auth-with-password') {
      let body = '';
      for await (const chunk of req) body += chunk;
      assert.deepEqual(JSON.parse(body), { identity: 'restricted@example.test', password: 'export-test-secret' });
      return res.end(JSON.stringify({ token: 'restricted-token', record: { collectionName: 'publishing_builds' } }));
    }
    if (req.headers.authorization !== 'restricted-token') return res.writeHead(403).end();
    if (req.url === '/api/publishing/content') return res.end(JSON.stringify(entries));
    if (files.has(req.url)) return res.end(corrupt ? Buffer.from('corrupt') : files.get(req.url));
    res.writeHead(404).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const env = {
    PUBLISHING_POCKETBASE_URL: `http://127.0.0.1:${server.address().port}`,
    PUBLISHING_BUILD_EMAIL: 'restricted@example.test', PUBLISHING_BUILD_PASSWORD: 'export-test-secret',
  };
  const destination = join(root, 'software');
  const result = await runExport(env, destination);
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(await readdir(destination), ['example-project']);
  const entry = await readFile(join(destination, 'example-project/index.mdx'), 'utf8');
  const frontmatter = JSON.parse(entry.split('---')[1]); // Export uses JSON, a YAML subset.
  const { assetNames, slug, ...expected } = project.data;
  assert.deepEqual(frontmatter, { ...expected,
    screenshot: './assets/screenshot.png',
    gallery: [{ ...expected.gallery[0], src: './assets/gallery.png' }],
  });
  assert.deepEqual(await readFile(join(destination, 'example-project/assets/screenshot.png')), project.assets[0].bytes);
  assert.deepEqual(await readFile(join(destination, 'example-project/assets/gallery.png')), project.assets[1].bytes);

  await t.test('a repeat export refuses to overwrite edited entries', async () => {
    const repeat = await runExport(env, destination);
    assert.notEqual(repeat.code, 0);
    assert.equal(await readFile(join(destination, 'example-project/index.mdx'), 'utf8'), entry);
  });
  await t.test('asset corruption fails without leaving a partial collection or leaking credentials', async () => {
    corrupt = true;
    const failed = await runExport(env, join(root, 'corrupt'));
    assert.notEqual(failed.code, 0);
    assert.doesNotMatch(failed.output, /export-test-secret|restricted-token/);
    await assert.rejects(readFile(join(root, 'corrupt/example-project/index.mdx')));
    assert.deepEqual(await readdir(root), ['software']);
  });
});
