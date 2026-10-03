import { test } from 'node:test';
import assert from 'node:assert/strict';
import { likesBrowser, settle } from './helpers/likes-browser.js';

const rows = Array.from({ length: 25 }, (_, i) => ({ id: `item${99-i}`, created: '2026-01-01 00:00:00.000Z', title: `Item ${i}`, url: 'https://example.com', published: true }));
test('load more preserves cards, retries the same page and announces exhaustion', async t => {
  const { document, window } = await likesBrowser(t);
  let fail = true, finish;
  globalThis.fetch = async url => {
    if (url.includes('likes_collections')) return Response.json({ items: [], totalPages: 1 });
    if (new URL(url).searchParams.get('filter').includes('created <')) {
      if (fail) throw new Error('offline');
      return new Promise(resolve => { finish = () => resolve(Response.json({ items: [rows[24]] })); });
    }
    return Response.json({ items: rows, totalPages: 1 });
  };
  await import('../src/scripts/likes.js?pagination');
  document.dispatchEvent(new window.Event('astro:page-load'));
  assert.match(document.querySelector('#read-status').textContent, /Loading/);
  await settle();
  const first = document.querySelector('#likes-board li');
  const more = document.querySelector('#load-more');
  assert.equal(document.querySelectorAll('#likes-board li').length, 24);
  assert.equal(more.hidden, false);
  more.click();
  await settle();
  assert.match(document.querySelector('#read-status').textContent, /try again|Retry/i);
  assert.equal(document.querySelector('#likes-board li'), first);
  fail = false;
  document.querySelector('#retry-read').click();
  await settle();
  assert.equal(more.getAttribute('aria-disabled'), 'true');
  finish();
  await settle();
  assert.equal(document.querySelectorAll('#likes-board li').length, 25);
  assert.equal(document.querySelector('#likes-board li'), first);
  assert.match(document.querySelector('#read-status').textContent, /All .*loaded/);
  assert.equal(more.getAttribute('aria-disabled'), 'true');
  more.click();
  await settle();
  assert.equal(document.querySelectorAll('#likes-board li').length, 25);
});

test('filter changes reset the cursor and ignore stale in-flight pages, including failures', async t => {
  const { document, window } = await likesBrowser(t);
  const groups = [{ id: 'reading', name: 'Reading' }, { id: 'empty', name: 'Empty' }];
  let finishOld;
  globalThis.fetch = async url => {
    if (url.includes('likes_collections')) return Response.json({ items: groups, totalPages: 1 });
    const filter = new URL(url).searchParams.get('filter');
    if (filter.includes('created <')) return new Promise(resolve => { finishOld = resolve; });
    if (filter.includes('"reading"')) return Response.json({ items: [{ ...rows[0], title: 'Reading item', collections: ['reading'] }] });
    if (filter.includes('"empty"')) return Response.json({ items: [] });
    return Response.json({ items: rows });
  };
  await import('../src/scripts/likes.js?pagination-filters');
  document.dispatchEvent(new window.Event('astro:page-load'));
  await settle();
  document.querySelector('#load-more').click();
  await settle();
  document.querySelector('[data-collection="reading"]').click();
  assert.equal(document.querySelectorAll('#likes-board li').length, 0);
  await settle();
  assert.equal(document.querySelector('#likes-board h2').textContent, 'Reading item');
  finishOld(Response.json({ items: [rows[24]] }));
  await settle();
  assert.equal(document.querySelectorAll('#likes-board li').length, 1);
  document.querySelector('[data-collection=""]').click();
  await settle();
  assert.equal(document.querySelectorAll('#likes-board li').length, 24);
  document.querySelector('#load-more').click();
  await settle();
  document.querySelector('[data-collection="empty"]').click();
  await settle();
  finishOld(new Response(null, { status: 500 }));
  await settle();
  assert.equal(document.querySelectorAll('#likes-board li').length, 0);
  assert.match(document.querySelector('#read-status').textContent, /No likes in this collection/);
  assert.equal(document.querySelector('#load-more').hidden, true);
  assert.equal(document.querySelector('#retry-read').textContent, 'Reload Likes');
});
