import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';

async function collectionSite(t) {
  const parent = new URL('../.astro/', import.meta.url);
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(new URL('software-collection-', parent));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src/pages'), { recursive: true });
  await cp(new URL('../src/content/software', import.meta.url), join(root, 'src/content/software'), { recursive: true });
  await writeFile(join(root, 'src/content/named-collections.json'), '[]\n');
  await cp(new URL('../src/content.config.ts', import.meta.url), join(root, 'src/content.config.ts'));
  await mkdir(join(root, 'src/config'));
  await cp(new URL('../src/config/site-settings.json', import.meta.url), join(root, 'src/config/site-settings.json'));
  await writeFile(join(root, 'astro.config.mjs'), `import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
export default defineConfig({ integrations: [mdx()] });\n`);
  await writeFile(join(root, 'src/pages/index.astro'), `---
import { getCollection, render } from 'astro:content';
const projects = await getCollection('software');
const entries = await Promise.all(projects.map(async entry => ({ entry, ...await render(entry) })));
---
{entries.map(({ entry, Content }) => <article data-project={entry.id}>
  <script type="application/json" set:html={JSON.stringify(entry.data)} />
  <Content />
</article>)}\n`);
  return root;
}

async function build(root) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url)), 'build'], {
    cwd: root, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => output += chunk);
  child.stderr.on('data', chunk => output += chunk);
  const [code] = await once(child, 'exit');
  return { code, output };
}

test('software collection loads all seven exported projects with local original images and structured credits', { timeout: 90000 }, async t => {
  const root = await collectionSite(t);
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  const html = await readFile(join(root, 'dist/index.html'), 'utf8');
  const data = [...html.matchAll(/<script type="application\/json">(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]));
  assert.equal(data.length, 7);
  assert.deepEqual(data.map(project => project.title).sort(), [
    "A 'Linktree'-style React app", 'A B&B Marketing Page', 'A JavaScript Colour Scheme Generator',
    'A JavaScript Dice Game', 'A music festival page built with Astro', 'An API-driven Quiz Game', 'Tipbox.io',
  ]);
  const tipbox = data.find(project => project.title === 'Tipbox.io');
  assert.equal(tipbox.screenshot.width, 2548);
  assert.equal(tipbox.screenshot.height, 1299);
  assert.equal(tipbox.gallery.length, 3);
  assert.deepEqual(tipbox.gallery.map(image => [image.src.width, image.src.height]), [[2012, 1698], [1538, 1302], [1920, 1080]]);
  assert.equal(tipbox.team.length, 8);
  assert.match(tipbox.role.paragraphs[0], /Full-Stack Engineer/);
  assert.equal(tipbox.url, 'https://www.tipbox.io');
});

test('a software entry composes its MDX body with an Astro image component', { timeout: 90000 }, async t => {
  const root = await collectionSite(t);
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  const { document } = parseHTML(await readFile(join(root, 'dist/index.html'), 'utf8'));
  const figure = document.querySelector('article[data-project="tipbox"] figure');
  assert.ok(figure, 'Tipbox composes a figure in its entry body');
  const image = figure.querySelector('img');
  assert.equal(image.getAttribute('width'), '1920');
  assert.equal(image.getAttribute('height'), '1080');
  assert.match(image.getAttribute('src'), /^\/_astro\//);
  assert.ok(figure.querySelector('figcaption').textContent.trim());
});

test('collection loading rejects unknown categories and missing required index-card fields', { timeout: 90000 }, async t => {
  const root = await collectionSite(t);
  const path = join(root, 'src/content/software/biolink/index.mdx');
  const original = JSON.parse((await readFile(path, 'utf8')).split('---')[1]);
  const writeEntry = data => writeFile(path, `---\n${JSON.stringify(data, null, 2)}\n---\n`);

  await t.test('category IDs must exist in the production site settings', async () => {
    await writeEntry({ ...original, category: 'not-a-production-category' });
    const result = await build(root);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /Unknown software category/);
  });
  for (const field of ['title', 'description', 'category', 'order', 'tooling', 'screenshot']) {
    await t.test(`missing ${field} fails the build`, async () => {
      const data = { ...original };
      delete data[field];
      await writeEntry(data);
      const result = await build(root);
      assert.notEqual(result.code, 0);
      assert.match(result.output, new RegExp(field));
    });
  }
  await t.test('at least one website or repository link is required', async () => {
    const { url, repo, ...data } = original;
    await writeEntry(data);
    const result = await build(root);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /requires a website.*or repository/);
  });
  await t.test('a screenshot must be repository-owned rather than a remote URL', async () => {
    await writeEntry({ ...original, screenshot: 'https://example.test/image.png' });
    const result = await build(root);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /entry-relative repository paths/);
  });
  await t.test('referencing a missing local screenshot fails the build', async () => {
    await writeEntry({ ...original, screenshot: './assets/missing.png' });
    const result = await build(root);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /missing\.png/);
  });
});
