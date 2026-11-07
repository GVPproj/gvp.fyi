import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../', import.meta.url));

export function credentialFreeEnv() {
  return Object.fromEntries(Object.entries({ ...process.env, ASTRO_TELEMETRY_DISABLED: '1' })
    .filter(([key]) => !/POCKETBASE|^PUBLISHING_/.test(key)));
}

export async function buildSite(root, { outDir, signal } = {}) {
  const child = spawn(process.execPath, [join(repository, 'node_modules/astro/bin/astro.mjs'), 'build',
    ...(outDir ? ['--outDir', outDir] : [])], {
    cwd: root, env: credentialFreeEnv(), signal, timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', bytes => output += bytes);
  child.stderr.on('data', bytes => output += bytes);
  const [code] = await once(child, 'exit');
  return { code, output };
}

// Copy the real site, never its .env, generated output or backend snapshots.
// Living beneath .astro lets Node resolve the checkout's installed dependencies.
export async function fixtureSite(t, { empty = ['likes', 'music'], cleanup = true } = {}) {
  await mkdir(join(repository, '.astro'), { recursive: true });
  const root = await mkdtemp(join(repository, '.astro/fixture-site-'));
  const dispose = () => rm(root, { recursive: true, force: true, maxRetries: 3 });
  if (cleanup) t.after(dispose);
  for (const name of ['src', 'public', 'astro.config.mjs', 'tsconfig.json', 'package.json']) {
    await cp(join(repository, name), join(root, name), { recursive: true });
  }
  for (const collection of empty) {
    await rm(join(root, 'src/content', collection), { recursive: true, force: true });
    await mkdir(join(root, 'src/content', collection), { recursive: true });
  }
  let revision = 0;
  return {
    root,
    dispose,
    async collections(groups) {
      await writeFile(join(root, 'src/content/named-collections.json'), JSON.stringify(groups));
    },
    async entry(collection, folder, data, assets = {}) {
      const directory = join(root, 'src/content', collection, folder);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'index.md'), `---\n${JSON.stringify(data, null, 2)}\n---\n`);
      for (const [name, bytes] of Object.entries(assets)) await writeFile(join(directory, name), bytes);
      return directory;
    },
    async remove(collection, folder) {
      await rm(join(root, 'src/content', collection, folder), { recursive: true, force: true });
    },
    async build() {
      // Fresh content cache and output model separate deployments; a failed build
      // cannot overwrite an earlier successful deployment in this fixture.
      await rm(join(root, '.astro'), { recursive: true, force: true });
      const dir = join(root, `build-${++revision}`);
      const { code, output } = await buildSite(root, { outDir: dir, signal: t.signal });
      return { dir, code, logs: output, html: (route = '') => readFile(join(dir, route, 'index.html'), 'utf8') };
    },
  };
}

export async function staticServer(t, directory) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(directory, `.${pathname.endsWith('/') ? `${pathname}index.html` : extname(pathname) ? pathname : `${pathname}/index.html`}`);
    if (!file.startsWith(resolve(directory) + sep)) return res.writeHead(400).end();
    try {
      const bytes = await readFile(file);
      res.setHeader('Content-Type', {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
        '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
      }[extname(file)] ?? 'application/octet-stream');
      res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
