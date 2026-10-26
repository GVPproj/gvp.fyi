import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { publishingTransport } from './publishing-transport.mjs';
import { publishingIntegration } from './publishing-integration.mjs';
import sharp from 'sharp';
import siteSettings from '../config/site-settings.json' with { type: 'json' };

const releaseCategoryIds = siteSettings.categories.releases.map(category => category.id);

const maxArtworkBytes = 10 * 1024 * 1024;

// Validate only the public projection of the authoritative CMS catalogue.
function publicRelease(source) {
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
  if (!releaseCategoryIds.includes(source.category)) throw new Error();
  if (source.tracks != null && !Array.isArray(source.tracks)) throw new Error();
  const tracks = (source.tracks ?? []).map((track, index) => {
    if (track.track_num !== index + 1 ||
      (track.duration !== undefined && (!Number.isFinite(track.duration) || track.duration < 0))) throw new Error();
    if (track.audio_url !== undefined &&
      !(typeof track.audio_url === 'string' && /^\/audio\/[a-zA-Z0-9/_-]+\.mp3$/.test(track.audio_url))) throw new Error();
    return { title: text(track.title), track_num: track.track_num, ...(track.audio_url !== undefined && { audio_url: track.audio_url }),
      ...(track.duration !== undefined && { duration: track.duration }) };
  });
  if (!Number.isFinite(Date.parse(text(source.release_date)))) throw new Error();
  if (source.about !== null && typeof source.about !== 'string') throw new Error();
  const metadata = { category: source.category };
  for (const key of ['credit', 'display_title', 'youtube_video_id']) {
    if (source[key]) metadata[key] = text(source[key], 5000);
  }
  for (const key of ['album_id', 'player_height']) {
    if (source[key] !== undefined) {
      if (!Number.isSafeInteger(source[key]) || source[key] <= 0) throw new Error();
      metadata[key] = source[key];
    }
  }
  return { ...metadata, slug: source.slug, title: text(source.title), artist: text(source.artist), release_date: source.release_date,
    about: source.about ? text(source.about, 50000) : null, tracks,
    ...(source.display_date && { display_date: text(source.display_date) }),
    ...(source.url && { url: link(source.url) }),
    ...(source.streaming && { streaming: Object.fromEntries(['spotify', 'apple', 'tidal']
      .filter(key => source.streaming[key]).map(key => [key, link(source.streaming[key])])) }) };
}

export async function preparePublishedRelease(env, fetcher = fetch) {
  const endpoint = env.PUBLISHING_POCKETBASE_URL;
  if (!endpoint || !env.PUBLISHING_BUILD_EMAIL || !env.PUBLISHING_BUILD_PASSWORD) {
    throw new Error('Incomplete publishing configuration');
  }
  try {
    const request = await publishingTransport(env, { fetcher, timeout: 15000, limit: 1024 * 1024 });
    const response = JSON.parse(await request('/api/publishing/releases', 10 * 1024 * 1024));
    if (!Array.isArray(response)) throw new Error();
    const releases = [], allFiles = [], seen = new Set();
    for (const snapshot of response) {
    const slug = snapshot?.state === 'unpublished' ? snapshot.slug : snapshot?.release?.slug;
    if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || seen.has(slug)) throw new Error();
    seen.add(slug);
    // Withdrawals are explicit tombstones, never public release data.
    if (snapshot?.state === 'unpublished') {
      if (Object.keys(snapshot).sort().join(',') !== 'revision,slug,state' ||
        typeof snapshot.revision !== 'string' || !snapshot.revision.trim()) throw new Error();
      continue;
    }
    if (!snapshot || 'state' in snapshot || 'slug' in snapshot) throw new Error();
    const release = publicRelease(snapshot.release);
    for (const track of release.tracks) {
      if (track.audio_url) await access(new URL(`../../public${track.audio_url}`, import.meta.url));
    }
    const { artwork } = snapshot;
    if (typeof snapshot.revision !== 'string' || !snapshot.revision) throw new Error();
    if (!artwork || artwork.path !== `/api/publishing/artwork/${snapshot.revision}` || !/^[a-zA-Z0-9_-]+$/.test(snapshot.revision) || !/^[a-f0-9]{64}$/.test(artwork.sha256)) throw new Error();
    const source = await request(artwork.path, maxArtworkBytes);
    if (createHash('sha256').update(source).digest('hex') !== artwork.sha256) throw new Error();
    const image = sharp(source, { limitInputPixels: 40_000_000, animated: false });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || metadata.width !== artwork.width || metadata.height !== artwork.height ||
      (metadata.pages ?? 1) !== 1 || (metadata.orientation ?? 1) !== 1) throw new Error();
    const widths = [...new Set([160, 320, 640, 960, artwork.width].filter(width => width <= artwork.width))].sort((a, b) => a - b);
    const files = await Promise.all(widths.map(async width => {
      const bytes = await image.clone().resize({ width }).webp({ quality: 80 }).toBuffer();
      const hash = createHash('sha256').update(bytes).digest('hex');
      return { path: `/published-releases/${hash}-${width}.webp`, bytes, width, type: 'image/webp' };
    }));
    releases.push({ ...release,
      publishedArtwork: { src: files.at(-1).path, thumbnail: files.find(file => file.width >= 320)?.path ?? files.at(-1).path,
        srcset: files.map(file => `${file.path} ${file.width}w`).join(', '), width: artwork.width, height: artwork.height } });
    allFiles.push(...files);
    }
    return { release: releases, files: allFiles };
  } catch {
    // Backend bodies, URLs, credentials and private source data must never reach build logs.
    throw new Error('Published release build failed: verify publishing configuration, snapshot and artwork integrity');
  }
}

/** One authenticated snapshot per build; only its public projection enters Vite. */
export default function publishedRelease() {
  return publishingIntegration('published-release', preparePublishedRelease, 'release');
}
