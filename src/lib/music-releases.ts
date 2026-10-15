import publishedRelease from 'virtual:published-release';
import { categorySettings } from './editorial-content';

export type ReleaseData = {
  slug: string;
  category: string;
  youtube_video_id?: string;
  publishedArtwork: { src: string; thumbnail: string; srcset: string; width: number; height: number };
  title: string;
  artist: string;
  release_date: string;
  tracks: { title: string; duration?: number; track_num: number; audio_url?: string }[];
  about: string | null;
  credit?: string;
  display_title?: string;
  display_date?: string;
  player_height?: number;
  streaming?: { spotify?: string; apple?: string; tidal?: string };
  album_id?: number;
  url?: string;
};

// Keep the published catalogue intact; derive display fields in one place.
function prepareReleases(catalogue: ReleaseData[]) {
  return catalogue.map(release => {
    const title = release.display_title ?? release.title;
    return {
      ...release,
      title,
      slug: release.slug,
      // Preserve year/month precision rather than inventing an exact day.
      date: /^\d{4}(?:-\d{2})?$/.test(release.release_date)
        ? release.release_date
        : new Date(release.release_date).toISOString().slice(0, 10),
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

// The CMS catalogue is authoritative, including an intentionally empty catalogue.
const configuredCategories = categorySettings('releases');
if (publishedRelease.some(release => !configuredCategories.some(category => category.id === release.category))) {
  throw new Error('Published release references an unknown category');
}

export const releaseCategories = configuredCategories.map(category => ({
  id: category.id, name: category.title,
  releases: prepareReleases(publishedRelease.filter(release => release.category === category.id)),
}));
