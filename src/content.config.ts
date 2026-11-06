import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import siteSettings from './config/site-settings.json';

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
      description: text,
      category: text.refine(id => siteSettings.categories.software.some(category => category.id === id), {
        message: 'Unknown software category in production site settings',
      }),
      order: z.number().int(),
      tooling: z.array(text),
      screenshot: localImage,
      screenshotAlt: z.string().optional(),
      screenshotWidth: z.number().int().positive().optional(),
      screenshotHeight: z.number().int().positive().optional(),
      url: link.optional(),
      repo: link.optional(),
      role: z.object({ title: text, paragraphs: z.array(text) }).optional(),
      team: z.array(z.object({ name: text, role: text, href: link.optional() })).optional(),
      gallery: z.array(z.object({
        src: localImage,
        alt: z.string(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      })).optional(),
      tagline: text.optional(),
    }).refine(project => project.url || project.repo, {
      message: 'Software requires a website (url) or repository (repo) link',
      path: ['url'],
    });
  },
});

export const collections = { blog, software };
