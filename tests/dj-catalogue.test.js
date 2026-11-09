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

test('all four verified A Friendly Wave recordings are browsable, including the untagged June host', async () => {
  const cards = [...row('a-friendly-wave').querySelectorAll('a')];
  assert.deepEqual(cards.map(card => card.getAttribute('href')), [
    '/dj/afw-2026-10-20', '/dj/afw-2026-06-30', '/dj/afw-2026-03-01', '/dj/afw-2026-02-10',
  ]);
  const june = await page('dj/afw-2026-06-30');
  assert.match(june.querySelector('main').textContent, /Hosted by Graham Van Pelt/);
  assert.equal(june.querySelector('.broadcast-date time').getAttribute('datetime'), '2026-06-30');
  assert.equal(june.querySelector('.recording-duration time').textContent, '59:32');
});

test('Island City unifies the full FSR catalogue, AFW continuations and shared broadcasts', async () => {
  const cards = [...row('island-city').querySelectorAll('a')];
  assert.equal(cards.length, 124);
  assert.deepEqual(cards.slice(0, 3).map(card => card.getAttribute('href')), [
    '/dj/island-city-2026-07-29', '/dj/island-city-2026-07-22', '/dj/island-city-2026-01-18',
  ]);
  // These ten recordings are explicitly credited in FSR descriptions but absent from its playlist.
  for (const date of ['2021-11-05', '2022-01-14', '2022-07-01', '2022-07-22', '2022-10-21',
    '2022-11-04', '2022-12-16', '2023-04-21', '2023-06-02', '2023-12-01']) {
    assert.ok(row('island-city').querySelector(`a[href="/dj/island-city-${date}"]`), date);
  }
  for (const [slug, credit, duration, date] of [
    ['island-city-afw-cafe-mode-2025-05-24', 'Shared broadcast — Leo Chan, Jeff Stefani and Graham Van Pelt (Island City)', '5:06:59', '2025-05-24'],
    ['island-city-afw-weekend-2-day-2', 'Shared broadcast — Chris Dammeyer, AIKA and Graham Van Pelt (Island City)', '3:53:09', null],
  ]) {
    assert.equal(row('island-city').querySelectorAll(`a[href="/dj/${slug}"]`).length, 1);
    const detail = await page(`dj/${slug}`);
    assert.equal(detail.querySelector('main header p:last-child').textContent, credit);
    assert.equal(detail.querySelector('.recording-duration time').textContent, duration);
    assert.equal(detail.querySelector('.broadcast-date time')?.getAttribute('datetime') ?? null, date);
    if (!date) assert.match(detail.querySelector('.broadcast-date').textContent, /Broadcast date uncertain/);
  }
  for (const [date, originalKey] of [
    ['2022-04-29', 'island-city-w-graham-van-pelt-28april2022'],
    ['2022-06-10', 'island-city-with-graham-van-pelt-19jun2022'],
    ['2023-02-17', 'island-city-w-graham-van-pelt-14feb2023'],
    ['2024-01-12', 'island-city-with-graham-van-pelt-12jan2023'],
    ['2024-01-19', 'island-city-w-graham-van-pelt-19jan2023'],
  ]) {
    const detail = await page(`dj/island-city-${date}`);
    assert.equal(detail.querySelector('.broadcast-date time').getAttribute('datetime'), date);
    assert.ok(detail.querySelector(`main a[href="https://www.mixcloud.com/fsrlive/${originalKey}/"]`));
  }
  const uncertain = await page('dj/fsr-island-city-w-graham-van-pelt-0july2022');
  assert.equal(uncertain.querySelector('.broadcast-date time'), null);
  assert.match(uncertain.querySelector('.broadcast-date').textContent, /July 2022.*exact day unverified/i);
  assert.equal(uncertain.querySelector('.recording-duration time').textContent, '1:00:01');
  for (const slug of ['fsr-island-city-episode-3', 'fsr-island-city-w-graham-van-pelt-ep2',
    'fsr-island-city-w-graham-van-pelt', 'fsr-island-city-with-graham-van-pelt']) {
    const detail = await page(`dj/${slug}`);
    assert.equal(detail.querySelector('.broadcast-date time'), null);
    assert.match(detail.querySelector('.broadcast-date').textContent, /Broadcast date unknown/);
  }
});

