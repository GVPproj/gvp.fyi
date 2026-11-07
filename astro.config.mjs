import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import mdx from '@astrojs/mdx';
export default defineConfig({
  site: 'https://gvp.fyi',
  integrations: [mdx()],
  redirects: {
    '/blog/drawing-my-face/': '/blog/the-animated-face/',
  },
  // Local Astro handles SSR directly; this site needs no Netlify dev emulation.
  adapter: netlify({ devFeatures: false, imageCDN: false }),
  server: {
    host: '127.0.0.1',
    port: 4324,
    allowedHosts: ['asahi-mini.tail40c3ca.ts.net'],
  },
  vite: {
    server: {
      strictPort: true,
    },
  },
});
