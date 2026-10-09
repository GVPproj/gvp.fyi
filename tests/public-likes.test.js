import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { chromium } from 'playwright-core';
import { ownerResult, logout } from './helpers/owner-session.js';

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
      const filter = url.searchParams.get('filter') ?? '';
      let items = state.items.filter(item => item.published);
      const id = filter.match(/\bid\s*=\s*("(?:[^"\\]|\\.)*")/);
      if (id) items = items.filter(item => item.id === JSON.parse(id[1]));
      const collection = filter.match(/collections\.id \?= ("(?:[^"\\]|\\.)*")/);
      if (collection) items = items.filter(item => item.collections?.includes(JSON.parse(collection[1])));
      if (filter.includes('collections:length = 0')) items = items.filter(item => !item.collections?.length);
      if (url.searchParams.get('sort') === '-updated,-id') {
        items = items.toSorted((a, b) => (b.updated ?? b.created).localeCompare(a.updated ?? a.created) || b.id.localeCompare(a.id));
      }
      response.end(JSON.stringify({ totalItems: items.length, items: items.slice(0, Number(url.searchParams.get('perPage') ?? 200)), totalPages: 1 }));
    } else if (url.pathname.startsWith('/api/files/likes_items/')) {
      response.setHeader('Content-Type', 'image/png');
      response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64'));
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
    state, endpoint, origin,
    async page(path = '/likes') {
      requests.length = 0;
      const response = await fetch(new URL(path, origin), {
        signal: AbortSignal.any([t.signal, AbortSignal.timeout(15000)]),
      });
      const html = await response.text();
      const { document } = parseHTML(html); // Parse only; never execute scripts or load assets.
      assert.ok(requests.length >= 1, 'SSR must fetch public collection data');
      for (const request of requests) {
        assert.equal(request.headers.authorization, undefined, 'public reads must not authenticate');
        assert.equal(request.method, 'GET');
        assert.ok(['/api/collections/likes_items/records', '/api/collections/likes_collections/records'].includes(request.url.pathname));
      }
      const itemRequests = requests.filter(request => request.url.pathname === '/api/collections/likes_items/records');
      const target = new URL(path, origin);
      if (target.searchParams.get('collection') || target.searchParams.get('view') === 'all') assert.equal(itemRequests.length, 1);
      return { response, html, document, query: itemRequests[0]?.url.searchParams, queries: itemRequests.map(request => request.url.searchParams) };
    },
  };
}

// URL and DOM changes happen before Astro finishes a swap and runs page scripts.
async function clientNavigation(tab, action) {
  await tab.evaluate(() => {
    window.pageLoaded = false;
    document.addEventListener('astro:page-load', () => { window.pageLoaded = true; }, { once: true });
  });
  await action();
  await tab.waitForFunction(() => window.pageLoaded);
}

const created = '2026-01-01 00:00:00.000Z';
const item = (id, fields = {}) => ({
  id, created, published: true, title: `Published find ${id}`, url: `https://example.com/${id}`,
  collections: ['reading'], ...fields,
});

