import repositorySettings from '../config/site-settings.json' with { type: 'json' };

export type SiteSettings = typeof repositorySettings;
// Site structure, category definitions and presentation are Git-owned.
export const siteSettings: SiteSettings = repositorySettings;
export function sectionLabel(section: keyof SiteSettings['sections']) { return siteSettings.sections[section]; }
export function categorySettings(kind: keyof SiteSettings['categories']) { return siteSettings.categories[kind]; }
