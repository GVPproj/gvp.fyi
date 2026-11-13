import { getCollection } from 'astro:content';
import { categorySchema } from '../config/category-schema';
import { categorySettings } from './site-settings';
import type { ContentRowItem } from '../components/ContentRow.astro';

const registries = { likes: 'likes', music: 'releases', software: 'software', radio: 'radio' } as const;

export async function getCategorizedCollection<C extends keyof typeof registries>(collection: C) {
  const entries = await getCollection(collection);
  const category = categorySchema(registries[collection]);
  // Astro can reuse unchanged entries without rerunning their schemas when only
  // imported settings change. Check membership against the current registry.
  for (const entry of entries) {
    if (!category.safeParse(entry.data.category).success) {
      throw new Error(`Unknown ${collection} category "${entry.data.category}" in entry "${entry.id}"`);
    }
  }
  return entries;
}

export function getCollectionOverview<T extends ContentRowItem & { category: string }>(
  collection: keyof typeof registries,
  entries: readonly T[],
) {
  const categories = [...categorySettings(registries[collection])];
  if (collection === 'likes') {
    categories.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }
  return categories.map(category => ({
    id: category.id,
    title: category.title,
    items: entries.filter(entry => entry.category === category.id),
  })).filter(category => collection !== 'likes' || category.items.length > 0);
}
