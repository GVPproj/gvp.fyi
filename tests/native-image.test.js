import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';
import { fixtureSite } from './helpers/fixture-site.js';

function detailImage(html) {
  return parseHTML(html).document.querySelector('#like-detail img, .release-media img');
}

function candidates(image) {
  return new Map(image.getAttribute('srcset').split(',').map(part => {
    const [url, width] = part.trim().split(/\s+/);
    assert.match(url, /^\/_astro\//);
    return [width, url];
  }));
}

test('native images retain responsive widths, proportional sampling, original Likes sources and small thumbnails', { timeout: 90000 }, async t => {
  const site = await fixtureSite(t, { empty: [] });
  const small = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#336699' } }).png().toBuffer();
  await site.entry('likes', 'small-image', {
    id: 'small-image-id', slug: 'small-image', title: 'Small image',
    created: '2026-10-01T00:00:00Z', image: './small.png',
  }, { 'small.png': small });
  const built = await site.build();
  assert.equal(built.code, 0, built.logs);
  for (const [route, widths, original] of [
    ['likes/vincenzo-campi-the-ricotta-eaters', [160, 320, 640, 960, 3736], 'image.jpg'],
    ['likes/88x31-buttons', [160, 320, 640, 960, 1606], 'image.png'],
    ['likes/small-image', [80], 'small.png'],
    ['likes/john-heward', [160, 320, 640, 935], 'image.jpg'],
    ['music/paul-cries', [160, 320, 499]],
    ['music/fallen-empires-japanese-edition', [160, 320, 600]],
  ]) {
    const image = detailImage(await built.html(route));
    const sources = candidates(image);
    assert.deepEqual([...sources.keys()], widths.map(width => `${width}w`));
    const width = Number(image.getAttribute('width'));
    const height = Number(image.getAttribute('height'));
    for (const [candidate, url] of sources) {
      const metadata = await sharp(await readFile(join(built.dir, url))).metadata();
      const candidateWidth = parseInt(candidate);
      assert.equal(metadata.width, candidateWidth, `${route}: ${candidate}`);
      const expectedHeight = candidateWidth * height / width;
      assert.ok(metadata.height >= Math.floor(expectedHeight) && metadata.height <= Math.ceil(expectedHeight),
        `${route}: ${candidate} retains the original proportions`);
    }
    if (original) {
      assert.match(image.getAttribute('src'), /^\/_astro\//);
      assert.deepEqual(await readFile(join(built.dir, image.getAttribute('src'))),
        await readFile(join(site.root, 'src/content', route, original)), 'Likes detail src retains the original');
    }
    const index = parseHTML(await built.html(route.split('/')[0])).document;
    const thumbnail = index.querySelector(`a[href="/${route}"] img`);
    const thumbnailWidth = widths.find(width => width >= 320) ?? widths.at(-1);
    assert.equal(thumbnail.getAttribute('src'), width < 320 && original
      ? image.getAttribute('src') : sources.get(`${thumbnailWidth}w`));
  }
});
