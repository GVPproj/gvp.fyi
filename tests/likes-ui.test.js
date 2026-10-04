import { test } from 'node:test';
import assert from 'node:assert/strict';
import { likesBrowser, settle, login, logout } from './helpers/likes-browser.js';

test('board states, owner save, failed-save retention, and sign out', async t => {
  const { document, window } = await likesBrowser(t);
  let items = [], failRead = false, failSave = false;
  globalThis.fetch = async (url, options) => {
    if (new URL(url).pathname === '/api/likes/duplicates' && options.method === 'POST') return Response.json({ items: [] });
    if (options.method === 'POST') {
      if (failSave) return new Response('', { status: 403 });
      items = [{ id: 'saved', ...JSON.parse(options.body) }];
      return Response.json(items[0]);
    }
    if (failRead) throw new Error('offline');
    if (url.includes('/likes_collections/')) return Response.json({ items: [], totalPages: 1 });
    const draft = new URL(url).searchParams.get('filter') === 'published=false';
    return Response.json({ items: items.filter(item => item.published !== draft), totalPages: 1 });
  };
  await import('../src/scripts/likes.js');
  document.dispatchEvent(new window.Event('astro:page-load'));
  assert.equal(document.querySelector('#read-status').textContent, 'Loading Likes…');
  await settle();
  assert.equal(document.querySelector('#read-status').textContent, 'No likes yet.');
  failRead = true;
  document.querySelector('#retry-read').click();
  await settle();
  assert.match(document.querySelector('#read-status').textContent, /connection.*Retry/);
  failRead = false;
  await login();
  const save = document.querySelector('#save-link');
  assert.equal(save.hidden, false);
  save.querySelector('[name=url]').value = 'https://example.com';
  save.querySelector('[name=title]').value = 'My like';
  save.querySelector('[name=description]').value = 'A description';
  failSave = true;
  save.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await settle();
  assert.equal(save.hidden, true, 'Rejected authentication hides private editor contents');
  assert.equal(document.querySelector('#session-expired').hidden, false);
  assert.match(document.querySelector('#session-expired').textContent, /recover your unsaved edit/);
  failSave = false;
  await login();
  assert.equal(save.querySelector('[name=title]').value, 'My like');
  save.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await settle();
  assert.equal(document.querySelector('#likes-board h2').textContent, 'My like');
  assert.equal(save.querySelector('[name=title]').value, '');
  logout();
  assert.equal(save.hidden, true);
  assert.equal(document.querySelector('#owner-login'), null);
});
