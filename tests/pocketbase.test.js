import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createLikesAPI } from '../src/lib/likes.js';

// 'likes' (5) + 'owner' (5) + '00001' (5).
// Exactly 15 lowercase alphanumeric characters; set this ID in the admin UI.
const OWNER_ID = 'likesowner00001';
const binary = process.env.POCKETBASE_BINARY && path.resolve(process.env.POCKETBASE_BINARY);
const migrations = fileURLToPath(new URL('../pocketbase/pb_migrations/', import.meta.url));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function start(t, { migrate = true } = {}) {
  assert.match(execFileSync(binary, ['--version'], { encoding: 'utf8' }), /version 0\.40\.4\s*$/);
  const dir = await mkdtemp(path.join(tmpdir(), 'likes-pocketbase-'));
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
  if (migrate) await cp(migrations, path.join(dir, 'migrations'), { recursive: true });
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
  async function request(route, { method = 'GET', token, body } = {}) {
    const response = await fetch(`${base}/api/${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: token }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? null : await response.json();
    return { status: response.status, data };
  }
  const auth = await request('collections/_superusers/auth-with-password', { method: 'POST', body: { identity: email, password } });
  assert.equal(auth.status, 200);
  return { request, base, adminToken: auth.data.token, dir, flags };
}

test('PocketBase 0.40.4 Likes integration (temporary loopback server only)', {
  skip: !binary && 'Set POCKETBASE_BINARY to a local PocketBase v0.40.4 executable',
}, async (t) => {
  const { request, base, adminToken } = await start(t);
  assert.equal(OWNER_ID.length, 15);
  assert.equal((await request('collections/likes_owners/records', { token: adminToken })).data.totalItems, 0,
    'Migration must not provision an owner or credentials');
  const password = randomBytes(24).toString('hex');
  const account = { id: OWNER_ID, email: 'owner@example.test', password, passwordConfirm: password };
  const owner = await request('collections/likes_owners/records', { method: 'POST', token: adminToken, body: account });
  assert.equal(owner.status, 200, JSON.stringify(owner));
  const api = createLikesAPI(base);
  const auth = await api.login(account.email, password);
  assert.equal(auth.record.id, OWNER_ID);
  const records = 'collections/likes_items/records';
  const valid = { url: 'https://example.com/first', title: 'First', description: '', published: true };
  let first;
  await t.test('owner saves a published link that anonymous visitors can read', async () => {
    first = await api.save(auth.token, valid);
    assert.equal(first.published, true);
    assert.ok(Number.isFinite(Date.parse(first.created)));
    assert.equal(first.updated, first.created);
    assert.deepEqual((await api.list()).map((item) => item.id), [first.id]);
    assert.equal((await request(`${records}/${first.id}`)).status, 200);
  });

  const draft = await request(records, { method: 'POST', token: auth.token, body: { ...valid, title: 'Draft', published: false } });
  assert.equal(draft.status, 200);
  await t.test('anonymous reads exclude drafts even without a published filter; owner can read them', async () => {
    const publicList = await request(records);
    assert.equal(publicList.status, 200);
    assert.deepEqual(publicList.data.items.map((item) => item.id), [first.id]);
    assert.equal((await request(`${records}/${draft.data.id}`)).status, 404);
    assert.equal((await request(`${records}/${draft.data.id}`, { token: auth.token })).status, 200);
    const ownerList = await request(records, { token: auth.token });
    assert.equal(ownerList.data.totalItems, 2);
  });

  const otherAccount = { ...account, id: 'otherowner00001', email: 'other@example.test' };
  assert.equal((await request('collections/likes_owners/records', { method: 'POST', token: adminToken, body: otherAccount })).status, 200);
  const other = await api.login(otherAccount.email, password);
  // Unrelated authenticated users must not inherit access from other consumers.
  const unrelatedCollection = await request('collections', { method: 'POST', token: adminToken,
    body: { name: 'unrelated_accounts', type: 'auth', fields: [{ name: 'password', type: 'password', min: 12 }], passwordAuth: { enabled: true, identityFields: ['email'] } } });
  assert.equal(unrelatedCollection.status, 200, JSON.stringify(unrelatedCollection));
  const unrelatedAccount = await request('collections/unrelated_accounts/records', { method: 'POST', token: adminToken,
    body: { ...account, id: 'unrelated000001' } });
  assert.equal(unrelatedAccount.status, 200, JSON.stringify(unrelatedAccount));
  const unrelated = await request('collections/unrelated_accounts/auth-with-password', {
    method: 'POST', body: { identity: account.email, password },
  });
  assert.equal(unrelated.status, 200);

  for (const [label, token] of [['anonymous', undefined], ['another likes owner', other.token], ['unrelated auth account', unrelated.data.token]]) {
    await t.test(`${label} cannot create, update, delete, or read drafts`, async () => {
      assert.equal((await request(records, { method: 'POST', token, body: valid })).status, 400);
      assert.equal((await request(`${records}/${first.id}`, { method: 'PATCH', token, body: { title: 'Unauthorized' } })).status, 404);
      assert.equal((await request(`${records}/${first.id}`, { method: 'DELETE', token })).status, 404);
      assert.equal((await request(`${records}/${draft.data.id}`, { token })).status, 404);
      assert.equal((await request(records, { token })).data.totalItems, 1);
      assert.equal((await request(`${records}/${first.id}`)).data.title, 'First');
    });
  }

  await t.test('owner directory/signup/update/delete/manage stay admin-only', async () => {
    for (const token of [undefined, auth.token, other.token]) {
      const owners = 'collections/likes_owners/records';
      assert.equal((await request(owners, { token })).status, 403);
      assert.equal((await request(`${owners}/${OWNER_ID}`, { token })).status, 403);
      assert.equal((await request(owners, { method: 'POST', token,
        body: { ...account, id: 'signupowner0001', email: 'signup@example.test' } })).status, 403);
      assert.equal((await request(`${owners}/${OWNER_ID}`, { method: 'PATCH', token,
        body: { password: 'replacement-password', passwordConfirm: 'replacement-password' } })).status, 403);
      assert.equal((await request(`${owners}/${OWNER_ID}`, { method: 'DELETE', token })).status, 403);
    }
    const schema = await request('collections/likes_owners', { token: adminToken });
    assert.equal(schema.data.manageRule, null);
    assert.equal(schema.data.passwordAuth.enabled, true);
    assert.deepEqual(schema.data.passwordAuth.identityFields, ['email']);
    assert.equal(schema.data.oauth2.enabled, false);
    assert.equal(schema.data.otp.enabled, false);
    assert.equal(schema.data.fields.find((field) => field.name === 'email').required, true);
    assert.equal(schema.data.fields.find((field) => field.name === 'password').min, 12);
  });

  await t.test('server rejects missing title/URL and non-http(s) URLs (bypassing client validation)', async () => {
    for (const url of ['', 'not a url', 'javascript:alert(1)', 'data:text/html,hello', 'ftp://example.com/file', '//example.com']) {
      const result = await request(records, { method: 'POST', token: auth.token, body: { ...valid, url } });
      assert.equal(result.status, 400, `Unexpectedly accepted ${url}`);
      assert.ok(result.data.data.url, JSON.stringify(result));
    }
    const superuserInvalid = await request(records, { method: 'POST', token: adminToken,
      body: { ...valid, url: 'ftp://example.com/file' } });
    assert.equal(superuserInvalid.status, 400);
    assert.ok(superuserInvalid.data.data.url);
    const missingTitle = await request(records, { method: 'POST', token: auth.token, body: { ...valid, title: '' } });
    assert.equal(missingTitle.status, 400);
    assert.ok(missingTitle.data.data.title);
    const invalidUpdate = await request(`${records}/${first.id}`, { method: 'PATCH', token: auth.token, body: { url: 'ftp://example.com' } });
    assert.equal(invalidUpdate.status, 400);
    assert.equal((await request(`${records}/${first.id}`)).data.url, valid.url);
  });

  await t.test('newly saved items appear first publicly; description is optional and http is accepted', async () => {
    await pause(1100); // Different creation timestamps, not accidental ID ordering.
    const newest = await api.save(auth.token, { url: 'http://example.com/newest', title: 'Newest', description: '' });
    assert.deepEqual((await api.list()).map((item) => item.id), [newest.id, first.id]);
    const noDescription = await request(records, { method: 'POST', token: auth.token,
      body: { url: 'https://example.com/optional', title: 'No description', published: false } });
    assert.equal(noDescription.status, 200);
  });

  await t.test('designated owner can update and delete items', async () => {
    const updated = await request(`${records}/${draft.data.id}`, { method: 'PATCH', token: auth.token, body: { title: 'Edited' } });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.title, 'Edited');
    assert.equal(updated.data.created, draft.data.created);
    assert.ok(Date.parse(updated.data.updated) > Date.parse(draft.data.updated));
    assert.equal((await request(`${records}/${draft.data.id}`, { method: 'DELETE', token: auth.token })).status, 204);
    assert.equal((await request(`${records}/${draft.data.id}`, { token: auth.token })).status, 404);
  });
});

test('fixed owner ID in another auth collection grants no access (before owner provisioning)', {
  skip: !binary && 'Set POCKETBASE_BINARY to a local PocketBase v0.40.4 executable',
}, async (t) => {
  // PocketBase prohibits duplicate IDs across auth collections, so this needs
  // a separate database with no Likes owner yet. It isolates the collection guard.
  const { request, adminToken } = await start(t);
  const collection = await request('collections', { method: 'POST', token: adminToken,
    body: { name: 'other_accounts', type: 'auth', fields: [{ name: 'password', type: 'password', min: 12 }], passwordAuth: { enabled: true, identityFields: ['email'] } } });
  assert.equal(collection.status, 200);
  const password = randomBytes(24).toString('hex');
  const email = 'other@example.test';
  const created = await request('collections/other_accounts/records', { method: 'POST', token: adminToken,
    body: { id: OWNER_ID, email, password, passwordConfirm: password } });
  assert.equal(created.status, 200);
  const auth = await request('collections/other_accounts/auth-with-password', { method: 'POST', body: { identity: email, password } });
  assert.equal(auth.status, 200);
  assert.equal(auth.data.record.id, OWNER_ID);
  const token = auth.data.token;
  const records = 'collections/likes_items/records';
  const body = { url: 'https://example.com/draft', title: 'Private', published: false };
  const draft = await request(records, { method: 'POST', token: adminToken, body });
  assert.equal(draft.status, 200);
  assert.equal((await request(records, { token })).data.totalItems, 0);
  assert.equal((await request(`${records}/${draft.data.id}`, { token })).status, 404);
  assert.equal((await request(records, { method: 'POST', token, body })).status, 400);
  assert.equal((await request(`${records}/${draft.data.id}`, { method: 'PATCH', token, body: { published: true } })).status, 404);
  assert.equal((await request(`${records}/${draft.data.id}`, { method: 'DELETE', token })).status, 404);
});

for (const name of ['likes_owners', 'likes_items']) {
  test(`migration refuses existing ${name} without replacing data or adding the other collection`, {
    skip: !binary && 'Set POCKETBASE_BINARY to a local PocketBase v0.40.4 executable',
  }, async (t) => {
    const { request, adminToken, dir, flags } = await start(t, { migrate: false });
    const original = await request('collections', { method: 'POST', token: adminToken,
      body: { name, type: 'base', fields: [{ name: 'marker', type: 'text' }] } });
    assert.equal(original.status, 200);
    const record = await request(`collections/${name}/records`, { method: 'POST', token: adminToken, body: { marker: 'preserve me' } });
    assert.equal(record.status, 200);
    await cp(migrations, path.join(dir, 'migrations'), { recursive: true });
    assert.throws(() => execFileSync(binary, ['migrate', 'up', ...flags], {
      cwd: dir, encoding: 'utf8', stdio: 'pipe',
    }), (error) => {
      assert.notEqual(error.status, 0);
      assert.match(`${error.stdout}${error.stderr}`, /Likes migration refused/);
      return true;
    });
    const preserved = await request(`collections/${name}`, { token: adminToken });
    assert.equal(preserved.data.id, original.data.id);
    assert.equal(preserved.data.type, 'base');
    assert.equal((await request(`collections/${name}/records/${record.data.id}`, { token: adminToken })).data.marker, 'preserve me');
    const otherName = name === 'likes_owners' ? 'likes_items' : 'likes_owners';
    assert.equal((await request(`collections/${otherName}`, { token: adminToken })).status, 404);
  });
}
