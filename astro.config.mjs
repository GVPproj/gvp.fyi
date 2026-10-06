import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import mdx from '@astrojs/mdx';
import { loadEnvFile } from 'node:process';

try { loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const pocketbase = process.env.PUBLIC_POCKETBASE_URL ? new URL(process.env.PUBLIC_POCKETBASE_URL) : null;

export default defineConfig({
  site: 'https://gvp.fyi',
  integrations: [mdx()],
  markdown: {
    shikiConfig: {
      theme: 'nord',
    },
  },
  image: {
    remotePatterns: pocketbase ? [{
      protocol: pocketbase.protocol.slice(0, -1),
      hostname: pocketbase.hostname,
      port: pocketbase.port,
      pathname: `${pocketbase.pathname.replace(/\/$/, '')}/api/files/likes_items/**`,
    }] : [],
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
