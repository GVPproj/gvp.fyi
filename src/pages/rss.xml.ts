import type { APIRoute } from 'astro';
import rss, { type RSSFeedItem } from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { getLikes } from '../lib/likes-collection';
import { getSoftwareProjects } from '../lib/software-projects';
import { getMusicReleases } from '../lib/music-releases';
import { getRadioEpisodes } from '../lib/radio-episodes';
import { categorySettings, siteSettings } from '../lib/site-settings';
import { resolveWebURL } from '../lib/web-url';

type FeedEntry = {
  kind: 'Blog' | 'Likes' | 'Software' | 'Music' | 'Radio';
  id: string;
  title: string;
  date: string;
  href: string;
  description: string;
};

export const prerender = true;

// RSS descriptions are HTML inside XML. Escape text at the HTML boundary as well
// as letting @astrojs/rss escape the outer XML.
function escapeHTML(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function paragraph(value: string | undefined) {
  return value ? `<p>${escapeHTML(value)}</p>` : '';
}

export const GET: APIRoute = async ({ site }) => {
  if (!site) throw new Error('RSS requires a configured site URL');
  const items: (RSSFeedItem & { identity: string; pubDate: Date })[] = [];
  const identities = new Set<string>();
  function link(label: string, value: string | null | undefined) {
    if (!value) return '';
    const url = resolveWebURL(value, site);
    return url ? `<p><a href="${escapeHTML(url)}">${escapeHTML(label)}</a></p>` : '';
  }
  function add({ kind, id, title, date, href, description }: FeedEntry) {
    const identity = `urn:gvp.fyi:${kind.toLowerCase()}:${id}`;
    if (identities.has(identity)) throw new Error(`Duplicate RSS identity: ${identity}`);
    identities.add(identity);
    items.push({
      identity, title, pubDate: new Date(date), link: new URL(`${href}/`, site).href,
      description, categories: [kind],
      customData: `<guid isPermaLink="false">${identity}</guid>`,
    });
  }
  for (const { id, data } of await getCollection('blog')) {
    add({ kind: 'Blog', id: data.id, title: data.title, date: data.date,
      href: `/blog/${id}`, description: paragraph(data.summary) });
  }
  for (const like of await getLikes()) {
    add({ kind: 'Likes', id: like.id, title: like.title, date: like.created, href: like.href,
      description: paragraph(like.summary || like.title) + paragraph(like.attribution)
        + link('Source', like.source) + link(like.assetKind === 'pdf' ? 'Open PDF' : 'View image', like.media?.url)
        + like.links.map(source => link(source.label, source.url)).join(''),
    });
  }
  for (const project of await getSoftwareProjects()) {
    add({ kind: 'Software', id: project.id, title: project.title, date: project.publishedAt, href: project.href,
      description: paragraph(project.summary) + paragraph(`Tooling: ${project.tooling.join(', ')}`)
        + link('Website', project.url) + link('Repository', project.repo),
    });
  }
  for (const release of await getMusicReleases()) {
    add({ kind: 'Music', id: release.id, title: `${release.artist} — ${release.title}`, date: release.publishedAt, href: release.href,
      description: paragraph(release.summary) + paragraph(`Artist: ${release.artist}`) + paragraph(`Original release: ${release.date}`)
        + paragraph(release.display_date) + paragraph(release.credit) + link('Bandcamp', release.url)
        + Object.entries(release.streaming ?? {}).map(([service, url]) => link(service, url)).join(''),
    });
  }
  for (const recording of await getRadioEpisodes()) {
    const programme = categorySettings('radio').find(category => category.id === recording.category)!.title;
    const broadcast = recording.broadcast.status === 'verified' ? recording.broadcast.date
      : recording.broadcast.status === 'uncertain' ? `Uncertain — ${recording.broadcast.note}` : 'Unknown';
    const seconds = recording.duration_seconds;
    const duration = `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    add({ kind: 'Radio', id: recording.id, title: recording.title, date: recording.publishedAt, href: recording.href,
      description: [`Programme: ${programme}`, recording.credit, `Broadcast date: ${broadcast}`,
        `Full linked recording duration: ${duration}`].map(paragraph).join('') + link('Listen on Mixcloud', recording.mixcloud),
    });
  }
  items.sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf()
    || (a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0));
  return rss({ title: siteSettings.title, description: siteSettings.description, site, items });
};
