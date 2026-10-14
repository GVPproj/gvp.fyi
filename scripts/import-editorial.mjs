import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { editorialInventory } from './editorial-source.mjs';

/** Loopback-only, additive migration. Existing records are never adopted or changed. */
export async function importEditorial({ endpoint, token, publish = false, inventory, fetchImpl = fetch }) {
  const base = new URL(endpoint);
  if (base.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(base.hostname) ||
      base.pathname !== '/' || base.username || base.password || base.search || base.hash) {
    throw new Error('Editorial import requires an isolated loopback PocketBase URL');
  }
  if (!token) throw new Error('Local administrative token required');
  const entries = inventory ?? await editorialInventory();
  async function request(route, method = 'GET', body) {
    const response = await fetchImpl(new URL(`/api/${route}`, base), {
      method, headers: { Authorization: token, ...(!(body instanceof FormData) && { 'Content-Type': 'application/json' }) },
      ...(body !== undefined && { body: body instanceof FormData ? body : JSON.stringify(body) }),
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Editorial import failed (${response.status}); inspect local drafts before retrying`);
    return response.json();
  }
  // Fail closed before creating ANY draft: recreating a retained identity can
  // withdraw its publication even when the working record has been deleted.
  const identities = await request('publishing/editorial-identities');
  if (!Array.isArray(identities) || identities.some(identity =>
    !identity || !['software', 'blog', 'settings'].includes(identity.kind) || typeof identity.slug !== 'string')) {
    throw new Error('Invalid retained editorial identity response');
  }
  const retained = new Set(identities.map(({ kind, slug }) => `${kind}/${slug}`));
  const result = { imported: [], skipped: [] };
  for (const entry of entries) {
    if (retained.has(`${entry.kind}/${entry.slug}`)) { result.skipped.push(`${entry.kind}/${entry.slug}`); continue; }
    const filter = encodeURIComponent(`kind=${JSON.stringify(entry.kind)} && slug=${JSON.stringify(entry.slug)}`);
    const existing = await request(`collections/editorial_entries/records?filter=${filter}`);
    if (!Array.isArray(existing.items) || typeof existing.totalItems !== 'number') throw new Error('Invalid editorial inventory response');
    if (existing.totalItems) { result.skipped.push(`${entry.kind}/${entry.slug}`); continue; }
    const form = new FormData();
    form.set('kind', entry.kind);
    form.set('slug', entry.slug);
    form.set('data', JSON.stringify(entry.data));
    // Always create a draft first: PB renames uploads; publication must see the final mapping.
    form.set('published', 'false');
    for (const asset of entry.assets) {
      const bytes = await readFile(new URL(`../public${asset.source}`, import.meta.url));
      form.append('assets', new Blob([bytes]), asset.name);
    }
    const created = await request('collections/editorial_entries/records', 'POST', form);
    const names = created.assets ?? [];
    if (names.length !== entry.assets.length || !created.id) throw new Error('Incomplete upload; retained draft needs manual review');
    const assetNames = Object.fromEntries(entry.assets.map((asset, index) => [asset.name, names[index]]));
    if (names.length || publish) {
      await request(`collections/editorial_entries/records/${encodeURIComponent(created.id)}`, 'PATCH', {
        data: { ...entry.data, ...(names.length && { assetNames }) }, published: publish,
      });
    }
    result.imported.push(`${entry.kind}/${entry.slug}`);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--publish')) throw new Error('Usage: node scripts/import-editorial.mjs [--publish]');
    const result = await importEditorial({ endpoint: process.env.PUBLISHING_POCKETBASE_URL,
      token: process.env.PUBLISHING_IMPORT_TOKEN, publish: process.argv.includes('--publish') });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof TypeError ? 'Invalid isolated import configuration' : error.message);
    process.exitCode = 1;
  }
}
