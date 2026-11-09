import { z } from 'astro/zod';
import siteSettings from './site-settings.json';

const registry = z.array(z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().trim().min(1).max(100),
}).strict()).superRefine((categories, ctx) => {
  const ids = new Set<string>();
  for (const [index, category] of categories.entries()) {
    if (ids.has(category.id)) {
      ctx.addIssue({ code: 'custom', message: 'Duplicate category ID', path: [index, 'id'] });
    }
    ids.add(category.id);
  }
});

const categories = z.object({ likes: registry, software: registry, releases: registry, dj: registry })
  .parse(siteSettings.categories);

export function categorySchema(kind: keyof typeof categories) {
  return z.string().refine(id => categories[kind].some(category => category.id === id),
    `Unknown ${kind} category`);
}
