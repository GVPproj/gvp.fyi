import repositorySettings from '../config/site-settings.json' with { type: 'json' };

export type SiteSettings = typeof repositorySettings;
// Site structure and presentation are Git-owned, independent of published content.
export const siteSettings: SiteSettings = repositorySettings;
export function sectionLabel(section: keyof SiteSettings['sections']) { return siteSettings.sections[section]; }
export function categorySettings(kind: keyof SiteSettings['categories']) { return siteSettings.categories[kind]; }