test('public /likes is useful from server-rendered HTML without JavaScript', { timeout: 90000 }, async t => {
  const { state, endpoint, origin, page } = await publicLikesServer(t);
  state.collections = [{ id: 'reading', name: 'Reading & thinking' }, { id: 'empty', name: 'Empty' }];

  await t.test('default view shows bounded collection rows, full counts, last edits and Misc. without JavaScript', async () => {
    const unsafe = '<img src=x onerror="alert(1)">';
    const updated = '2026-02-03 12:00:00.000Z';
    state.items = [
      ...Array.from({ length: 12 }, (_, index) => item(`reading${index}`)),
      item('recent', { title: unsafe, updated, asset: 'preview.png' }),
      item('loose', { collections: [], type: 'note', body: unsafe }),
      item('private', { published: false, collections: [], body: 'PRIVATE draft' }),
    ];
    const { response, html, document, queries } = await page();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(document.querySelector('#likes-board'), null);
    const rows = [...document.querySelectorAll('#collection-rows > li')];
    assert.deepEqual(rows.map(row => row.querySelector('h2').textContent), ['Reading & thinking', 'Empty', 'Misc.']);
    assert.match(rows[0].querySelector('p').textContent, /13 blocks/);
    assert.equal(rows[0].querySelectorAll('.content-preview').length, 8);
    assert.equal(document.querySelectorAll('#collection-rows .content-row').length, 3);
    assert.equal(rows[0].querySelector('time').getAttribute('datetime'), '2026-02-03T12:00:00.000Z');
    assert.match(rows[0].querySelector('time').getAttribute('title'), /03 Feb 2026/);
    assert.equal(rows[0].querySelector('a').getAttribute('href'), '/likes?collection=reading');
    assert.equal(rows[0].querySelectorAll('a').length, 9, 'collection heading and eight item pages are independently linked');
    assert.equal(rows[0].querySelector('.content-preview').closest('a').getAttribute('href'), '/likes/recent');
    assert.equal(rows[0].querySelector('img').getAttribute('loading'), 'lazy');
    assert.match(rows[1].textContent, /0 blocks/);
    assert.match(rows[1].textContent, /No published items/);
    assert.equal(rows[1].querySelector('time'), null);
    assert.match(rows[2].textContent, /1 block/);
    assert.ok(rows[2].textContent.includes(unsafe));
    assert.equal(rows[2].querySelector('a').getAttribute('href'), '/likes?collection=misc');
    assert.equal(document.querySelector('#collection-rows script, #collection-rows [onerror]'), null);
    assert.doesNotMatch(html, /PRIVATE draft/);
    assert.equal(queries.length, 3);
    for (const query of queries) {
      assert.match(query.get('filter'), /^published=true/);
      assert.equal(query.get('perPage'), '8');
      assert.equal(query.get('sort'), '-updated,-id');
    }
    const misc = await page(rows[2].querySelector('a').getAttribute('href'));
    assert.equal(misc.query.get('filter'), 'published=true && collections:length = 0');
    assert.equal(misc.document.querySelectorAll('#likes-board > li').length, 1);
    assert.equal(misc.document.querySelector('#collection-filters [aria-current="page"]').textContent, 'Misc.');
    assert.equal(misc.document.querySelector('#collection-filters a').getAttribute('href'), '/likes');
  });

  await t.test('empty Misc. is hidden while empty named collections remain visible', async () => {
    for (const items of [[], [item('private', { published: false, collections: [] })]]) {
      state.items = items;
      const { document } = await page();
      assert.deepEqual([...document.querySelectorAll('#collection-rows h2')].map(heading => heading.textContent), ['Reading & thinking', 'Empty']);
      assert.equal(document.querySelector('#collection-rows a[href="/likes?collection=misc"]'), null);
      assert.equal(document.querySelectorAll('#collection-rows time').length, 0);
      assert.equal(document.querySelector('#likes-board'), null);
    }
  });

  await t.test('published grid links to item pages and renders safe previews', async () => {
    const unsafe = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const body = `${'A full-length note. '.repeat(40)}${unsafe}`;
    state.items = [
      item('link', { title: unsafe, description: 'A useful description', commentary: unsafe }),
      item('note', { type: 'note', title: 'Long note', body, url: '' }),
      item('quote', { type: 'quote', title: 'Quotation', body: 'Every word of the quotation.', attribution: unsafe }),
      item('image', { asset: 'original image.png', title: 'Original image' }),
      item('unsafe', { title: 'Unsafe destination', url: 'javascript:alert(1)' }),
    ];
    const { response, document, query } = await page('/likes?view=all');
    assert.equal(response.status, 200);
    assert.equal(query.get('filter'), 'published=true');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(document.querySelectorAll('#likes-board > li').length, 5);
    assert.equal(document.querySelector('#likes-board h2').textContent, unsafe);
    assert.ok(document.querySelector('#likes-board').textContent.includes('A useful description'));
    assert.equal(document.querySelectorAll('#likes-board details').length, 0);
    const note = document.querySelector('#likes-board a[href="/likes/note"]');
    assert.equal(note.querySelector('.text-preview').textContent.trim(), body.slice(0, 400) + '…');
    assert.ok(document.querySelector('#likes-board a[href="/likes/quote"]').textContent.includes('Every word of the quotation.'));
    const image = document.querySelector('#likes-board img');
    const original = `${endpoint}/api/files/likes_items/image/original%20image.png`;
    assert.equal(image.closest('a').getAttribute('href'), '/likes/image');
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

  await t.test('item pages show full content and safe destinations, while missing and draft items return 404', async () => {
    const unsafe = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const body = `${'A full-length note. '.repeat(40)}\n${unsafe}`;
    state.items = [
      item('note', { type: 'note', title: '', body, attribution: 'A note attribution', url: '' }),
      item('quote', { type: 'quote', title: 'Quotation', body, attribution: unsafe }),
      item('image', { asset: 'original image.png', description: unsafe, commentary: 'Personal thoughts\nMore thoughts' }),
      item('pdf', { asset: 'document.pdf' }),
      item('unsafe', { url: 'javascript:alert(1)', title: unsafe }),
      item('private', { published: false, title: 'PRIVATE draft', body }),
    ];
    for (const record of state.items.filter(item => item.published)) {
      const { response, document, query } = await page(`/likes/${record.id}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(query.get('filter'), `published=true && id=${JSON.stringify(record.id)}`);
      assert.equal(query.get('perPage'), '1');
      assert.equal(query.get('skipTotal'), 'true');
      const article = document.querySelector('#like-detail');
      assert.equal(article.querySelector('h1').textContent, record.title || 'Personal note');
      assert.equal(article.querySelector('a').getAttribute('href'), '/likes');
      if (record.type === 'note') assert.equal(article.querySelector('.full-text').textContent, body);
      if (record.type === 'quote') {
        assert.equal(article.querySelector('blockquote').textContent, body);
        assert.equal(article.querySelector('figcaption').textContent, unsafe);
      }
      if (record.asset) {
        const original = `${endpoint}/api/files/likes_items/${record.id}/${encodeURIComponent(record.asset)}`;
        assert.ok(article.querySelector(`a[href="${original}"]`));
        assert.equal(article.querySelectorAll('img').length, record.asset.endsWith('.pdf') ? 0 : 1);
        if (!record.asset.endsWith('.pdf')) assert.equal(new URL(article.querySelector('img').getAttribute('src'), origin).searchParams.get('href'), original);
      }
      if (record.url.startsWith('https:')) assert.equal(article.querySelector('.source').getAttribute('href'), record.url);
      else assert.equal(article.querySelector('.source'), null);
      if (record.commentary) assert.equal(article.querySelector('.commentary').textContent, record.commentary);
      assert.equal(article.querySelector('script, [onerror], a[href^="javascript:"]'), null);
    }
    for (const slug of ['missing', 'private']) {
      const { response, html, document } = await page(`/likes/${slug}`);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(document.querySelector('#like-detail [role="status"]').textContent, /not found/);
      assert.doesNotMatch(html, /PRIVATE draft|A full-length note/);
    }
    // IDs, unlike editorial titles, are stable when a find is renamed.
    state.items[0].title = 'Renamed note';
    assert.equal((await page('/likes/note')).document.querySelector('h1').textContent, 'Renamed note');
  });

  await t.test('collection links and cursor links forward the selected filter and exclusive cursor', async () => {
    state.items = Array.from({ length: 25 }, (_, index) => item(String(99 - index)));
    const initial = await page();
    const filter = [...initial.document.querySelectorAll('#collection-rows h2')].find(heading => heading.textContent === 'Reading & thinking')?.querySelector('a');
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

  await t.test('previously shared all-items cursor URLs still open the grid', async () => {
    state.items = Array.from({ length: 25 }, (_, index) => item(String(75 - index)));
    const { document, query } = await page(`/likes?${new URLSearchParams({ afterCreated: created, afterId: '76' })}`);
    assert.equal(document.querySelector('#collection-rows'), null);
    assert.equal(document.querySelectorAll('#likes-board > li').length, 24);
    assert.equal(query.get('filter'), `published=true && (created < "${created}" || (created = "${created}" && id < "76"))`);
    const older = document.querySelector('nav[aria-label="Likes pagination"] a');
    const target = new URL(older.getAttribute('href'), 'http://site.test');
    assert.equal(target.searchParams.get('view'), 'all');
    assert.equal(target.searchParams.get('afterId'), '52');
    assert.equal(document.querySelector('#collection-filters [aria-current="page"]').textContent, 'All items');
  });

  await t.test('empty all-items and named-collection views, and unknown collection recovery', async () => {
    state.items = [];
    for (const path of ['/likes?view=all', '/likes?collection=empty', '/likes?collection=misc']) {
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

  await t.test('rows fit desktop and mobile; keyboard and back navigation work without JavaScript', {
    skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }, async () => {
    state.items = [
      ...Array.from({ length: 25 }, (_, index) => item(`loose${index}`, { collections: [], title: 'A long uncollected title '.repeat(8) })),
      item('reading', { type: 'quote', body: 'A thought worth keeping. '.repeat(30) }),
    ];
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
    try {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const tab = await context.newPage();
      for (const width of [1440, 375, 320]) {
        await tab.setViewportSize({ width, height: 900 });
        await tab.goto(`${origin}/likes`);
        assert.equal(await tab.locator('#collection-rows > li').count(), 3);
        assert.ok(await tab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'the preview strip must not overflow the page');
        const info = await tab.locator('.content-row-info').first().boundingBox();
        const previews = await tab.locator('.content-row ul').first().boundingBox();
        if (width > 480) assert.ok(info.x + info.width <= previews.x, 'metadata stays to the left of previews');
        else assert.ok(info.y + info.height <= previews.y, 'metadata stacks above previews on small screens');
        const row = tab.getByRole('region', { name: 'Misc.', exact: true });
        await row.locator('ul a').first().focus();
        for (let index = 1; index < 8; index++) await tab.keyboard.press('Tab');
        assert.equal(await row.locator('ul a').last().evaluate(link => document.activeElement === link), true);
        assert.equal(await row.locator('ul a').last().evaluate(link => {
          const rect = link.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth;
        }), true);
      }
      const card = tab.getByRole('region', { name: 'Misc.', exact: true }).locator('ul a').last();
      const itemPath = await card.getAttribute('href');
      await card.focus();
      await tab.keyboard.press('Enter');
      await tab.waitForURL(`${origin}${itemPath}`);
      await tab.getByRole('heading', { level: 1, name: state.items[0].title, exact: true }).waitFor();
      assert.ok(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await tab.getByRole('main').getByRole('link', { name: '← Likes', exact: true }).click();
      await tab.waitForURL(`${origin}/likes`);
      const misc = tab.locator('#collection-rows h2 a[href="/likes?collection=misc"]');
      await misc.focus();
      assert.equal(await misc.evaluate(node => node.matches(':focus-visible')), true);
      await tab.keyboard.press('Enter');
      await tab.waitForURL('**/likes?collection=misc');
      assert.equal(await tab.locator('#likes-board > li').count(), 24);
      const older = tab.locator('nav[aria-label="Likes pagination"] a');
      assert.equal(new URL(await older.getAttribute('href'), origin).searchParams.get('collection'), 'misc');
      await tab.getByRole('link', { name: '← Collections', exact: true }).click();
      await tab.waitForURL(`${origin}/likes`);
      await tab.goBack();
      assert.equal(await tab.locator('#likes-board > li').count(), 24);
    } finally {
      await browser.close();
    }
  });

  await t.test('item links, full content, images, refresh and Back/Forward work with and without JavaScript', {
    skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }, async () => {
    const body = 'A complete note with multiple paragraphs.\n\n' + 'More words. '.repeat(60);
    state.items = [
      item('note', { type: 'note', body, title: 'A saved note', url: '' }),
      item('quote', { type: 'quote', body, title: 'A saved quote', attribution: 'An author' }),
      item('image', { asset: 'landscape.png', title: 'A saved image' }),
      item('pdf', { asset: 'document.pdf', title: 'A saved PDF' }),
      item('link', { title: 'A saved link' }),
    ];
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
    try {
      for (const javaScriptEnabled of [true, false]) {
        const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 320, height: 800 } });
        const tab = await context.newPage();
        tab.setDefaultTimeout(5000);
        for (const record of state.items) {
          await tab.goto(`${origin}/likes`);
          // Wait for the initial router scripts before asserting a client-side swap.
          if (javaScriptEnabled) await tab.waitForLoadState('networkidle');
          const card = tab.locator(`#collection-rows a[href="/likes/${record.id}"]`);
          const thumbnail = card.locator('img');
          if (await thumbnail.count()) await thumbnail.evaluate(image => image.decode());
          if (javaScriptEnabled) await clientNavigation(tab, () => card.click());
          else await card.click();
          await tab.waitForURL(`${origin}/likes/${record.id}`);
          const article = tab.locator('#like-detail');
          await article.getByRole('heading', { name: record.title, level: 1, exact: true }).waitFor();
          if (record.type) assert.equal(await article.locator(record.type === 'quote' ? 'blockquote' : '.full-text').textContent(), body);
          if (record.asset === 'landscape.png') await article.getByRole('img').evaluate(image => image.decode());
          assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await tab.reload();
          if (javaScriptEnabled) await tab.waitForLoadState('networkidle');
          await article.getByRole('heading', { name: record.title, level: 1, exact: true }).waitFor();
          await tab.goBack();
          await tab.locator('#collection-rows').waitFor();
          await tab.goForward();
          await article.getByRole('heading', { name: record.title, level: 1, exact: true }).waitFor();
          await article.getByRole('link', { name: '← Likes', exact: true }).click();
          await tab.locator('#collection-rows').waitFor();
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }
  });

  await t.test('completed signature survives public Likes navigation without replay, including remove-and-reinsert', {
    skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }, async () => {
    state.items = [item('reading')];
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
    try {
      for (const fallback of [false, true]) {
        const context = await browser.newContext();
        if (fallback) await context.addInitScript(() => { Element.prototype.moveBefore = undefined; });
        const tab = await context.newPage();
        tab.setDefaultTimeout(5000);
        await tab.goto(`${origin}/blog`);
        await tab.waitForFunction(() => document.querySelector('.sig path')?.style.animationName === 'none');
        await tab.evaluate(() => { window.originalSignature = document.querySelector('.sig'); });
        const nav = tab.getByRole('navigation', { name: 'Main navigation', exact: true });
        await clientNavigation(tab, () => nav.getByRole('link', { name: 'Likes', exact: true }).click());
        await tab.locator('#collection-rows').waitFor();
        assert.equal(await tab.evaluate(() => window.originalSignature === document.querySelector('.sig')), true);
        assert.equal(await tab.locator('.sig path').evaluate(path => parseFloat(getComputedStyle(path).strokeDashoffset)), 0);
        assert.equal(await tab.locator('.sig path').evaluate(path => getComputedStyle(path).animationName), 'none');
        await clientNavigation(tab, () => nav.getByRole('link', { name: 'Blog', exact: true }).click());
        await tab.waitForURL(`${origin}/blog`);
        assert.equal(await tab.evaluate(() => window.originalSignature === document.querySelector('.sig')), true);
        assert.equal(await tab.locator('.sig path').evaluate(path => getComputedStyle(path).animationName), 'none');
        await context.close();
      }
    } finally {
      await browser.close();
    }
  });

  await t.test('initial loads draw the signature and navigation during drawing keeps the SVG, including the fallback', {
    skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }, async () => {
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
    try {
      for (const fallback of [false, true]) {
        const context = await browser.newContext();
        if (fallback) await context.addInitScript(() => { Element.prototype.moveBefore = undefined; });
        const tab = await context.newPage();
        tab.setDefaultTimeout(5000);
        await tab.goto(`${origin}/likes`);
        assert.ok(await tab.locator('.sig path').evaluate(path => parseFloat(getComputedStyle(path).strokeDashoffset) > 0));
        await tab.evaluate(() => { window.originalSignature = document.querySelector('.sig'); });
        await clientNavigation(tab, () => tab.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Blog', exact: true }).click());
        await tab.waitForURL(`${origin}/blog`);
        assert.equal(await tab.evaluate(() => window.originalSignature === document.querySelector('.sig')), true);
        await tab.waitForFunction(() => document.querySelector('.sig path')?.style.animationName === 'none');
        assert.equal(await tab.locator('.sig path').evaluate(path => parseFloat(getComputedStyle(path).strokeDashoffset)), 0);
        await tab.reload();
        assert.ok(await tab.locator('.sig path').evaluate(path => parseFloat(getComputedStyle(path).strokeDashoffset) > 0), 'a new document draws again');
        await context.close();
      }
    } finally {
      await browser.close();
    }
  });

  await t.test('reduced motion shows the signature immediately through public navigation', {
    skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }, async () => {
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
    try {
      const context = await browser.newContext({ reducedMotion: 'reduce' });
      const tab = await context.newPage();
      await tab.goto(`${origin}/likes`);
      await tab.evaluate(() => { window.originalSignature = document.querySelector('.sig'); });
      for (const destination of ['Blog', 'Likes']) {
        assert.equal(await tab.locator('.sig path').evaluate(path => parseFloat(getComputedStyle(path).strokeDashoffset)), 0);
        assert.equal(await tab.locator('.sig path').evaluate(path => getComputedStyle(path).animationName), 'none');
        await clientNavigation(tab, () => tab.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: destination, exact: true }).click());
        await tab.waitForURL(`${origin}/${destination.toLowerCase()}`);
        assert.equal(await tab.evaluate(() => window.originalSignature === document.querySelector('.sig')), true);
      }
      assert.equal(await tab.locator('.sig path').evaluate(path => parseFloat(getComputedStyle(path).strokeDashoffset)), 0);
      assert.equal(await tab.locator('.sig path').evaluate(path => getComputedStyle(path).animationName), 'none');
    } finally {
      await browser.close();
    }
  });

  await t.test('client navigation preserves public filters, keyboard links, direct URLs, refresh and Back/Forward', {
    skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }, async () => {
    state.items = [item('reading'), item('loose', { collections: [] })];
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
    try {
      const tab = await browser.newPage();
      tab.setDefaultTimeout(5000);
      await tab.goto(`${origin}/likes`);
      await tab.evaluate(() => { window.originalSignature = document.querySelector('.sig'); });
      await tab.locator('#collection-rows a[href="/likes?collection=reading"]').focus();
      await clientNavigation(tab, () => tab.keyboard.press('Enter'));
      await tab.locator('#collection-filters [aria-current="page"]').filter({ hasText: 'Reading & thinking' }).waitFor();
      assert.deepEqual(await tab.locator('#likes-board h2').allTextContents(), ['Published find reading']);
      assert.equal(await tab.evaluate(() => window.originalSignature === document.querySelector('.sig')), true);
      await clientNavigation(tab, () => tab.locator('#collection-filters a').filter({ hasText: 'All items' }).click());
      await tab.waitForURL(`${origin}/likes?view=all`);
      assert.equal(await tab.locator('#likes-board > li').count(), 2);
      await clientNavigation(tab, () => tab.goBack());
      await tab.locator('#collection-filters [aria-current="page"]').filter({ hasText: 'Reading & thinking' }).waitFor();
      assert.deepEqual(await tab.locator('#likes-board h2').allTextContents(), ['Published find reading']);
      await clientNavigation(tab, () => tab.goForward());
      await tab.locator('#collection-filters [aria-current="page"]').filter({ hasText: 'All items' }).waitFor();
      assert.equal(await tab.locator('#likes-board > li').count(), 2);
      assert.equal(await tab.evaluate(() => window.originalSignature === document.querySelector('.sig')), true);
      await tab.reload();
      assert.equal(await tab.locator('#likes-board > li').count(), 2);
      assert.equal(await tab.locator('#collection-filters [aria-current="page"]').textContent(), 'All items');
      await tab.goto(`${origin}/likes?collection=misc`);
      assert.deepEqual(await tab.locator('#likes-board h2').allTextContents(), ['Published find loose']);
      assert.equal(await tab.locator('#collection-filters [aria-current="page"]').textContent(), 'Misc.');
      await clientNavigation(tab, () => tab.getByRole('link', { name: '← Collections', exact: true }).click());
      await tab.locator('#collection-rows').waitFor();
      assert.equal(new URL(tab.url()).search, '');
    } finally {
      await browser.close();
    }
  });

  await t.test('shared session controls reconcile repeated public navigation, logout and expiry without duplicate handlers', {
    skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }, async () => {
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
    try {
      const context = await browser.newContext();
      let auth = ownerResult();
      await context.route(`${endpoint}/api/collections/likes_owners/auth-with-password`, route => route.fulfill({ json: auth }));
      const tab = await context.newPage();
      tab.setDefaultTimeout(5000);
      const signIn = async () => {
        await tab.goto(`${origin}/login`);
        await tab.locator('#owner-login [name=email]').fill('owner@example.test');
        await tab.locator('#owner-login [name=password]').fill('owner-password');
        await tab.getByRole('button', { name: 'Sign in', exact: true }).click();
        await tab.waitForURL(`${origin}/`);
        await tab.getByRole('button', { name: 'Logged In', exact: true }).waitFor();
      };
      await signIn();
      await tab.evaluate(() => {
        window.logoutEvents = 0;
        document.addEventListener('owner-session-change', event => {
          if (event.detail.reason === 'logout') window.logoutEvents++;
        });
      });
      const nav = tab.getByRole('navigation', { name: 'Main navigation', exact: true });
      for (let index = 0; index < 3; index++) {
        await clientNavigation(tab, () => nav.getByRole('link', { name: 'Likes', exact: true }).click());
        await tab.locator('#manage-likes').waitFor({ state: 'visible' });
        await tab.getByRole('button', { name: 'Logged In', exact: true }).waitFor();
        await clientNavigation(tab, () => nav.getByRole('link', { name: 'Blog', exact: true }).click());
        await tab.getByRole('button', { name: 'Logged In', exact: true }).waitFor();
      }
      await logout(tab);
      assert.equal(await tab.evaluate(() => window.logoutEvents), 1);
      await clientNavigation(tab, () => tab.goBack());
      assert.equal(await tab.locator('#manage-likes').isVisible(), false);
      assert.equal(await tab.getByRole('button', { name: 'Logged In', exact: true }).isVisible(), false);
      await clientNavigation(tab, () => tab.goForward());
      assert.equal(await tab.getByRole('button', { name: 'Logged In', exact: true }).isVisible(), false);
      auth = ownerResult(Math.floor(Date.now() / 1000) + 4);
      await signIn();
      await clientNavigation(tab, () => nav.getByRole('link', { name: 'Likes', exact: true }).click());
      await tab.locator('#manage-likes').waitFor({ state: 'visible' });
      await tab.getByRole('button', { name: 'Logged In', exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await tab.locator('#manage-likes').isVisible(), false);
      await clientNavigation(tab, () => nav.getByRole('link', { name: 'Blog', exact: true }).click());
      assert.equal(await tab.getByRole('button', { name: 'Logged In', exact: true }).isVisible(), false);
    } finally {
      await browser.close();
    }
  });

  await t.test('backend failure returns HTTP 503 and a working collection-preserving retry link', async () => {
    state.failure = true;
    const overview = await page();
    assert.equal(overview.response.status, 503);
    assert.equal(overview.document.querySelector('#likes [role="status"] a').getAttribute('href'), '/likes');
    const failed = await page('/likes?collection=reading');
    assert.equal(failed.response.status, 503);
    assert.doesNotMatch(failed.html, /PRIVATE backend diagnostic/);
    const retry = failed.document.querySelector('#likes [role="status"] a');
    assert.ok(retry);
    assert.match(retry.textContent, /try again|retry/i);
    assert.equal(new URL(retry.getAttribute('href'), 'http://site.test').searchParams.get('collection'), 'reading');
    const detail = await page('/likes/recovered');
    assert.equal(detail.response.status, 503);
    assert.equal(detail.response.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(detail.html, /PRIVATE backend diagnostic/);
    assert.equal(detail.document.querySelector('#like-detail [role="status"] a').getAttribute('href'), '/likes/recovered');
    state.failure = false;
    state.items = [item('recovered')];
    const recovered = await page(retry.getAttribute('href'));
    assert.equal(recovered.response.status, 200);
    assert.equal(recovered.document.querySelector('#likes-board h2').textContent, 'Published find recovered');
  });
});
