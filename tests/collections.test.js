import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { parseHTML } from 'linkedom';
import { createBuildFixture } from './build-fixture.js';

let fixture;
let build;
let cleanup;
let settings;

async function page(path) {
  return parseHTML(await readFile(join(fixture, 'dist', path, 'index.html'), 'utf8')).document;
}

before(async () => {
  ({ directory: fixture, build, cleanup } = await createBuildFixture('collections'));
  const settingsFile = join(fixture, 'src/config/site-settings.json');
  settings = JSON.parse(await readFile(settingsFile, 'utf8'));
  for (const categories of Object.values(settings.categories)) {
    categories.reverse();
    categories.push({ id: 'empty', title: 'AAA empty category' });
  }
  await writeFile(settingsFile, JSON.stringify(settings));
  for (const [slug, data, body] of [
    ['fixture-quote', { type: 'quote', attribution: 'A quoted author' }, '**Readable quote**'],
    ['fixture-note', { type: 'note' }, '<strong>Readable MDX note</strong><script>hiddenPreviewText</script>'],
    ['fixture-pdf', { title: 'Adjacent PDF', download: './document.pdf' }, 'PDF description'],
    ['equal-route', { id: 'equal-route', type: 'note' }, 'An entry whose ID matches its slug'],
  ]) {
    const dir = join(fixture, 'src/content/likes', slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.mdx'), `---\n${JSON.stringify({
      id: `${slug}-id`, slug, created: '2099-01-01T00:00:00Z',
      category: settings.categories.likes.find(category => category.id !== 'empty').id,
      ...data,
    })}\n---\n${body}\n`);
    if (data.download) await writeFile(join(dir, 'document.pdf'), '%PDF-1.4\n%%EOF\n');
  }
  await build();
});

after(async () => {
  await cleanup?.();
});

test('overviews preserve category policies and normalized links', async () => {
  for (const [section, registry] of [['likes', 'likes'], ['music', 'releases'], ['software', 'software']]) {
    const document = await page(section);
    const categories = settings.categories[registry].filter(category => section !== 'likes' || category.id !== 'empty');
    if (section === 'likes') categories.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    assert.deepEqual([...document.querySelectorAll('.content-row h2')].map(el => el.textContent), categories.map(category => category.title));
    for (const link of document.querySelectorAll('.content-row li a')) {
      const destination = await page(link.getAttribute('href'));
      assert.ok(destination.querySelector('main h1'), `Missing detail page for ${link.getAttribute('href')}`);
    }
  }
});

test('Eternal Family appears in Consulting with a square homepage screenshot', async () => {
  const overview = await page('software');
  const row = [...overview.querySelectorAll('.content-row')]
    .find(row => row.querySelector('h2')?.textContent === 'Consulting');
  assert.ok(row);
  const link = row.querySelector('a[href="/software/eternal-family"]');
  assert.ok(link);
  assert.match(link.textContent, /Eternal Family/);

  const detail = await page('software/eternal-family');
  assert.equal(detail.querySelector('h1').textContent, 'Eternal Family');
  assert.match(detail.querySelector('.content-body').textContent, /Streaming platform/);
  assert.match(detail.querySelector('.content-body').textContent, /Reader and publication/);
  assert.ok(detail.querySelector('nav[aria-label="Project links"] a[href="https://eternal.tv/"]'));
  const screenshot = detail.querySelector('img.screenshot');
  assert.ok(screenshot);
  assert.equal(screenshot.getAttribute('width'), screenshot.getAttribute('height'));
});

test('Gap Year appears in Games with official screenshots and audio credit', async () => {
  const overview = await page('software');
  const row = [...overview.querySelectorAll('.content-row')]
    .find(row => row.querySelector('h2')?.textContent === 'Games');
  assert.ok(row?.querySelector('a[href="/software/gap-year"]'));

  const detail = await page('software/gap-year');
  assert.equal(detail.querySelector('h1').textContent, 'Gap Year');
  assert.match(detail.querySelector('.content-body').textContent, /Lead Audio/);
  assert.ok(detail.querySelector('nav[aria-label="Project links"] a[href="https://store.steampowered.com/app/2585900/Gap_Year/"]'));
  const images = [...detail.querySelectorAll('img.screenshot, .gallery img')];
  assert.equal(images.length, 3);
  for (const image of images) {
    assert.ok(image.getAttribute('alt'));
    assert.ok(Number(image.getAttribute('width')) > 0);
    assert.ok(Number(image.getAttribute('height')) > 0);
  }
  assert.equal(detail.querySelector('[aria-labelledby="tooling-heading"]'), null);
  const tipbox = await page('software/tipbox');
  assert.ok(tipbox.querySelector('[aria-labelledby="tooling-heading"]'));
});

test('Inside Touch has its own music row and a verified release player', async () => {
  const overview = await page('music');
  const row = [...overview.querySelectorAll('.content-row')]
    .find(row => row.querySelector('h2')?.textContent === 'as Inside Touch');
  assert.ok(row);
  assert.deepEqual([...row.querySelectorAll('li a')].map(link => link.getAttribute('href')), [
    '/music/ep2', '/music/different-sense', '/music/kawhi', '/music/mr-clutch',
    '/music/the-answer', '/music/trey-5', '/music/the-truth',
  ]);
  for (const slug of ['kawhi', 'mr-clutch', 'the-answer', 'trey-5', 'the-truth']) {
    const track = await page(`music/${slug}`);
    const url = `https://soundcloud.com/inside-touch/${slug}`;
    assert.ok(track.querySelector(`nav[aria-label="Listen to this release"] a[href="${url}"]`));
    const player = track.querySelector('iframe');
    const embed = new URL(player.getAttribute('src'));
    assert.equal(embed.origin, 'https://w.soundcloud.com');
    assert.equal(embed.searchParams.get('url'), url);
    assert.equal(embed.searchParams.get('auto_play'), 'false');
    assert.match(player.getAttribute('title'), /SoundCloud player/);
    assert.equal(track.querySelector('time').getAttribute('datetime'), '2014');
    assert.match(track.querySelector('time').textContent, /SoundCloud upload/);
    assert.equal(track.querySelector('.content-body'), null);
  }

  const ep = await page('music/ep2');
  assert.equal(ep.querySelector('h1').textContent, 'EP2');
  assert.equal(ep.querySelector('time').getAttribute('datetime'), '2016-10-07');
  assert.match(ep.querySelector('time').textContent, /House of Commons/);
  const epPlayer = ep.querySelector('iframe');
  assert.equal(new URL(epPlayer.getAttribute('src')).searchParams.get('url'),
    'https://soundcloud.com/house_of_commons/sets/inside-touch-ep2');
  assert.equal(epPlayer.getAttribute('height'), '350');
  assert.equal(ep.querySelector('.content-body'), null);

  const release = await page('music/different-sense');
  assert.equal(release.querySelector('h1').textContent, 'Different Sense');
  assert.equal(release.querySelector('time').getAttribute('datetime'), '2016-02-11');
  assert.match(release.querySelector('iframe').getAttribute('src'), /album=2722254768\//);
  assert.ok(release.querySelector('a[href="https://insidetouch.bandcamp.com/album/different-sense"]'));
});

