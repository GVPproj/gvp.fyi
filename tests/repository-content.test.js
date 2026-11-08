import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';
import { buildSite as build } from './helpers/fixture-site.js';

async function site(t, collection) {
  const parent = fileURLToPath(new URL('../.astro/', import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'repository-content-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src/pages'), { recursive: true });
  await mkdir(join(root, 'src/config'), { recursive: true });
  await mkdir(join(root, 'src/content'), { recursive: true });
  await cp(new URL('../src/content.config.ts', import.meta.url), join(root, 'src/content.config.ts'));
  await cp(new URL('../src/config/site-settings.json', import.meta.url), join(root, 'src/config/site-settings.json'));
  await cp(new URL('../src/config/category-schema.ts', import.meta.url), join(root, 'src/config/category-schema.ts'));
  const settingsPath = join(root, 'src/config/site-settings.json');
  const settings = JSON.parse(await readFile(settingsPath, 'utf8'));
  settings.categories.likes = [{ id: 'reading', title: 'Reading' }];
  await writeFile(settingsPath, JSON.stringify(settings));
  await writeFile(join(root, 'astro.config.mjs'), 'export default { site: "https://gvp.fyi" };\n');
  await writeFile(join(root, 'src/pages/index.astro'), `---
import { getCollection } from 'astro:content';
const entries = await getCollection('${collection}');
---
<script type="application/json" set:html={JSON.stringify(entries.map(entry => ({ id: entry.id, data: entry.data })))} />\n`);
  return root;
}

async function likesSite(t) {
  const root = await site(t, 'likes');
  for (const dir of ['components', 'layouts', 'styles', 'scripts', 'lib']) {
    await cp(new URL(`../src/${dir}`, import.meta.url), join(root, 'src', dir), { recursive: true });
  }
  await cp(new URL('../src/pages/likes', import.meta.url), join(root, 'src/pages/likes'), { recursive: true });
  return root;
}

async function entry(root, collection, folder, data) {
  const dir = join(root, 'src/content', collection, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.md'), `---\n${JSON.stringify(data, null, 2)}\n---\n`);
  return dir;
}

const note = {
  id: 'note-one', slug: 'stable-note', title: 'A personal note', type: 'note',
  body: '**Literal** <em>text</em>\n\nSecond paragraph.',
  created: '2026-10-01 12:34:56.123Z', updated: '2026-10-02 12:34:56.123Z', category: 'reading',
};

test('native Likes retain explicit identity, date added and literal text independently of the entry folder', async t => {
  const root = await site(t, 'likes');
  await entry(root, 'likes', 'different-folder', note);
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  const { document } = parseHTML(await readFile(join(root, 'dist/index.html'), 'utf8'));
  const entries = JSON.parse(document.querySelector('script').textContent);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 'different-folder');
  assert.equal(entries[0].data.id, 'note-one');
  assert.equal(entries[0].data.slug, 'stable-note');
  assert.equal(entries[0].data.body, '**Literal** <em>text</em>\n\nSecond paragraph.');
  assert.equal(entries[0].data.created, '2026-10-01 12:34:56.123Z');
  assert.equal(entries[0].data.category, 'reading');
  assert.equal(Object.hasOwn(entries[0].data, 'collections'), false);
});

test('changing only category settings revalidates unchanged entries on the next build', async t => {
  const root = await likesSite(t);
  await entry(root, 'likes', 'note', note);
  const initial = await build(root);
  assert.equal(initial.code, 0, initial.output);
  const path = join(root, 'src/config/site-settings.json');
  const settings = JSON.parse(await readFile(path, 'utf8'));
  settings.categories.likes = [];
  await writeFile(path, JSON.stringify(settings));
  const removed = await build(root);
  assert.notEqual(removed.code, 0, removed.output);
  assert.match(removed.output, /category/i);
});

