import { mkdir, writeFile } from 'node:fs/promises';

/** Only the prepared public projection enters Vite; media stays in static files. */
export function publishingIntegration(name, prepare, projection) {
  const virtualId = `virtual:${name}`;
  const resolvedId = '\0' + virtualId;
  let prepared;
  return { name, hooks: {
    'astro:config:setup': async ({ updateConfig }) => {
      prepared = await prepare(process.env);
      updateConfig({ vite: { plugins: [{ name: `${name}-data`,
        resolveId(id) { if (id === virtualId) return resolvedId; },
        load(id) { if (id === resolvedId) return `export default ${JSON.stringify(prepared[projection])};`; },
      }] } });
    },
    'astro:build:done': async ({ dir }) => {
      for (const file of prepared.files) {
        const target = new URL(file.path.slice(1), dir);
        await mkdir(new URL('.', target), { recursive: true });
        await writeFile(target, file.bytes);
      }
    },
    'astro:server:setup': ({ server }) => {
      server.middlewares.use((req, res, next) => {
        const file = prepared.files.find(file => file.path === req.url);
        if (!file) return next();
        res.setHeader('Content-Type', file.type);
        res.end(file.bytes);
      });
    },
  } };
}
