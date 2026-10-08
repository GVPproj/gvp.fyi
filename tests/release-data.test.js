import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { releases, slugOf } from './helpers/release-catalog.js';

test('Release content has usable metadata, unique routes and existing local assets', () => {
  assert.ok(releases.length > 0);
  const slugs = releases.map(slugOf);
  assert.ok(slugs.every(Boolean));
  assert.equal(new Set(slugs).size, releases.length, 'Release routes must not collide');
  for (const release of releases) {
    assert.ok(release.title?.trim());
    assert.ok(release.artist?.trim());
    assert.ok(Number.isFinite(Date.parse(release.release_date)));
    assert.ok(release.artwork_url || release.art_id, `${release.title} needs a cover`);
    const assets = [release.artwork_url, ...release.tracks.map(track => track.audio_url)];
    for (const asset of assets.filter(url => url?.startsWith('/'))) {
      assert.ok(existsSync(new URL(`../public${asset}`, import.meta.url)), `Missing asset: ${asset}`);
    }
  }
});
