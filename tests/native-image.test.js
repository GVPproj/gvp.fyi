import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';
import { fixtureSite } from './helpers/fixture-site.js';

function candidates(image) {
  return image.getAttribute('srcset').split(',').map(part => {
    const [url, width] = part.trim().split(/\s+/);
    assert.match(url, /^\/_astro\//);
    return [url, parseInt(width)];
  });
}

test('native images are responsive, proportional and never upscale small originals across Likes, music and software', { timeout: 90000 }, async t => {
  const site = await fixtureSite(t, { empty: [] });
  const small = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#336699' } }).png().toBuffer();
  await site.entry('likes', 'small-image', {
    id: 'small-image-id', slug: 'small-image', title: 'Small image',
    created: '2026-10-01T00:00:00Z', image: './small.png', category: 'i69nqzrzgom9c3s',
  }, { 'small.png': small });
  for (const [slug, width, height] of [['small-screenshot', 80, 60], ['odd-screenshot', 499, 333]]) {
    const screenshot = await sharp({ create: { width, height, channels: 3, background: '#336699' } }).png().toBuffer();
    await site.entry('software', slug, {
      title: slug, description: 'Screenshot proportions fixture', category: 'portfolio',
      order: 99, tooling: [], screenshot: './screenshot.png', url: 'https://example.test',
    }, { 'screenshot.png': screenshot });
  }
  const built = await site.build();
  assert.equal(built.code, 0, built.logs);
  for (const [route, originalWidth] of [
    ['likes/vincenzo-campi-the-ricotta-eaters', 3736],
    ['likes/88x31-buttons', 1606],
    ['likes/small-image', 80],
    ['likes/john-heward', 935],
    ['music/paul-cries', 499],
    ['music/fallen-empires-japanese-edition', 600],
    ['software/tipbox', 2548],
    ['software/small-screenshot', 80],
    ['software/odd-screenshot', 499],
  ]) {
    const detail = parseHTML(await built.html(route)).document;
    const image = detail.querySelector('#like-detail img, .release-media img, .software-detail img.screenshot');
    assert.equal(Number(image.getAttribute('width')), originalWidth);
    const originalHeight = Number(image.getAttribute('height'));
    const index = parseHTML(await built.html(route.split('/')[0])).document;
    const thumbnail = index.querySelector(`a[href="/${route}"] img`);
    assert.equal(thumbnail.getAttribute('sizes'), '192px');
    const thumbnailMetadata = await sharp(await readFile(join(built.dir, thumbnail.getAttribute('src')))).metadata();
    assert.equal(thumbnailMetadata.width, Math.min(320, originalWidth));
    for (const rendered of [image, thumbnail]) {
      const sources = candidates(rendered);
      assert.ok(sources.length > 0, `${route}: responsive candidates`);
      for (const [url, width] of sources) {
        assert.ok(width <= originalWidth, `${route}: no upscaling`);
        const metadata = await sharp(await readFile(join(built.dir, url))).metadata();
        assert.equal(metadata.width, width, `${route}: accurate width descriptor`);
        const expectedHeight = width * originalHeight / originalWidth;
        assert.ok(metadata.height >= Math.floor(expectedHeight) && metadata.height <= Math.ceil(expectedHeight),
          `${route}: ${width}w retains the original proportions`);
      }
    }
  }
});
