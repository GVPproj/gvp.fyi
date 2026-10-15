import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { tracerRelease, tracerSlug, releaseCategoryIds } from '../lib/release-source.js';

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

// Preserve the legacy tracer contract while validating the authoritative catalogue.
function publicRelease(source, full = false) {
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
  if (!source || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.slug)) throw new Error();
  if (!full && (source.slug !== tracerSlug || !Array.isArray(source.tracks) || source.tracks.length !== audio.size)) throw new Error();
  if (full && !releaseCategoryIds.includes(source.category ?? (source.slug === tracerSlug ? 'miracle-fortress' : ''))) throw new Error();
  if (source.tracks != null && !Array.isArray(source.tracks)) throw new Error();
  const tracks = (source.tracks ?? []).map((track, index) => {
    if (track.track_num !== index + 1 || (!full && !audio.delete(track.audio_url)) ||
      (track.duration !== undefined && (!Number.isFinite(track.duration) || track.duration < 0))) throw new Error();
    if (full && track.audio_url !== undefined &&
      !(typeof track.audio_url === 'string' && /^\/audio\/[a-zA-Z0-9/_-]+\.mp3$/.test(track.audio_url))) throw new Error();
    return { title: text(track.title), track_num: track.track_num, ...(track.audio_url !== undefined && { audio_url: track.audio_url }),
      ...(track.duration !== undefined && { duration: track.duration }) };
  });
  if (!Number.isFinite(Date.parse(text(source.release_date)))) throw new Error();
  if (source.about !== null && typeof source.about !== 'string') throw new Error();
  const metadata = {};
  if (full) {
    metadata.category = source.category ?? 'miracle-fortress';
    for (const key of ['credit', 'display_title', 'youtube_video_id']) {
      if (source[key]) metadata[key] = text(source[key], 5000);
    }
    for (const key of ['album_id', 'art_id', 'player_height']) {
      if (source[key] !== undefined) {
        if (!Number.isSafeInteger(source[key]) || source[key] <= 0) throw new Error();
        metadata[key] = source[key];
      }
    }
  }
  return { ...metadata, slug: source.slug, title: text(source.title), artist: text(source.artist), release_date: source.release_date,
    about: source.about ? text(source.about, 50000) : null, tracks,
    ...(source.display_date && { display_date: text(source.display_date) }),
    ...(source.url && { url: link(source.url) }),
    ...(source.streaming && { streaming: Object.fromEntries(['spotify', 'apple', 'tidal']
      .filter(key => source.streaming[key]).map(key => [key, link(source.streaming[key])])) }) };
}

export async function preparePublishedRelease(env) {
  const full = env.PUBLISHING_CONTENT === 'true';
  const endpoint = env.PUBLISHING_POCKETBASE_URL;
  if (!endpoint) {
    if (full || env.PUBLISHING_BUILD_EMAIL || env.PUBLISHING_BUILD_PASSWORD) throw new Error('Incomplete publishing configuration');
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
    const response = JSON.parse(await request(full ? '/api/publishing/releases' : `/api/publishing/releases/${tracerSlug}`, { headers }, 10 * 1024 * 1024));
    if (full && !Array.isArray(response)) throw new Error();
    const releases = [], allFiles = [], seen = new Set();
    for (const snapshot of full ? response : [response]) {
    const slug = snapshot?.state === 'unpublished' ? snapshot.slug : snapshot?.release?.slug;
    if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || seen.has(slug)) throw new Error();
    seen.add(slug);
    // Only an exact explicit withdrawal can remove the checked-in tracer.
    // null remains reserved for the configuration-unset local catalogue.
    if (snapshot?.state === 'unpublished') {
      if (Object.keys(snapshot).sort().join(',') !== 'revision,slug,state' ||
        typeof snapshot.revision !== 'string' || !snapshot.revision.trim() || (!full && snapshot.slug !== tracerSlug)) throw new Error();
      if (!full) return { release: false, files: [] };
      continue;
    }
    if (!snapshot || 'state' in snapshot || 'slug' in snapshot) throw new Error();
    const release = publicRelease(snapshot.release, full);
    if (full) {
      for (const track of release.tracks) {
        if (track.audio_url) await access(new URL(`../../public${track.audio_url}`, import.meta.url));
      }
    }
    const { artwork } = snapshot;
    if (typeof snapshot.revision !== 'string' || !snapshot.revision || (!full && release?.slug !== tracerSlug)) throw new Error();
    if (!artwork || artwork.path !== `/api/publishing/artwork/${snapshot.revision}` || !/^[a-zA-Z0-9_-]+$/.test(snapshot.revision) || !/^[a-f0-9]{64}$/.test(artwork.sha256)) throw new Error();
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
    releases.push({ ...release, artwork_url: files.at(-1).path,
      publishedArtwork: { src: files.at(-1).path, thumbnail: files.find(file => file.width >= 320)?.path ?? files.at(-1).path,
        srcset: files.map(file => `${file.path} ${file.width}w`).join(', '), width: artwork.width, height: artwork.height } });
    allFiles.push(...files);
    }
    return { release: full ? releases : releases[0], files: allFiles };
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
