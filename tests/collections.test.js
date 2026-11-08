import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseHTML } from 'linkedom';

const repository = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);
let fixture;
let settings;

async function build() {
  return exec(process.execPath, [join(repository, 'node_modules/astro/bin/astro.mjs'), 'build'], {
    cwd: fixture,
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function page(path) {
  return parseHTML(await readFile(join(fixture, 'dist', path, 'index.html'), 'utf8')).document;
}

before(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'gvp-collections-'));
  await cp(join(repository, 'src'), join(fixture, 'src'), { recursive: true });
  for (const file of ['package.json', 'astro.config.mjs', 'tsconfig.json']) {
    await cp(join(repository, file), join(fixture, file));
  }
  for (const directory of ['node_modules', 'public']) {
    await symlink(join(repository, directory), join(fixture, directory), 'dir');
  }
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
  if (fixture) await rm(fixture, { recursive: true, force: true });
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

test('adjacent PDFs are published and music dates retain their precision', async () => {
  const pdf = await page('likes/fixture-pdf');
  const download = [...pdf.querySelectorAll('a')].find(link => link.textContent === 'Open PDF');
  const bytes = await readFile(join(fixture, 'dist', download.getAttribute('href')));
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  const release = await page('music/watery-grave-ep');
  assert.equal(release.querySelector('time').getAttribute('datetime'), '2005');
  assert.equal(release.querySelectorAll('audio').length, 5);
});

test('loaders still reject route conflicts, empty bodies, invalid PDFs and missing audio', async () => {
  for (const [path, change, message] of [
    ['likes/fixture-note/index.mdx', source => source.replace('fixture-note-id', 'fixture-quote'), /Duplicate or conflicting Likes route/],
    ['likes/fixture-quote/index.mdx', source => source.slice(0, source.lastIndexOf('---') + 3), /Quotes and notes require a Markdown body/],
    ['software/tipbox/index.mdx', source => source.slice(0, source.lastIndexOf('---') + 3), /Software projects require a Markdown body/],
    ['likes/fixture-pdf/document.pdf', () => 'not a PDF', /Missing or invalid PDF download/],
    ['music/watery-grave-ep/index.md', source => source.replace('/audio/watery-grave/01-watery-grave.mp3', '/audio/missing.mp3'), /missing audio file/],
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