test('Likes previews are rendered text, with fallback titles and ID redirects', async () => {
  const overview = await page('likes');
  const fixtureLinks = [...overview.querySelectorAll('.content-row li a')]
    .map(link => link.getAttribute('href')).filter(href => href.startsWith('/likes/fixture-'));
  assert.deepEqual(fixtureLinks, ['/likes/fixture-quote', '/likes/fixture-pdf', '/likes/fixture-note']);
  for (const [slug, title, text] of [
    ['fixture-note', 'Personal note', 'Readable MDX note'],
    ['fixture-quote', 'Quote', 'Readable quote'],
  ]) {
    const item = overview.querySelector(`a[href="/likes/${slug}"]`);
    assert.equal(item.querySelector('.content-title').textContent, title);
    assert.equal(item.querySelector('.content-preview').textContent, text);
    const redirect = await page(`likes/${slug}-id`);
    assert.match(redirect.querySelector('meta[http-equiv="refresh"]').content, new RegExp(`/likes/${slug}`));
  }
  const quote = await page('likes/fixture-quote');
  assert.equal(quote.querySelector('blockquote strong').textContent, 'Readable quote');
  assert.equal(quote.querySelector('figcaption').textContent, 'A quoted author');
});

test('Likes IDs may match their own slug without a self-redirect', async () => {
  const detail = await page('likes/equal-route');
  assert.equal(detail.querySelector('meta[http-equiv="refresh"]'), null);
  assert.match(detail.querySelector('main').textContent, /An entry whose ID matches its slug/);
});

