import { getCollection } from 'astro:content';
import { categorySchema } from '../config/category-schema';

const registries = { likes: 'likes', music: 'releases', software: 'software' } as const;

export async function getCategorizedCollection<C extends keyof typeof registries>(collection: C) {
  const entries = await getCollection(collection);
  const category = categorySchema(registries[collection]);
  // Astro can reuse unchanged entries without rerunning their schemas when only
  // imported settings change. Check membership against the current registry.
  for (const entry of entries) {
    if (collection === 'software' && !entry.body?.trim()) {
      throw new Error(`Software projects require a Markdown body in entry ${entry.id}`);
    }
    if (!category.safeParse(entry.data.category).success) {
      throw new Error(`Unknown ${collection} category "${entry.data.category}" in entry "${entry.id}"`);
    }
  }
  return entries;
}
