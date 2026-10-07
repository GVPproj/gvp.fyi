import grahamVanPelt from '../data/releases/graham-van-pelt.json';

// Keep the imported catalogue intact; derive display fields in one place.
const releases = grahamVanPelt.map(release => {
  const title = release.display_title ?? release.title;
  return {
    ...release,
    title,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    artwork: `https://f4.bcbits.com/img/a${release.art_id}_16.jpg`,
    date: new Date(release.release_date).toISOString().slice(0, 10),
  };
}).sort((a, b) => b.date.localeCompare(a.date));

export const releaseCategories = [
  { id: 'graham-van-pelt', name: 'as Graham Van Pelt', releases },
];

export type ReleaseCategory = (typeof releaseCategories)[number];
