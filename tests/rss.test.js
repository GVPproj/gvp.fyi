import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import { after, before, test } from 'node:test';
import { DOMParser, parseHTML } from 'linkedom';
import { SyntaxValidator } from 'fast-xml-validator';
import { createBuildFixture } from './build-fixture.js';

let workspace;
const text = (node, selector) => node.querySelector(selector)?.textContent;
async function feed() {
  const xml = await readFile(join(workspace.directory, 'dist/rss.xml'), 'utf8');
  assert.equal(SyntaxValidator.validate(xml), true);
  return new DOMParser().parseFromString(xml, 'text/xml');
}
before(async () => {
  workspace = await createBuildFixture('rss', {
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${new URL('./no-network.mjs', import.meta.url).href}`,
    ASTRO_TELEMETRY_DISABLED: '1',
  });
  await workspace.build();
});
after(async () => workspace?.cleanup());

test('an offline build publishes the complete five-type RSS catalogue with local canonical destinations', async () => {
  const document = await feed();
  assert.equal(document.documentElement.getAttribute('version'), '2.0');
  const settings = JSON.parse(await readFile(join(workspace.directory, 'src/config/site-settings.json'), 'utf8'));
  assert.equal(text(document, 'channel > title'), settings.title);
  assert.equal(text(document, 'channel > description'), settings.description);
  assert.equal(text(document, 'channel > link'), 'https://gvp.fyi/');
  const items = [...document.querySelectorAll('item')];
  const ids = new Set();
  for (const [path, date] of [
    ['blog/the-animated-face', '2026-10-01T00:00:00.000Z'],
    ['likes/eli-horn', '2026-11-06T17:48:33.000Z'],
    ['software/biolink', '2026-10-09T00:00:00.000Z'],
    ['music/watery-grave-ep', '2026-10-07T00:00:00.000Z'],
    ['radio/afw-2026-10-20', '2026-11-09T00:00:00.000Z'],
  ]) {
    const item = items.find(item => text(item, 'link') === `https://gvp.fyi/${path}/`);
    assert.equal(new Date(text(item, 'pubDate')).toISOString(), date);
  }
  for (const [collection, category] of [['blog', 'Blog'], ['likes', 'Likes'], ['software', 'Software'], ['music', 'Music'], ['radio', 'Radio']]) {
    const entries = await readdir(join(workspace.directory, 'src/content', collection));
    assert.equal(items.filter(item => text(item, 'category') === category).length, entries.length, collection);
  }
  for (const item of items) {
    assert.ok(text(item, 'title')?.trim());
    assert.ok(text(item, 'description')?.trim());
    assert.ok(Number.isFinite(Date.parse(text(item, 'pubDate'))));
    const guid = item.querySelector('guid');
    assert.equal(guid.getAttribute('isPermaLink'), 'false');
    assert.ok(guid.textContent);
    assert.equal(ids.has(guid.textContent), false);
    ids.add(guid.textContent);
    const url = new URL(text(item, 'link'));
    assert.equal(url.origin, 'https://gvp.fyi');
    const page = parseHTML(await readFile(join(workspace.directory, 'dist', url.pathname, 'index.html'), 'utf8')).document;
    assert.equal(page.querySelector('link[rel="canonical"]').getAttribute('href'), url.href);
  }
});

test('every content page advertises RSS and exposes a native footer subscription link', async () => {
  const output = join(workspace.directory, 'dist');
  const pages = (await readdir(output, { recursive: true })).filter(path => path.endsWith('.html'));
  assert.ok(pages.length > 100);
  for (const path of pages) {
    const document = parseHTML(await readFile(join(output, path), 'utf8')).document;
    if (document.querySelector('meta[http-equiv="refresh"]')) continue;
    const discovery = document.querySelector('head link[rel="alternate"][type="application/rss+xml"]');
    assert.equal(discovery?.getAttribute('href'), 'https://gvp.fyi/rss.xml', path);
    const link = document.querySelector('footer a[href="/rss.xml"]');
    assert.equal(link?.textContent, 'RSS', path);
    assert.equal(link.hasAttribute('tabindex'), false);
    assert.equal(link.hasAttribute('data-astro-reload'), true);
  }
});

test('summaries retain reader context, original date precision and shared-recording credit without players', async () => {
  const document = await feed();
  const description = path => {
    const item = [...document.querySelectorAll('item')].find(item => text(item, 'link') === `https://gvp.fyi/${path}/`);
    assert.ok(item, path);
    return parseHTML(`<html><body>${text(item, 'description')}</body></html>`).document.body;
  };
  assert.match(description('blog/the-animated-face').textContent, /drawing|portrait/i);
  const like = description('likes/eli-horn');
  assert.match(like.textContent, /treasured friend/);
  assert.ok(like.querySelector('a[href="https://elihorn.ca/"]'));
  const image = like.querySelector('a[href^="https://gvp.fyi/_astro/"]');
  assert.ok(image);
  assert.ok((await readFile(join(workspace.directory, 'dist', new URL(image.getAttribute('href')).pathname))).length > 0);
  const software = description('software/quizzical');
  assert.match(software.textContent, /trivia|OpenTrivia/i);
  assert.match(software.textContent, /React/);
  assert.ok(software.querySelector('a[href="https://github.com/GVPproj/react-trivia"]'));
  const music = description('music/watery-grave-ep');
  assert.match(music.textContent, /Miracle Fortress/);
  assert.match(music.innerText, /Original release: 2005(?:\s|$)/);
  assert.doesNotMatch(music.textContent, /2005-01-01/);
  assert.match(description('music/family-japanese-edition').innerText, /Original release: 2009-10(?:\s|$)/);
  assert.match(description('music/new-found-land').textContent, /Songwriting/);
  const shared = description('radio/island-city-afw-weekend-2-day-2');
  assert.match(shared.textContent, /Programme: A Friendly Wave/);
  assert.match(shared.textContent, /Shared broadcast.*Chris Dammeyer, AIKA and Graham Van Pelt/);
  assert.match(shared.textContent, /Uncertain.*Exact day unverified/);
  assert.match(shared.textContent, /Full linked recording duration: 3:53:09/);
  assert.ok(shared.querySelector('a[href^="https://www.mixcloud.com/"]'));
  assert.match(description('radio/fsr-island-city-w-graham-van-pelt').textContent, /Broadcast date: Unknown/);
  assert.match(description('radio/afw-2026-10-20').textContent, /Broadcast date: 2026-10-20/);
  for (const item of document.querySelectorAll('item')) {
    const summary = parseHTML(`<html><body>${text(item, 'description')}</body></html>`).document.body;
    assert.equal(summary.querySelectorAll('script, style, iframe, audio, video, button, svg, template').length, 0);
    assert.doesNotMatch(summary.textContent, /import .*from|<MusicPlayer|<Quizzical/);
    for (const link of summary.querySelectorAll('a')) assert.match(link.getAttribute('href'), /^https?:\/\//);
  }
});

test('RSS subscription works with keyboard alone, no JavaScript and reduced motion at desktop and mobile sizes', async () => {
  const mime = { '.css': 'text/css', '.js': 'text/javascript', '.xml': 'application/xml', '.html': 'text/html', '.woff2': 'font/woff2' };
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = extname(path) ? path : join(path, 'index.html');
    try {
      response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(join(workspace.directory, 'dist', file)));
    } catch { response.writeHead(404).end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch();
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce', viewport: { width, height: 844 } });
      const tab = await context.newPage();
      await tab.goto(`http://127.0.0.1:${server.address().port}/blog/the-agent-shepherd/`);
      for (let step = 0; step < 30; step++) {
        await tab.keyboard.press('Tab');
        if (await tab.evaluate(() => document.activeElement.getAttribute('href') === '/rss.xml')) break;
      }
      assert.equal(await tab.evaluate(() => document.activeElement.getAttribute('href')), '/rss.xml');
      const link = tab.getByRole('link', { name: 'RSS', exact: true });
      assert.notEqual(await link.evaluate(element => getComputedStyle(element).outlineStyle), 'none');
      assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const [response] = await Promise.all([
        tab.waitForResponse(response => response.url().endsWith('/rss.xml')),
        tab.keyboard.press('Enter'),
      ]);
      await tab.waitForURL('**/rss.xml');
      assert.equal(response.status(), 200);
      assert.match(response.headers()['content-type'], /xml/);
      assert.equal(SyntaxValidator.validate(await response.text()), true);
      await context.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('ordinary edits and slug or folder changes retain all five publication identities and dates', async () => {
  const root = workspace.directory;
  const cases = [
    ['blog', 'the-animated-face', 'blog/the-animated-face.mdx', 'renamed-rss-post'],
    ['likes', 'eli-horn', 'likes/eli-horn/index.md', 'renamed-rss-like'],
    ['software', 'biolink', 'software/biolink/index.mdx', 'renamed-rss-project'],
    ['music', 'watery-grave-ep', 'music/watery-grave-ep/index.mdx', 'renamed-rss-release'],
    ['radio', 'afw-2026-10-20', 'radio/afw-2026-10-20/index.md', 'renamed-rss-recording'],
  ];
  const originalItems = [...(await feed()).querySelectorAll('item')];
  const originals = new Map();
  const moves = [];
  const title = 'Edited & readable <entry>';
  try {
    for (const [kind, , relative] of cases) {
      const file = join(root, 'src/content', relative);
      const source = await readFile(file, 'utf8');
      originals.set(file, source);
      const changed = source.includes('"title":')
        ? source.replace(/"title": "(?:\\.|[^"\\])*"/, `"title": ${JSON.stringify(title)}`)
        : source.replace(/^title: .*$/m, `title: ${JSON.stringify(title)}`);
      await writeFile(file, kind === 'blog'
        ? changed.replace(/^summary: .*$/m, 'summary: "Literal <script>not executable</script> & readable text."') : changed);
    }
    await workspace.build();
    let items = [...(await feed()).querySelectorAll('item')];
    for (const [kind, slug] of cases) {
      const url = `https://gvp.fyi/${kind}/${slug}/`;
      const before = originalItems.find(item => text(item, 'link') === url);
      const after = items.find(item => text(item, 'link') === url);
      assert.equal(text(after, 'guid'), text(before, 'guid'));
      assert.equal(text(after, 'pubDate'), text(before, 'pubDate'));
      assert.ok(text(after, 'title').includes(title));
      if (kind === 'blog') {
        const summary = parseHTML(`<html><body>${text(after, 'description')}</body></html>`).document.body;
        assert.equal(summary.querySelector('script'), null);
        assert.equal(summary.textContent, 'Literal <script>not executable</script> & readable text.');
      }
    }
    for (const [kind, slug, relative, nextSlug] of cases) {
      const file = join(root, 'src/content', relative);
      if (kind === 'blog' || kind === 'software') {
        const from = kind === 'blog' ? file : join(root, 'src/content/software', slug);
        const to = kind === 'blog' ? join(root, 'src/content/blog', `${nextSlug}.mdx`) : join(root, 'src/content/software', nextSlug);
        await rename(from, to);
        moves.push([from, to]);
      } else {
        const source = await readFile(file, 'utf8');
        const changed = source.replace(`"slug": "${slug}"`, `"slug": "${nextSlug}"`)
          .replace(/^slug: .*$/m, `slug: "${nextSlug}"`);
        assert.notEqual(changed, source);
        await writeFile(file, changed);
      }
    }
    await workspace.build();
    items = [...(await feed()).querySelectorAll('item')];
    assert.equal(items.length, originalItems.length);
    for (const [kind, slug, , nextSlug] of cases) {
      const before = originalItems.find(item => text(item, 'link') === `https://gvp.fyi/${kind}/${slug}/`);
      const after = items.find(item => text(item, 'guid') === text(before, 'guid'));
      assert.equal(text(after, 'link'), `https://gvp.fyi/${kind}/${nextSlug}/`);
      assert.equal(text(after, 'pubDate'), text(before, 'pubDate'));
      const page = parseHTML(await readFile(join(root, 'dist', kind, nextSlug, 'index.html'), 'utf8')).document;
      assert.equal(page.querySelector('link[rel="canonical"]').getAttribute('href'), text(after, 'link'));
    }
  } finally {
    for (const [from, to] of moves.reverse()) await rename(to, from);
    for (const [file, source] of originals) await writeFile(file, source);
    await workspace.build();
  }
});

test('builds reject impossible publication dates, missing dates and conflicting persistent identities', async () => {
  for (const [relative, change, message] of [
    ['blog/the-animated-face.mdx', source => source.replace("date: '2026-10-01'", "date: '2025-02-29'"), /Invalid calendar publication date/],
    ['likes/eli-horn/index.md', source => source.replace(/"created": "[^"]+"/, '"created": "2025-02-29T00:00:00Z"'), /Invalid calendar timestamp/],
    ['software/biolink/index.mdx', source => source.replace('"publishedAt": "2026-10-09"', '"publishedAt": "2025-02-29"'), /Invalid calendar publication date/],
    ['music/atlantis-tapes/index.md', source => source.replace('"publishedAt": "2026-10-07"', '"publishedAt": "2025-02-29"'), /Invalid calendar publication date/],
    ['radio/afw-2026-10-20/index.md', source => source.replace("publishedAt: '2026-11-09'", "publishedAt: '2025-02-29'"), /Invalid calendar publication date/],
    ['radio/afw-2026-10-20/index.md', source => source.replace(/^publishedAt:.*\n/m, ''), /publishedAt.*Required/s],
    ['blog/the-animated-face.mdx', source => source.replace('id: the-animated-face', 'id: the-agent-shepherd'), /Duplicate RSS identity/],
    ['software/biolink/index.mdx', source => source.replace('"id": "biolink"', '"id": "tipbox"'), /Duplicate RSS identity/],
  ]) {
    const file = join(workspace.directory, 'src/content', relative);
    const original = await readFile(file, 'utf8');
    try {
      const changed = change(original);
      assert.notEqual(changed, original, relative);
      await writeFile(file, changed);
      await assert.rejects(workspace.build(), error => {
        assert.match(error.stdout + error.stderr, message, relative);
        return true;
      });
    } finally { await writeFile(file, original); }
  }
  await workspace.build();
});

test('RSS escapes special characters, retains full Likes text and sorts equal dates by persistent identity', async () => {
  const title = 'Angles < & "quotes"';
  const longText = `${'A thoughtful note. '.repeat(35)}Beyond the preview limit.`;
  const directories = [];
  try {
    for (const [id, slug, type] of [['rss-tie-z', 'rss-first-slug', 'quote'], ['rss-tie-a', 'rss-last-slug', 'note']]) {
      const directory = join(workspace.directory, 'src/content/likes', slug);
      directories.push(directory);
      await mkdir(directory);
      await writeFile(join(directory, 'index.mdx'), `---\n${JSON.stringify({
        id, slug, type, title, created: '2099-01-01T00:00:00Z', category: 'i69nqzrzgom9c3s',
        attribution: 'Author & Other <3', url: 'https://example.com/?a=1&b=2',
      })}\n---\n${longText}\n\n[Local release](/music/watery-grave-ep/)\n\n[Unsafe source](javascript:alert)\n\n<script>hiddenScriptMarker</script><button>hiddenControlMarker</button>\n`);
    }
    await workspace.build();
    const items = [...(await feed()).querySelectorAll('item')];
    assert.deepEqual(items.slice(0, 2).map(item => text(item, 'guid')),
      ['urn:gvp.fyi:likes:rss-tie-a', 'urn:gvp.fyi:likes:rss-tie-z']);
    for (let index = 1; index < items.length; index++) {
      const previous = Date.parse(text(items[index - 1], 'pubDate'));
      const current = Date.parse(text(items[index], 'pubDate'));
      assert.ok(previous >= current);
      if (previous === current) assert.ok(text(items[index - 1], 'guid') < text(items[index], 'guid'));
    }
    for (const item of items.slice(0, 2)) {
      assert.equal(text(item, 'title'), title);
      const summary = parseHTML(`<html><body>${text(item, 'description')}</body></html>`).document.body;
      assert.ok(summary.textContent.includes(longText));
      assert.ok(summary.textContent.includes('Author & Other <3'));
      assert.doesNotMatch(summary.textContent, /hiddenScriptMarker|hiddenControlMarker/);
      assert.equal(summary.querySelectorAll('script, button, a[href^="javascript:"]').length, 0);
      assert.ok(summary.querySelector('a[href="https://example.com/?a=1&b=2"]'));
      assert.ok(summary.querySelector('a[href="https://gvp.fyi/music/watery-grave-ep/"]'));
    }
  } finally {
    for (const directory of directories) await rm(directory, { recursive: true, force: true });
    await workspace.build();
  }
});
