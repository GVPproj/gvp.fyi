import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { parseHTML } from 'linkedom';
import { createBuildFixture } from './build-fixture.js';

let workspace;
let overview;
async function page(route) {
  return parseHTML(await readFile(join(workspace.directory, 'dist', route, 'index.html'), 'utf8')).document;
}
function row(programme) {
  return overview.querySelector(`section[aria-labelledby="programme-${programme}-heading"]`);
}

before(async () => {
  workspace = await createBuildFixture('dj-catalogue');
  await workspace.build();
  overview = await page('dj');
});
after(async () => workspace?.cleanup());

test('A Friendly Wave includes Island City continuations and shared broadcasts in date order', async () => {
  const cards = [...row('a-friendly-wave').querySelectorAll('a')];
  assert.deepEqual(cards.map(card => card.getAttribute('href')), [
    '/dj/afw-2026-10-20', '/dj/island-city-2026-07-29', '/dj/island-city-2026-07-22',
    '/dj/afw-2026-06-30', '/dj/afw-2026-03-01', '/dj/afw-2026-02-10',
    '/dj/island-city-2026-01-18', '/dj/island-city-afw-cafe-mode-2025-05-24',
    '/dj/island-city-afw-weekend-2-day-2',
  ]);
});

test('on FSR.live contains only the full FSR catalogue', async () => {
  assert.equal(row('island-city').querySelector('h2').textContent, 'on FSR.live');
  const cards = [...row('island-city').querySelectorAll('a')];
  assert.equal(cards.length, 119);
  for (const card of cards) {
    const detail = await page(card.getAttribute('href'));
    assert.ok(detail.querySelector('main a[href^="https://www.mixcloud.com/fsrlive/"]'));
  }
  // These ten recordings are explicitly credited in FSR descriptions but absent from its playlist.
  for (const date of ['2021-11-05', '2022-01-14', '2022-07-01', '2022-07-22', '2022-10-21',
    '2022-11-04', '2022-12-16', '2023-04-21', '2023-06-02', '2023-12-01']) {
    assert.ok(row('island-city').querySelector(`a[href="/dj/island-city-${date}"]`), date);
  }
  for (const [date, originalKey] of [
    ['2022-04-29', 'island-city-w-graham-van-pelt-28april2022'],
    ['2022-06-10', 'island-city-with-graham-van-pelt-19jun2022'],
    ['2023-02-17', 'island-city-w-graham-van-pelt-14feb2023'],
    ['2024-01-12', 'island-city-with-graham-van-pelt-12jan2023'],
    ['2024-01-19', 'island-city-w-graham-van-pelt-19jan2023'],
  ]) {
    const detail = await page(`dj/island-city-${date}`);
    assert.ok(detail.querySelector(`main a[href="https://www.mixcloud.com/fsrlive/${originalKey}/"]`));
  }
});

test('all recordings have title-only cards and artwork-led detail pages without metadata or sources', async () => {
  const appearances = [...row('other-appearances').querySelectorAll('a')];
  assert.deepEqual(appearances.map(card => card.getAttribute('href')), [
    '/dj/other-noods-radio-2019-12-18', '/dj/other-the-lot-radio-2019-03-06',
    '/dj/other-solid-steel-2018-11-23', '/dj/other-n10as-2018-11-11',
  ]);
  const routes = new Set();
  const recordings = new Set();
  assert.equal(overview.querySelectorAll('.empty-preview').length, 0);
  for (const programme of ['a-friendly-wave', 'island-city', 'other-appearances']) {
    for (const card of row(programme).querySelectorAll('a')) {
      const route = card.getAttribute('href');
      assert.match(route, /^\/dj\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.equal(routes.has(route), false, route);
      routes.add(route);
      const detail = await page(route);
      assert.equal(detail.querySelector('main h1').textContent, card.querySelector('.content-title').textContent);
      assert.equal(card.textContent.trim(), detail.querySelector('main h1').textContent);
      assert.equal(detail.querySelector('main header p').textContent, row(programme).querySelector('h2').textContent);
      assert.equal(detail.querySelectorAll('main header p').length, 1);
      assert.equal(detail.querySelectorAll('main dl, main time, main details').length, 0);
      assert.equal(detail.querySelector('main > article > a').getAttribute('href'), '/dj/');
      const listen = [...detail.querySelectorAll('main a')].find(link => link.textContent === 'Listen on Mixcloud');
      const recording = listen.getAttribute('href');
      assert.match(recording, /^https:\/\/www\.mixcloud\.com\/[a-z0-9_-]+\/[a-z0-9_-]+\/$/);
      assert.equal(recordings.has(recording), false, recording);
      recordings.add(recording);
      for (const image of [card.querySelector('img'), detail.querySelector('main img')]) {
        assert.ok(Number(image.getAttribute('width')) > 0);
        assert.ok(Number(image.getAttribute('height')) > 0);
        assert.ok((await stat(join(workspace.directory, 'dist', image.getAttribute('src')))).size > 0);
      }
      assert.equal(detail.querySelectorAll('main iframe, main audio, main video, main [download]').length, 0);
    }
  }
  assert.equal(routes.size, 132);
  assert.equal(recordings.size, 132);
});
