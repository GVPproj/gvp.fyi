import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { editorialFixtures } from './helpers/editorial.js';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';

test('Published-content build keeps presentation repo-owned despite stale CMS settings', { timeout: 90000 }, async t => {
  const fixtures = await editorialFixtures();
  const files = new Map();
  const assetRequests = [];
  const entries = [];
  for (const entry of fixtures) {
    const assets = [];
    for (const file of entry.assets) {
      const { bytes } = file;
      const path = `/api/publishing/content-assets/fixture/${file.name}`;
      if (entry.kind !== 'software') files.set(path, bytes);
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
  entries.push({ kind: 'software', state: 'invalid', data: { url: 'javascript:unused()' } });
  const likeImage = fixtures[0].assets[0].bytes;
  const likePath = '/api/publishing/content-assets/likes1/retained.png';
  const likeHash = createHash('sha256').update(likeImage).digest('hex');
  files.set(likePath, likeImage);
  entries.push({ kind: 'like', slug: 'retained-image', revision: 'likes1', state: 'published',
    data: { type: 'image', title: 'Retained Likes image' },
    assets: [{ name: 'retained.png', path: likePath, sha256: likeHash }] });
  entries.push({ kind: 'like', slug: 'withdrawn-image', revision: 'likes2', state: 'unpublished' });
  const server = createServer((req, res) => {
    if (req.url.startsWith('/api/publishing/content-assets/')) assetRequests.push(req.url);
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
  assert.deepEqual(assetRequests, [likePath], 'only Likes assets are fetched; legacy software media may be unavailable');
  const likes = await readFile(`${dir}/likes/retained-image/index.html`, 'utf8');
  assert.match(likes, /Retained Likes image/);
  assert.match(likes, /\/published-content\//);
  assert.deepEqual(await readFile(`${dir}/published-content/${likeHash}.png`), likeImage);
  await assert.rejects(readFile(`${dir}/likes/withdrawn-image/index.html`));
  await t.test('homepage renders accessible testimonial choices and attribution', async () => {
    const home = await readFile(`${dir}/index.html`, 'utf8');
    const { document: homeDocument } = parseHTML(home);
    const testimonials = homeDocument.querySelector('#testimonials');
    assert.ok(testimonials);
    assert.equal(testimonials.querySelectorAll('figure').length, 3);
    assert.match(testimonials.textContent, /Milton Gonzalez/);
    const expected = [
      {
        name: 'Ben Frey',
        role: 'UX/UI Design Lead, Jr Product Manager',
        avatar: 'ben',
        paragraphs: [
          "Graham and I worked together for nearly two years on a product designed to enable better task management and file storage for the film and TV industry. It was an absolute treat to work alongside Graham, someone who can multitask, has great insight into both engineering and design trends, is always curious, and is very professional. I've never worked with an Engineer who could easily run a product demo with potential investors or beta testers, and Graham could with ease.",
          'Graham will be an invaluable asset to any team, and I hope that we can work together in any capacity in the future.',
        ],
      },
      {
        name: 'Jeff Stefani',
        role: 'Creative Director / Design Lead at Fastwave.ai',
        avatar: 'jeff',
        paragraphs: [
          "I had the pleasure of working with Graham for about a year and a half. His attention to detail both on front-end design and back-end problem solving was incredible. Communication is key on any project and Graham is great at bouncing ideas around, talking through technical challenges, and discussing possible solutions that we hadn't thought of.",
          'His polite, kind and professional attitude makes him an asset on any team. I hope to work with Graham again in the future and can absolutely recommend him to add value for all digital projects.',
        ],
      },
    ];
    for (const [index, person] of expected.entries()) {
      const figure = testimonials.querySelectorAll('figure')[index + 1];
      assert.equal(figure.querySelector('.person-name').textContent, person.name);
      assert.equal(figure.querySelector('.person-role').textContent, person.role);
      assert.equal(figure.querySelector('img').getAttribute('src'), `/images/testimonials/${person.avatar}-pixel.png`);
      assert.deepEqual([...figure.querySelectorAll('blockquote p')].map(paragraph => paragraph.textContent), person.paragraphs);
    }
    const heading = testimonials.querySelector('h2');
    assert.equal(heading.textContent, 'Testimonials:');
    assert.equal(testimonials.getAttribute('aria-labelledby'), heading.id);
    const radios = [...testimonials.querySelectorAll('input[type="radio"]')];
    assert.equal(radios.length, 3);
    assert.deepEqual(radios.map(radio => radio.hasAttribute('checked')), [true, false, false]);
    for (const radio of radios) {
      assert.equal(radio.name, 'testimonial');
      assert.equal(radio.nextElementSibling.getAttribute('for'), radio.id);
      assert.ok(radio.nextElementSibling.querySelector('img').getAttribute('alt'));
    }
    assert.doesNotMatch(home, /Layout sample|LAYOUT SAMPLE|prototype-switcher|data-prototype-variant|From the other side of the desk/);
  });
  const software = await readFile(`${dir}/software/tipbox/index.html`, 'utf8');
  assert.match(software, /Tipbox\.io/);
  assert.match(software, /Full-Stack Engineer/);
  assert.match(software, /Howard Baral/);
  assert.match(software, /\/_astro\//);
  assert.doesNotMatch(software, /<figcaption|\/published-content\//);
  const { document: softwareDocument } = parseHTML(software);
  const screenshot = softwareDocument.querySelector('img.screenshot');
  assert.equal(screenshot.getAttribute('width'), '2548');
  assert.equal(screenshot.getAttribute('height'), '1299');
  assert.equal(screenshot.getAttribute('alt'), 'Screenshot of Tipbox.io');
  assert.equal(screenshot.getAttribute('sizes'), '(min-width: 45rem) 65ch, calc(100vw - 3rem)');
  assert.deepEqual(screenshot.getAttribute('srcset').split(', ').map(candidate => candidate.split(' ')[1]),
    ['160w', '320w', '640w', '960w', '2548w']);
  assert.equal(softwareDocument.querySelectorAll('.gallery img[loading="lazy"]').length, 3);
  for (const image of softwareDocument.querySelectorAll('.software-detail img')) {
    for (const [source, expectedWidth] of [
      [image.getAttribute('src'), Number(image.getAttribute('width'))],
      ...image.getAttribute('srcset').split(', ').map(candidate => {
        const [source, width] = candidate.split(' ');
        return [source, parseInt(width)];
      }),
    ]) {
      assert.match(source, /^\/_astro\//);
      const metadata = await sharp(await readFile(`${dir}${source}`)).metadata();
      assert.equal(metadata.width, expectedWidth);
    }
  }
  const { document: softwareIndex } = parseHTML(await readFile(`${dir}/software/index.html`, 'utf8'));
  for (const [category, slugs] of [
    ['portfolio', ['tipbox', 'biolink']],
    ['small-websites', ['groundwaves']],
    ['early-projects', ['bloom-bnb', 'quizzical', 'tenzies', 'colour-scheme-generator']],
  ]) {
    assert.deepEqual([...softwareIndex.querySelector(`#${category}-heading`).closest('section').querySelectorAll('li a')].map(link => link.getAttribute('href')),
      slugs.map(slug => `/software/${slug}`));
    for (const slug of slugs) assert.ok(await readFile(`${dir}/software/${slug}/index.html`, 'utf8'));
  }
  await assert.rejects(readFile(`${dir}/software/example-project/index.html`));
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
  for (const [html, pathname, type] of [
    [software, '/software/tipbox/', 'website'],
    [blog, '/blog/the-animated-face/', 'article'],
  ]) {
    const { document } = parseHTML(html);
    const meta = key => document.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute('content');
    assert.equal(meta('og:title'), document.title);
    assert.equal(meta('og:description'), meta('description'));
    assert.equal(meta('og:type'), type);
    assert.equal(new URL(meta('og:url')).pathname.replace(/\/$/, ''), pathname.replace(/\/$/, ''));
    assert.equal(new URL(meta('og:url')).origin, 'https://gvp.fyi');
    assert.equal(document.querySelector('link[rel="canonical"]').href, meta('og:url'));
    assert.equal(meta('og:image'), 'https://gvp.fyi/social/og-image.png');
    assert.equal(meta('og:image:width'), '1200');
    assert.equal(meta('og:image:height'), '630');
    assert.ok(meta('og:image:alt'));
    assert.equal(meta('twitter:card'), 'summary_large_image');
    for (const field of ['title', 'description', 'image', 'image:alt']) {
      assert.equal(meta(`twitter:${field}`), meta(`og:${field}`));
    }
    assert.ok(document.querySelector('link[rel="icon"][type="image/svg+xml"]'));
    assert.ok(document.querySelector('link[rel="apple-touch-icon"]'));
  }
  for (const [file, width, height] of [
    ['social/og-image.png', 1200, 630], ['favicon-32.png', 32, 32], ['apple-touch-icon.png', 180, 180],
  ]) {
    const image = await sharp(await readFile(`${dir}/${file}`)).metadata();
    assert.equal(image.format, 'png');
    assert.equal(image.width, width);
    assert.equal(image.height, height);
  }
  const icon = await readFile(`${dir}/favicon.svg`, 'utf8');
  assert.match(icon, /<path\b/);
  assert.doesNotMatch(icon, /animation|stroke-dashoffset/);
  assert.match(blog, /data-language="astro"/);
  const blogIndex = await readFile(`${dir}/blog/index.html`, 'utf8');
  assert.match(blogIndex, /href="\/blog\/the-animated-face\/?"/);
  assert.match(blogIndex, /Animating My Face/);
  assert.match(await readFile(`${dir}/software/biolink/index.html`, 'utf8'), /Linktree/);
  assert.match(await readFile(`${dir}/software/tenzies/index.html`, 'utf8'), /Dice Game/);
});
