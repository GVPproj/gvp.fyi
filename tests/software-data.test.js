import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { softwareProjects } from './fixtures/software-projects.ts';
import { materializeSoftware, publishedEntries } from '../src/lib/editorial-source.js';

test('Software rendering fixtures have unique routes, project information and test-only screenshots', () => {
  assert.equal(softwareProjects.length, 7);
  assert.deepEqual(softwareProjects.filter(project => project.category === 'portfolio').map(project => project.slug), ['tipbox', 'biolink']);
  assert.deepEqual(softwareProjects.filter(project => project.category === 'small-websites').map(project => project.slug), ['groundwaves']);
  assert.deepEqual(softwareProjects.filter(project => project.category === 'early-projects').map(project => project.slug), ['bloom-bnb', 'quizzical', 'tenzies', 'colour-scheme-generator']);
  assert.equal(new Set(softwareProjects.map(project => project.slug)).size, softwareProjects.length);
  for (const project of softwareProjects) {
    assert.match(project.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(project.title.trim());
    assert.ok(project.description.trim());
    assert.ok(project.tooling.length > 0);
    assert.ok(project.url || project.repo, `${project.title} needs a project link`);
    for (const url of [project.url, project.repo].filter(Boolean)) assert.equal(new URL(url).protocol, 'https:');
    for (const image of [
      { src: project.screenshot, width: project.screenshotWidth, height: project.screenshotHeight },
      ...(project.gallery ?? []),
    ]) {
      assert.ok(image.src.startsWith('/images/software/'));
      assert.ok(existsSync(new URL(`./fixtures/software/${image.src.split('/').at(-1)}`, import.meta.url)), `Missing image: ${image.src}`);
      assert.ok(image.width > 0 && image.height > 0);
    }
  }
  const tipbox = softwareProjects.find(project => project.title === 'Tipbox.io');
  assert.ok(tipbox.role.paragraphs.join(' ').includes('GraphQL'));
  assert.equal(tipbox.team.length, 8);
  assert.equal(tipbox.gallery.length, 3);
});

test('Published software materializes retained assets, not fixture paths', () => {
  for (const project of softwareProjects) {
    const assets = [project.screenshot, ...(project.gallery ?? []).map(image => image.src)].map(source => ({
      name: source.split('/').at(-1), url: `/published-content/${source.split('/').at(-1)}`,
      width: 320, height: 200, srcset: '/published-content/small.webp 160w',
    }));
    const entry = { kind: 'software', slug: project.slug, state: 'published', data: project, assets };
    const result = materializeSoftware(publishedEntries([entry], 'software')[0]);
    assert.equal(result.screenshot, assets[0].url);
    assert.equal(result.screenshotWidth, 320);
    assert.equal(result.screenshotHeight, 200);
    assert.equal(result.screenshotSrcset, assets[0].srcset);
    assert.deepEqual(result.gallery?.map(image => image.src) ?? [], assets.slice(1).map(asset => asset.url));
    assert.throws(() => materializeSoftware({ ...entry, assets: [] }), /Missing software asset/);
    assert.deepEqual(publishedEntries([{ ...entry, state: 'unpublished' }], 'software'), []);
  }
  assert.deepEqual(publishedEntries([], 'software'), []);
});
