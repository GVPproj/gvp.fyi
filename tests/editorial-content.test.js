import test from 'node:test';
import assert from 'node:assert/strict';
import { editorialInventory } from '../scripts/editorial-source.mjs';
import { importEditorial } from '../scripts/import-editorial.mjs';
import { publishedEntries, materializeSoftware } from '../src/lib/editorial-source.js';
import { renderBlogMarkdown } from '../src/lib/blog-markdown.js';

test('inventory preserves software ordering, nested Tipbox fields and complete prose', async () => {
  const inventory = await editorialInventory();
  const projects = inventory.filter(entry => entry.kind === 'software');
  assert.equal(projects.length, 7);
  assert.deepEqual(projects.map(entry => entry.data.order), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(projects[0].data.team.length, 8);
  assert.equal(projects[0].data.gallery.length, 3);
  assert.equal(projects[0].assets.length, 4);
  assert.equal(projects[0].data.gallery[2].alt, 'A Tipbox.io project board with attached media');
  const post = inventory.find(entry => entry.kind === 'blog');
  const parts = renderBlogMarkdown(post.data.markdown);
  assert.equal(parts.filter(part => part.demo).length, 1);
  const html = parts.map(part => part.html ?? '').join('');
  assert.match(html, /https:\/\/sophiaburke.ca\//);
  assert.match(html, /language-astro/);
  assert.match(html, /stroke-dashoffset on MDN/);
});

test('published content excludes withdrawals, resolves renamed uploads and fails closed', () => {
  assert.deepEqual(publishedEntries([], 'software'), []);
  assert.deepEqual(publishedEntries([{ kind: 'software', slug: 'gone', state: 'unpublished' }], 'software'), []);
  const entry = { slug: 'example', data: { screenshot: '/images/original.png', assetNames: { 'original.png': 'original_random.png' }, gallery: [] }, assets: [{ name: 'original_random.png', url: '/published-content/hash.png' }] };
  assert.equal(materializeSoftware(entry).screenshot, '/published-content/hash.png');
  assert.throws(() => materializeSoftware({ ...entry, assets: [] }), /Missing software asset/);
});

test('Markdown does not execute HTML/MDX or code-fenced demo markers', () => {
  const html = renderBlogMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n```md\n<!-- demo:face -->\n```').map(part => part.html).join('');
  assert.doesNotMatch(html, /<script>|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
  assert.throws(() => renderBlogMarkdown('<!-- demo:face -->\n\n<!-- demo:face -->'), /Only one/);
  assert.throws(() => renderBlogMarkdown('![alt](/images/missing.png)', { assets: [] }), /Missing blog asset/);
  const media = { assets: [{ name: 'renamed.png', url: '/published-content/hash.png' }], assetNames: { 'old.png': 'renamed.png' } };
  assert.match(renderBlogMarkdown('![Editorial alt](/images/old.png)', media)[0].html, /src="\/published-content\/hash.png" alt="Editorial alt"/);
});

test('import is additive, private by default, and maps PB filenames before publishing', async () => {
  const inventory = (await editorialInventory()).slice(0, 1);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, json: async () => url.pathname.endsWith('/editorial-identities') ? [] : options.method === 'GET' ? { items: [], totalItems: 0 } : options.method === 'POST'
      ? { id: 'new', assets: inventory[0].assets.map((_, i) => `stored_${i}.png`) } : {} };
  };
  await importEditorial({ endpoint: 'http://127.0.0.1:8090', token: 'local', inventory, fetchImpl });
  assert.equal(calls[2].body.get('published'), 'false');
  const patched = JSON.parse(calls[3].body);
  assert.equal(patched.published, false);
  assert.equal(patched.data.assetNames['tipboxThumb.webp'], 'stored_0.png');
  calls.length = 0;
  await importEditorial({ endpoint: 'http://127.0.0.1:8090', token: 'local', publish: true, inventory, fetchImpl });
  assert.equal(calls[2].body.get('published'), 'false');
  assert.equal(JSON.parse(calls[3].body).published, true);
  await assert.rejects(importEditorial({ endpoint: 'https://production.example', token: 'no', inventory, fetchImpl }), /loopback/);
  let requests = 0;
  const skipped = await importEditorial({ endpoint: 'http://127.0.0.1:8090', token: 'local', inventory, fetchImpl: async (url) => {
    requests++; return { ok: true, json: async () => url.pathname.endsWith('/editorial-identities') ? [] : ({ items: [{}], totalItems: 1 }) };
  } });
  assert.equal(requests, 2);
  assert.equal(skipped.skipped.length, 1);
});
