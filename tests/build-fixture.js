import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repository = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);

export async function createBuildFixture(prefix) {
  // Stay on the repository filesystem so package files can be copy-on-write clones.
  const directory = await mkdtemp(join(repository, `.test-fixture-${prefix}-`));
  const cleanup = () => rm(directory, { recursive: true, force: true });
  try {
    await cp(join(repository, 'src'), join(directory, 'src'), { recursive: true });
    for (const file of ['package.json', 'astro.config.mjs', 'tsconfig.json']) {
      await cp(join(repository, file), join(directory, file));
    }
    const dependencies = join(repository, 'node_modules');
    const caches = new Set(['.astro', '.vite', '.vite-temp'].map(name => join(dependencies, name)));
    // Astro's own components must resolve inside the fixture. Preserve pnpm's
    // relative links, but do not share writable files or build caches with the repo.
    await cp(dependencies, join(directory, 'node_modules'), {
      recursive: true,
      verbatimSymlinks: true,
      mode: constants.COPYFILE_FICLONE,
      filter: source => !caches.has(source),
    });
    await symlink(join(repository, 'public'), join(directory, 'public'), 'dir');
    return {
      directory,
      build: () => exec(process.execPath, [join(directory, 'node_modules/astro/bin/astro.mjs'), 'build'], {
        cwd: directory,
        maxBuffer: 4 * 1024 * 1024,
      }),
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
