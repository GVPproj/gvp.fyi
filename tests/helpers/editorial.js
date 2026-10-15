import assert from 'node:assert/strict';
import sharp from 'sharp';

/** Small synthetic content shared by rendering and isolated backend tests. */
export async function editorialFixtures() {
  const image = background => sharp({ create: { width: 24, height: 16, channels: 3, background } }).png().toBuffer();
  return [
    {
      kind: 'software', slug: 'example-project',
      data: {
        title: 'Example project', description: 'A test project.', category: 'portfolio', order: 0,
        screenshot: '/images/fixture/screenshot.png', screenshotAlt: 'Project screenshot',
        tooling: ['HTML', 'CSS'], url: 'https://example.test/project',
        role: { title: 'Development', paragraphs: ['Built for a rendering test.'] },
        gallery: [{ src: '/images/fixture/gallery.png', alt: 'Project gallery detail' }],
        team: [{ name: 'Example teammate', role: 'Designer', href: 'https://example.test/team' }],
      },
      assets: [
        { name: 'screenshot.png', bytes: await image('#123456') },
        { name: 'gallery.png', bytes: await image('#654321') },
      ],
    },
    {
      kind: 'blog', slug: 'example-post',
      data: { title: 'Example post', markdown: '# Example post\n\nA [reference](https://example.test/reference).\n\n<!-- demo:face -->\n\n```astro\n<Face />\n```' },
      assets: [],
    },
    { kind: 'settings', slug: 'site', data: { description: 'Fixture settings', categories: { software: [] } }, assets: [] },
  ];
}

/** Seed a fresh server from publishing-pocketbase.start(), never a shared backend. */
export async function seedEditorial(pb, { publish = false } = {}) {
  const base = new URL(pb.base);
  assert.equal(base.protocol, 'http:');
  assert.ok(['127.0.0.1', '[::1]'].includes(base.hostname));
  const records = [];
  for (const entry of await editorialFixtures()) {
    const form = new FormData();
    form.set('kind', entry.kind);
    form.set('slug', entry.slug);
    form.set('data', JSON.stringify(entry.data));
    form.set('published', 'false');
    for (const asset of entry.assets) form.append('assets', new Blob([asset.bytes], { type: 'image/png' }), asset.name);
    const created = await pb.request('collections/editorial_entries/records', { token: pb.adminToken, method: 'POST', body: form });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.assets.length, entry.assets.length);
    // PocketBase renames uploads; resolve aliases before publishing the draft.
    const assetNames = Object.fromEntries(entry.assets.map((asset, index) => [asset.name, created.data.assets[index]]));
    const saved = await pb.request(`collections/editorial_entries/records/${created.data.id}`, {
      token: pb.adminToken, method: 'PATCH', body: { data: { ...entry.data, assetNames }, published: publish },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    records.push(saved.data);
  }
  return records;
}
