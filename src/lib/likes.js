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

// Reserve legacy ID paths so readable URLs never shadow existing links.
/**
 * @template {{ id: string }} T
 * @param {T[]} items
 * @returns {(T & { slug: string })[]}
 */
export function withLikeSlugs(items) {
  const used = new Set(items.map(item => item.id));
  const slugs = new Map();
  for (const item of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
    const base = likeItemTitle(item).normalize('NFKD').replace(/\p{M}/gu, '')
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'item';
    let slug = base;
    let suffix = 2;
    while (used.has(slug)) slug = `${base}-${suffix++}`;
    used.add(slug);
    slugs.set(item.id, slug);
  }
  return items.map(item => ({ ...item, slug: slugs.get(item.id) }));
}

export function likesItemURL(item) {
  return `/likes/${encodeURIComponent(item.slug ?? item.id)}`;
}
