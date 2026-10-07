import grahamVanPelt from '../data/releases/graham-van-pelt.json';
import miracleFortress from '../data/releases/miracle-fortress.json';

type ReleaseData = {
  title: string;
  artist: string;
  release_date: string;
  tracks: { title: string; duration?: number; track_num: number }[];
  about: string | null;
  display_title?: string;
  display_date?: string;
  player_height?: number;
  streaming?: { spotify?: string; apple?: string; tidal?: string };
} & (
  | { album_id: number; art_id: number; url: string; artwork_url?: never }
  | { album_id?: never; art_id?: never; url?: never; artwork_url: string }
);

// Keep the imported catalogue intact; derive display fields in one place.
function prepareReleases(catalogue: ReleaseData[]) {
  return catalogue.map(release => {
    const title = release.display_title ?? release.title;
    return {
      ...release,
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      artwork: release.artwork_url ?? `https://f4.bcbits.com/img/a${release.art_id}_16.jpg`,
      // Historical releases may only have a verified year, not an exact day.
      date: /^\d{4}$/.test(release.release_date)
        ? release.release_date
        : new Date(release.release_date).toISOString().slice(0, 10),
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

export const releaseCategories = [
  { id: 'graham-van-pelt', name: 'as Graham Van Pelt', releases: prepareReleases(grahamVanPelt) },
  { id: 'miracle-fortress', name: 'as Miracle Fortress', releases: prepareReleases(miracleFortress) },
];

export type ReleaseCategory = (typeof releaseCategories)[number];
