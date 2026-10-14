import content from 'virtual:published-content';

export const staticLikesEnabled = content !== null;
export const publishedLikes = (content ?? []).filter(entry => entry.kind === 'like' && entry.state === 'published').map(entry => {
  const media = entry.assets[0];
  return { ...entry.data, id: entry.slug, asset: media?.name ?? '', publishedAsset: media ?? null };
}).sort((a, b) => String(b.created ?? '').localeCompare(String(a.created ?? '')) || b.id.localeCompare(a.id));
export const publishedCollections = [...new Map(publishedLikes.flatMap(item => (item.collections ?? []).map(group => [group.id, group]))).values()]
  .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
