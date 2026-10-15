import content from 'virtual:published-content';
import { MISC_COLLECTION } from './likes.js';

export const staticLikesEnabled = content !== null;
export const publishedLikes = (content ?? []).filter(entry => entry.kind === 'like' && entry.state === 'published').map(entry => {
  const media = entry.assets[0];
  return { ...entry.data, id: entry.slug, asset: media?.name ?? '', publishedAsset: media ?? null };
}).sort((a, b) => String(b.created ?? '').localeCompare(String(a.created ?? '')) || b.id.localeCompare(a.id));
export const publishedCollections = [...new Map(publishedLikes.flatMap(item => (item.collections ?? []).map(group => [group.id, group]))).values()]
  .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

// Full membership stays in creation order for the static collection views.
export const publishedCollectionGroups = [...publishedCollections, { id: MISC_COLLECTION, name: 'Misc.' }]
  .map(group => ({ ...group, items: publishedLikes.filter(item => group.id === MISC_COLLECTION
    ? !item.collections?.length : item.collections?.some(collection => collection.id === group.id)) }));

// Match the live overview: eight latest-edited previews, full totals, latest member edit.
export const publishedCollectionOverview = publishedCollectionGroups.map(group => {
  const items = [...group.items].sort((a, b) => String(b.updated || b.created || '').localeCompare(String(a.updated || a.created || '')) || b.id.localeCompare(a.id)).slice(0, 8);
  return { ...group, items, totalItems: group.items.length, updated: items[0]?.updated || items[0]?.created || null };
});
