import { readFile } from 'node:fs/promises';
import { render } from 'astro:content';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import mdxRenderer from '@astrojs/mdx/server.js';
import { parseHTML } from 'linkedom';
import { getCategorizedCollection } from './categorized-content';
import { root } from 'astro:config/server';
import { categorySettings } from './site-settings';
import type { ContentRowItem } from '../components/ContentRow.astro';
import { webURL, likesItemURL, likeItemTitle, likeAssetKind } from './likes.js';

// Vite publishes adjacent downloads; source-directory files are not public by default.
const downloads = import.meta.glob<string>('/src/content/likes/**/*.pdf', {
  eager: true, query: '?url&no-inline', import: 'default',
});

type Media = { url: string };

const categories = [...categorySettings('likes')]
  .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

const entries = await getCategorizedCollection('likes');
const routes = new Set<string>();
for (const { data, body, id } of entries) {
  if (data.type && !body?.trim()) {
    throw new Error(`Quotes and notes require a Markdown body in Likes entry ${id}`);
  }
  for (const route of [data.id, data.slug]) {
    if (routes.has(route)) throw new Error(`Duplicate or conflicting Likes route: /likes/${route}`);
    routes.add(route);
  }
}

export const likes = (await Promise.all(entries.map(async entry => {
  const data = entry.data;
  let media: Media | null = null;
  if (data.image) {
    media = { url: data.image.src };
  } else if (data.download) {
    const path = `${entry.filePath!.slice(0, entry.filePath!.lastIndexOf('/'))}/${data.download.slice(2)}`;
    const url = downloads[`/${path}`];
    const bytes = await readFile(new URL(path, root)).catch(() => null);
    if (!url || bytes?.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error(`Missing or invalid PDF download in Likes entry ${entry.id}: ${data.download}`);
    }
    media = { url };
  }
  let preview: string | undefined;
  if (data.type) {
    // Render first so previews contain readable text, never Markdown or MDX source.
    const container = await AstroContainer.create();
    container.addServerRenderer({ name: 'astro:jsx', renderer: mdxRenderer });
    const { Content } = await render(entry);
    const html = await container.renderToString(Content);
    const { document } = parseHTML(`<html><body>${html}</body></html>`);
    document.querySelectorAll('script, style, template').forEach(node => node.remove());
    preview = document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 400);
  }
  return {
    ...data,
    entry,
    media,
    preview,
  };
}))).sort((a, b) => Date.parse(b.created) - Date.parse(a.created) || b.id.localeCompare(a.id));

export const collectionOverview = categories.map(category => ({
  id: category.id,
  name: category.title,
  items: likes.filter(item => item.category === category.id).map((item): ContentRowItem => {
    const textItem = item.type === 'quote' || item.type === 'note';
    const url = webURL(item.url);
    return {
      href: likesItemURL(item),
      title: likeItemTitle(item),
      image: item.image,
      text: item.preview,
      label: likeAssetKind(item) === 'pdf' ? 'PDF document' : url ? new URL(url).hostname : 'Link unavailable',
      metadata: textItem ? item.attribution : undefined,
    };
  }),
})).filter(category => category.items.length > 0);