test('native music preserves partial dates, optional metadata and real local artwork', async t => {
  const root = await site(t, 'music');
  const dir = await entry(root, 'music', 'release-folder', {
    id: 'release-one', slug: 'fixed-release', order: 7, category: 'think-about-life',
    title: 'A release', artist: 'An artist', release_date: '2009-10',
    artwork: './cover.png', about: '**Literal** description',
  });
  await writeFile(join(dir, 'cover.png'), await sharp({ create: { width: 32, height: 24, channels: 3, background: '#336699' } }).png().toBuffer());
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  const { document } = parseHTML(await readFile(join(root, 'dist/index.html'), 'utf8'));
  const entries = JSON.parse(document.querySelector('script').textContent);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 'release-folder');
  assert.equal(entries[0].data.release_date, '2009-10');
  assert.equal(entries[0].data.order, 7);
  assert.equal(entries[0].data.artwork.width, 32);
  assert.equal(entries[0].data.artwork.height, 24);
  assert.equal(entries[0].data.about, '**Literal** description');
  assert.deepEqual(entries[0].data.tracks, []);
});

test('Likes render literal repository text at stable readable and legacy routes after title edits', async t => {
  const root = await likesSite(t);
  await entry(root, 'likes', 'note-folder', note);
  let result = await build(root);
  assert.equal(result.code, 0, result.output);
  const detailPath = join(root, 'dist/likes/stable-note/index.html');
  let { document } = parseHTML(await readFile(detailPath, 'utf8'));
  assert.equal(document.querySelector('.full-text').textContent, '**Literal** <em>text</em>\n\nSecond paragraph.');
  assert.equal(document.querySelector('.full-text em, .full-text strong'), null);
  assert.match(await readFile(join(root, 'dist/likes/note-one/index.html'), 'utf8'), /url=\/likes\/stable-note/);
  await entry(root, 'likes', 'note-folder', { ...note, title: 'A different title', updated: '2026-11-07T12:00:00Z' });
  result = await build(root);
  assert.equal(result.code, 0, result.output);
  ({ document } = parseHTML(await readFile(detailPath, 'utf8')));
  assert.equal(document.querySelector('h1').textContent, 'A different title');
  assert.match(await readFile(join(root, 'dist/likes/index.html'), 'utf8'), /href="\/likes\/stable-note"/);
  await assert.rejects(readFile(join(root, 'dist/likes/a-different-title/index.html')));
});

