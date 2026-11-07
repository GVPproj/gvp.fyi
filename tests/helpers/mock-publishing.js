import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import sharp from 'sharp';
import siteSettings from '../../src/config/site-settings.json' with { type: 'json' };
import { categories, slugOf, dateOf } from './release-catalog.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const email = 'browser-build@example.test';
const password = 'isolated-browser-fixture';
const token = 'browser-fixture-token';

/** Exercise the real publishing adapters without a live CMS or repository fallback. */
export async function startMockPublishing(t) {
  const assets = new Map();
  const content = [];

  const releases = [];
  const categoryIds = siteSettings.categories.releases.map(category => category.id);
  // One test-only cover keeps the entire catalogue offline.
  const bytes = await readFile(new URL('../fixtures/artwork/watery-grave.jpg', import.meta.url));
  const { width, height } = await sharp(bytes).metadata();
  for (const [index, category] of categories.entries()) {
    for (const source of category.releases) {
      const slug = slugOf(source);
      const id = `release-${slug}`;
      const path = `/api/publishing/current/music-assets/${id}/cover.jpg`;
      assets.set(path, bytes);
      releases.push({ id,
        release: { ...source, slug, category: categoryIds[index], release_date: dateOf(source), about: source.about ?? null },
        artwork: { path, width, height, sha256: hash(bytes) },
      });
    }
  }

  const server = createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    try {
      if (req.method === 'POST' && req.url === '/api/collections/publishing_builds/auth-with-password') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const credentials = JSON.parse(Buffer.concat(chunks).toString());
        if (credentials.identity !== email || credentials.password !== password) return json(401, {});
        return json(200, { token, record: { collectionName: 'publishing_builds' } });
      }
      if (req.headers.authorization !== token) return json(401, {});
      if (req.method !== 'GET') return json(405, {});
      if (req.url === '/api/publishing/current/likes') return json(200, content);
      if (req.url === '/api/publishing/current/music') return json(200, releases);
      if (assets.has(req.url)) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        return res.end(assets.get(req.url));
      }
      json(404, {});
    } catch {
      json(400, {});
    }
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    PUBLISHING_POCKETBASE_URL: `http://127.0.0.1:${server.address().port}`,
    PUBLISHING_BUILD_EMAIL: email,
    PUBLISHING_BUILD_PASSWORD: password,
  };
}
