import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

// Keep server requests independent of the controller's global fetch mock.
const fetchHTML = globalThis.fetch;
let renderedHTML;

export function renderedLikes(t) {
  // Each test gets a fresh DOM, but Astro only needs to render once per process.
  return renderedHTML ??= render(t);
}

async function render(t) {
  const signal = AbortSignal.any([t.signal, AbortSignal.timeout(30000)]);
  signal.throwIfAborted();
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  signal.throwIfAborted();

  const child = spawn(process.execPath, [
    fileURLToPath(new URL('../../node_modules/astro/bin/astro.mjs', import.meta.url)),
    // Astro 7 can auto-background agent sessions; ignore-lock keeps this server
    // in the foreground and leaves any developer server's lock untouched.
    'dev', '--ignore-lock', '--host', '127.0.0.1', '--port', String(port),
  ], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, PUBLIC_POCKETBASE_URL: 'https://pb.example', ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '', spawnError, finished = false;
  const exited = new Promise(resolve => {
    child.once('exit', () => { finished = true; resolve(); });
    child.once('error', error => { spawnError = error; finished = true; resolve(); });
  });
  const log = data => { logs = (logs + data).slice(-16000); };
  child.stdout.on('data', log);
  child.stderr.on('data', log);

  const kill = () => { if (!finished) child.kill('SIGKILL'); };
  process.once('exit', kill);
  let stopping;
  function stop() {
    return stopping ??= (async () => {
      try {
        if (!finished) {
          child.kill('SIGTERM');
          const force = setTimeout(kill, 3000);
          try { await exited; } finally { clearTimeout(force); }
        }
      } finally {
        process.removeListener('exit', kill);
      }
    })();
  }
  t.after(stop);

  try {
    while (true) {
      signal.throwIfAborted();
      if (finished) throw spawnError ?? new Error(`Astro exited (${child.exitCode ?? child.signalCode})`);
      let response;
      try {
        response = await fetchHTML(`http://127.0.0.1:${port}/likes`, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
        });
      } catch (error) {
        // Connection refusal during startup is expected. All retries share a
        // deadline, including requests that connect but never finish rendering.
        signal.throwIfAborted();
        if (finished) throw spawnError ?? error;
        await delay(100, undefined, { signal });
        continue;
      }
      if (!response.ok) {
        throw new Error(`GET /likes returned ${response.status}: ${await response.text()}`);
      }
      return await response.text();
    }
  } catch (error) {
    throw new Error(`Could not render Likes with temporary Astro server: ${error.message}\n${logs}`, { cause: error });
  } finally {
    // No server remains alive during tests, even when rendering fails or the
    // test is cancelled. SIGKILL bounds shutdown if graceful termination stalls.
    await stop();
  }
}
