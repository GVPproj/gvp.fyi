import miracleFortress from '../data/releases/miracle-fortress.json' with { type: 'json' };

/** Stable route identity shared by the local catalogue, importer and build. */
export function releaseSlug(release) {
  return release.slug ?? (release.display_title ?? release.title).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const releaseCategoryIds = ['graham-van-pelt', 'miracle-fortress', 'think-about-life', 'other-credits'];

export const tracerSlug = 'watery-grave-ep';
const matches = miracleFortress.filter(release => releaseSlug(release) === tracerSlug);
if (matches.length !== 1) throw new Error('Expected exactly one local publishing tracer release');
export const tracerRelease = matches[0];
