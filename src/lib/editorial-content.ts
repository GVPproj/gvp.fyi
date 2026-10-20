import snapshots from 'virtual:published-content';
import repositorySettings from '../config/site-settings.json';
import type { SoftwareProject } from './software-project';
import { materializeSoftware, publishedEntries } from './editorial-source.js';

export type SiteSettings = typeof repositorySettings;
// Site structure and presentation are deployed with code, never overridden by
// legacy CMS settings/site snapshots. The CMS supplies editorial content only.
export const siteSettings: SiteSettings = repositorySettings;
export function sectionLabel(section: keyof SiteSettings['sections']) { return siteSettings.sections[section]; }
export function categorySettings(kind: keyof SiteSettings['categories']) { return siteSettings.categories[kind]; }
export const softwareProjects: SoftwareProject[] = publishedEntries(snapshots, 'software')
  .map(materializeSoftware)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.slug.localeCompare(b.slug));
if (softwareProjects.some(project => !siteSettings.categories.software.some(category => category.id === project.category))) {
  throw new Error('Published software references an unknown category');
}
