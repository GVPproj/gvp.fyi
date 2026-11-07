import { createHash } from 'node:crypto';
import { publishingTransport } from './publishing-transport.mjs';
import { publishingIntegration } from './publishing-integration.mjs';
import sharp from 'sharp';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function publicLike(item) {
  const source = item.data;
  if (!source || typeof source !== 'object' || Array.isArray(source) || source.id !== item.id ||
    !Array.isArray(source.collections) || !Array.isArray(item.assets)) throw new Error();
  const data = { id: item.id };
  for (const [key, max] of Object.entries({ title: 500, url: 8192, description: 10000, commentary: 10000,
    type: 5, body: 100000, attribution: 1000, created: 100, updated: 100, asset: 255 })) {
    const value = source[key];
    if (typeof value !== 'string' || [...value].length > max) throw new Error();
    data[key] = value;
  }
  if (!['', 'quote', 'note'].includes(data.type)) throw new Error();
  if (data.type ? !data.body.trim() || data.asset : !data.title.trim() || !(data.url || data.asset)) throw new Error();
  if (data.url) {
    if (/[\u0000-\u0020\\\\]/.test(data.url)) throw new Error();
    const url = new URL(data.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
  }
  if (item.assets.length !== (data.asset ? 1 : 0) || (data.asset && item.assets[0]?.name !== data.asset)) throw new Error();
  const groups = new Set();
  data.collections = source.collections.map(group => {
    if (!group || typeof group.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(group.id) || groups.has(group.id) ||
      typeof group.name !== 'string' || !group.name.trim() || [...group.name].length > 100) throw new Error();
    groups.add(group.id);
    return { id: group.id, name: group.name };
  });
  return data;
}

export async function preparePublishedContent(env, fetcher = fetch) {
  try {
    const request = await publishingTransport(env, { fetcher, timeout: 30000, limit: 20 * 1024 * 1024 });
    const items = JSON.parse(await request('/api/publishing/current/likes'));
    if (!Array.isArray(items)) throw new Error();
    const files = [], content = [], identities = new Set();
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(item.id) ||
        Object.keys(item).sort().join(',') !== 'assets,data,id' || identities.has(item.id)) throw new Error();
      identities.add(item.id);
      const data = publicLike(item);
      const assets = [], names = new Set();
      for (const asset of item.assets) {
        if (!asset || typeof asset.name !== 'string' || names.has(asset.name) ||
          asset.path !== `/api/publishing/current/likes-assets/${item.id}/${asset.name}` ||
          !/^[a-zA-Z0-9_.-]+$/.test(asset.name) ||
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
      content.push({ id: item.id, data, assets });
    }
    return { content, files };
  } catch {
    throw new Error('Published content build failed: verify publishing configuration, current records and asset integrity');
  }
}

export default function publishedContent() {
  return publishingIntegration('published-content', preparePublishedContent, 'content');
}
