import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const binary = process.env.POCKETBASE_BINARY && path.resolve(process.env.POCKETBASE_BINARY);
const hooks = fileURLToPath(new URL('../../pocketbase/pb_hooks/', import.meta.url));
const migrations = fileURLToPath(new URL('../../pocketbase/pb_migrations/', import.meta.url));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function start(t) {
  assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /version 0\.40\.4\s*$/);
  const dir = await mkdtemp(path.join(tmpdir(), 'publishing-pocketbase-'));
  let child;
  let exited;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 3000);
      await exited;
      clearTimeout(force);
    }
    await rm(dir, { recursive: true, force: true });
  });
  await mkdir(path.join(dir, 'migrations'));
  await cp(migrations, path.join(dir, 'migrations'), { recursive: true });
  // Runtime validation must be exercised as deployed, not just the schema.
  await cp(hooks, path.join(dir, 'hooks'), { recursive: true });
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const flags = ['--dir', path.join(dir, 'data'), '--migrationsDir', path.join(dir, 'migrations'),
    '--hooksDir', path.join(dir, 'hooks'), '--publicDir', path.join(dir, 'public'), '--dev=false'];
  const password = randomBytes(24).toString('hex');
  const email = `${randomBytes(16).toString('hex')}@example.test`;
  // Suppress CLI output/errors containing private credentials; never use a shared database.
  try {
    execFileSync(binary, ['superuser', 'create', email, password, ...flags], { cwd: dir, stdio: 'pipe' });
  } catch {
    throw new Error('Temporary PocketBase superuser provisioning failed');
  }
  let logs = '';
  async function boot() {
    child = spawn(binary, ['serve', '--http', `127.0.0.1:${port}`, ...flags], { cwd: dir });
    exited = once(child, 'exit');
    child.stdout.on('data', (data) => { logs += data; });
    child.stderr.on('data', (data) => { logs += data; });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) break;
      try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
      await pause(50);
    }
    assert.ok(ready, `Local PocketBase failed to start:\n${logs}`);
  }
  await boot();
  async function restart() {
    child.kill('SIGTERM');
    await exited;
    await boot();
  }
  async function request(route, { method = 'GET', token, body } = {}) {
    const response = await fetch(`${base}/api/${route}`, {
      method, headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token && { Authorization: token }) },
      ...(body !== undefined && { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
    const data = response.status === 204 ? null : await response.json();
    return { status: response.status, data };
  }
  const auth = await request('collections/_superusers/auth-with-password', { method: 'POST', body: { identity: email, password } });
  assert.equal(auth.status, 200);
  return { request, base, adminToken: auth.data.token, dir, flags, restart };
}
