import { getCategorizedCollection } from './categorized-content';

export async function getSoftwareProjects() {
  const entries = await getCategorizedCollection('software');
  return entries.map(entry => {
    if (!entry.body?.trim()) {
      throw new Error(`Software projects require a Markdown body in entry ${entry.id}`);
    }
    return {
      ...entry.data,
      entry,
      href: `/software/${entry.id}`,
      image: entry.data.screenshot,
      metadata: entry.data.tooling.join(' · '),
    };
  }).sort((a, b) => a.order - b.order || a.entry.id.localeCompare(b.entry.id));
}
