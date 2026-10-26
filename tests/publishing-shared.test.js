import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparePublishedRelease } from '../src/integrations/published-release.mjs';
import { preparePublishedContent } from '../src/integrations/published-content.mjs';
import { publishingTransport } from '../src/integrations/publishing-transport.mjs';
import { publishingIntegration } from '../src/integrations/publishing-integration.mjs';

const env = { PUBLISHING_POCKETBASE_URL: 'http://127.0.0.1:8090', PUBLISHING_BUILD_EMAIL: 'build@example.test', PUBLISHING_BUILD_PASSWORD: 'private-password' };
const auth = { token: 'private-token', record: { collectionName: 'publishing_builds' } };
for (const [name, prepare, route] of [
  ['release', preparePublishedRelease, '/api/publishing/releases'],
  ['content', preparePublishedContent, '/api/publishing/content'],
]) {
  test(`${name}: authenticates once and routes published data`, async () => {
    const requests = [];
    const result = await prepare(env, async (url, options) => {
      requests.push(url.pathname);
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      if (requests.length === 1) {
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), { identity: env.PUBLISHING_BUILD_EMAIL, password: env.PUBLISHING_BUILD_PASSWORD });
        return Response.json(auth);
      }
      assert.deepEqual(options.headers, { Authorization: auth.token });
      return Response.json([]);
    });
    assert.deepEqual(requests, ['/api/collections/publishing_builds/auth-with-password', route]);
    assert.deepEqual(result, { [name]: [], files: [] });
    await assert.rejects(prepare(env, async () => { throw new Error('private transport failure'); }), error => {
      assert.match(error.message, /build failed: verify publishing configuration/);
      assert.doesNotMatch(error.message, /private|8090/);
      assert.equal(error.cause, undefined);
      return true;
    });
  });
}

const transportOptions = { timeout: 1000, limit: 1024 };

test('transport rejects malformed authentication and failed responses', async () => {
  for (const response of [Response.json({ ...auth, token: 42 }), Response.json({ ...auth, record: { collectionName: '_superusers' } }), new Response('private-body', { status: 500 }), new Response(null), new Response('invalid JSON private-body')]) {
    let calls = 0;
    await assert.rejects(publishingTransport(env, { ...transportOptions, fetcher: async () => { calls++; return response; } }));
    assert.equal(calls, 1);
  }
});

test('transport rejects unsafe endpoints and missing credentials before fetching', async () => {
  const options = { ...transportOptions, fetcher: () => assert.fail('must not fetch') };
  for (const endpoint of ['', 'http://example.test', 'https://user:password@example.test', 'https://example.test/path', 'https://example.test/?secret', 'https://example.test/#secret']) {
    await assert.rejects(publishingTransport({ ...env, PUBLISHING_POCKETBASE_URL: endpoint }, options));
  }
  for (const key of Object.keys(env)) {
    await assert.rejects(publishingTransport({ ...env, [key]: '' }, options));
  }
});

test('transport bounds streamed authentication and data responses, including exact-limit success', async () => {
  const authBytes = Buffer.from(JSON.stringify(auth));
  await assert.rejects(publishingTransport(env, { timeout: 1000, limit: authBytes.length - 1, fetcher: async () => new Response(authBytes) }));
  const request = await publishingTransport(env, { timeout: 1000, limit: authBytes.length, fetcher: async url => {
    if (url.pathname.includes('auth-with-password')) return new Response(authBytes);
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(Buffer.from('abc'));
      controller.enqueue(Buffer.from('def'));
      controller.close();
    } }));
  } });
  assert.equal((await request('/api/publishing/content', 6)).toString(), 'abcdef');
  await assert.rejects(request('/api/publishing/content', 5));
});

test('shared Astro wiring projects only public data and serves/copies media unchanged', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'publishing-wiring-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const files = [
    { path: '/published-releases/art.webp', bytes: Buffer.from('webp'), type: 'image/webp' },
    { path: '/published-content/note.pdf', bytes: Buffer.from('%PDF-'), type: 'application/pdf' },
  ];
  let preparations = 0, plugin, middleware;
  const integration = publishingIntegration('fixture', async () => {
    preparations++;
    return { public: [{ title: 'Public' }], private: 'never-export', files };
  }, 'public');
  await integration.hooks['astro:config:setup']({ updateConfig(config) { [plugin] = config.vite.plugins; } });
  assert.equal(plugin.resolveId('other'), undefined);
  assert.equal(plugin.load('other'), undefined);
  assert.equal(plugin.load(plugin.resolveId('virtual:fixture')), 'export default [{"title":"Public"}];');
  integration.hooks['astro:server:setup']({ server: { middlewares: { use(handler) { middleware = handler; } } } });
  for (const file of files) {
    middleware({ url: file.path }, {
      setHeader(name, value) { assert.equal(name, 'Content-Type'); assert.equal(value, file.type); },
      end(bytes) { assert.deepEqual(bytes, file.bytes); },
    }, () => assert.fail('known file'));
  }
  let next = 0;
  middleware({ url: '/missing' }, {}, () => next++);
  assert.equal(next, 1);
  await integration.hooks['astro:build:done']({ dir: pathToFileURL(`${dir}/`) });
  for (const file of files) assert.deepEqual(await readFile(join(dir, file.path)), file.bytes);
  assert.equal(preparations, 1);
});
