import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { CollectionEntry } from 'astro:content';
import mdxRenderer from '@astrojs/mdx/server.js';
import { parseHTML } from 'linkedom';
import BlogPostBody from '../components/BlogPostBody.astro';
import { resolveWebURL } from './web-url';

const articleTags = new Set(`a abbr b blockquote br caption cite code dd del details div dl dt em
  figcaption figure h1 h2 h3 h4 h5 h6 hr i img kbd li mark ol p pre q s samp small span
  strong sub summary sup table tbody td th thead tfoot tr ul var`.split(/\s+/));
const articleAttributes: Record<string, readonly string[]> = {
  a: ['href'], blockquote: ['cite'], q: ['cite'],
  img: ['src', 'alt', 'width', 'height'], ol: ['start', 'reversed'], li: ['value'],
  td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'], details: ['open'],
};

export async function renderBlogForRSS(entry: CollectionEntry<'blog' | 'musicJournal'>, permalink: URL) {
  const container = await AstroContainer.create();
  container.addServerRenderer({ name: 'astro:jsx', renderer: mdxRenderer });
  const html = await container.renderToString(BlogPostBody, { props: { post: entry } });
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  const body = document.body;

  body.querySelectorAll('script, style, template, noscript, [hidden], input, button, select, textarea')
    .forEach(node => node.remove());
  const embeds = body.querySelectorAll('svg, math, canvas, iframe, object, embed, audio, video');
  for (const node of embeds) {
    if (node.matches('audio, video')) {
      const src = node.getAttribute('src') ?? node.querySelector('source[src]')?.getAttribute('src');
      const url = src && resolveWebURL(src, permalink);
      if (url && !Array.from(body.querySelectorAll('a[href]')).some(anchor =>
        resolveWebURL(anchor.getAttribute('href')!, permalink) === url)) {
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.textContent = node.matches('audio') ? 'Listen to the audio' : 'Watch the video';
        node.replaceWith(link);
        continue;
      }
    }
    node.remove();
  }

  // Keep only portable article markup and never carry site styles, controls or event handlers.
  for (const node of body.querySelectorAll('*')) {
    const tag = node.localName;
    if (!articleTags.has(tag)) {
      node.replaceWith(...Array.from(node.childNodes));
      continue;
    }
    for (const { name, value } of Array.from(node.attributes)) {
      if (name !== 'title' && !articleAttributes[tag]?.includes(name)) {
        node.removeAttribute(name);
      } else if (name === 'href' || name === 'src' || name === 'cite') {
        const url = value.trim() && resolveWebURL(value, permalink);
        if (url) node.setAttribute(name, url);
        else node.removeAttribute(name);
      }
    }
    if (tag === 'img' && !node.hasAttribute('src')) node.replaceWith(node.getAttribute('alt') ?? '');
  }

  if (embeds.length) {
    const paragraph = document.createElement('p');
    const link = document.createElement('a');
    link.setAttribute('href', permalink.href);
    link.textContent = 'View the original post with media on gvp.fyi';
    paragraph.append(link);
    body.append(paragraph);
  }
  return body.innerHTML;
}
