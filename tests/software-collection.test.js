import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildSite as build } from './helpers/fixture-site.js';

async function collectionSite(t) {
  const parent = new URL('../.astro/', import.meta.url);
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(new URL('software-collection-', parent));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src/pages'), { recursive: true });
  await cp(new URL('../src/content/software', import.meta.url), join(root, 'src/content/software'), { recursive: true });
  await cp(new URL('../src/content.config.ts', import.meta.url), join(root, 'src/content.config.ts'));
  await mkdir(join(root, 'src/config'));
  await cp(new URL('../src/config/site-settings.json', import.meta.url), join(root, 'src/config/site-settings.json'));
  await cp(new URL('../src/config/category-schema.ts', import.meta.url), join(root, 'src/config/category-schema.ts'));
  await writeFile(join(root, 'astro.config.mjs'), `import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
export default defineConfig({ integrations: [mdx()] });\n`);
  await writeFile(join(root, 'src/pages/index.astro'), `---
import { getCollection } from 'astro:content';
const projects = await getCollection('software');
---
{projects.map(entry => <script type="application/json" set:html={JSON.stringify(entry.data)} />)}\n`);
  return root;
}

test('software collection content and image metadata', { timeout: 90000 }, async t => {
  const root = await collectionSite(t);
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  const html = await readFile(join(root, 'dist/index.html'), 'utf8');
  await t.test('software collection loads all seven projects with local original images and structured credits', () => {
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
