import snapshots from 'virtual:published-content';
import { categorySettings } from './site-settings';
import type { SoftwareProject } from './software-project';
import { materializeSoftware, publishedEntries } from './editorial-source.js';

export const softwareProjects: SoftwareProject[] = publishedEntries(snapshots, 'software')
  .map(materializeSoftware)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.slug.localeCompare(b.slug));
if (softwareProjects.some(project => !categorySettings('software').some(category => category.id === project.category))) {
  throw new Error('Published software references an unknown category');
}
