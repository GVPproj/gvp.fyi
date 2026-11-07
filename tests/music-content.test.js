import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSite } from './helpers/fixture-site.js';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';

// Real collection schemas, pages and image service; only the repository content is a fixture.
async function musicSite(t) {
  const parent = new URL('../.astro/', import.meta.url);
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(new URL('music-content-', parent));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src/pages'), { recursive: true });
  for (const directory of ['components', 'config', 'layouts', 'lib', 'scripts', 'styles', 'pages/music']) {
    await cp(new URL(`../src/${directory}`, import.meta.url), join(root, 'src', directory), { recursive: true });
  }
  await cp(new URL('../src/content.config.ts', import.meta.url), join(root, 'src/content.config.ts'));
  await mkdir(join(root, 'src/content/music'), { recursive: true });
  await writeFile(join(root, 'src/content/named-collections.json'), '[]\n');
  await writeFile(join(root, 'astro.config.mjs'), `import { defineConfig } from 'astro/config';
export default defineConfig({ site: 'https://gvp.fyi' });\n`);
  return root;
}

async function entry(root, folder, overrides = {}, width = 1100) {
  const directory = join(root, 'src/content/music', folder);
  await mkdir(directory, { recursive: true });
  await sharp({ create: { width, height: width / 2, channels: 3, background: '#123456' } })
    .png().toFile(join(directory, 'cover.png'));
  const data = {
    id: folder, slug: folder, order: 0, category: 'graham-van-pelt',
    title: 'Repository release', artist: 'Fixture artist', release_date: '2020',
    artwork: './cover.png', about: null, tracks: [], ...overrides,
  };
  await writeFile(join(directory, 'index.md'), `---\n${JSON.stringify(data, null, 2)}\n---\n`);
}

const build = (t, root) => buildSite(root, { signal: t.signal });

async function page(root, path) {
  return parseHTML(await readFile(join(root, 'dist', path, 'index.html'), 'utf8')).document;
}

