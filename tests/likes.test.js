import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createLikesAPI, renderItem, webURL } from '../src/lib/likes.js';

test('only absolute web URLs without embedded credentials are navigable', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,hi', '/relative', 'https://user:pass@example.com', 'not a url']) assert.equal(webURL(value), null);
  assert.equal(webURL('https://example.com'), 'https://example.com/');
});

test('supplied text is inert and external destinations are safe', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const title = '<img src=x onerror=alert(1)>';
  const card = renderItem(document, { title, description: '<script>alert(1)</script>', url: 'https://example.com' });
  assert.equal(card.querySelector('h2').textContent, title);
  assert.equal(card.querySelector('script, img'), null);
  assert.equal(card.querySelector('a').target, '_blank');
  assert.equal(card.querySelector('a').rel, 'noopener noreferrer');
  assert.equal(renderItem(document, { title, description: '', url: 'javascript:alert(1)' }).querySelector('a'), null);
});

test('public listing explicitly filters and orders every page without credentials', async () => {
  const requests = [];
  const api = createLikesAPI('https://pb.example', async (url, options) => {
    requests.push([new URL(url), options]);
    return Response.json({ items: [{ id: String(requests.length) }], totalPages: 2 });
  });
  assert.deepEqual(await api.list(), [{ id: '1' }, { id: '2' }]);
  for (const [url, options] of requests) {
    assert.equal(url.searchParams.get('sort'), '-created,-id');
    assert.equal(url.searchParams.get('filter'), 'published=true');
    assert.equal(options.headers, undefined);
  }
});

test('save publishes by default and failed saves do not mutate input', async () => {
  const data = { url: 'https://example.com', title: ' A title ', description: 'Description' };
  const original = { ...data };
  let body;
  const api = createLikesAPI('https://pb.example', async (_, options) => {
    assert.equal(options.headers.Authorization, 'owner-token');
    body = JSON.parse(options.body);
    return new Response('', { status: 403 });
  });
  await assert.rejects(api.save('owner-token', data), /owner account/);
  assert.equal(body.published, true);
  assert.equal(body.title, 'A title');
  assert.deepEqual(data, original);
});

test('read failures and missing configuration are actionable', async () => {
  await assert.rejects(createLikesAPI('').list(), /not configured/);
  await assert.rejects(createLikesAPI('https://pb.example', async () => { throw new Error('offline'); }).list(), /connection/);
});
