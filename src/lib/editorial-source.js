/** The build adapter supplies one latest snapshot per identity, including withdrawals. */
export function publishedEntries(snapshots, kind) {
  const latest = new Map();
  for (const snapshot of snapshots ?? []) {
    if (snapshot.kind !== kind) continue;
    if (latest.has(snapshot.slug)) throw new Error(`Duplicate editorial snapshot: ${kind}/${snapshot.slug}`);
    latest.set(snapshot.slug, snapshot);
  }
  return [...latest.values()].filter(entry => entry.state === 'published');
}