test('Likes publish adjacent images and PDF downloads through native assets', async t => {
  const root = await likesSite(t);
  const imageDir = await entry(root, 'likes', 'image', {
    id: 'image-id', slug: 'local-image', title: 'Local image', created: note.created, category: 'reading', image: './image.png',
  });
  await writeFile(join(imageDir, 'image.png'), await sharp({ create: { width: 320, height: 240, channels: 3, background: '#336699' } }).png().toBuffer());
  const pdf = Buffer.from('%PDF-1.4\nrepository download\n%%EOF');
  const pdfDir = await entry(root, 'likes', 'pdf', {
    id: 'pdf-id', slug: 'local-pdf', title: 'Local PDF', created: note.created, category: 'reading', download: './document.pdf',
  });
  await writeFile(join(pdfDir, 'document.pdf'), pdf);
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  const image = parseHTML(await readFile(join(root, 'dist/likes/local-image/index.html'), 'utf8')).document.querySelector('#like-detail img');
  assert.ok(image, 'the repository image is rendered');
  assert.match(image.getAttribute('src'), /^\/_astro\//);
  assert.equal(image.getAttribute('width'), '320');
  assert.equal(image.getAttribute('height'), '240');
  assert.ok(image.getAttribute('srcset').includes('320w'));
  const { document } = parseHTML(await readFile(join(root, 'dist/likes/local-pdf/index.html'), 'utf8'));
  const download = document.querySelector('#like-detail a[target="_blank"]');
  assert.ok(download, 'the adjacent PDF is downloadable');
  assert.match(download.getAttribute('href'), /^\/_astro\/.*\.pdf$/);
  assert.deepEqual(await readFile(join(root, 'dist', download.getAttribute('href'))), pdf);
  const overview = parseHTML(await readFile(join(root, 'dist/likes/index.html'), 'utf8')).document;
  assert.equal(overview.querySelector('a[href="/likes/local-pdf"] .content-preview').textContent, 'PDF document');
  assert.equal(overview.querySelector('a[href="/likes/local-pdf"] img'), null);
  assert.ok(overview.querySelector('a[href="/likes/local-image"] img'));
});

test('credential-free development reflects content edits without restarting the server', { timeout: 30000 }, async t => {
  const root = await likesSite(t);
  await entry(root, 'likes', 'note', note);
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url)), 'dev', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/POCKETBASE|^PUBLISHING_/.test(key))),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', chunk => logs += chunk);
  child.stderr.on('data', chunk => logs += chunk);
  const exited = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null) { child.kill(); await exited; } });
  const text = async () => {
    try { return await (await fetch(`http://127.0.0.1:${port}/likes/stable-note`, { signal: AbortSignal.timeout(1000) })).text(); }
    catch { return ''; }
  };
  async function waitForTitle(title) {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (parseHTML(await text()).document.querySelector('h1')?.textContent === title) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Development did not render ${title}: ${logs}`);
  }
  await waitForTitle('A personal note');
  await entry(root, 'likes', 'note', { ...note, title: 'Edited without restart' });
  await waitForTitle('Edited without restart');
});

test('Likes reject duplicate identities, readable routes and legacy-route collisions instead of shadowing entries', async t => {
  const root = await likesSite(t);
  await entry(root, 'likes', 'first-folder', note);
  for (const [name, changes] of [
    ['duplicate ID', { id: 'note-one', slug: 'other-note' }],
    ['duplicate slug', { id: 'another-id', slug: 'stable-note' }],
    ['slug shadows legacy ID', { id: 'another-id', slug: 'note-one' }],
    ['legacy ID shadows slug', { id: 'stable-note', slug: 'other-note' }],
  ]) {
    await t.test(name, async () => {
      await entry(root, 'likes', 'second-folder', { ...note, ...changes });
      const result = await build(root);
      assert.notEqual(result.code, 0, result.output);
      assert.match(result.output, /Duplicate|conflict|collision/i);
    });
  }
});

test('all settings category registries reject duplicate IDs and missing or empty IDs and titles', async t => {
  const root = await site(t, 'likes');
  const path = join(root, 'src/config/site-settings.json');
  const settings = JSON.parse(await readFile(path, 'utf8'));
  for (const kind of ['likes', 'software', 'releases']) {
    for (const [name, data] of [
      ['duplicate ID', [{ id: 'reading', title: 'Reading' }, { id: 'reading', title: 'Other' }]],
      ['missing ID', [{ title: 'Reading' }]],
      ['empty ID', [{ id: '', title: 'Reading' }]],
      ['blank ID', [{ id: ' ', title: 'Reading' }]],
      ['missing title', [{ id: 'reading' }]],
      ['empty title', [{ id: 'reading', title: '' }]],
      ['blank title', [{ id: 'reading', title: ' ' }]],
      ['missing registry', undefined],
    ]) {
      await t.test(`${kind}: ${name}`, async () => {
        await writeFile(path, JSON.stringify({ ...settings, categories: { ...settings.categories, [kind]: data } }));
        const result = await build(root);
        assert.notEqual(result.code, 0, result.output);
        assert.match(result.output, /categor|registry|\bid\b|title|array/i);
      });
    }
  }
  await rm(path);
  const missing = await build(root);
  assert.notEqual(missing.code, 0, missing.output);
  assert.match(missing.output, /site-settings\.json/);
});

test('misc is accepted as an explicit category ID in every settings registry', async t => {
  const root = await likesSite(t);
  const path = join(root, 'src/config/site-settings.json');
  const settings = JSON.parse(await readFile(path, 'utf8'));
  for (const kind of ['likes', 'software', 'releases']) {
    settings.categories[kind] = [{ id: 'misc', title: `Explicit ${kind}` }];
  }
  await writeFile(path, JSON.stringify(settings));
  await entry(root, 'likes', 'note', { ...note, category: 'misc' });
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  const { document } = parseHTML(await readFile(join(root, 'dist/likes/index.html'), 'utf8'));
  assert.deepEqual([...document.querySelectorAll('#collection-rows h2')].map(heading => heading.textContent.trim()), ['Explicit likes']);
  assert.equal(document.querySelector('#collection-misc-heading').closest('section').querySelectorAll('a[href="/likes/stable-note"]').length, 1);
});

test('invalid music metadata, track order and nonlocal artwork fail collection loading', async t => {
  const root = await site(t, 'music');
  const release = { id: 'release-id', slug: 'release-slug', category: 'think-about-life', title: 'Release', artist: 'Artist', release_date: '2007', artwork: './cover.png' };
  const dir = await entry(root, 'music', 'release', release);
  await writeFile(join(dir, 'cover.png'), await sharp({ create: { width: 16, height: 16, channels: 3, background: '#336699' } }).png().toBuffer());
  for (const [name, changes, diagnostic] of [
    ['unknown category', { category: 'unknown' }, /category/i],
    ['invalid date', { release_date: 'yesterday' }, /release_date|date/i],
    ['invalid partial date', { release_date: '2007-13' }, /release_date|date/i],
    ['impossible calendar date', { release_date: '2026-02-30' }, /release_date|date/i],
    ['impossible imported RFC date', { release_date: '31 Apr 2026 00:00:00 GMT' }, /release_date|date/i],
    ['empty title', { title: ' ' }, /title/i],
    ['unsafe listening link', { url: 'javascript:alert(1)' }, /url/i],
    ['out-of-order track', { tracks: [{ title: 'Track', track_num: 2 }] }, /track/i],
    ['negative duration', { tracks: [{ title: 'Track', track_num: 1, duration: -1 }] }, /duration/i],
    ['remote audio', { tracks: [{ title: 'Track', track_num: 1, audio_url: 'https://example.test/audio.mp3' }] }, /audio_url/i],
    ['remote cover', { artwork: 'https://example.test/cover.png' }, /entry-relative/i],
  ]) {
    await t.test(name, async () => {
      await entry(root, 'music', 'release', { ...release, ...changes });
      const result = await build(root);
      assert.notEqual(result.code, 0, result.output);
      assert.match(result.output, diagnostic);
    });
  }
});

test('collection-item text limits count Unicode characters rather than UTF-16 units', async t => {
  const root = await site(t, 'likes');
  await entry(root, 'likes', 'unicode', { ...note, title: '🎵'.repeat(500) });
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  const { document } = parseHTML(await readFile(join(root, 'dist/index.html'), 'utf8'));
  assert.equal(JSON.parse(document.querySelector('script').textContent)[0].data.title, '🎵'.repeat(500));
});

test('invalid collection-item categories, kinds, timestamps and local assets fail collection loading', async t => {
  const root = await site(t, 'likes');
  for (const [name, changes, diagnostic] of [
    ['empty note', { body: ' ' }, /body|text/i],
    ['ordinary item without destination', { type: '', body: '' }, /URL|asset|image|download/i],
    ['invalid date added', { created: 'yesterday' }, /created|timestamp/i],
    ['impossible date added', { created: '2026-02-30T12:00:00Z' }, /created|timestamp/i],
    ['impossible updated timestamp', { updated: '2026-04-31T12:00:00Z' }, /updated|timestamp/i],
    ['unsafe destination', { url: 'javascript:alert(1)' }, /url/i],
    ['missing local image', { type: '', image: './missing.png' }, /missing\.png/i],
    ['remote image', { type: '', image: 'https://example.test/image.png' }, /entry-relative/i],
    ['invalid readable route', { slug: '../escape' }, /slug/i],
    ['unknown category', { category: 'unknown' }, /category/i],
    ['undeclared misc category', { category: 'misc' }, /category/i],
    ['missing category', { category: undefined }, /category/i],
    ['empty category', { category: '' }, /category/i],
    ['blank category', { category: ' ' }, /category/i],
    ['category array', { category: ['reading'] }, /category/i],
    ['multiple categories', { category: ['reading', 'other'] }, /category/i],
    ['empty category array', { category: [] }, /category/i],
    ['legacy collections only', { category: undefined, collections: ['reading'] }, /category|collections/i],
    ['legacy collections alongside category', { collections: ['reading'] }, /collections/i],
    ['legacy empty collections', { collections: [] }, /collections/i],
  ]) {
    await t.test(name, async () => {
      await entry(root, 'likes', 'item', { ...note, ...changes });
      const result = await build(root);
      assert.notEqual(result.code, 0, result.output);
      assert.match(result.output, diagnostic);
    });
  }
});