test('adjacent PDFs are published and music dates retain their precision', async () => {
  const pdf = await page('likes/fixture-pdf');
  const download = [...pdf.querySelectorAll('a')].find(link => link.textContent === 'Open PDF');
  const bytes = await readFile(join(fixture, 'dist', download.getAttribute('href')));
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  const release = await page('music/watery-grave-ep');
  assert.equal(release.querySelector('time').getAttribute('datetime'), '2005');
  assert.equal(release.querySelectorAll('audio').length, 5);
  assert.equal(release.querySelectorAll('.content-body .music-player audio').length, 5);
  assert.equal(release.querySelectorAll('.music-player a[download]').length, 5);
  assert.ok(!release.body.textContent.includes('No listening link is currently available'));
});

test('loaders still reject route conflicts, empty bodies, invalid PDFs and missing audio', async () => {
  for (const [path, change, message] of [
    ['likes/fixture-note/index.mdx', source => source.replace('fixture-note-id', 'fixture-quote'), /Duplicate or conflicting Likes route/],
    ['likes/fixture-quote/index.mdx', source => source.slice(0, source.lastIndexOf('---') + 3), /Quotes and notes require a Markdown body/],
    ['software/tipbox/index.mdx', source => source.slice(0, source.lastIndexOf('---') + 3), /Software projects require a Markdown body/],
    ['likes/fixture-pdf/document.pdf', () => 'not a PDF', /Missing or invalid PDF download/],
    ['music/watery-grave-ep/index.mdx', source => source.replace('/audio/watery-grave/01-watery-grave.mp3', '/audio/missing.mp3'), /missing audio file/],
  ]) {
    const file = join(fixture, 'src/content', path);
    const original = await readFile(file, 'utf8');
    try {
      await writeFile(file, change(original));
      await assert.rejects(build(), error => {
        assert.match(error.stdout + error.stderr, message);
        return true;
      });
    } finally {
      await writeFile(file, original);
    }
  }
});

test('content edits are rendered on subsequent builds', async () => {
  const file = join(fixture, 'src/content/likes/fixture-note/index.mdx');
  const original = await readFile(file, 'utf8');
  try {
    await writeFile(file, original.replace('Readable MDX note', 'Updated MDX note'));
    await build();
    const overview = await page('likes');
    assert.equal(overview.querySelector('a[href="/likes/fixture-note"] .content-preview').textContent, 'Updated MDX note');
    const detail = await page('likes/fixture-note');
    assert.match(detail.querySelector('main').textContent, /Updated MDX note/);
  } finally {
    await writeFile(file, original);
  }
});

test('category membership is revalidated when only settings change', async () => {
  const file = join(fixture, 'src/config/site-settings.json');
  const original = await readFile(file, 'utf8');
  const changed = JSON.parse(original);
  changed.categories.likes = changed.categories.likes.filter(category => category.id === 'empty');
  try {
    await writeFile(file, JSON.stringify(changed));
    await assert.rejects(build(), error => {
      assert.match(error.stdout + error.stderr, /Unknown likes category/);
      return true;
    });
  } finally {
    await writeFile(file, original);
  }
});
