import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';
import { currentLike } from './helpers/current-likes.js';

// This HTTP fixture is the published-only boundary, not a fake working-record API.
// Real authorization/persistence/state transitions are tested in the backend.
async function publisher(t) {
  const state = { items: [], media: new Map(), status: 200, authStatus: 200, requests: [] };
  const server = createServer((req, res) => {
    state.requests.push(req.url);
    if (req.url.endsWith('auth-with-password')) return res.writeHead(state.authStatus).end(JSON.stringify({ token: 'fixture-token', record: { collectionName: 'publishing_builds' } }));
    if (req.headers.authorization !== 'fixture-token') return res.writeHead(403).end('{}');
    if (req.url === '/api/publishing/current/music') return res.end('[]');
    if (req.url === '/api/publishing/current/likes') return res.writeHead(state.status).end(JSON.stringify(state.items));
    if (state.media.has(req.url)) return res.end(state.media.get(req.url));
    res.writeHead(404).end('{}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  state.build = async () => {
    await mkdir(new URL('../.astro/', import.meta.url), { recursive: true });
    const dir = await mkdtemp(new URL('../.astro/current-build-', import.meta.url));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const child = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', dir], {
      env: { ...process.env, PUBLISHING_POCKETBASE_URL: `http://127.0.0.1:${server.address().port}`,
        PUBLISHING_BUILD_EMAIL: 'fixture@example.test', PUBLISHING_BUILD_PASSWORD: 'fixture-password', ASTRO_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    let logs = ''; child.stdout.on('data', bytes => logs += bytes); child.stderr.on('data', bytes => logs += bytes);
    const [code] = await once(child, 'exit');
    return { dir, code, logs, html: route => readFile(join(dir, route, 'index.html'), 'utf8') };
  };
  return state;
}
const group = { id: 'reading', name: 'Reading' }, other = { id: 'inspiration', name: 'Inspiration' };
const note = (id, title) => currentLike(id, { title, type: 'note', body: `Body of ${title}`, collections: [group] });
function upload(id, title, filename, bytes) {
  const asset = { name: filename, path: `/api/publishing/current/likes-assets/${id}/${filename}`, sha256: createHash('sha256').update(bytes).digest('hex') };
  return currentLike(id, { title, asset: filename, collections: [group] }, [asset]);
}
const groupSection = (html, id) => parseHTML(html).document.getElementById(`collection-${id}-heading`)?.closest('section');

test('current Likes render all kinds and subsequent builds follow edits, memberships and removals', { timeout: 120000 }, async t => {
  const state = await publisher(t);
  const png = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#369' } }).png().toBuffer();
  const pdf = Buffer.from('%PDF-1.7\ncurrent download');
  const image = upload('image1', 'Image find', 'image.png', png);
  const document = upload('pdf1', 'PDF find', 'document.pdf', pdf);
  state.media.set(image.assets[0].path, png); state.media.set(document.assets[0].path, pdf);
  const saved = note('note1', 'Saved note');
  saved.data.previewProvenance = { secret: 'private-preview-source' };
  saved.data.privateToken = 'must-not-leak';
  saved.data.collections = [group, other];
  state.items = [saved, { ...note('quote1', 'Quoted find'), data: { ...note('quote1', 'Quoted find').data, type: 'quote', attribution: 'A writer', body: 'Quoted words.' } },
    currentLike('link1', { title: 'Link find', url: 'https://example.com/current' }), image, document,
    currentLike('unicode1', { title: '🎵'.repeat(500), type: 'note', body: 'Unicode title' })];
  const initial = await state.build(); assert.equal(initial.code, 0, initial.logs);
  const initialOverview = await initial.html('likes');
  assert.ok(groupSection(initialOverview, 'inspiration'));
  assert.ok(groupSection(initialOverview, 'reading'));
  assert.ok(groupSection(initialOverview, 'misc').querySelector('a[href="/likes/link-find"]'));
  assert.equal(parseHTML(await initial.html('likes/item')).document.querySelector('#like-detail h1').textContent, '🎵'.repeat(500));
  const overviewDocument = parseHTML(initialOverview).document;
  assert.equal(overviewDocument.querySelectorAll('a[href="/likes/saved-note"]').length, 2, 'one item can belong to several named collections');
  const noteHTML = await initial.html('likes/saved-note');
  assert.match(noteHTML, /Body of Saved note/);
  assert.doesNotMatch(initialOverview + noteHTML, /private-preview-source|must-not-leak/);
  assert.match(await initial.html('likes/quoted-find'), /<blockquote[^>]*>Quoted words\.<\/blockquote>/);
  assert.match(await initial.html('likes/quoted-find'), /A writer/);
  assert.match(await initial.html('likes/link-find'), /href="https:\/\/example.com\/current"/);
  const imageDocument = parseHTML(await initial.html('likes/image-find')).document;
  const imageURL = imageDocument.querySelector('#like-detail img').getAttribute('src');
  assert.deepEqual(await readFile(join(initial.dir, imageURL)), png);
  const pdfDocument = parseHTML(await initial.html('likes/pdf-find')).document;
  const pdfURL = pdfDocument.querySelector('#like-detail a[href$=".pdf"]').getAttribute('href');
  assert.deepEqual(await readFile(join(initial.dir, pdfURL)), pdf);
  await assert.rejects(initial.html('likes/private-draft'));

  // A later acquisition sees saved edits, renamed groups and changed memberships.
  saved.data.title = 'Edited note'; saved.data.body = 'Saved public edit';
  saved.data.collections = [{ ...other, name: 'Renamed group' }];
  state.items = state.items.map(item => item === saved ? saved : { ...item, data: { ...item.data, collections: [] } });
  const edited = await state.build(); assert.equal(edited.code, 0, edited.logs);
  assert.match(await edited.html('likes/edited-note'), /Saved public edit/);
  const editedOverview = await edited.html('likes');
  assert.equal(groupSection(editedOverview, 'inspiration').querySelector('h2').textContent.trim(), 'Renamed group');
  assert.ok(groupSection(editedOverview, 'inspiration').querySelector('a[href="/likes/edited-note"]'));
  assert.equal(groupSection(editedOverview, 'reading'), undefined);
  assert.ok(groupSection(editedOverview, 'misc').querySelector('a[href="/likes/quoted-find"]'));
  await assert.rejects(edited.html('likes/saved-note'));
  assert.equal(await initial.html('likes'), initialOverview, 'Save and later builds do not mutate previous static output');

  // The published surface omits unpublished/deleted records; no tombstones needed.
  state.items = state.items.filter(item => item.id !== 'note1');
  const unpublished = await state.build(); assert.equal(unpublished.code, 0, unpublished.logs);
  await assert.rejects(unpublished.html('likes/edited-note'));
  assert.doesNotMatch(await unpublished.html('likes'), /Renamed group/);
  state.items = state.items.filter(item => item.id !== 'image1');
  const deleted = await state.build(); assert.equal(deleted.code, 0, deleted.logs);
  await assert.rejects(deleted.html('likes/image-find'));
  await assert.rejects(readFile(join(deleted.dir, imageURL)));
  assert.match(await deleted.html('likes/quoted-find'), /Quoted words/);
  const deletedOverview = await deleted.html('likes');
  assert.equal(groupSection(deletedOverview, 'inspiration'), undefined);
  assert.equal(groupSection(deletedOverview, 'reading'), undefined);
  assert.ok(groupSection(deletedOverview, 'misc').querySelector('a[href="/likes/quoted-find"]'), 'deleting groups leaves their items ungrouped');
  state.items = [];
  const empty = await state.build(); assert.equal(empty.code, 0, empty.logs);
  assert.equal(parseHTML(await empty.html('likes')).document.querySelector('#collection-rows .content-row'), null);
  await assert.rejects(empty.html('likes/quoted-find'));
  assert.ok(!state.requests.some(route => /^\/api\/publishing\/(content|releases|artwork)/.test(route)));
});

test('authentication, response and media acquisition failures never yield a successful empty or partial build', { timeout: 120000 }, async t => {
  const state = await publisher(t);
  const pdf = Buffer.from('%PDF-1.7\nintact original');
  const item = upload('pdf1', 'Required download', 'document.pdf', pdf);
  state.items = [item]; state.media.set(item.assets[0].path, pdf);
  const successful = await state.build(); assert.equal(successful.code, 0, successful.logs);
  const previous = await successful.html('likes/required-download');
  for (const mode of ['missing-media', 'changed-media', 'authentication', 'fetch', 'invalid-response', 'missing-public-field']) {
    state.authStatus = 200; state.status = 200; state.items = [item];
    state.media.set(item.assets[0].path, pdf);
    if (mode === 'missing-media') state.media.delete(item.assets[0].path);
    if (mode === 'changed-media') state.media.set(item.assets[0].path, Buffer.from('%PDF-1.7\nchanged bytes'));
    if (mode === 'authentication') state.authStatus = 403;
    if (mode === 'fetch') state.status = 503;
    if (mode === 'invalid-response') state.items = {};
    if (mode === 'missing-public-field') {
      state.items = [{ ...item, data: { ...item.data } }];
      delete state.items[0].data.created;
    }
    const failed = await state.build();
    assert.notEqual(failed.code, 0, mode);
    assert.match(failed.logs, /build failed/);
    assert.doesNotMatch(failed.logs, /fixture-password|fixture-token/);
    assert.equal(await successful.html('likes/required-download'), previous);
  }
  state.authStatus = 200; state.status = 200;
  for (const data of [{}, { ...item.data, id: 'different' }, { ...item.data, type: 'unknown' },
    { ...item.data, title: {} }, { ...item.data, type: 'note', body: '' },
    { ...item.data, collections: [{ id: 'group1', name: null }] }, { ...item.data, collections: null },
    { ...item.data, asset: 'missing.png' }, { ...item.data, url: 'javascript:alert(1)' }]) {
    state.items = [{ ...item, data }];
    const failed = await state.build();
    assert.notEqual(failed.code, 0, 'invalid public data is not a partial successful output');
    assert.equal(await successful.html('likes/required-download'), previous);
  }
  const emitted = await readdir(successful.dir);
  assert.ok(emitted.includes('published-content'));
});
