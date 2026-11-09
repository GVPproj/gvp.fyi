import { getCategorizedCollection } from './categorized-content';

export async function getDjEpisodes() {
  const entries = await getCategorizedCollection('dj');
  for (const field of ['id', 'slug', 'mixcloud'] as const) {
    const seen = new Map<string, string>();
    for (const entry of entries) {
      const value = entry.data[field];
      if (seen.has(value)) {
        throw new Error(`Duplicate DJ ${field} "${value}" in entries "${seen.get(value)}" and "${entry.id}"`);
      }
      seen.set(value, entry.id);
    }
  }
  return entries.map(({ data }) => ({
    ...data,
    href: `/dj/${data.slug}`,
    image: data.artwork,
    date: data.broadcast.status === 'verified' ? data.broadcast.date : undefined,
  })).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
}
