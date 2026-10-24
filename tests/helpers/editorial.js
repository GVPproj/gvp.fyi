import sharp from 'sharp';

/** Small synthetic content for frontend rendering tests; no live CMS required. */
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
    { kind: 'settings', slug: 'site', data: { description: 'Fixture settings', categories: { software: [] } }, assets: [] },
  ];
}
