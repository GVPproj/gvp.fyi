import snapshots from 'virtual:published-content';
import repositorySettings from '../data/site-settings.json';
import { softwareProjects as repositorySoftware, type SoftwareProject } from '../data/software-projects';
import { materializeSoftware, publishedEntries } from './editorial-source.js';

export const fullEditorialMode = snapshots !== null;
export type SiteSettings = typeof repositorySettings;
// Site structure and presentation are deployed with code, never overridden by
// legacy CMS settings/site snapshots. The CMS supplies editorial content only.
export const siteSettings: SiteSettings = repositorySettings;
export function sectionLabel(section: keyof SiteSettings['sections']) { return siteSettings.sections[section]; }
export function categorySettings(kind: keyof SiteSettings['categories']) { return siteSettings.categories[kind]; }
export const softwareProjects: (SoftwareProject & { order?: number; screenshotAlt?: string })[] = fullEditorialMode
  ? publishedEntries(snapshots, 'software').map(materializeSoftware).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.slug.localeCompare(b.slug))
  : repositorySoftware;
if (fullEditorialMode && softwareProjects.some(project => !siteSettings.categories.software.some(category => category.id === project.category))) {
  throw new Error('Published software references an unknown category');
}

export async function blogPosts() {
  if (fullEditorialMode) return publishedEntries(snapshots, 'blog').map(entry => ({
    id: entry.slug, data: entry.data as { title: string; markdown: string; assetNames?: Record<string, string> }, assets: entry.assets,
  })).sort((a, b) => a.data.title.localeCompare(b.data.title));
  const { getCollection } = await import('astro:content');
  return (await getCollection('blog')).sort((a, b) => a.data.title.localeCompare(b.data.title));
}