test('the four other appearances complete a unique, sourced, newest-first local listening catalogue', async () => {
  const appearances = [...row('other-appearances').querySelectorAll('a')];
  assert.deepEqual(appearances.map(card => card.getAttribute('href')), [
    '/dj/other-noods-radio-2019-12-18', '/dj/other-the-lot-radio-2019-03-06',
    '/dj/other-solid-steel-2018-11-23', '/dj/other-n10as-2018-11-11',
  ]);
  for (const [slug, date, duration] of [
    ['other-noods-radio-2019-12-18', '2019-12-18', '58:24'],
    ['other-the-lot-radio-2019-03-06', '2019-03-06', '2:00:35'],
    ['other-solid-steel-2018-11-23', '2018-11-23', '1:03:57'],
    ['other-n10as-2018-11-11', '2018-11-11', '1:00:00'],
  ]) {
    const detail = await page(`dj/${slug}`);
    assert.equal(detail.querySelector('.broadcast-date time').getAttribute('datetime'), date);
    assert.equal(detail.querySelector('.recording-duration time').textContent, duration);
  }
  const routes = new Set();
  const recordings = new Set();
  const certainty = { verified: 0, uncertain: 0, unknown: 0 };
  assert.equal(overview.querySelectorAll('.empty-preview').length, 0);
  for (const programme of ['a-friendly-wave', 'island-city', 'other-appearances']) {
    let previousDate = '9999-12-31';
    let reachedUndated = false;
    for (const card of row(programme).querySelectorAll('a')) {
      const route = card.getAttribute('href');
      assert.match(route, /^\/dj\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.equal(routes.has(route), false, route);
      routes.add(route);
      const detail = await page(route);
      assert.equal(detail.querySelector('main h1').textContent, card.querySelector('.content-title').textContent);
      assert.equal(detail.querySelector('main header p').textContent, row(programme).querySelector('h2').textContent);
      assert.match(detail.querySelector('main header p:last-child').textContent, /Graham Van Pelt/);
      assert.equal(detail.querySelector('main > article > a').getAttribute('href'), '/dj/');
      assert.match(detail.querySelector('.recording-duration time').getAttribute('datetime'), /^PT[1-9]\d*S$/);
      const date = detail.querySelector('.broadcast-date time')?.getAttribute('datetime');
      if (date) {
        assert.equal(reachedUndated, false, route);
        assert.ok(date <= previousDate, route);
        previousDate = date;
        certainty.verified++;
        assert.equal(card.querySelector('.item-metadata').textContent, date);
      } else {
        reachedUndated = true;
        const message = detail.querySelector('.broadcast-date dd').textContent;
        assert.equal(card.querySelector('.item-metadata').textContent, message);
        if (message.startsWith('Broadcast date uncertain')) certainty.uncertain++;
        else {
          assert.equal(message, 'Broadcast date unknown');
          certainty.unknown++;
        }
      }
      const listen = [...detail.querySelectorAll('main a')].find(link => link.textContent === 'Listen on Mixcloud');
      const recording = listen.getAttribute('href');
      assert.match(recording, /^https:\/\/www\.mixcloud\.com\/[a-z0-9_-]+\/[a-z0-9_-]+\/$/);
      assert.equal(recordings.has(recording), false, recording);
      recordings.add(recording);
      const sources = [...detail.querySelectorAll('main details a')];
      assert.ok(sources.some(source => source.getAttribute('href').startsWith('https://api.mixcloud.com/')));
      assert.ok(sources.some(source => source.getAttribute('href').startsWith('https://thumbnailer.mixcloud.com/unsafe/0x0/')));
      for (const source of sources) {
        const url = new URL(source.getAttribute('href'));
        assert.equal(url.protocol, 'https:');
        assert.equal(url.username + url.password, '');
      }
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
  assert.deepEqual(certainty, { verified: 126, uncertain: 2, unknown: 4 });
});
