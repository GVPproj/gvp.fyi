import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function publicLikesServer(t) {
  const requests = [];
  const state = { items: [], collections: [], failure: false };
  const backend = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://pocketbase.test');
    requests.push({ url, headers: request.headers, method: request.method });
    response.setHeader('Content-Type', 'application/json');
    if (state.failure) {
      response.writeHead(500).end(JSON.stringify({ message: 'PRIVATE backend diagnostic' }));
    } else if (url.pathname === '/api/collections/likes_items/records') {
      response.end(JSON.stringify({ items: state.items, totalPages: 1 }));
    } else if (url.pathname === '/api/collections/likes_collections/records') {
      response.end(JSON.stringify({ items: state.collections, totalPages: 1 }));
    } else {
      response.writeHead(404).end('{}');
    }
  });
  const endpoint = await listen(backend);
  t.after(async () => {
    const closed = new Promise(resolve => backend.close(resolve));
    backend.closeAllConnections();
    await closed;
  });

  const socket = net.createServer();
  const origin = await listen(socket);
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  const child = spawn(process.execPath, [
    fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url)),
    'dev', '--ignore-lock', '--host', '127.0.0.1', '--port', new URL(origin).port,
  ], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, PUBLIC_POCKETBASE_URL: endpoint, ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '', finished = false, spawnError;
  const exited = new Promise(resolve => {
    child.once('exit', () => { finished = true; resolve(); });
    child.once('error', error => { spawnError = error; finished = true; resolve(); });
  });
  const log = data => { logs = (logs + data).slice(-16000); };
  child.stdout.on('data', log);
  child.stderr.on('data', log);
  const kill = () => { if (!finished) child.kill('SIGKILL'); };
  process.once('exit', kill);
  t.after(async () => {
    try {
      if (!finished) {
        child.kill('SIGTERM');
        const force = setTimeout(kill, 3000);
        try { await exited; } finally { clearTimeout(force); }
      }
    } finally {
      process.removeListener('exit', kill);
    }
  });

  const signal = AbortSignal.any([t.signal, AbortSignal.timeout(45000)]);
  try {
    while (true) {
      signal.throwIfAborted();
      if (finished) throw spawnError ?? new Error(`Astro exited (${child.exitCode ?? child.signalCode})`);
      try {
        const response = await fetch(origin, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
        await response.text();
        if (!response.ok) throw new Error(`Astro startup returned ${response.status}`);
        break;
      } catch (error) {
        signal.throwIfAborted();
        if (finished) throw spawnError ?? error;
        await delay(100, undefined, { signal });
      }
    }
  } catch (error) {
    throw new Error(`Could not start temporary Astro server: ${error.message}\n${logs}`, { cause: error });
  }

  return {
    state, endpoint,
    async page(path = '/likes') {
      requests.length = 0;
      const response = await fetch(new URL(path, origin), {
        signal: AbortSignal.any([t.signal, AbortSignal.timeout(15000)]),
      });
      const html = await response.text();
      const { document } = parseHTML(html); // Parse only; never execute scripts or load assets.
      assert.ok(requests.length >= 2, 'SSR must fetch items and named collections');
      for (const request of requests) {
        assert.equal(request.headers.authorization, undefined, 'public reads must not authenticate');
        assert.equal(request.method, 'GET');
        assert.ok(['/api/collections/likes_items/records', '/api/collections/likes_collections/records'].includes(request.url.pathname));
      }
      const itemRequests = requests.filter(request => request.url.pathname === '/api/collections/likes_items/records');
      assert.equal(itemRequests.length, 1);
      return { response, html, document, query: itemRequests[0].url.searchParams };
    },
  };
}

const created = '2026-01-01 00:00:00.000Z';
const item = (id, fields = {}) => ({
  id, created, published: true, title: `Published find ${id}`, url: `https://example.com/${id}`,
  collections: ['reading'], ...fields,
});
const links = document => [...document.querySelectorAll('a')];

