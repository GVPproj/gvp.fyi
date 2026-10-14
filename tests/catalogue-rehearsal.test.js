import test from 'node:test';
import assert from 'node:assert/strict';
import { start } from './helpers/publishing-pocketbase.js';
import { importCatalogue, repositoryCatalogue } from '../scripts/import-catalogue.mjs';
import { importEditorial } from '../scripts/import-editorial.mjs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

test('complete catalogue import captures existing remote artwork and preserves all metadata', {
  skip: !(process.env.POCKETBASE_BINARY && process.env.RUN_CATALOGUE_CAPTURE === 'true') && 'Opt-in network/artwork rehearsal', timeout: 600000,
}, async t => {
  const pb = await start(t);
  const result = await importCatalogue({ endpoint: pb.base, token: pb.adminToken, publish: true });
  assert.equal(result.imported.length, 36);
  assert.equal(result.skipped.length, 0);
  const records = await pb.request('collections/publishing_releases/records?perPage=100', { token: pb.adminToken });
  assert.equal(records.status, 200);
  assert.equal(records.data.items.length, 36);
  const original = await repositoryCatalogue();
  for (const source of original) {
    const record = records.data.items.find(row => row.slug === source.slug);
    assert.ok(record, source.slug);
    for (const key of ['title', 'artist', 'category', 'credit', 'display_title', 'album_id', 'art_id', 'youtube_video_id', 'tracks']) {
      if (source[key] !== undefined && source[key] !== null) assert.deepEqual(record[key], source[key], `${source.slug}: ${key}`);
    }
    assert.ok(record.artwork);
    assert.equal(record.published, true);
  }
  const email = 'build@example.test', password = 'fixture-build-password';
  assert.equal((await pb.request('collections/publishing_builds/records', { token: pb.adminToken, method: 'POST', body: { email, password, passwordConfirm: password } })).status, 200);
  const auth = await pb.request('collections/publishing_builds/auth-with-password', { method: 'POST', body: { identity: email, password } });
  const snapshots = await pb.request('publishing/releases', { token: auth.data.token });
  assert.equal(snapshots.status, 200);
  assert.equal(snapshots.data.length, 36);
  assert.equal(snapshots.data.reduce((n, snapshot) => n + snapshot.release.tracks.length, 0), 138);
  const editorial = await importEditorial({ endpoint: pb.base, token: pb.adminToken, publish: true });
  assert.equal(editorial.imported.length, 9);
  const dir = await mkdtemp(fileURLToPath(new URL('../.astro/catalogue-build-', import.meta.url)));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const child = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', dir], {
    env: { ...process.env, PUBLISHING_CONTENT: 'true', PUBLISHING_POCKETBASE_URL: pb.base,
      PUBLISHING_BUILD_EMAIL: email, PUBLISHING_BUILD_PASSWORD: password, ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
  const [code] = await once(child, 'exit'); assert.equal(code, 0, output);
  for (const source of original) {
    const html = await readFile(join(dir, `music-releases/${source.slug}/index.html`), 'utf8');
    assert.match(html, /published-releases\//);
    assert.doesNotMatch(html, /fixture-build-password|api\/publishing/);
  }
  for (const slug of ['tipbox', 'bloom-bnb', 'biolink', 'groundwaves', 'quizzical', 'tenzies', 'colour-scheme-generator']) {
    assert.match(await readFile(join(dir, `software/${slug}/index.html`), 'utf8'), /published-content\//);
  }
  const article = await readFile(join(dir, 'blog/the-animated-face/index.html'), 'utf8');
  assert.match(article, /Sophia/);
  assert.match(article, /svg/);
});
