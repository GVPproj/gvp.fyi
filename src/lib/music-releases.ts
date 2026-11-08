import { getCategorizedCollection } from './categorized-content';

export async function getMusicReleases() {
  const entries = await getCategorizedCollection('music');
  for (const field of ['id', 'slug'] as const) {
    const seen = new Map<string, string>();
    for (const entry of entries) {
      const value = entry.data[field];
      if (seen.has(value)) {
        throw new Error(`Duplicate music ${field} "${value}" in entries "${seen.get(value)}" and "${entry.id}"`);
      }
      seen.set(value, entry.id);
    }
  }
  const releases = entries.map(entry => {
    const { data } = entry;
    return {
      ...data,
      entry,
      href: `/music/${data.slug}`,
      title: data.display_title ?? data.title,
      image: data.artwork,
      subtitle: data.credit ? data.artist : undefined,
      metadata: data.credit,
      // Preserve year/month precision rather than inventing an exact day.
      date: /^\d{4}(?:-\d{2})?$/.test(data.release_date)
        ? data.release_date
        : new Date(data.release_date).toISOString().slice(0, 10),
    };
  });
  return releases.sort((a, b) => b.date.localeCompare(a.date) || a.order - b.order || a.id.localeCompare(b.id));
}