test('public /likes is useful from server-rendered HTML without JavaScript', { timeout: 90000 }, async t => {
  const { state, endpoint, page } = await publicLikesServer(t);
  state.collections = [{ id: 'reading', name: 'Reading & thinking' }, { id: 'empty', name: 'Empty' }];

  await t.test('renders published content, native full text and original image links safely', async () => {
    const unsafe = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const body = `${'A full-length note. '.repeat(40)}${unsafe}`;
    state.items = [
      item('link', { title: unsafe, description: 'A useful description', commentary: unsafe }),
      item('note', { type: 'note', title: 'Long note', body, url: '' }),
      item('quote', { type: 'quote', title: 'Quotation', body: 'Every word of the quotation.', attribution: unsafe }),
      item('image', { asset: 'original image.png', title: 'Original image' }),
      item('unsafe', { title: 'Unsafe destination', url: 'javascript:alert(1)' }),
    ];
    const { response, document, query } = await page();
    assert.equal(response.status, 200);
    assert.equal(query.get('filter'), 'published=true');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(document.querySelectorAll('#likes-board > li').length, 5);
    assert.equal(document.querySelector('#likes-board h2').textContent, unsafe);
    assert.ok(document.querySelector('#likes-board').textContent.includes('A useful description'));
    assert.equal(document.querySelector('details .full-text').textContent, body);
    assert.equal(document.querySelector('details blockquote').textContent, 'Every word of the quotation.');
    assert.equal(document.querySelectorAll('details > summary').length, 2);
    const image = document.querySelector('#likes-board img');
    const original = `${endpoint}/api/files/likes_items/image/original%20image.png`;
    assert.equal(image.closest('a').getAttribute('href'), original);
    const optimized = new URL(image.getAttribute('src'), 'http://site.test');
    assert.equal(optimized.pathname, '/_image');
    assert.equal(optimized.searchParams.get('href'), original);
    assert.equal(optimized.searchParams.get('f'), 'webp');
    assert.equal(optimized.searchParams.get('w'), '640');
    assert.match(image.getAttribute('srcset'), /320w/);
    assert.match(image.getAttribute('srcset'), /640w/);
    assert.match(image.getAttribute('srcset'), /960w/);
    assert.equal(image.getAttribute('loading'), 'lazy');
    assert.equal(document.querySelector('#likes-board script, #likes-board [onerror], a[href^="javascript:"]'), null);
    assert.ok(document.querySelector('a[href="/likes/manage"]').closest('[hidden]'), 'Manage Likes is hidden without an owner session');
    assert.equal(document.querySelector('input[type="password"], input[type="email"], dialog, #likes-editor'), null);
    assert.equal(document.querySelectorAll('#likes form, #likes button').length, 0);
    for (const script of document.querySelectorAll('script')) {
      assert.doesNotMatch(`${script.getAttribute('src') ?? ''}\n${script.textContent}`, /(?:\/scripts\/likes\.(?:js|ts)|\/lib\/likes\.js|auth-with-password)/);
    }
  });

  await t.test('collection links and cursor links forward the selected filter and exclusive cursor', async () => {
    state.items = Array.from({ length: 25 }, (_, index) => item(String(99 - index)));
    const initial = await page();
    const filter = links(initial.document).find(link => link.textContent === 'Reading & thinking');
    assert.ok(filter);
    const filterURL = new URL(filter.getAttribute('href'), 'http://site.test');
    assert.equal(filterURL.searchParams.get('collection'), 'reading');
    const first = await page(filter.getAttribute('href'));
    assert.equal(first.response.status, 200);
    assert.equal(first.query.get('filter'), 'published=true && collections.id ?= "reading"');
    assert.equal(first.query.get('sort'), '-created,-id');
    assert.equal(first.query.get('perPage'), '25');
    assert.equal(first.query.get('skipTotal'), 'true');
    assert.equal(first.document.querySelectorAll('#likes-board > li').length, 24);
    assert.equal(first.document.querySelector('#collection-filters [aria-current="page"]').textContent, 'Reading & thinking');
    const older = first.document.querySelector('nav[aria-label="Likes pagination"] a');
    assert.ok(older);
    const cursorURL = new URL(older.getAttribute('href'), 'http://site.test');
    assert.equal(cursorURL.searchParams.get('collection'), 'reading');
    assert.equal(cursorURL.searchParams.get('afterCreated'), created);
    assert.equal(cursorURL.searchParams.get('afterId'), '76');
    state.items = [item('75', { title: 'Older published find' })];
    const next = await page(older.getAttribute('href'));
    assert.equal(next.response.status, 200);
    assert.equal(next.query.get('filter'), `published=true && collections.id ?= "reading" && (created < "${created}" || (created = "${created}" && id < "76"))`);
    assert.equal(next.document.querySelector('#likes-board h2').textContent, 'Older published find');
    assert.equal(next.document.querySelector('nav[aria-label="Likes pagination"]'), null);
    for (const link of next.document.querySelectorAll('#collection-filters a')) {
      const target = new URL(link.getAttribute('href'), 'http://site.test');
      assert.equal(target.searchParams.has('afterCreated'), false, 'changing collections resets pagination');
      assert.equal(target.searchParams.has('afterId'), false);
    }
  });

  await t.test('empty all-items and named-collection views, and unknown collection recovery', async () => {
    state.items = [];
    for (const path of ['/likes', '/likes?collection=empty']) {
      const { response, document } = await page(path);
      assert.equal(response.status, 200);
      assert.match(document.querySelector('#likes [role="status"]').textContent, /no published items/i);
      assert.equal(document.querySelector('#likes-board > li'), null);
    }
    const { response, document, query } = await page('/likes?collection=unknown');
    assert.equal(response.status, 200);
    assert.equal(query.get('filter'), 'published=true && collections.id ?= "unknown"');
    const status = document.querySelector('#likes [role="status"]');
    assert.match(status.textContent, /collection.*(?:not.*found|unknown)/i);
    assert.equal(status.querySelector('a').getAttribute('href'), '/likes');
  });

  await t.test('backend failure returns HTTP 503 and a working collection-preserving retry link', async () => {
    state.failure = true;
    const failed = await page('/likes?collection=reading');
    assert.equal(failed.response.status, 503);
    assert.doesNotMatch(failed.html, /PRIVATE backend diagnostic/);
    const retry = failed.document.querySelector('#likes [role="status"] a');
    assert.ok(retry);
    assert.match(retry.textContent, /try again|retry/i);
    assert.equal(new URL(retry.getAttribute('href'), 'http://site.test').searchParams.get('collection'), 'reading');
    state.failure = false;
    state.items = [item('recovered')];
    const recovered = await page(retry.getAttribute('href'));
    assert.equal(recovered.response.status, 200);
    assert.equal(recovered.document.querySelector('#likes-board h2').textContent, 'Published find recovered');
  });
});
