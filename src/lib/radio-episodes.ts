import { getCategorizedCollection } from './categorized-content';

export async function getRadioEpisodes() {
  const entries = await getCategorizedCollection('radio');
  for (const field of ['id', 'slug', 'mixcloud'] as const) {
    const seen = new Map<string, string>();
    for (const entry of entries) {
      const value = entry.data[field];
      if (seen.has(value)) {
        throw new Error(`Duplicate Radio ${field} "${value}" in entries "${seen.get(value)}" and "${entry.id}"`);
      }
      seen.set(value, entry.id);
    }
  }
  return entries.map(({ data }) => ({
    ...data,
    href: `/radio/${data.slug}`,
    image: data.artwork,
    date: data.broadcast.status === 'verified' ? data.broadcast.date : undefined,
  })).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
}
