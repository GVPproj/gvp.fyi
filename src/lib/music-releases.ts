import { stat } from 'node:fs/promises';
import { getCategorizedCollection } from './categorized-content';
import { publicDir } from 'astro:config/server';
import { categorySettings } from './site-settings';

export async function getReleaseCategories() {
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
  const releases = await Promise.all(entries.map(async ({ data }) => {
    for (const track of data.tracks) {
      if (!track.audio_url) continue;
      const audio = await stat(new URL(`.${track.audio_url}`, publicDir)).catch(() => undefined);
      if (!audio?.isFile()) {
        throw new Error(`Music release "${data.slug}" track ${track.track_num}: missing audio file "${track.audio_url}"`);
      }
    }
    return {
      ...data,
      title: data.display_title ?? data.title,
      // Preserve year/month precision rather than inventing an exact day.
      date: /^\d{4}(?:-\d{2})?$/.test(data.release_date)
        ? data.release_date
        : new Date(data.release_date).toISOString().slice(0, 10),
    };
  }));
  return categorySettings('releases').map(category => ({
    id: category.id, name: category.title,
    releases: releases.filter(release => release.category === category.id)
      .sort((a, b) => b.date.localeCompare(a.date) || a.order - b.order || a.id.localeCompare(b.id)),
  }));
}
