import { createHash } from 'node:crypto';
import { publishingTransport } from './publishing-transport.mjs';
import { publishingIntegration } from './publishing-integration.mjs';
import sharp from 'sharp';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function validateLinks(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['href', 'url', 'repo'].includes(key) && child) {
      if (typeof child !== 'string' || /[\u0000-\u0020\\\\]/.test(child)) throw new Error();
      if (!(child.startsWith('/') && !child.startsWith('//')) && !child.startsWith('#')) {
        const url = new URL(child);
        if (!['https:', 'http:', 'mailto:'].includes(url.protocol) || url.username || url.password) throw new Error();
      }
    }
    validateLinks(child);
  }
}

export async function preparePublishedContent(env, fetcher = fetch) {
  try {
    const request = await publishingTransport(env, { fetcher, timeout: 30000, limit: 20 * 1024 * 1024 });
    const snapshots = JSON.parse(await request('/api/publishing/content'));
    if (!Array.isArray(snapshots)) throw new Error();
    const files = [], content = [], identities = new Set();
    for (const snapshot of snapshots) {
      // Site settings live in Git; legacy CMS settings and their assets are unused.
      if (snapshot?.kind === 'settings') continue;
      if (!snapshot || !['software', 'like'].includes(snapshot.kind) ||
        typeof snapshot.slug !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(snapshot.slug) ||
        typeof snapshot.revision !== 'string' || !snapshot.revision ||
        !['published', 'unpublished'].includes(snapshot.state)) throw new Error();
      const identity = `${snapshot.kind}/${snapshot.slug}`;
      if (identities.has(identity)) throw new Error();
      identities.add(identity);
      if (snapshot.state === 'unpublished') {
        content.push({ revision: snapshot.revision, kind: snapshot.kind, slug: snapshot.slug, state: snapshot.state });
        continue;
      }
      if (!snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data) || !Array.isArray(snapshot.assets)) throw new Error();
      validateLinks(snapshot.data);
      const assets = [], names = new Set();
      for (const asset of snapshot.assets) {
        if (!asset || typeof asset.name !== 'string' || names.has(asset.name) ||
          !/^\/api\/publishing\/content-assets\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(asset.path) ||
          !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error();
        names.add(asset.name);
        const bytes = await request(asset.path, 10 * 1024 * 1024);
        if (hash(bytes) !== asset.sha256) throw new Error();
        const pdf = bytes.subarray(0, 5).toString() === '%PDF-';
        let extension, variants = [], width, height;
        if (pdf) extension = 'pdf';
        else {
          const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
          const metadata = await image.metadata();
          extension = ({ jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' })[metadata.format];
          if (!extension) throw new Error();
          const swapsAxes = (metadata.orientation ?? 1) >= 5;
          width = swapsAxes ? metadata.height : metadata.width;
          height = swapsAxes ? metadata.width : metadata.height;
          for (const size of [...new Set([160, 320, 640, 960, width].filter(size => size <= width))]) {
            const output = await image.clone().rotate().resize({ width: size }).webp({ quality: 80 }).toBuffer();
            const path = `/published-content/${hash(output)}-${size}.webp`;
            files.push({ path, bytes: output, type: 'image/webp' });
            variants.push({ path, width: size });
          }
        }
        const url = `/published-content/${asset.sha256}.${extension}`;
        files.push({ path: url, bytes, type: pdf ? 'application/pdf' : `image/${extension === 'jpg' ? 'jpeg' : extension}` });
        assets.push({ name: asset.name, path: asset.path, sha256: asset.sha256, url, width, height,
          thumbnail: variants.find(v => v.width >= 320)?.path ?? url,
          srcset: variants.map(v => `${v.path} ${v.width}w`).join(', ') });
      }
      content.push({ revision: snapshot.revision, kind: snapshot.kind, slug: snapshot.slug,
        state: 'published', data: snapshot.data, assets });
    }
    return { content, files };
  } catch {
    throw new Error('Published content build failed: verify publishing configuration, snapshots and asset integrity');
  }
}

export default function publishedContent() {
  return publishingIntegration('published-content', preparePublishedContent, 'content');
}
