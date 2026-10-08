import grahamVanPelt from '../../src/data/releases/graham-van-pelt.json' with { type: 'json' };
import miracleFortress from '../../src/data/releases/miracle-fortress.json' with { type: 'json' };
import thinkAboutLife from '../../src/data/releases/think-about-life.json' with { type: 'json' };
import otherCredits from '../../src/data/releases/other-credits.json' with { type: 'json' };

// Read current content rather than maintaining a second catalogue in assertions.
export const categories = [
  { name: 'as Graham Van Pelt', releases: grahamVanPelt },
  { name: 'as Miracle Fortress', releases: miracleFortress },
  { name: 'with Think About Life', releases: thinkAboutLife },
  { name: 'Other Credits', releases: otherCredits },
];
export const releases = categories.flatMap(category => category.releases);
export const titleOf = release => release.display_title ?? release.title;
export const slugOf = release => titleOf(release).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const dateOf = release => /^\d{4}(?:-\d{2})?$/.test(release.release_date)
  ? release.release_date : new Date(release.release_date).toISOString().slice(0, 10);