test('repository music builds at its explicit slug with native responsive artwork and retained empty categories', { timeout: 90000 }, async t => {
  const root = await musicSite(t);
  await entry(root, 'folder-not-the-route', { id: 'stable-record', slug: 'retained-route' });
  const result = await build(t, root);
  assert.equal(result.code, 0, result.output);
  const index = await page(root, 'music');
  const links = [...index.querySelectorAll('.music-releases li a')];
  assert.deepEqual(links.map(link => link.getAttribute('href')), ['/music/retained-route']);
  assert.equal(index.querySelectorAll('.music-releases section').length, 4);
  const emptyCategory = index.querySelector('#category-miracle-fortress-heading').closest('section');
  assert.equal(emptyCategory.querySelectorAll('li a').length, 0);
  assert.ok(emptyCategory.querySelector('.empty-preview'));
  const detail = await page(root, 'music/retained-route');
  assert.equal(detail.querySelector('h1').textContent, 'Repository release');
  const cover = detail.querySelector('.release-media img');
  assert.equal(cover.getAttribute('alt'), 'Repository release album cover');
  assert.equal(cover.getAttribute('width'), '1100');
  assert.equal(cover.getAttribute('height'), '550');
  assert.equal(cover.getAttribute('sizes'), '(max-width: 48rem) calc(100vw - 2rem), 65ch');
  const variants = cover.getAttribute('srcset').split(', ').map(candidate => candidate.split(' '));
  assert.deepEqual(variants.map(([, width]) => width), ['160w', '320w', '640w', '960w', '1100w']);
  assert.equal(cover.getAttribute('src'), variants.at(-1)[0]);
  assert.equal(links[0].querySelector('img').getAttribute('src'), variants[1][0]);
  for (const [source, width] of variants) {
    assert.match(source, /^\/_astro\//);
    const metadata = await sharp(await readFile(join(root, 'dist', source))).metadata();
    assert.equal(metadata.width, parseInt(width));
    assert.equal(metadata.format, 'webp');
  }
  await assert.rejects(readFile(join(root, 'dist/music/folder-not-the-route/index.html')));
});

test('an intentionally empty music collection keeps every category and generates no release links', { timeout: 90000 }, async t => {
  const root = await musicSite(t);
  const result = await build(t, root);
  assert.equal(result.code, 0, result.output);
  const index = await page(root, 'music');
  assert.deepEqual([...index.querySelectorAll('.music-releases h2')].map(heading => heading.id), [
    'category-graham-van-pelt-heading', 'category-miracle-fortress-heading',
    'category-think-about-life-heading', 'category-other-credits-heading',
  ]);
  assert.equal(index.querySelectorAll('.music-releases li a').length, 0);
  assert.equal(index.querySelectorAll('.empty-preview').length, 4);
});

test('music retains literal descriptions, optional metadata, listening links and native audio markup', { timeout: 90000 }, async t => {
  const root = await musicSite(t);
  await mkdir(join(root, 'public/audio'), { recursive: true });
  await cp(new URL('../public/audio/ambient-silence.mp3', import.meta.url), join(root, 'public/audio/retained.mp3'));
  await entry(root, 'full-metadata', {
    title: 'Original title', display_title: 'Display title', display_date: 'Summer 2020',
    credit: 'Production', player_height: 512, album_id: 12345,
    about: '**Literal emphasis** and <em>literal HTML</em>\nwith a line break.\n\n[Not a link](https://example.test)',
    url: 'https://example.test/bandcamp',
    streaming: { spotify: 'https://example.test/spotify', apple: 'https://example.test/apple', tidal: 'https://example.test/tidal' },
    tracks: [
      { title: 'No audio here', track_num: 1 },
      { title: 'Playable track', track_num: 2, duration: 12, audio_url: '/audio/retained.mp3' },
    ],
  }, 240);
  await entry(root, 'minimal', { tracks: undefined, about: null }, 80);
  await entry(root, 'default-player', { album_id: 67890 }, 320);
  const result = await build(t, root);
  assert.equal(result.code, 0, result.output);
  const detail = await page(root, 'music/full-metadata');
  assert.equal(detail.querySelector('h1').textContent, 'Display title');
  assert.equal(detail.querySelector('.release-credit').textContent, 'Graham Van Pelt — Production');
  assert.equal(detail.querySelector('time').textContent, 'Summer 2020');
  assert.equal(detail.querySelector('time').getAttribute('datetime'), '2020');
  assert.deepEqual([...detail.querySelectorAll('.description p')].map(p => p.textContent), [
    '**Literal emphasis** and <em>literal HTML</em>\nwith a line break.', '[Not a link](https://example.test)',
  ]);
  assert.equal(detail.querySelectorAll('.description em, .description strong, .description a').length, 0);
  const embed = detail.querySelector('iframe');
  assert.equal(embed.getAttribute('height'), '512');
  assert.equal(embed.getAttribute('title'), 'Bandcamp player — Display title by Fixture artist');
  assert.equal(embed.getAttribute('src'), 'https://bandcamp.com/EmbeddedPlayer/album=12345/size=large/bgcol=2e3440/linkcol=88c0d0/artwork=none/transparent=true/');
  assert.deepEqual([...detail.querySelectorAll('nav[aria-label="Listen to this release"] a')].map(a => [a.textContent, a.getAttribute('href')]), [
    ['Bandcamp', 'https://example.test/bandcamp'], ['Spotify', 'https://example.test/spotify'],
    ['Apple Music', 'https://example.test/apple'], ['Tidal', 'https://example.test/tidal'],
  ]);
  const audio = detail.querySelector('audio');
  assert.equal(detail.querySelectorAll('audio').length, 1);
  assert.equal(audio.getAttribute('src'), '/audio/retained.mp3');
  assert.equal(audio.hasAttribute('controls'), true);
  assert.equal(audio.getAttribute('preload'), 'none');
  assert.equal(audio.hasAttribute('autoplay'), false);
  assert.equal(audio.closest('li').getAttribute('value'), '2');
  assert.equal(detail.getElementById(audio.getAttribute('aria-labelledby')).textContent, 'Playable track');
  assert.equal(audio.querySelector('a').getAttribute('href'), '/audio/retained.mp3');
  assert.deepEqual(await readFile(join(root, 'dist/audio/retained.mp3')), await readFile(new URL('../public/audio/ambient-silence.mp3', import.meta.url)));
  const minimal = await page(root, 'music/minimal');
  assert.equal(minimal.querySelectorAll('.description, .release-credit, iframe, audio, article nav').length, 0);
  assert.match(minimal.querySelector('article').textContent, /No listening link is currently available/);
  assert.equal((await page(root, 'music/default-player')).querySelector('iframe').getAttribute('height'), '406');
  const index = await page(root, 'music');
  assert.equal(index.querySelector('a[href="/music/full-metadata"] .subtitle').textContent, 'Fixture artist');
  assert.equal(index.querySelector('a[href="/music/full-metadata"] .item-metadata').textContent, 'Production');
  assert.equal(index.querySelectorAll('a[href="/music/minimal"] .subtitle, a[href="/music/minimal"] .item-metadata').length, 0);
  for (const [slug, widths] of [['full-metadata', ['160w', '240w']], ['minimal', ['80w']], ['default-player', ['160w', '320w']]]) {
    const cover = (await page(root, `music/${slug}`)).querySelector('.release-media img');
    const variants = cover.getAttribute('srcset').split(', ').map(candidate => candidate.split(' '));
    assert.deepEqual(variants.map(([, width]) => width), widths, 'Small originals are never upscaled');
    assert.equal(index.querySelector(`a[href="/music/${slug}"] img`).getAttribute('src'), variants.at(-1)[0]);
  }
});

test('a missing referenced local MP3 fails the music build clearly', { timeout: 90000 }, async t => {
  const root = await musicSite(t);
  await entry(root, 'missing-audio', {
    tracks: [{ title: 'Unplayable track', track_num: 1, audio_url: '/audio/missing-song.mp3' }],
  }, 240);
  const result = await build(t, root);
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, /missing-audio/);
  assert.match(result.output, /missing.*audio.*\/audio\/missing-song\.mp3/i);
});

