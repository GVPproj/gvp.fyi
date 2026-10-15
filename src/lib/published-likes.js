import content from 'virtual:published-content';

export const publishedLikes = (content ?? []).filter(entry => entry.kind === 'like' && entry.state === 'published').map(entry => {
  const media = entry.assets[0];
  return { ...entry.data, id: entry.slug, asset: media?.name ?? '', publishedAsset: media ?? null };
}).sort((a, b) => String(b.created ?? '').localeCompare(String(a.created ?? '')) || b.id.localeCompare(a.id));

const collections = [...new Map(publishedLikes.flatMap(item => (item.collections ?? []).map(group => [group.id, group]))).values()]
  .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

// Include every item in the scrollable rows; there is no separate collection view.
export const publishedCollectionOverview = [...collections, { id: 'misc', name: 'Misc.' }]
  .map(group => {
    const items = publishedLikes.filter(item => group.id === 'misc'
      ? !item.collections?.length : item.collections?.some(collection => collection.id === group.id));
    return { ...group, items, totalItems: items.length };
  }).filter(group => group.totalItems > 0);
