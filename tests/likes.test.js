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

test('commentary is rendered as text, never markup', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const commentary = '<img src=x onerror=alert(1)><script>alert(1)</script>';
  const card = renderItem(document, { url: 'https://example.com', title: 'Title', description: '', commentary });
  assert.ok(card.textContent.includes(commentary));
  assert.equal(card.querySelector('img, script'), null);
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

test('draft listing authenticates and filters every page in saved order', async () => {
  const requests = [];
  const api = createLikesAPI('https://pb.example', async (url, options) => {
    requests.push([new URL(url), options]);
    return Response.json({ items: [{ id: String(requests.length) }], totalPages: 2 });
  });
  assert.deepEqual(await api.listDrafts('owner-token'), [{ id: '1' }, { id: '2' }]);
  for (const [index, [url, options]] of requests.entries()) {
    assert.equal(url.searchParams.get('filter'), 'published=false');
    assert.equal(url.searchParams.get('sort'), '-created,-id');
    assert.equal(url.searchParams.get('page'), String(index + 1));
    assert.equal(options.headers.Authorization, 'owner-token');
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

test('save creates drafts and edits all fields with authenticated PATCH', async () => {
  const requests = [];
  const fields = { url: 'https://example.com', title: ' Edited ', description: ' Summary ', commentary: ' My thoughts ', published: false };
  const api = createLikesAPI('https://pb.example', async (url, options) => {
    requests.push({ url, ...options });
    return Response.json({ id: 'item123', ...JSON.parse(options.body) });
  });
  assert.equal((await api.save('owner-token', fields)).published, false);
  assert.equal((await api.save('owner-token', fields, 'item123')).commentary, 'My thoughts');
  assert.deepEqual(requests.map(({ url, method }) => [url, method]), [
    ['https://pb.example/api/collections/likes_items/records', 'POST'],
    ['https://pb.example/api/collections/likes_items/records/item123', 'PATCH'],
  ]);
  for (const request of requests) {
    assert.equal(request.headers.Authorization, 'owner-token');
    assert.deepEqual(JSON.parse(request.body), {
      url: 'https://example.com/', title: 'Edited', description: 'Summary', commentary: 'My thoughts', published: false,
    });
  }
  assert.equal(fields.title, ' Edited ');
});

test('remove authenticates DELETE, accepts empty 204, and propagates failures', async () => {
  let status = 204;
  const api = createLikesAPI('https://pb.example', async (url, options) => {
    assert.equal(url, 'https://pb.example/api/collections/likes_items/records/item123');
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers.Authorization, 'owner-token');
    return new Response(null, { status });
  });
  await api.remove('owner-token', 'item123');
  for (status of [403, 404, 500]) {
    await assert.rejects(api.remove('owner-token', 'item123'), /owner account|try again/);
  }
});

test('read failures and missing configuration are actionable', async () => {
  await assert.rejects(createLikesAPI('').list(), /not configured/);
  await assert.rejects(createLikesAPI('https://pb.example', async () => { throw new Error('offline'); }).list(), /connection/);
});
