import type { ContentRowItem } from '../components/ContentRow.astro';
import { webURL, likesItemURL, likeItemTitle, likeAssetKind } from './likes.js';

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
      const asset = item.media?.url;
      const pdf = asset && likeAssetKind(item) === 'pdf';
      const textItem = item.type === 'quote' || item.type === 'note';
      const url = webURL(item.url);
      const media = item.media;
      return {
        href: likesItemURL(item),
        title: likeItemTitle(item),
        image: !textItem && asset && !pdf ? {
          src: media?.thumbnail || asset,
          srcset: media?.srcset || undefined,
          width: media?.width || 320,
          height: media?.height || 320,
        } : undefined,
        text: textItem ? (item.body ?? '').slice(0, 400) : undefined,
        label: pdf ? 'PDF document' : url ? new URL(url).hostname : 'Link unavailable',
        metadata: textItem ? item.attribution : undefined,
      };
    }),
  }));
}
