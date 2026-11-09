import { getCategorizedCollection } from './categorized-content';

function recordingDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const parts = hours ? [hours, minutes, seconds % 60] : [minutes, seconds % 60];
  return parts.map((part, index) => index ? String(part).padStart(2, '0') : String(part)).join(':');
}

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
    subtitle: data.credit,
    date: data.broadcast.status === 'verified' ? data.broadcast.date : undefined,
    metadata: data.broadcast.status === 'verified' ? data.broadcast.date
      : data.broadcast.status === 'uncertain' ? `Broadcast date uncertain — ${data.broadcast.note}`
      : 'Broadcast date unknown',
    duration: recordingDuration(data.duration_seconds),
  })).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
}
