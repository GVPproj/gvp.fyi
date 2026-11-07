import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';
import { fixtureSite } from './helpers/fixture-site.js';

// Independently captured deployed bytes, not hashes of locally generated images.
const preserved = [
  ['likes/vincenzo-campi-the-ricotta-eaters', '320w', '2074afcc92f5b866f78d9bc26d5e2c1561515afbea63bf65c39cdf226ca27563'],
  ['likes/vincenzo-campi-the-ricotta-eaters', '640w', '9f5c03db8772ffdc46f84b106a48ba1fb5562f488f5be90d8efca37935837237'],
  ['likes/88x31-buttons', '320w', 'b68ca6841585cbf93ae1e933535afb3d595d1344612c37351a10b799923fe433'],
  ['likes/88x31-buttons', '640w', '7c1990e88bf0cd998b510a1cd73705d692c0a963894fd03c0159a7de76e69c79'],
  ['music/paul-cries', '320w', '6888a959eb2d2a949b89f846beea321791d9b149fbb0d1cf240db0c277f3803d'],
];

function detailImage(html) {
  return parseHTML(html).document.querySelector('#like-detail img, .release-media img');
}

function candidates(image) {
  return new Map(image.getAttribute('srcset').split(',').map(part => {
    const [url, width] = part.trim().split(/\s+/);
    assert.match(url, /^\/_astro\//, 'responsive images use native assets, not compatibility URLs');
    return [width, url];
  }));
}

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

const entries = [
  ['likes', 'vincenzo-campi-the-ricotta-eaters', 'imageVariants'],
  ['music', 'paul-cries', 'artworkVariants'],
];

async function changeEntry(site, collection, folder, change) {
  const file = await readFile(join(site.root, 'src/content', collection, folder, 'index.md'), 'utf8');
  const data = JSON.parse(file.split('---')[1]);
  await site.entry(collection, folder, change(data));
}

test('native Likes and music responsive assets retain the five deployed codec-sensitive variants', { timeout: 90000 }, async t => {
  const site = await fixtureSite(t, { empty: [] });
  const built = await site.build();
  assert.equal(built.code, 0, built.logs);
  const actual = [];
  for (const [route, width] of preserved) {
    const image = detailImage(await built.html(route));
    assert.ok(image, route);
    const url = candidates(image).get(width);
    assert.ok(url, `${route} ${width}`);
    actual.push([route, width, hash(await readFile(join(built.dir, url)))]);
    const index = parseHTML(await built.html(route.split('/')[0])).document;
    if (width === '320w') {
      assert.equal(index.querySelector(`a[href="/${route}"] img`).getAttribute('src'), url);
    }
  }
  assert.deepEqual(actual, preserved);
});

test('optional variants leave native sampling, original Likes sources and small thumbnails intact', { timeout: 90000 }, async t => {
  const site = await fixtureSite(t, { empty: [] });
  const small = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#336699' } }).png().toBuffer();
  await site.entry('likes', 'small-image', {
    id: 'small-image-id', slug: 'small-image', title: 'Small image',
    created: '2026-10-01T00:00:00Z', image: './small.png',
  }, { 'small.png': small });
  const built = await site.build();
  assert.equal(built.code, 0, built.logs);
  for (const [route, widths, original] of [
    ['likes/vincenzo-campi-the-ricotta-eaters', ['160w', '320w', '640w', '960w', '3736w'], 'image.jpg'],
    ['likes/88x31-buttons', ['160w', '320w', '640w', '960w', '1606w'], 'image.png'],
    ['likes/small-image', ['80w'], 'small.png'],
    ['music/paul-cries', ['160w', '320w', '499w']],
  ]) {
    const image = detailImage(await built.html(route));
    assert.deepEqual([...candidates(image).keys()], widths);
    if (original) {
      assert.match(image.getAttribute('src'), /^\/_astro\//);
      assert.deepEqual(await readFile(join(built.dir, image.getAttribute('src'))),
        await readFile(join(site.root, 'src/content', route, original)), 'Likes detail src retains the original');
    }
  }
  const smallImage = detailImage(await built.html('likes/small-image'));
  const index = parseHTML(await built.html('likes')).document;
  assert.equal(index.querySelector('a[href="/likes/small-image"] img').getAttribute('src'), smallImage.getAttribute('src'));
  // Captured deployed samples also exercise native generation with no authored variants.
  for (const [route, expected] of [
    ['likes/john-heward', '07f1a0a1b48457e4191c1c70a9c890b19cf2952cbd3ef40d670fc944903b9bda'],
    ['music/fallen-empires-japanese-edition', '602bab6d4fdee98249610220128abc24bb20dddfb80bb9e994666d472caf61f7'],
  ]) {
    const url = candidates(detailImage(await built.html(route))).get('320w');
    assert.equal(hash(await readFile(join(built.dir, url))), expected, route);
  }
});

test('preserved variants must remain proportional to the primary image', { timeout: 90000 }, async t => {
  for (const [collection, folder, field] of entries) {
    await t.test(collection, async t => {
      const site = await fixtureSite(t, { empty: [] });
      await writeFile(join(site.root, 'src/content', collection, folder, 'distorted.png'),
        await sharp({ create: { width: 320, height: 100, channels: 3, background: '#336699' } }).png().toBuffer());
      await changeEntry(site, collection, folder, data => ({ ...data, [field]: ['./distorted.png'] }));
      const built = await site.build();
      assert.notEqual(built.code, 0, 'Distorted variants must fail the build');
      assert.match(built.logs, /variant.*proportional/i);
      assert.match(built.logs, /distorted/);
    });
  }
});

test('preserved Likes variants require a primary image', { timeout: 90000 }, async t => {
  const site = await fixtureSite(t, { empty: [] });
  await changeEntry(site, 'likes', 'vincenzo-campi-the-ricotta-eaters', data => ({ ...data, image: undefined }));
  const built = await site.build();
  assert.notEqual(built.code, 0, 'Variants without a primary image must fail the build');
  assert.match(built.logs, /imageVariants/);
  assert.match(built.logs, /require.*primary.*image/i);
});

test('missing preserved assets fail native image loading with the missing path', { timeout: 90000 }, async t => {
  for (const [collection, folder, field] of entries) {
    await t.test(collection, async t => {
      const site = await fixtureSite(t, { empty: [] });
      await changeEntry(site, collection, folder, data => ({ ...data, [field]: ['./missing-variant.webp'] }));
      const built = await site.build();
      assert.notEqual(built.code, 0, 'Missing image() assets must fail the build');
      assert.match(built.logs, /missing-variant\.webp/);
      assert.match(built.logs, /could not|not exist|not found|cannot find/i);
    });
  }
});

test('Likes and music reject unexpected or upscaled preserved widths', { timeout: 90000 }, async t => {
  for (const [collection, folder, field] of entries) {
    for (const width of [200, 640]) {
      await t.test(`${collection}: ${width}`, async t => {
        const site = await fixtureSite(t, { empty: [] });
        await writeFile(join(site.root, 'src/content', collection, folder, 'variant.png'),
          await sharp({ create: { width, height: width, channels: 3, background: '#336699' } }).png().toBuffer());
        await changeEntry(site, collection, folder, data => ({
          ...data,
          // 200 is not a responsive width; 640 exceeds this 320px primary.
          ...(width === 640 ? { [collection === 'likes' ? 'image' : 'artwork']: data[field][0] } : {}),
          [field]: ['./variant.png'],
        }));
        const built = await site.build();
        assert.notEqual(built.code, 0, 'Unexpected widths must fail the build');
        assert.match(built.logs, new RegExp(`unexpected.*variant.*${width}`, 'i'));
      });
    }
  }
});

test('Likes and music reject duplicate preserved responsive widths', { timeout: 90000 }, async t => {
  for (const [collection, folder, field] of entries) {
    await t.test(collection, async t => {
      const site = await fixtureSite(t, { empty: [] });
      const directory = join(site.root, 'src/content', collection, folder);
      const filename = collection === 'likes' ? 'image-320.webp' : 'artwork-320.webp';
      await writeFile(join(directory, 'duplicate.webp'), await readFile(join(directory, filename)));
      await changeEntry(site, collection, folder, data => ({
        ...data, [field]: [data[field][0], './duplicate.webp'],
      }));
      const built = await site.build();
      assert.notEqual(built.code, 0, 'Duplicate widths must fail the build');
      assert.match(built.logs, /duplicate.*variant.*320|duplicate.*320.*variant/i);
    });
  }
});
