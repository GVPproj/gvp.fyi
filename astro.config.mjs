import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

export default defineConfig({
  site: 'https://gvp.fyi',
  // Local Astro handles SSR directly; this site needs no Netlify dev emulation.
  adapter: netlify({ devFeatures: false }),
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
