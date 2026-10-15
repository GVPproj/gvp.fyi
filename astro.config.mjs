import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import mdx from '@astrojs/mdx';
import { loadEnvFile } from 'node:process';
import publishedRelease from './src/integrations/published-release.mjs';
import publishedContent from './src/integrations/published-content.mjs';

try { loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }

export default defineConfig({
  site: 'https://gvp.fyi',
  integrations: [publishedRelease(), publishedContent(), mdx()],
  redirects: {
    '/blog/drawing-my-face/': '/blog/the-animated-face/',
  },
  markdown: {
    shikiConfig: {
      theme: 'nord',
    },
  },
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
