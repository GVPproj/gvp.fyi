import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { tracerRelease as original, tracerSlug } from '../src/lib/release-source.js';

/** Add one draft to an isolated backend. Never overwrite/adopt an existing slug. */
export async function importRelease({ endpoint, token }) {
  const base = new URL(endpoint);
  if (base.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(base.hostname) ||
    base.pathname !== '/' || base.username || base.password || base.search || base.hash) {
    throw new Error('Tracer import requires an isolated loopback PocketBase URL');
  }
  if (!token) throw new Error('Local administrative token required');
  async function request(route, { body, method = 'GET' } = {}) {
    let response;
    try {
      response = await fetch(new URL(`/api/${route}`, base), {
        method, headers: { Authorization: token, ...(!(body instanceof FormData) && { 'Content-Type': 'application/json' }) },
        ...(body !== undefined && { body: body instanceof FormData ? body : JSON.stringify(body) }),
        redirect: 'error', signal: AbortSignal.timeout(15000),
      });
    } catch { throw new Error('Isolated release import request failed'); }
    if (!response.ok) throw new Error('Isolated release import failed; inspect the local dashboard before retrying (no existing records were overwritten)');
    try { return await response.json(); }
    catch { throw new Error('Invalid isolated import response'); }
  }
  for (const collection of ['publishing_releases', 'publishing_snapshots']) {
    const existing = await request(`collections/${collection}/records?filter=${encodeURIComponent(`slug="${tracerSlug}"`)}`);
    if (!Array.isArray(existing.items)) throw new Error('Invalid release inventory');
    if (existing.totalItems !== 0) throw new Error('Release already exists; refusing to adopt or overwrite it');
  }
  const form = new FormData();
  for (const key of ['title', 'artist', 'release_date', 'display_date', 'about']) form.set(key, original[key] ?? '');
  form.set('slug', tracerSlug);
  form.set('published', 'false');
  form.set('tracks', JSON.stringify(original.tracks));
  form.set('artwork', new Blob([await readFile(new URL(`../public${original.artwork_url}`, import.meta.url))], { type: 'image/jpeg' }), 'watery-grave.jpg');
  return request('collections/publishing_releases/records', { method: 'POST', body: form });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await importRelease({ endpoint: process.env.PUBLISHING_POCKETBASE_URL, token: process.env.PUBLISHING_IMPORT_TOKEN });
    console.log('Imported Watery Grave EP as a private draft. Review tracks/artwork in the local dashboard before publishing.');
  } catch (error) {
    console.error(error instanceof TypeError ? 'Invalid isolated import configuration' : error.message);
    process.exitCode = 1;
  }
}