test('music builds reject duplicate public slugs and stable record IDs across distinct folders', { timeout: 90000 }, async t => {
  for (const field of ['slug', 'id']) {
    await t.test(field, async t => {
      const root = await musicSite(t);
      await entry(root, 'first-folder', { [field]: 'conflicting-value' }, 240);
      await entry(root, 'second-folder', { [field]: 'conflicting-value', category: 'other-credits' }, 240);
      const result = await build(t, root);
      assert.notEqual(result.code, 0, result.output);
      assert.match(result.output, new RegExp(`Duplicate music ${field}.*conflicting-value`, 'i'));
      assert.match(result.output, /first-folder/);
      assert.match(result.output, /second-folder/);
    });
  }
});

test('music chronology normalizes legacy dates and preserves captured tie order independently of folder names', { timeout: 90000 }, async t => {
  const root = await musicSite(t);
  for (const [folder, data] of [
    ['a-last-tie', { id: 'z', slug: 'last-tie', release_date: '2024-01-02', order: 8 }],
    ['b-middle-tie', { id: 'b', slug: 'middle-tie', release_date: 'Tue, 02 Jan 2024 00:00:00 GMT', order: 3 }],
    ['z-first-tie', { id: 'a', slug: 'first-tie', release_date: '2024-01-02', order: 3 }],
    ['month', { release_date: '2023-06' }],
    ['year', { release_date: '2022' }],
    ['newest', { release_date: '2025-01-01', order: 99 }],
  ]) await entry(root, folder, data, 240);
  const result = await build(t, root);
  assert.equal(result.code, 0, result.output);
  const index = await page(root, 'music');
  assert.deepEqual([...index.querySelectorAll('.music-releases li a')].map(link => link.getAttribute('href')), [
    '/music/newest', '/music/first-tie', '/music/middle-tie', '/music/last-tie', '/music/month', '/music/year',
  ]);
  for (const [slug, date] of [['month', '2023-06'], ['year', '2022'], ['middle-tie', '2024-01-02']]) {
    const detail = await page(root, `music/${slug}`);
    assert.equal(detail.querySelector('time').getAttribute('datetime'), date);
    assert.equal(detail.querySelector('time').textContent, date);
  }
});
