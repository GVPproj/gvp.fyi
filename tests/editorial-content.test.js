import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedEntries, materializeSoftware } from '../src/lib/editorial-source.js';
import { renderBlogMarkdown } from '../src/lib/blog-markdown.js';
import { editorialFixtures } from './helpers/editorial.js';

test('Markdown renders links and fenced code alongside the native face demo', async () => {
  const post = (await editorialFixtures()).find(entry => entry.kind === 'blog');
  const parts = renderBlogMarkdown(post.data.markdown);
  assert.equal(parts.filter(part => part.demo).length, 1);
  const html = parts.map(part => part.html ?? '').join('');
  assert.match(html, /href="https:\/\/example.test\/reference"/);
  assert.match(html, /language-astro/);
  assert.match(html, /&lt;Face/);
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
