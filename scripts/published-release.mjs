import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { tracerRelease, tracerSlug } from '../src/lib/release-source.js';

const virtualId = 'virtual:published-release';
const resolvedId = '\0' + virtualId;
const maxArtworkBytes = 10 * 1024 * 1024;

async function readResponse(response, limit) {
  if (!response.ok) throw new Error('Published release request failed');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('Published release response exceeds limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// This incremental slice replaces one known release, not an arbitrary remote catalogue.
function publicRelease(source) {
  const audio = new Set(tracerRelease.tracks.map(track => track.audio_url));
  const text = (value, max = 500) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error();
    return value;
  };
  const link = value => {
    const url = new URL(text(value, 2048));
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    return url.href;
  };
  if (source.slug !== tracerSlug || !Array.isArray(source.tracks) || source.tracks.length !== audio.size) throw new Error();
  const tracks = source.tracks.map((track, index) => {
    if (track.track_num !== index + 1 || !audio.delete(track.audio_url) ||
      (track.duration !== undefined && (!Number.isFinite(track.duration) || track.duration < 0))) throw new Error();
    return { title: text(track.title), track_num: track.track_num, audio_url: track.audio_url,
      ...(track.duration !== undefined && { duration: track.duration }) };
  });
  if (!Number.isFinite(Date.parse(text(source.release_date)))) throw new Error();
  if (source.about !== null && typeof source.about !== 'string') throw new Error();
  return { slug: source.slug, title: text(source.title), artist: text(source.artist), release_date: source.release_date,
    about: source.about ? text(source.about, 50000) : null, tracks,
    ...(source.display_date && { display_date: text(source.display_date) }),
    ...(source.url && { url: link(source.url) }),
    ...(source.streaming && { streaming: Object.fromEntries(['spotify', 'apple', 'tidal']
      .filter(key => source.streaming[key]).map(key => [key, link(source.streaming[key])])) }) };
}

async function preparePublishedRelease(env) {
  const endpoint = env.PUBLISHING_POCKETBASE_URL;
  if (!endpoint) {
    if (env.PUBLISHING_BUILD_EMAIL || env.PUBLISHING_BUILD_PASSWORD) throw new Error('Incomplete publishing configuration');
    return { release: null, files: [] };
  }
  try {
    const base = new URL(endpoint);
    if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(base.hostname))) ||
      base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error();
    if (!env.PUBLISHING_BUILD_EMAIL || !env.PUBLISHING_BUILD_PASSWORD) throw new Error();
    async function request(route, options = {}, limit = 1024 * 1024) {
      return readResponse(await fetch(new URL(route, base), {
        ...options, redirect: 'error', signal: AbortSignal.timeout(15000),
      }), limit);
    }
    const auth = JSON.parse(await request('/api/collections/publishing_builds/auth-with-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: env.PUBLISHING_BUILD_EMAIL, password: env.PUBLISHING_BUILD_PASSWORD }),
    }));
    if (typeof auth.token !== 'string' || !auth.token || auth.record?.collectionName !== 'publishing_builds') throw new Error();
    const headers = { Authorization: auth.token };
    const snapshot = JSON.parse(await request(`/api/publishing/releases/${tracerSlug}`, { headers }));
    // Only an exact explicit withdrawal can remove the checked-in tracer.
    // null remains reserved for the configuration-unset local catalogue.
    if (snapshot?.state === 'unpublished') {
      if (Object.keys(snapshot).sort().join(',') !== 'revision,slug,state' ||
        typeof snapshot.revision !== 'string' || !snapshot.revision.trim() || snapshot.slug !== tracerSlug) throw new Error();
      return { release: false, files: [] };
    }
    if (!snapshot || 'state' in snapshot || 'slug' in snapshot) throw new Error();
    const release = publicRelease(snapshot.release);
    const { artwork } = snapshot;
    if (typeof snapshot.revision !== 'string' || !snapshot.revision || release?.slug !== tracerSlug) throw new Error();
    if (!artwork || !/^\/api\/publishing\/[a-zA-Z0-9/_-]+$/.test(artwork.path) || !/^[a-f0-9]{64}$/.test(artwork.sha256)) throw new Error();
    const source = await request(artwork.path, { headers }, maxArtworkBytes);
    if (createHash('sha256').update(source).digest('hex') !== artwork.sha256) throw new Error();
    const image = sharp(source, { limitInputPixels: 40_000_000, animated: false });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || metadata.width !== artwork.width || metadata.height !== artwork.height ||
      (metadata.pages ?? 1) !== 1 || (metadata.orientation ?? 1) !== 1) throw new Error();
    const widths = [...new Set([160, 320, 640, 960, artwork.width].filter(width => width <= artwork.width))].sort((a, b) => a - b);
    const files = await Promise.all(widths.map(async width => {
      const bytes = await image.clone().resize({ width }).webp({ quality: 80 }).toBuffer();
      const hash = createHash('sha256').update(bytes).digest('hex');
      return { path: `/published-releases/${hash}-${width}.webp`, bytes, width };
    }));
    return { release: { ...release, artwork_url: files.at(-1).path,
      publishedArtwork: { src: files.at(-1).path, thumbnail: files.find(file => file.width >= 320)?.path ?? files.at(-1).path,
        srcset: files.map(file => `${file.path} ${file.width}w`).join(', '), width: artwork.width, height: artwork.height } }, files };
  } catch {
    // Backend bodies, URLs, credentials and private source data must never reach build logs.
    throw new Error('Published release build failed: verify publishing configuration, snapshot and artwork integrity');
  }
}

/** One authenticated snapshot per build; only its public projection enters Vite. */
export default function publishedRelease() {
  let prepared;
  return {
    name: 'published-release',
    hooks: {
      'astro:config:setup': async ({ updateConfig }) => {
        prepared = await preparePublishedRelease(process.env);
        updateConfig({ vite: { plugins: [{ name: 'published-release-data',
          resolveId(id) { if (id === virtualId) return resolvedId; },
          load(id) { if (id === resolvedId) return `export default ${JSON.stringify(prepared.release)};`; },
        }] } });
      },
      'astro:build:done': async ({ dir }) => {
        for (const file of prepared.files) {
          const target = new URL(file.path.slice(1), dir);
          await mkdir(new URL('.', target), { recursive: true });
          await writeFile(target, file.bytes);
        }
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use((req, res, next) => {
          const file = prepared.files.find(file => file.path === req.url);
          if (!file) return next();
          res.setHeader('Content-Type', 'image/webp');
          res.end(file.bytes);
        });
      },
    },
  };
}
