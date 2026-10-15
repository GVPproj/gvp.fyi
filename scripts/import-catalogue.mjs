import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { releaseCategoryIds, releaseSlug } from '../src/lib/release-source.js';

const maxBytes = 10 * 1024 * 1024;

export async function repositoryCatalogue() {
  const releases = [];
  for (const category of releaseCategoryIds) {
    const rows = JSON.parse(await readFile(new URL(`../src/data/releases/${category}.json`, import.meta.url)));
    releases.push(...rows.map(row => ({ ...row, slug: releaseSlug(row), category })));
  }
  if (new Set(releases.map(row => row.slug)).size !== releases.length) throw new Error('Duplicate repository release slugs');
  return releases;
}

// Explicit allowlist, no redirects or arbitrary dashboard-supplied fetch targets.
export async function captureArtwork(release) {
  const source = release.artwork_url ?? `https://f4.bcbits.com/img/a${release.art_id}_16.jpg`;
  let bytes;
  if (source.startsWith('/images/music-releases/') && /^\/images\/music-releases\/[a-zA-Z0-9_-]+\.jpg$/.test(source)) {
    bytes = await readFile(new URL(`../public${source}`, import.meta.url));
  } else {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !/^(?:f[0-9]+\.bcbits\.com|is[0-9]+-ssl\.mzstatic\.com)$/.test(url.hostname)) throw new Error('Artwork source is not approved');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok || !/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error('Artwork capture failed');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('Artwork exceeds size limit');
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
  }
  if (!bytes.length || bytes.length > maxBytes) throw new Error('Invalid artwork size');
  const image = sharp(bytes, { limitInputPixels: 16000000 });
  const meta = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(meta.format) || meta.width > 4096 || meta.height > 4096 ||
    (meta.pages ?? 1) !== 1 || (meta.orientation ?? 1) !== 1) throw new Error('Invalid artwork');
  await image.raw().toBuffer(); // Decode fully before any write; retain original bytes.
  return { bytes, type: `image/${meta.format}`, name: `artwork.${meta.format}` };
}

/** Additive import; production requires explicit opt-in. Existing slugs are never adopted. */
export async function importCatalogue({ endpoint, token, publish = false, allowProduction = false }) {
  const base = new URL(endpoint);
  const loopback = base.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(base.hostname);
  const production = allowProduction === true && base.href === 'https://pocketbase-fly-starter.fly.dev/';
  if ((!loopback && !production) ||
    base.pathname !== '/' || base.username || base.password || base.search || base.hash || !token) {
    throw new Error('Catalogue import requires an isolated loopback backend or explicit approved production opt-in, and administrative token');
  }
  async function request(route, body) {
    const response = await fetch(new URL(`/api/${route}`, base), {
      method: body ? 'POST' : 'GET', headers: { Authorization: token }, body,
      redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error('Catalogue import request failed; inspect local records before retrying');
    return response.json();
  }
  const result = { imported: [], skipped: [] };
  for (const release of await repositoryCatalogue()) {
    let exists = false;
    for (const collection of ['publishing_releases', 'publishing_snapshots']) {
      const inventory = await request(`collections/${collection}/records?perPage=1&filter=${encodeURIComponent(`slug="${release.slug}"`)}`);
      if (!Array.isArray(inventory.items) || !Number.isInteger(inventory.totalItems)) throw new Error('Invalid catalogue inventory');
      exists ||= inventory.totalItems > 0;
    }
    if (exists) { result.skipped.push(release.slug); continue; }
    const artwork = await captureArtwork(release);
    const form = new FormData();
    for (const [key, value] of Object.entries(release)) {
      if (key === 'artwork_url' || value == null) continue;
      form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    form.set('published', String(publish === true));
    form.set('artwork', new Blob([artwork.bytes], { type: artwork.type }), artwork.name);
    await request('collections/publishing_releases/records', form);
    result.imported.push(release.slug);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.slice(2).some(arg => !['--publish', '--production'].includes(arg))) throw new Error('Unknown option');
    const result = await importCatalogue({ endpoint: process.env.PUBLISHING_POCKETBASE_URL,
      token: process.env.PUBLISHING_IMPORT_TOKEN, publish: process.argv.includes('--publish'),
      allowProduction: process.argv.includes('--production') });
    console.log(`Imported ${result.imported.length}; skipped ${result.skipped.length}. Publication requires --publish or dashboard Save with Published on.`);
  } catch {
    console.error('Catalogue import failed. Inspect isolated records and artwork sources; no existing records were overwritten.');
    process.exitCode = 1;
  }
}
