import { readFile } from 'node:fs/promises';
import { render } from 'astro:content';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import mdxRenderer from '@astrojs/mdx/server.js';
import { parseHTML } from 'linkedom';
import { getCategorizedCollection } from './categorized-content';
import { root, site } from 'astro:config/server';
import { resolveWebURL } from './web-url';

// Vite publishes adjacent downloads; source-directory files are not public by default.
const downloads = import.meta.glob<string>('/src/content/likes/**/*.pdf', {
  eager: true, query: '?url&no-inline', import: 'default',
});

export async function getLikes() {
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

  return (await Promise.all(entries.map(async entry => {
    const data = entry.data;
    let media: { url: string } | null = null;
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
    let text: string | undefined;
    let summary: string | undefined;
    const links: { label: string; url: string }[] = [];
    if (entry.body?.trim()) {
      // Reuse rendered text for previews and RSS, never Markdown or MDX source.
      const container = await AstroContainer.create();
      container.addServerRenderer({ name: 'astro:jsx', renderer: mdxRenderer });
      const { Content } = await render(entry);
      const html = await container.renderToString(Content);
      const { document } = parseHTML(`<html><body>${html}</body></html>`);
      document.querySelectorAll('script, style, template, iframe, audio, video, button, input, select, textarea, svg, noscript').forEach(node => node.remove());
      summary = document.body.innerText.replace(/\s+/g, ' ').trim();
      if (data.type) text = summary.slice(0, 400);
      for (const anchor of document.querySelectorAll('a[href]')) {
        const url = resolveWebURL(anchor.getAttribute('href')!, new URL(`/likes/${encodeURIComponent(data.slug)}/`, site));
        if (url) links.push({ label: anchor.textContent?.trim() || url, url });
      }
    }
    const assetKind = data.download ? 'pdf' as const : data.image ? 'image' as const : null;
    const source = resolveWebURL(data.url);
    return {
      ...data,
      entry,
      href: `/likes/${encodeURIComponent(data.slug)}`,
      title: data.title || (data.type === 'quote' ? 'Quote' : data.type === 'note' ? 'Personal note'
        : assetKind === 'pdf' ? 'PDF document' : assetKind === 'image' ? 'Image' : 'Link'),
      media,
      assetKind,
      source,
      text,
      summary,
      links,
      label: assetKind === 'pdf' ? 'PDF document' : source ? new URL(source).hostname : 'Link unavailable',
      metadata: data.type ? data.attribution : undefined,
    };
  }))).sort((a, b) => Date.parse(b.created) - Date.parse(a.created) || b.id.localeCompare(a.id));
}
