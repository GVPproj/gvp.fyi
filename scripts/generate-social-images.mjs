import { readFile, mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Extract the source artwork, not the component's animated CSS. Regenerate after
// changing Face.astro with `pnpm generate:social` and commit the public assets.
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('src/components/elements/Face.astro', root), 'utf8');
const path = source.match(/<path\b[\s\S]*?\/>/)?.[0];
if (!path) throw new Error('Face.astro must contain a self-closing portrait path');
const portrait = `<svg viewBox="-15 -15 400 460" x="0" y="0" width="400" height="460" color="#eceff4">${path}</svg>`;
const svg = (width, height, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#2e3440"/>${content}</svg>`;
const card = svg(1200, 630, `<g transform="translate(100 85)">${portrait}</g><text x="560" y="340" fill="#88c0d0" font-family="monospace" font-size="88">gvp.fyi</text>`);
const icon = svg(512, 512, `<g transform="translate(56 26)">${portrait}</g>`);
await mkdir(new URL('public/social/', root), { recursive: true });
await sharp(Buffer.from(card)).png().toFile(new URL('public/social/og-image.png', root).pathname);
await writeFile(new URL('public/favicon.svg', root), icon);
await sharp(Buffer.from(icon)).resize(32, 32).png().toFile(new URL('public/favicon-32.png', root).pathname);
await sharp(Buffer.from(icon)).resize(180, 180).png().toFile(new URL('public/apple-touch-icon.png', root).pathname);
