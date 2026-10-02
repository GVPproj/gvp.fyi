import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://gvp.fyi',
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
