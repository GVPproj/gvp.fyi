import { getCollection, type CollectionEntry } from 'astro:content';

function newestFirst(a: CollectionEntry<'blog' | 'musicJournal'>, b: CollectionEntry<'blog' | 'musicJournal'>) {
  return b.data.date.localeCompare(a.data.date) || a.id.localeCompare(b.id);
}

export async function getDatedEntries<C extends 'blog' | 'musicJournal'>(collection: C) {
  return (await getCollection(collection)).sort(newestFirst);
}
