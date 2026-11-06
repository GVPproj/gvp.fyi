import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { publishingTransport } from '../src/integrations/publishing-transport.mjs';

// One-off migration: export to a NEW directory so reruns cannot erase authored MDX.
async function exportSoftware(destination) {
  try {
    await lstat(destination);
    throw new Error('Export destination already exists; choose a new directory');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const request = await publishingTransport(process.env, { timeout: 30000, limit: 20 * 1024 * 1024 });
  const snapshots = JSON.parse(await request('/api/publishing/content'));
  if (!Array.isArray(snapshots)) throw new Error();
  await mkdir(dirname(destination), { recursive: true });
  const staging = await mkdtemp(`${destination}.export-`);
  try {
    const slugs = new Set();
    for (const snapshot of snapshots) {
      if (snapshot.kind !== 'software' || snapshot.state === 'unpublished') continue;
      const { slug, data, assets } = snapshot;
      if (snapshot.state !== 'published' || !/^[a-zA-Z0-9_-]+$/.test(slug) || slugs.has(slug) ||
        !data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(assets)) throw new Error();
      slugs.add(slug);
      const directory = join(staging, slug);
      await mkdir(join(directory, 'assets'), { recursive: true });
      const copied = new Map();
      async function copyImage(source) {
        if (typeof source !== 'string') throw new Error();
        const name = basename(source);
        if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(png|jpe?g|webp|gif)$/i.test(name)) throw new Error();
        const assetName = data.assetNames?.[name] ?? name;
        if (copied.has(name)) return copied.get(name);
        const matches = assets.filter(asset => asset.name === assetName);
        if (matches.length !== 1) throw new Error();
        const asset = matches[0];
        if (!/^\/api\/publishing\/content-assets\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(asset.path) ||
          !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error();
        const bytes = await request(asset.path, 10 * 1024 * 1024);
        if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error();
        await writeFile(join(directory, 'assets', name), bytes);
        const path = `./assets/${name}`;
        copied.set(name, path);
        return path;
      }
      // Keep editorial fields verbatim; drop CMS-only upload aliases and redundant slug.
      const { assetNames, slug: cmsSlug, ...frontmatter } = data;
      frontmatter.screenshot = await copyImage(data.screenshot);
      if (data.gallery !== undefined) {
        frontmatter.gallery = await Promise.all(data.gallery.map(async image => ({ ...image, src: await copyImage(image.src) })));
      }
      // JSON is valid YAML and preserves strings, nested blocks and punctuation losslessly.
      await writeFile(join(directory, 'index.mdx'), `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n`);
    }
    if (!slugs.size) throw new Error();
    await rename(staging, destination);
    console.log(`Exported ${slugs.size} published software projects to ${destination}`);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

try {
  try { loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await exportSoftware(resolve(process.argv[2] ?? 'src/content/software'));
} catch {
  // Never expose response bodies, tokens or credentials on a failed migration.
  console.error('Software export failed: verify restricted publishing credentials, snapshots, asset integrity and a new destination directory');
  process.exitCode = 1;
}
