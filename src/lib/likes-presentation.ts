import type { ContentRowItem } from '../components/ContentRow.astro';
import { webURL, likesItemURL, likeItemTitle } from './likes.js';

export interface CollectionOverview {
  id: string;
  name: string;
  items: Array<Record<string, any>>;
  totalItems: number;
}

export function collectionRows(rows: CollectionOverview[]) {
  return rows.map(row => ({
    ...row,
    items: row.items.map((item): ContentRowItem => {
      const asset = item.publishedAsset?.url;
      const pdf = asset && /\.pdf$/i.test(item.asset ?? '');
      const textItem = item.type === 'quote' || item.type === 'note';
      const url = webURL(item.url);
      const published = item.publishedAsset;
      return {
        href: likesItemURL(item),
        title: likeItemTitle(item),
        image: !textItem && asset && !pdf ? {
          src: published?.thumbnail || asset,
          srcset: published?.srcset || undefined,
          width: published?.width || 320,
          height: published?.height || 320,
        } : undefined,
        text: textItem ? (item.body ?? '').slice(0, 400) : undefined,
        label: pdf ? 'PDF document' : url ? new URL(url).hostname : 'Link unavailable',
        metadata: textItem ? item.attribution : undefined,
      };
    }),
  }));
}
