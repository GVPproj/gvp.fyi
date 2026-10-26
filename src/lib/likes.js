// Only web destinations are navigable, even if stored records are malformed.
export function webURL(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function likeAssetKind(item) {
  // Materialized extensions reflect verified bytes, not the source filename.
  const asset = item.publishedAsset?.url ?? item.asset;
  return asset ? (/\.pdf$/i.test(asset) ? 'pdf' : 'image') : null;
}

export function likeItemTitle(item) {
  if (item.title) return item.title;
  if (item.type === 'quote') return 'Quote';
  if (item.type === 'note') return 'Personal note';
  const kind = likeAssetKind(item);
  return kind === 'pdf' ? 'PDF document' : kind === 'image' ? 'Image' : 'Link';
}

export function likesItemURL(item) {
  return `/likes/${encodeURIComponent(item.id)}`;
}
