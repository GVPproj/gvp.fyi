import { readFile } from 'node:fs/promises';
import { getCategorizedCollection } from './categorized-content';
import { contentImage } from './content-image';
import { root } from 'astro:config/server';
import { categorySettings } from './site-settings';

// Vite publishes adjacent downloads; source-directory files are not public by default.
const downloads = import.meta.glob<string>('/src/content/likes/**/*.pdf', {
  eager: true, query: '?url&no-inline', import: 'default',
});

type Media = { url: string; thumbnail?: string; srcset?: string; width?: number; height?: number };

const categories = [...categorySettings('likes')]
  .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

const entries = await getCategorizedCollection('likes');
const routes = new Set<string>();
for (const { data } of entries) {
  for (const route of [data.id, data.slug]) {
    if (routes.has(route)) throw new Error(`Duplicate or conflicting Likes route: /likes/${route}`);
    routes.add(route);
  }
}

export const likes = (await Promise.all(entries.map(async entry => {
  const data = entry.data;
  let media: Media | null = null;
  if (data.image) {
    const image = await contentImage(data.image);
    media = { url: data.image.src, thumbnail: data.image.width < 320 ? data.image.src : image.thumbnail,
      srcset: image.srcset, width: image.width, height: image.height };
  } else if (data.download) {
    const path = `${entry.filePath!.slice(0, entry.filePath!.lastIndexOf('/'))}/${data.download.slice(2)}`;
    const url = downloads[`/${path}`];
    const bytes = await readFile(new URL(path, root)).catch(() => null);
    if (!url || bytes?.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error(`Missing or invalid PDF download in Likes entry ${entry.id}: ${data.download}`);
    }
    media = { url };
  }
  return {
    ...data,
    media,
  };
}))).sort((a, b) => Date.parse(b.created) - Date.parse(a.created) || b.id.localeCompare(a.id));

export const collectionOverview = categories.map(category => {
  const items = likes.filter(item => item.category === category.id);
  return { id: category.id, name: category.title, items, totalItems: items.length };
}).filter(category => category.totalItems > 0);
