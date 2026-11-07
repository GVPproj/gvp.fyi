import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';
import { fixtureSite } from './helpers/fixture-site.js';

const group = { id: 'reading', name: 'Reading' }, other = { id: 'inspiration', name: 'Inspiration' };
const note = (id, slug, title, overrides = {}) => ({ id, slug, title, type: 'note', body: `Body of ${title}`,
  created: '2026-01-01 12:00:00Z', collections: ['reading'], ...overrides });
const groupSection = (html, id) => parseHTML(html).document.getElementById(`collection-${id}-heading`)?.closest('section');
const links = section => [...section.querySelectorAll('li a')].map(link => link.getAttribute('href'));

test('file-authored Likes retain literal kinds, stable routes, date-added order, memberships and removals across builds', { timeout: 240000 }, async t => {
  const site = await fixtureSite(t);
  await site.collections([group, other, { id: 'empty', name: 'Empty group' }]);
  const png = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#369' } }).png().toBuffer();
  const pdf = Buffer.from('%PDF-1.7\ncurrent download');
  const saved = note('note1', 'saved-note', 'Saved note', {
    body: '**Literal note** <em>not HTML</em>\n\n[Not a link](https://example.test)',
    collections: ['reading', 'inspiration'],
  });
  await site.entry('likes', 'folder-not-slug', saved);
  await site.entry('likes', 'newer', note('newer1', 'newer-note', 'Newer note', { created: '2026-02-01 12:00:00Z' }));
  await site.entry('likes', 'quote', note('quote1', 'quoted-find', 'Quoted find', {
    type: 'quote', attribution: 'A writer', body: '**Quoted words** <em>literal</em>.', collections: [],
  }));
  await site.entry('likes', 'link', { id: 'link1', slug: 'link-find', title: 'Link find', url: 'https://example.com/current',
    description: '**Literal description**', commentary: '<b>Personal commentary</b>', created: saved.created, collections: [] });
  await site.entry('likes', 'image', { id: 'image1', slug: 'image-find', title: 'Image find', image: './image.png', created: saved.created }, { 'image.png': png });
  await site.entry('likes', 'pdf', { id: 'pdf1', slug: 'pdf-find', title: 'PDF find', download: './document.pdf', created: saved.created }, { 'document.pdf': pdf });
  await site.entry('likes', 'unicode', note('unicode1', 'unicode-note', '🎵'.repeat(250), { collections: [] }));
  const initial = await site.build();
  assert.equal(initial.code, 0, initial.logs);
  const initialOverview = await initial.html('likes');
  const overviewDocument = parseHTML(initialOverview).document;
  assert.deepEqual([...overviewDocument.querySelectorAll('#collection-rows h2')].map(heading => heading.textContent.trim()), ['Inspiration', 'Reading', 'Misc.']);
  assert.deepEqual(links(groupSection(initialOverview, 'reading')), ['/likes/newer-note', '/likes/saved-note']);
  assert.ok(groupSection(initialOverview, 'misc').querySelector('a[href="/likes/link-find"]'));
  assert.equal(overviewDocument.querySelectorAll('a[href="/likes/saved-note"]').length, 2, 'one item can belong to several named collections');
  assert.equal(parseHTML(await initial.html('likes/unicode-note')).document.querySelector('#like-detail h1').textContent, '🎵'.repeat(250));
  for (const [slug, literal] of [['saved-note', saved.body], ['quoted-find', '**Quoted words** <em>literal</em>.']]) {
    const detail = parseHTML(await initial.html(`likes/${slug}`)).document.querySelector('#like-detail');
    assert.ok(detail.textContent.includes(literal));
    assert.equal(detail.querySelector('em, strong, a[href="https://example.test"]'), null, 'frontmatter body is literal text, not Markdown or HTML');
  }
  const quote = parseHTML(await initial.html('likes/quoted-find')).document;
  assert.equal(quote.querySelector('blockquote').textContent, '**Quoted words** <em>literal</em>.');
  assert.match(quote.querySelector('#like-detail').textContent, /A writer/);
  const link = parseHTML(await initial.html('likes/link-find')).document;
  assert.ok(link.querySelector('a[href="https://example.com/current"]'));
  assert.match(link.querySelector('#like-detail').textContent, /\*\*Literal description\*\*/);
  assert.match(link.querySelector('#like-detail').textContent, /<b>Personal commentary<\/b>/);
  assert.equal(link.querySelector('#like-detail b, #like-detail strong'), null);
  const imageDocument = parseHTML(await initial.html('likes/image-find')).document;
  const imageURL = imageDocument.querySelector('#like-detail img').getAttribute('src');
  assert.match(imageURL, /^\/_astro\//);
  const metadata = await sharp(await readFile(join(initial.dir, imageURL))).metadata();
  assert.equal(metadata.width, 30);
  assert.equal(metadata.height, 20);
  const pdfDocument = parseHTML(await initial.html('likes/pdf-find')).document;
  const pdfURL = pdfDocument.querySelector('#like-detail a[href$=".pdf"]').getAttribute('href');
  assert.match(pdfURL, /^\/_astro\//);
  assert.deepEqual(await readFile(join(initial.dir, pdfURL)), pdf);
  assert.match(await initial.html('likes/note1'), /url=\/likes\/saved-note/i);
  await assert.rejects(initial.html('likes/folder-not-slug'));

  // An edit updates the public text, not the readable URL or date-added order.
  saved.title = 'Edited note'; saved.body = 'Saved public edit'; saved.updated = '2026-12-01 12:00:00Z';
  await site.entry('likes', 'folder-not-slug', saved);
  await site.collections([group, { ...other, name: 'A renamed group' }, { id: 'empty', name: 'Empty group' }]);
  const edited = await site.build();
  assert.equal(edited.code, 0, edited.logs);
  assert.match(await edited.html('likes/saved-note'), /Edited note/);
  assert.match(await edited.html('likes/saved-note'), /Saved public edit/);
  assert.match(await edited.html('likes/note1'), /url=\/likes\/saved-note/i);
  await assert.rejects(edited.html('likes/edited-note'));
  const editedOverview = await edited.html('likes');
  assert.deepEqual(links(groupSection(editedOverview, 'reading')), ['/likes/newer-note', '/likes/saved-note']);
  assert.equal(groupSection(editedOverview, 'inspiration').querySelector('h2').textContent.trim(), 'A renamed group');
  assert.equal(await initial.html('likes'), initialOverview, 'later builds never mutate the previously deployed output');

  saved.collections = [];
  await site.entry('likes', 'folder-not-slug', saved);
  await site.remove('likes', 'newer');
  await site.remove('likes', 'image');
  await site.collections([]);
  const removed = await site.build();
  assert.equal(removed.code, 0, removed.logs);
  await assert.rejects(removed.html('likes/newer-note'));
  await assert.rejects(removed.html('likes/newer1'));
  await assert.rejects(removed.html('likes/image-find'));
  await assert.rejects(readFile(join(removed.dir, imageURL)));
  const removedOverview = await removed.html('likes');
  assert.equal(groupSection(removedOverview, 'inspiration'), undefined);
  assert.equal(groupSection(removedOverview, 'reading'), undefined);
  assert.ok(groupSection(removedOverview, 'misc').querySelector('a[href="/likes/saved-note"]'));
  assert.match(await removed.html('likes/quoted-find'), /Quoted words/);
  for (const folder of ['folder-not-slug', 'quote', 'link', 'pdf', 'unicode']) await site.remove('likes', folder);
  const empty = await site.build();
  assert.equal(empty.code, 0, empty.logs);
  assert.equal(parseHTML(await empty.html('likes')).document.querySelector('#collection-rows .content-row'), null);
  await assert.rejects(empty.html('likes/quoted-find'));
  await assert.rejects(readFile(join(empty.dir, pdfURL)));
});

test('missing or corrupt repository content fails the build without changing a previous deployment', { timeout: 240000 }, async t => {
  const site = await fixtureSite(t);
  await site.collections([]);
  const png = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#369' } }).png().toBuffer();
  const pdf = Buffer.from('%PDF-1.7\nintact original');
  const item = { id: 'asset1', slug: 'required-download', title: 'Required download', download: './document.pdf', created: '2026-01-01 12:00:00Z' };
  const directory = await site.entry('likes', 'asset', item, { 'document.pdf': pdf });
  const successful = await site.build();
  assert.equal(successful.code, 0, successful.logs);
  const previous = await successful.html('likes/required-download');
  const failures = [
    ['missing PDF', async () => { await rm(join(directory, 'document.pdf')); }],
    ['missing image', async () => { await site.entry('likes', 'asset', { ...item, download: undefined, image: './missing.png' }); }],
    ['corrupt image', async () => { await site.entry('likes', 'asset', { ...item, download: undefined, image: './broken.png' }, { 'broken.png': Buffer.from('not an image') }); }],
    ['malformed frontmatter', async () => { await writeFile(join(directory, 'index.md'), '---\ntitle: [unterminated\n---\n'); }],
    ['missing required field', async () => { await site.entry('likes', 'asset', { ...item, created: undefined }, { 'document.pdf': pdf }); }],
    ['unknown named collection', async () => { await site.entry('likes', 'asset', { ...item, collections: ['missing'] }, { 'document.pdf': pdf }); }],
  ];
  for (const [name, change] of failures) {
    await change();
    const failed = await site.build();
    assert.notEqual(failed.code, 0, `${name}: ${failed.logs}`);
    assert.equal(await successful.html('likes/required-download'), previous);
  }
  // Asset edits are now intentionally file-authoring operations, not checksum
  // mismatches against a remote record. Valid replacement bytes must publish.
  await site.entry('likes', 'asset', { ...item, download: undefined, image: './replacement.png' }, { 'replacement.png': png });
  const repaired = await site.build();
  assert.equal(repaired.code, 0, repaired.logs);
  assert.ok(parseHTML(await repaired.html('likes/required-download')).document.querySelector('#like-detail img'));
});
