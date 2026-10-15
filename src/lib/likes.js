// Only web destinations are navigable, even if stored records are malformed.
export function webURL(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function likeItemTitle(item) {
  if (item.type === 'quote' || item.type === 'note') return textItemTitle(item);
  return item.title || (item.asset ? /\.pdf$/i.test(item.asset) ? 'PDF document' : 'Image' : 'Link');
}

export function likesItemURL(item) {
  return `/likes/${encodeURIComponent(item.id)}`;
}

export function textItemTitle(item) {
  return item.title || (item.type === 'quote' ? 'Quote' : 'Personal note');
}
