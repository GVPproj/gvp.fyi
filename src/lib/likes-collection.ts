import { readFile } from 'node:fs/promises';
import { getCollection } from 'astro:content';
import { contentImage } from './content-image';
import { root } from 'astro:config/server';

// Vite publishes adjacent downloads; source-directory files are not public by default.
const downloads = import.meta.glob<string>('/src/content/likes/**/*.pdf', {
  eager: true, query: '?url&no-inline', import: 'default',
});

type Media = { url: string; thumbnail?: string; srcset?: string; width?: number; height?: number };

const groups = (await getCollection('namedCollections')).map(entry => entry.data)
  .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

const entries = await getCollection('likes');
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
    collections: data.collections.map(reference => {
      const group = groups.find(group => group.id === reference.id);
      if (!group) throw new Error(`Unknown named collection ${reference.id} in ${entry.id}`);
      return group;
    }),
    media,
  };
}))).sort((a, b) => Date.parse(b.created) - Date.parse(a.created) || b.id.localeCompare(a.id));

// An item may appear in several rows; ungrouped items appear only in Misc.
export const collectionOverview = [...groups, { id: 'misc', name: 'Misc.' }]
  .map(group => {
    const items = likes.filter(item => group.id === 'misc'
      ? !item.collections.length : item.collections.some(collection => collection.id === group.id));
    return { ...group, items, totalItems: items.length };
  }).filter(group => group.totalItems > 0);
