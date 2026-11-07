import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { credentialFreeEnv, fixtureSite } from './fixture-site.js';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
export const browserOptions = {
  skip: !executablePath && 'Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to a local Chromium executable',
  timeout: 60000,
};

async function startServer(t) {
  const { root, dispose } = await fixtureSite(t, { empty: [], cleanup: false });
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [
    fileURLToPath(new URL('../../node_modules/astro/bin/astro.mjs', import.meta.url)),
    'dev', '--ignore-lock', '--host', '127.0.0.1', '--port', String(port),
  ], {
    cwd: root,
    env: credentialFreeEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '', spawnError;
  const exited = new Promise(resolve => {
    child.once('exit', resolve);
    child.once('error', error => { spawnError = error; resolve(); });
  });
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null && !spawnError) {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 3000);
      await exited;
      clearTimeout(force);
    }
    // Stop file watchers before removing their isolated working directory.
    await dispose();
  });
  let ready = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (spawnError || child.exitCode !== null) break;
    try {
      // The real repository collection must load without credentials or a backend.
      if ((await fetch(`${base}/software`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, `Temporary Astro server failed to start: ${spawnError ?? ''}\n${logs}`);
  return base;
}

export async function realBrowser(t) {
  // A preview/production server avoids Vite reloads disrupting lifecycle tests.
  const base = process.env.PLAYWRIGHT_BASE_URL ?? await startServer(t);
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  return { base, context, page };
}
