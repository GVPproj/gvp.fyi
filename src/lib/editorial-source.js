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

export function materializeSoftware(entry) {
  const resolve = (source) => {
    const name = source.split('/').at(-1);
    const mapped = entry.data.assetNames?.[name] ?? name;
    const asset = entry.assets.find(asset => asset.name === source || asset.name === mapped);
    if (!asset?.url) throw new Error(`Missing software asset: ${entry.slug}/${name}`);
    return asset;
  };
  const screenshot = resolve(entry.data.screenshot);
  return {
    ...entry.data, slug: entry.slug,
    screenshot: screenshot.url, screenshotSrcset: screenshot.srcset,
    screenshotWidth: screenshot.width ?? entry.data.screenshotWidth,
    screenshotHeight: screenshot.height ?? entry.data.screenshotHeight,
    gallery: entry.data.gallery?.map(image => {
      const asset = resolve(image.src);
      return { ...image, src: asset.url, srcset: asset.srcset,
        width: asset.width ?? image.width, height: asset.height ?? image.height };
    }),
  };
}
