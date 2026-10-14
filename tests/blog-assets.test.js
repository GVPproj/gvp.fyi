import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBlogMarkdown } from '../src/lib/blog-markdown.js';

test('published blog downloads and images must resolve retained assets', () => {
  for (const markdown of ['[Download](report.pdf)', '[Download](/files/report.pdf)', '![Art](https://example.test/art.png)']) {
    assert.throws(() => renderBlogMarkdown(markdown, { assets: [] }), /Missing blog asset/);
  }
  assert.throws(() => renderBlogMarkdown('[Download](old.pdf)', { assets: [], assetNames: { 'old.pdf': 'missing.pdf' } }), /Missing blog asset/);
  const media = { assets: [{ name: 'saved.pdf', url: '/published-content/hash.pdf' }], assetNames: { 'report.pdf': 'saved.pdf' } };
  assert.match(renderBlogMarkdown('[Download](report.pdf#page=2)', media)[0].html, /href="\/published-content\/hash.pdf#page=2"/);
  assert.match(renderBlogMarkdown('[Project](/software/tipbox) [Reading](https://example.test/paper.pdf)', { assets: [] })[0].html, /href="https:\/\/example.test\/paper.pdf"/);
});
