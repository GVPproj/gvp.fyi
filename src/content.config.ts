import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { categorySchema } from './config/category-schema';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
});

const software = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/software' }),
  schema: ({ image }) => {
    const text = z.string().trim().min(1);
    const link = z.url({ protocol: /^https?$/ });
    const localImage = z.preprocess((value, ctx) => {
      if (typeof value !== 'string' || !value.startsWith('./')) {
        ctx.addIssue({ code: 'custom', message: 'Software images must use entry-relative repository paths' });
      }
      return value;
    }, image());
    return z.object({
      title: text,
      category: categorySchema('software'),
      order: z.number().int(),
      tooling: z.array(text),
      screenshot: localImage,
      screenshotAlt: z.string().optional(),
      showScreenshot: z.boolean().default(true),
      url: link.optional(),
      repo: link.optional(),
      team: z.array(z.object({ name: text, role: text, href: link.optional() })).optional(),
      gallery: z.array(z.object({
        src: localImage,
        alt: z.string(),
      })).optional(),
    }).strict().refine(project => project.url || project.repo, {
      message: 'Software requires a website (url) or repository (repo) link',
      path: ['url'],
    });
  },
});

// Folder IDs keep duplicate explicit slugs visible to route validation rather than
// allowing glob's default slug-derived IDs to silently overwrite an entry.
const entryId = ({ entry }: { entry: string }) => entry.replace(/\/index\.mdx?$/, '');

// Date.parse normalizes impossible days (e.g. February 30). Check the authored
// calendar components, without changing date precision or timezone semantics.
function validCalendarDate(value: string) {
  if (!Number.isFinite(Date.parse(value))) return false;
  const iso = value.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?=$|[T ])/);
  const rfc = value.match(/^(?:[a-z]{3},\s*)?(\d{1,2})\s+([a-z]{3})\s+(\d{4})\s/i);
  if (!iso && !rfc) return false;
  const year = Number(iso?.[1] ?? rfc![3]);
  const month = iso ? Number(iso[2] ?? 1)
    : ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(rfc![2].toLowerCase()) + 1;
  const day = Number(iso ? iso[3] ?? 1 : rfc![1]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)
  .refine(validCalendarDate, 'Invalid calendar timestamp');
const webLink = z.url({ protocol: /^https?$/ }).refine(value => {
  const url = new URL(value);
  return !url.username && !url.password && !/[\u0000-\u0020\\\\]/.test(value);
}, 'Links must be credential-free HTTP(S) URLs');
function entryRelativeImage(value: unknown, ctx: z.RefinementCtx) {
  if (typeof value !== 'string' || !value.startsWith('./') || value.split('/').includes('..') || /[?#\\\\]/.test(value)) {
    ctx.addIssue({ code: 'custom', message: 'Images must use entry-relative repository paths' });
  }
  return value;
}

const likes = defineCollection({
  loader: glob({ pattern: '**/index.{md,mdx}', base: './src/content/likes', generateId: entryId }),
  schema: ({ image }) => z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    slug: z.string().regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u),
    title: z.string().max(500).default(''),
    url: z.union([z.literal(''), webLink]).default(''),
    type: z.enum(['', 'quote', 'note']).default(''),
    attribution: z.string().max(1000).default(''),
    created: timestamp,
    category: categorySchema('likes'),
    image: z.preprocess(entryRelativeImage, image()).optional(),
    download: z.string().regex(/^\.\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.pdf$/, 'Downloads must be adjacent PDF files').optional(),
  }).strict().superRefine((item, ctx) => {
    const issue = (message: string, path: string) => ctx.addIssue({ code: 'custom', message, path: [path] });
    if (item.type) {
      if (item.image || item.download) issue('Quotes and notes cannot have an image or download', 'type');
    } else {
      if (!item.title.trim()) issue('Ordinary collection items require a title', 'title');
      if (!(item.url || item.image || item.download)) issue('Ordinary collection items require a URL or asset', 'url');
    }
    if (item.image && item.download) issue('Choose one image or PDF download', 'download');
  }),
});

const text = z.string().refine(value => Boolean(value.trim()), 'Text must not be empty');
const listeningLink = webLink.refine(value => value.startsWith('https://'), 'Listening links require HTTPS');

const music = defineCollection({
  loader: glob({ pattern: '**/index.{md,mdx}', base: './src/content/music', generateId: entryId }),
  schema: ({ image }) => z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    order: z.number().int().default(0),
    category: categorySchema('releases'),
    artwork: z.preprocess(entryRelativeImage, image()),
    title: text.max(500),
    artist: text.max(500),
    release_date: text.refine(validCalendarDate, 'Invalid calendar release date'),
    tracks: z.array(z.object({
      title: text.max(500), track_num: z.number().int().positive(),
    }).strict()).default([]).refine(tracks => tracks.every((track, index) => track.track_num === index + 1), 'Tracks must be ordered with consecutive track numbers'),
    credit: text.max(5000).optional(),
    display_title: text.max(5000).optional(),
    display_date: text.max(500).optional(),
    player_height: z.number().int().positive().optional(),
    album_id: z.number().int().positive().optional(),
    url: listeningLink.optional(),
    streaming: z.object({ spotify: listeningLink.optional(), apple: listeningLink.optional(), tidal: listeningLink.optional() }).strict().optional(),
  }).strict(),
});

const mixcloudRecording = listeningLink.refine(value => {
  const url = new URL(value);
  const parts = url.pathname.split('/').filter(Boolean);
  return ['www.mixcloud.com', 'mixcloud.com'].includes(url.hostname) && !url.port
    && /^\/[a-z0-9_-]+\/[a-z0-9_-]+\/?$/i.test(url.pathname)
    && !['widget', 'discover', 'live', 'upload', 'search'].includes(parts[0].toLowerCase())
    && !['playlists', 'favorites', 'followers', 'following', 'uploads', 'cloudcasts', 'listen-later'].includes(parts[1].toLowerCase())
    && !/[?#]/.test(value);
}, 'Expected a canonical Mixcloud recording URL').transform(value =>
  `https://www.mixcloud.com${new URL(value).pathname.toLowerCase().replace(/\/$/, '')}/`);

const dj = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/dj', generateId: entryId }),
  schema: ({ image }) => z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    category: categorySchema('dj'),
    title: text.max(500),
    credit: text.max(1000),
    artwork: z.preprocess(entryRelativeImage, image()),
    broadcast: z.discriminatedUnion('status', [
      z.object({
        status: z.literal('verified'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(validCalendarDate, 'Invalid calendar broadcast date'),
        source: webLink,
      }).strict(),
      z.object({ status: z.literal('uncertain'), note: text.max(500) }).strict(),
      z.object({ status: z.literal('unknown') }).strict(),
    ]),
    duration_seconds: z.number().int().positive(),
    mixcloud: mixcloudRecording,
    sources: z.array(z.object({ label: text, url: webLink }).strict()).min(1),
  }).strict(),
});

export const collections = { blog, software, likes, music, dj };
