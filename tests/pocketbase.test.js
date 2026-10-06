import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { request as httpRequest } from 'node:http';
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
const hooks = fileURLToPath(new URL('../pocketbase/pb_hooks/', import.meta.url));
const migrations = fileURLToPath(new URL('../pocketbase/pb_migrations/', import.meta.url));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function start(t, { migrate = true, beforeText = false } = {}) {
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
  if (migrate) await cp(migrations, path.join(dir, 'migrations'), {
    recursive: true, filter: (source) => !beforeText || !source.endsWith('1782000000_text_items.js'),
  });
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
      assert.equal((await request(`${records}/${draft.data.id}`, { method: 'PATCH', token,
        body: { title: 'Stolen draft', commentary: 'Unauthorized', published: true } })).status, 404);
      assert.equal((await request(`${records}/${draft.data.id}`, { method: 'DELETE', token })).status, 404);
      assert.equal((await request(records, { token })).data.totalItems, 1);
      const preserved = await request(`${records}/${draft.data.id}`, { token: auth.token });
      assert.equal(preserved.data.title, 'Draft');
      assert.equal(preserved.data.published, false);
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

  await t.test('owner edits, publishes, returns to draft, and deletes without changing saved order', async () => {
    const fields = { url: 'https://example.com/private', title: 'Private', description: 'Summary', commentary: 'Original thoughts', published: false };
    const older = await api.save(auth.token, fields);
    assert.equal(older.commentary, 'Original thoughts');
    await pause(1100);
    const newer = await api.save(auth.token, { ...fields, title: 'Newer draft' });
    assert.deepEqual((await api.listDrafts(auth.token)).slice(0, 2).map((item) => item.id), [newer.id, older.id]);
    const editedFields = { url: 'https://example.com/edited', title: 'Edited', description: 'Edited summary', commentary: 'Edited thoughts' };
    const edited = await api.save(auth.token, editedFields, older.id);
    assert.equal(edited.created, older.created);
    assert.ok(Date.parse(edited.updated) > Date.parse(older.updated));
    assert.equal(edited.published, true);
    for (const [key, value] of Object.entries(editedFields)) assert.equal(edited[key], value);
    assert.equal((await request(`${records}/${older.id}`)).data.commentary, 'Edited thoughts');
    await api.save(auth.token, { ...fields, published: true }, newer.id);
    assert.deepEqual((await api.list()).slice(0, 2).map((item) => item.id), [newer.id, older.id]);
    const returned = await api.save(auth.token, { ...editedFields, published: false }, older.id);
    assert.equal(returned.created, older.created);
    assert.equal((await request(`${records}/${older.id}`)).status, 404);
    assert.ok(!(await api.list()).some((item) => item.id === older.id));
    assert.ok((await api.listDrafts(auth.token)).some((item) => item.id === older.id));
    await api.remove(auth.token, older.id);
    await api.remove(auth.token, newer.id);
    assert.equal((await request(`${records}/${older.id}`, { token: auth.token })).status, 404);
    assert.ok(!(await api.listDrafts(auth.token)).some((item) => item.id === older.id));
    assert.ok(!(await api.list()).some((item) => item.id === newer.id));
  });

  await t.test('commentary accepts 10000 characters and rejects longer edits without losing saved data', async () => {
    const fields = { ...valid, commentary: 'a'.repeat(10000), published: false };
    const item = await api.save(auth.token, fields);
    assert.equal(item.commentary, fields.commentary);
    await assert.rejects(api.save(auth.token, { ...fields, commentary: 'b'.repeat(10001) }, item.id), /link fields/);
    const preserved = await request(`${records}/${item.id}`, { token: auth.token });
    assert.equal(preserved.data.commentary, fields.commentary);
    assert.equal(preserved.data.created, item.created);
    await api.remove(auth.token, item.id);
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
  const { request, base, adminToken } = await start(t);
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
  const asset = await request(records, { method: 'POST', token: adminToken, body: upload(png, 'private.png', { published: false }) });
  assert.equal(asset.status, 200);
  const fileToken = (await request('files/token', { method: 'POST', token })).data.token;
  for (const thumb of ['', '&thumb=400x400']) {
    const result = await fetch(`${base}/api/files/likes_items/${asset.data.id}/${asset.data.asset}?token=${fileToken}${thumb}`);
    assert.ok([403, 404].includes(result.status));
  }
  const groups = 'collections/likes_collections/records';
  const group = await request(groups, { method: 'POST', token: adminToken, body: { name: 'Public grouping' } });
  assert.equal(group.status, 200);
  assert.equal((await request(groups, { method: 'POST', token, body: { name: 'Denied' } })).status, 400);
  assert.equal((await request(`${groups}/${group.data.id}`, { method: 'PATCH', token, body: { name: 'Denied' } })).status, 404);
  assert.equal((await request(`${groups}/${group.data.id}`, { method: 'DELETE', token })).status, 404);
  assert.equal((await request(`${records}/${draft.data.id}`, { method: 'PATCH', token,
    body: { collections: [group.data.id] } })).status, 404);
});

test('named collections through the PocketBase REST interface', {
  skip: !binary && 'Set POCKETBASE_BINARY to a local PocketBase v0.40.4 executable',
}, async (t) => {
  const { request, adminToken } = await start(t);
  const password = randomBytes(24).toString('hex');
  async function provision(id, email) {
    const created = await request('collections/likes_owners/records', { method: 'POST', token: adminToken,
      body: { id, email, password, passwordConfirm: password } });
    assert.equal(created.status, 200);
    const auth = await request('collections/likes_owners/auth-with-password', { method: 'POST',
      body: { identity: email, password } });
    assert.equal(auth.status, 200);
    return auth.data.token;
  }
  const token = await provision(OWNER_ID, 'owner@example.test');
  const otherToken = await provision('otherowner00001', 'other@example.test');
  const groups = 'collections/likes_collections/records';
  let group;
  await t.test('owner creates and renames a public named collection with stable identity and a bounded required name', async () => {
    const created = await request(groups, { method: 'POST', token, body: { name: 'Reading' } });
    assert.equal(created.status, 200, JSON.stringify(created));
    group = created.data;
    const renamed = await request(`${groups}/${group.id}`, { method: 'PATCH', token, body: { name: 'a'.repeat(100) } });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.id, group.id);
    assert.equal((await request(`${groups}/${group.id}`)).data.name, 'a'.repeat(100));
    assert.deepEqual((await request(groups)).data.items.map((item) => item.id), [group.id]);
    for (const name of ['', 'a'.repeat(101)]) {
      for (const [route, method] of [[groups, 'POST'], [`${groups}/${group.id}`, 'PATCH']]) {
        const invalid = await request(route, { method, token, body: { name } });
        assert.equal(invalid.status, 400);
        assert.ok(invalid.data.data.name);
      }
    }
    assert.equal((await request(`${groups}/${group.id}`)).data.name, 'a'.repeat(100));
    for (const deniedToken of [undefined, otherToken]) {
      assert.equal((await request(groups, { method: 'POST', token: deniedToken, body: { name: 'Denied' } })).status, 400);
      assert.equal((await request(`${groups}/${group.id}`, { method: 'PATCH', token: deniedToken, body: { name: 'Denied' } })).status, 404);
      assert.equal((await request(`${groups}/${group.id}`, { method: 'DELETE', token: deniedToken })).status, 404);
    }
  });

  await t.test('optional multiple memberships filter newest-saved items, preserve draft privacy, and delete non-destructively', async () => {
    const second = await request(groups, { method: 'POST', token, body: { name: 'Music' } });
    assert.equal(second.status, 200);
    const records = 'collections/likes_items/records';
    async function save(title, extra = {}) {
      const result = await request(records, { method: 'POST', token,
        body: { url: 'https://example.com/item', title, published: true, ...extra } });
      assert.equal(result.status, 200, JSON.stringify(result));
      return result.data;
    }
    const memberships = [group.id, second.data.id];
    const older = await save('Older', { collections: memberships });
    assert.deepEqual([...older.collections].sort(), [...memberships].sort());
    const ungrouped = await save('Ungrouped');
    assert.deepEqual(ungrouped.collections, []);
    const draft = await save('Secret draft', { published: false, collections: memberships });
    await pause(1100); // Saved order must not depend on random IDs or last edit time.
    const newer = await save('Newer', { collections: [group.id] });
    const renamed = await request(`${groups}/${group.id}`, { method: 'PATCH', token, body: { name: 'Renamed' } });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.id, group.id);
    assert.equal((await request(`${records}/${older.id}`, { method: 'PATCH', token, body: { title: 'Edited older' } })).status, 200);
    const filter = (id) => `${records}?${new URLSearchParams({ filter: `collections.id ?= "${id}"`, sort: '-created', expand: 'collections' })}`;
    const filtered = await request(filter(group.id));
    assert.equal(filtered.status, 200);
    assert.deepEqual(filtered.data.items.map((item) => item.id), [newer.id, older.id]);
    assert.equal(filtered.data.items[1].created, older.created);
    assert.equal(filtered.data.items[1].expand.collections.find((item) => item.id === group.id).name, 'Renamed');
    assert.deepEqual((await request(filter(second.data.id))).data.items.map((item) => item.id), [older.id]);
    assert.deepEqual(new Set((await request(records)).data.items.map((item) => item.id)), new Set([older.id, newer.id, ungrouped.id]));

    // Back-relations must enforce the item rules, not the public grouping rules.
    const reverse = `${groups}/${group.id}?expand=likes_items_via_collections`;
    for (const deniedToken of [undefined, otherToken]) {
      const expanded = await request(reverse, { token: deniedToken });
      assert.equal(expanded.status, 200);
      assert.deepEqual(new Set(expanded.data.expand.likes_items_via_collections.map((item) => item.id)), new Set([older.id, newer.id]));
      assert.equal((await request(`${records}/${draft.id}?expand=collections`, { token: deniedToken })).status, 404);
      assert.deepEqual((await request(filter(group.id), { token: deniedToken })).data.items.map((item) => item.id), [newer.id, older.id]);
      assert.equal((await request(records, { method: 'POST', token: deniedToken,
        body: { url: 'https://example.com/denied', title: 'Denied', published: true, collections: memberships } })).status, 400);
      for (const id of [older.id, draft.id]) {
        assert.equal((await request(`${records}/${id}`, { method: 'PATCH', token: deniedToken, body: { collections: [] } })).status, 404);
      }
    }
    const ownerExpanded = await request(reverse, { token });
    assert.deepEqual(new Set(ownerExpanded.data.expand.likes_items_via_collections.map((item) => item.id)), new Set([older.id, newer.id, draft.id]));
    assert.equal((await request(`${records}/${draft.id}?expand=collections`, { token })).data.expand.collections.length, 2);

    const assigned = await request(`${records}/${ungrouped.id}`, { method: 'PATCH', token, body: { collections: memberships } });
    assert.equal(assigned.status, 200);
    assert.deepEqual([...assigned.data.collections].sort(), [...memberships].sort());
    const removed = await request(`${records}/${ungrouped.id}`, { method: 'PATCH', token, body: { collections: [] } });
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.data.collections, []);
    assert.equal((await request(`${groups}/${group.id}`, { method: 'DELETE', token })).status, 204);
    assert.equal((await request(`${groups}/${group.id}`)).status, 404);
    assert.deepEqual((await request(filter(group.id))).data.items, []);
    for (const item of [older, newer, draft, ungrouped]) {
      const preserved = await request(`${records}/${item.id}`, { token });
      assert.equal(preserved.status, 200);
      assert.equal(preserved.data.created, item.created);
      assert.equal(preserved.data.published, item.published);
      assert.deepEqual(preserved.data.collections, [older.id, draft.id].includes(item.id) ? [second.data.id] : []);
    }
    assert.equal((await request(`${records}/${draft.id}`)).status, 404);
    assert.equal((await request(`${groups}/${second.data.id}`)).status, 200);
  });
});

test('collection overview: real PocketBase public totals, latest edits and empty multi-relations', {
  skip: !binary && 'Set POCKETBASE_BINARY to a local PocketBase v0.40.4 executable',
}, async (t) => {
  const { request, base, adminToken, dir, restart } = await start(t);
  // Explicit dates are fixture-only: the deployed schema keeps native autodates.
  await writeFile(path.join(dir, 'hooks/overview-fixtures.pb.js'), `
    onRecordUpdateRequest((e) => {
      if (e.hasSuperuserAuth() && e.requestInfo().body.fixtureUpdated) {
        e.record.setRaw("created", new DateTime("2026-01-01 00:00:00.000Z"));
        e.record.setRaw("updated", new DateTime(e.requestInfo().body.fixtureUpdated));
      }
      e.next();
    }, "likes_items");
  `);
  await restart();
  const api = createLikesAPI(base);
  const groups = 'collections/likes_collections/records';
  const records = 'collections/likes_items/records';
  async function create(route, body) {
    const result = await request(route, { method: 'POST', token: adminToken, body });
    assert.equal(result.status, 200, JSON.stringify(result));
    return result.data;
  }
  async function patch(id, body) {
    const result = await request(`${records}/${id}`, { method: 'PATCH', token: adminToken, body });
    assert.equal(result.status, 200, JSON.stringify(result));
    return result.data;
  }
  const reading = await create(groups, { name: 'Reading' });
  const empty = await create(groups, { name: 'Empty' });
  const art = await create(groups, { name: 'Art' });
  const drafts = await create(groups, { name: 'Drafts only' });
  const older = '2026-02-01 00:00:00.000Z';
  const recent = '2026-03-01 00:00:00.000Z';
  const id = n => `overview${String(n).padStart(7, '0')}`;
  async function seed(n, collections, updated, published = true) {
    await create(records, { id: id(n), title: `Item ${n}`, url: `https://example.com/${n}`, collections, published });
    const item = await patch(id(n), { fixtureUpdated: updated });
    assert.equal(item.updated, updated, 'Fixture edit time must actually persist');
    return item;
  }
  for (let n = 1; n <= 11; n++) {
    await seed(n, n === 1 ? [reading.id, art.id] : [reading.id], n <= 2 ? recent : older);
    await seed(n + 20, [], n <= 2 ? recent : older);
  }
  await seed(100, [reading.id, drafts.id], '2026-04-01 00:00:00.000Z', false);
  await seed(101, [], '2026-04-01 00:00:00.000Z', false);
  const rows = await api.listCollectionOverview();
  assert.deepEqual(rows.map(row => [row.id, row.name]), [
    [art.id, 'Art'], [drafts.id, 'Drafts only'], [empty.id, 'Empty'], [reading.id, 'Reading'], ['misc', 'Misc.'],
  ]);
  assert.deepEqual(rows.map(row => row.totalItems), [1, 0, 0, 11, 11]);
  assert.deepEqual(rows.map(row => row.updated), [recent, null, null, recent, recent]);
  assert.deepEqual(rows[3].items.map(item => item.id), [2, 1, 11, 10, 9, 8, 7, 6].map(id));
  assert.deepEqual(rows[4].items.map(item => item.id), [22, 21, 31, 30, 29, 28, 27, 26].map(id));
  assert.ok(rows.flatMap(row => row.items).every(item => item.published));
  assert.ok(rows[4].items.every(item => item.collections.length === 0));
  const miscPage = await api.listPage({ collection: 'misc' });
  assert.deepEqual(miscPage.items.map(item => item.id), Array.from({ length: 11 }, (_, n) => id(31 - n)));
  assert.equal(miscPage.nextCursor, null);

  // A more recent draft edit and removal from a named collection are not row history.
  await patch(id(1), { published: false });
  await patch(id(2), { collections: [] });
  const changed = await api.listCollectionOverview();
  assert.deepEqual(changed[0], { id: art.id, name: 'Art', items: [], totalItems: 0, updated: null });
  assert.equal(changed[3].totalItems, 9);
  assert.equal(changed[3].updated, older);
  assert.equal(changed[4].totalItems, 12);
  assert.equal(changed[4].items[0].id, id(2));
  assert.equal(changed[4].updated, changed[4].items[0].updated);

  // Misc. is still present when every published item has a membership.
  for (const n of [2, ...Array.from({ length: 11 }, (_, n) => n + 21)]) {
    await patch(id(n), { collections: [reading.id] });
  }
  assert.deepEqual((await api.listCollectionOverview()).at(-1), {
    id: 'misc', name: 'Misc.', items: [], totalItems: 0, updated: null,
  });
  assert.deepEqual(await api.listPage({ collection: 'misc' }), { items: [], nextCursor: null });
});

test('load more: real PocketBase keyset pagination', {
  skip: !binary && 'Set POCKETBASE_BINARY to a local PocketBase v0.40.4 executable',
}, async (t) => {
  const { request, base, adminToken, dir, restart } = await start(t);
  // Autodate fields ignore REST values in v0.40.4. This fixture-only hook
  // permits explicit superuser fixture dates, without altering deployed schema
  // or owner edits. All records still pass real HTTP validation and access rules.
  await writeFile(path.join(dir, 'hooks/pagination-fixtures.pb.js'), `
    onRecordUpdateRequest((e) => {
      if (e.hasSuperuserAuth() && e.requestInfo().body.fixtureCreated) {
        e.record.setRaw("created", new DateTime(e.requestInfo().body.fixtureCreated));
      }
      e.next();
    }, "likes_items");
  `);
  await restart();
  const api = createLikesAPI(base);
  const records = 'collections/likes_items/records';
  const password = randomBytes(24).toString('hex');
  assert.equal((await request('collections/likes_owners/records', { method: 'POST', token: adminToken,
    body: { id: OWNER_ID, email: 'paging@example.test', password, passwordConfirm: password } })).status, 200);
  const { token } = await api.login('paging@example.test', password);
  const reading = await api.saveCollection(token, 'Reading');
  const exact = await api.saveCollection(token, 'Exactly 24');
  const empty = await api.saveCollection(token, 'Drafts only');
  const recent = '2026-01-02 00:00:00.000Z';
  const older = '2026-01-01 00:00:00.000Z';
  const id = (n) => `paging${String(n).padStart(9, '0')}`;
  async function seed(n, created, extra = {}) {
    const result = await request(records, { method: 'POST', token: adminToken,
      body: { id: id(n), title: `Item ${n}`, url: `https://example.com/${n}`, published: true, created, ...extra } });
    assert.equal(result.status, 200, JSON.stringify(result));
    const dated = await request(`${records}/${result.data.id}`, { method: 'PATCH', token: adminToken, body: { fixtureCreated: created } });
    assert.equal(dated.status, 200, JSON.stringify(dated));
    assert.equal(dated.data.created, created, 'Fixture timestamp must actually be persisted');
    return dated.data;
  }
  const saved = new Map();
  for (let n = 1; n <= 53; n++) {
    saved.set(id(n), await seed(n, n <= 30 ? recent : older, {
      collections: [...(n % 2 ? [reading.id] : []), ...(n <= 24 ? [exact.id] : [])],
    }));
  }
  // Timestamps take precedence over IDs; both timestamp cohorts span a page
  // boundary. Creation order is deliberately opposite the required tie order.
  const descending = (high, low) => Array.from({ length: high - low + 1 }, (_, i) => id(high - i));
  const expected = [...descending(30, 1), ...descending(53, 31)];
  const filtered = [...descending(29, 1), ...descending(53, 31)].filter((value) => Number(value.slice(6)) % 2);
  for (const [n, created] of [[101, '2026-01-03 00:00:00.000Z'], [102, recent], [103, older]]) {
    await seed(n, created, { published: false, collections: [reading.id, exact.id, empty.id] });
  }
  const ids = (page) => page.items.map((item) => item.id);
  function checkPage(page, wanted, more) {
    assert.deepEqual(ids(page), wanted);
    assert.ok(page.items.every((item) => item.published));
    const last = page.items.at(-1);
    assert.deepEqual(page.nextCursor, more ? { created: last.created, id: last.id } : null,
      'Cursor names the last visible item, never the lookahead record');
  }

  await t.test('24-item pages cross equal timestamps without gaps and exhaust after more than two pages', async () => {
    const first = await api.listPage();
    checkPage(first, expected.slice(0, 24), true);
    const second = await api.listPage({ cursor: first.nextCursor });
    checkPage(second, expected.slice(24, 48), true);
    const third = await api.listPage({ cursor: second.nextCursor });
    checkPage(third, expected.slice(48), false);
    const all = [...ids(first), ...ids(second), ...ids(third)];
    assert.equal(new Set(all).size, 53);
    assert.deepEqual(all, expected);
    const last = third.items.at(-1);
    checkPage(await api.listPage({ cursor: { created: last.created, id: last.id } }), [], false);
    // The old all-records API stays available, not silently capped at 24.
    assert.deepEqual((await api.list()).map((item) => item.id), expected);
  });

  await t.test('newer insertion between requests neither duplicates nor skips the original remaining items', async () => {
    const first = await api.listPage();
    checkPage(first, expected.slice(0, 24), true);
    const inserted = await seed(200, '2026-01-04 00:00:00.000Z');
    try {
      const second = await api.listPage({ cursor: first.nextCursor });
      checkPage(second, expected.slice(24, 48), true);
      const third = await api.listPage({ cursor: second.nextCursor });
      checkPage(third, expected.slice(48), false);
      assert.deepEqual([...ids(first), ...ids(second), ...ids(third)], expected);
      checkPage(await api.listPage({ cursor: null }), [inserted.id, ...expected.slice(0, 23)], true);
    } finally {
      await api.remove(token, inserted.id);
    }
  });

  await t.test('collection filters apply on every page and reset independently of prior cursors', async () => {
    const first = await api.listPage({ collection: reading.id });
    checkPage(first, filtered.slice(0, 24), true);
    checkPage(await api.listPage({ collection: reading.id, cursor: first.nextCursor }), filtered.slice(24), false);
    checkPage(await api.listPage({ collection: exact.id, cursor: null }), descending(24, 1), false);
    checkPage(await api.listPage({ collection: empty.id }), [], false);
    checkPage(await api.listPage({ collection: '', cursor: null }), expected.slice(0, 24), true);
    checkPage(await api.listPage({ collection: reading.id, cursor: null }), filtered.slice(0, 24), true);
  });

  await t.test('25th published item supplies lookahead but exactly 24 items have no next cursor', async () => {
    checkPage(await api.listPage({ collection: exact.id }), descending(24, 1), false);
    const lookahead = await seed(201, older, { collections: [exact.id] });
    try {
      const first = await api.listPage({ collection: exact.id });
      checkPage(first, descending(24, 1), true);
      checkPage(await api.listPage({ collection: exact.id, cursor: first.nextCursor }), [lookahead.id], false);
    } finally {
      await api.remove(token, lookahead.id);
    }
  });

  await t.test('anonymous counts exclude drafts in All and named collections, even without a published filter', async () => {
    for (const [collection, publicCount, ownerCount] of [['', 53, 56], [reading.id, 27, 30], [exact.id, 24, 27], [empty.id, 0, 3]]) {
      const query = new URLSearchParams({ perPage: '24', ...(collection && { filter: `collections.id ?= "${collection}"` }) });
      const route = `${records}?${query}`;
      const publicList = await request(route);
      assert.equal(publicList.status, 200);
      assert.equal(publicList.data.totalItems, publicCount);
      assert.equal(publicList.data.totalPages, Math.ceil(publicCount / 24));
      assert.ok(publicList.data.items.every((item) => item.published));
      const ownerList = await request(route, { token });
      assert.equal(ownerList.status, 200);
      assert.equal(ownerList.data.totalItems, ownerCount, 'Draft fixtures exist but are private');
    }
  });

  await t.test('editing and adding or removing memberships preserve created and pagination position', async () => {
    const original = saved.get(id(32)); // Old, not initially in Reading.
    const first = await api.listPage();
    const edited = await api.save(token, { ...original, title: 'Edited old item', commentary: 'New commentary' }, original.id);
    assert.equal(edited.created, original.created);
    assert.equal(edited.title, 'Edited old item');
    const assigned = await api.save(token, { ...edited, collections: [reading.id] }, original.id);
    assert.equal(assigned.created, original.created);
    assert.deepEqual(assigned.collections, [reading.id]);
    try {
      checkPage(await api.listPage(), expected.slice(0, 24), true);
      const second = await api.listPage({ cursor: first.nextCursor });
      checkPage(second, expected.slice(24, 48), true);
      const third = await api.listPage({ cursor: second.nextCursor });
      checkPage(third, expected.slice(48), false);
      const visible = third.items.find((item) => item.id === original.id);
      assert.equal(visible.created, original.created);
      assert.equal(visible.title, 'Edited old item');
      const readingFirst = await api.listPage({ collection: reading.id });
      checkPage(readingFirst, filtered.slice(0, 24), true);
      checkPage(await api.listPage({ collection: reading.id, cursor: readingFirst.nextCursor }),
        [id(35), id(33), original.id, id(31)], false);
    } finally {
      const removed = await api.save(token, { ...edited, collections: [] }, original.id);
      assert.equal(removed.created, original.created);
      assert.deepEqual(removed.collections, []);
    }
    checkPage(await api.listPage(), expected.slice(0, 24), true);
    const readingFirst = await api.listPage({ collection: reading.id });
    checkPage(await api.listPage({ collection: reading.id, cursor: readingFirst.nextCursor }), filtered.slice(24), false);
  });
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

test('text migration preserves existing links, uploads, timestamps and restrictions', {
  skip: !binary && 'Set POCKETBASE_BINARY to a local PocketBase v0.40.4 executable',
}, async (t) => {
  const { request, adminToken: token, dir, restart } = await start(t, { beforeText: true });
  const records = 'collections/likes_items/records';
  const link = await request(records, { method: 'POST', token,
    body: { title: 'Existing link', url: 'https://example.com', commentary: 'Keep commentary', published: false } });
  const asset = await request(records, { method: 'POST', token, body: upload() });
  assert.equal(link.status, 200);
  assert.equal(asset.status, 200);
  await cp(path.join(migrations, '1782000000_text_items.js'), path.join(dir, 'migrations/1782000000_text_items.js'));
  await restart();
  for (const original of [link.data, asset.data]) {
    const result = await request(`${records}/${original.id}`, { token });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, { ...original, type: '', body: '', attribution: '' });
    assert.equal((await request(`${records}/${original.id}`, { method: 'PATCH', token, body: { title: '' } })).status, 400);
  }
  assert.equal((await request(`${records}/${link.data.id}`)).status, 404);
  assert.deepEqual((await request(records)).data.items.map((item) => item.id), [asset.data.id]);
  assert.equal((await request(`${records}/${link.data.id}`, { method: 'PATCH', token, body: { url: '' } })).status, 400);
  assert.equal((await request(`${records}/${asset.data.id}`, { method: 'PATCH', token, body: { asset: '' } })).status, 400);
});

test('quote and note HTTP contract', {
  skip: !binary && 'Set POCKETBASE_BINARY to a local PocketBase v0.40.4 executable',
}, async (t) => {
  const { request, adminToken } = await start(t);
  const password = randomBytes(24).toString('hex');
  async function login(id, email) {
    assert.equal((await request('collections/likes_owners/records', { method: 'POST', token: adminToken,
      body: { id, email, password, passwordConfirm: password } })).status, 200);
    const auth = await request('collections/likes_owners/auth-with-password', { method: 'POST', body: { identity: email, password } });
    assert.equal(auth.status, 200);
    return auth.data.token;
  }
  const token = await login(OWNER_ID, 'text-owner@example.test');
  const records = 'collections/likes_items/records';
  const save = (body, id, writer = token) => request(id ? `${records}/${id}` : records,
    { method: id ? 'PATCH' : 'POST', token: writer, body });
  await t.test('both types isolate drafts and preserve newest-saved order across publication, editing and deletion', async () => {
    const other = await login('otherowner00001', 'other-text@example.test');
    for (const type of ['quote', 'note']) {
      const older = await save({ type, body: 'Private original', published: false });
      assert.equal(older.status, 200);
      const id = older.data.id;
      const route = `${records}/${id}`;
      const list = `${records}?${new URLSearchParams({ filter: `id = "${id}"` })}`;
      assert.equal((await request(route, { token })).data.body, 'Private original');
      assert.equal((await request(list, { token })).data.totalItems, 1);
      for (const denied of [undefined, other]) {
        assert.equal((await request(route, { token: denied })).status, 404);
        assert.equal((await request(list, { token: denied })).data.totalItems, 0);
        assert.equal((await request(records, { method: 'POST', token: denied, body: { type, body: 'Denied' } })).status, 400);
        assert.equal((await request(route, { method: 'PATCH', token: denied, body: { published: true, body: 'Denied' } })).status, 404);
        assert.equal((await request(route, { method: 'DELETE', token: denied })).status, 404);
      }
      await pause(1100);
      const newer = await save({ type, body: 'Newer', published: true });
      assert.equal(newer.status, 200);
      const published = await save({ published: true, body: 'Edited text', attribution: 'Author' }, id);
      assert.equal(published.status, 200);
      assert.equal(published.data.created, older.data.created);
      assert.ok(Date.parse(published.data.updated) > Date.parse(older.data.updated));
      assert.equal((await request(route)).data.body, 'Edited text');
      const ordered = `${records}?${new URLSearchParams({ filter: `id = "${id}" || id = "${newer.data.id}"`, sort: '-created' })}`;
      assert.deepEqual((await request(ordered)).data.items.map((item) => item.id), [newer.data.id, id]);
      for (const denied of [undefined, other]) {
        assert.equal((await request(route, { method: 'PATCH', token: denied, body: { body: 'Denied' } })).status, 404);
        assert.equal((await request(route, { method: 'DELETE', token: denied })).status, 404);
      }
      assert.equal((await save({ published: false }, id)).status, 200);
      assert.equal((await request(route)).status, 404);
      assert.equal((await request(list, { token: other })).data.totalItems, 0);
      assert.equal((await request(route, { method: 'DELETE', token })).status, 204);
      assert.equal((await request(route, { token })).status, 404);
      assert.equal((await request(list, { token })).data.totalItems, 0);
      assert.equal((await request(`${records}/${newer.data.id}`, { method: 'DELETE', token })).status, 204);
    }
  });
  await t.test('text types reject new and retained assets, including type conversions', async () => {
    const asset = await save(upload());
    assert.equal(asset.status, 200);
    for (const type of ['quote', 'note']) {
      const item = await save({ type, body: 'Text' });
      assert.equal(item.status, 200);
      for (const writer of [token, adminToken]) {
        for (const id of [undefined, item.data.id]) {
          const rejected = await save(upload(png, 'text.png', { type, body: 'Text' }), id, writer);
          assert.equal(rejected.status, 400);
          assert.ok(rejected.data.data.asset);
        }
        assert.equal((await save({ type, body: 'Text' }, asset.data.id, writer)).status, 400);
      }
      assert.equal((await request(`${records}/${asset.data.id}`)).data.asset, asset.data.asset);
      assert.equal((await save({ type: '' }, item.data.id)).status, 400, 'Legacy items still need title and URL/asset');
    }
    const converted = await save({ type: 'quote', body: 'Converted', asset: '' }, asset.data.id);
    assert.equal(converted.status, 200);
    assert.equal(converted.data.asset, '');
    assert.equal(converted.data.created, asset.data.created);
  });
  await t.test('text validation rejects empty bodies, oversized fields and unsafe sources atomically', async () => {
    for (const type of ['quote', 'note']) {
      const created = await save({ type, body: 'Keep this text', published: false });
      assert.equal(created.status, 200);
      for (const writer of [token, adminToken]) {
        for (const [field, value] of [['body', ''], ['body', ' \n\t'], ['body', 'x'.repeat(100001)],
          ['attribution', 'x'.repeat(1001)], ['title', 'x'.repeat(501)], ['type', 'article'],
          ...['javascript:alert(1)', 'data:text/html,hello', 'ftp://example.com', '//example.com', 'https://user:pass@example.com'].map((url) => ['url', url])]) {
          for (const id of [undefined, created.data.id]) {
            const invalid = await save({ type, title: 'Valid', url: 'https://example.com', body: 'Keep this text', [field]: value }, id, writer);
            assert.equal(invalid.status, 400, `${type} ${field}: ${JSON.stringify(invalid)}`);
            assert.ok(invalid.data.data[field]);
          }
        }
      }
      assert.equal((await request(`${records}/${created.data.id}`, { token })).data.body, 'Keep this text');
      assert.equal((await save({ url: 'http://example.com/source' }, created.data.id)).status, 200);
      assert.equal((await save({ url: '' }, created.data.id)).status, 200);
    }
  });
  await t.test('both text types save without a title or destination and preserve literal long text', async () => {
    for (const type of ['quote', 'note']) {
      const body = '<script>alert(1)</script>\n' + 'x'.repeat(99974);
      const result = await save({ type, body, published: true });
      assert.equal(result.status, 200, JSON.stringify(result));
      const item = (await request(`${records}/${result.data.id}`)).data;
      assert.equal(item.type, type);
      assert.equal(item.body, body);
      assert.equal(item.title, '');
      assert.equal(item.url, '');
      assert.equal(item.attribution, '');
      assert.equal(item.asset, '');
      assert.equal((await save({ attribution: 'a'.repeat(1000), url: 'https://example.com/source', title: 'Optional' }, item.id)).status, 200);
    }
  });
});

// All asset assertions use the real HTTP API, including file downloads.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAyAAAAGQAQAAAAB+XjmZAAAAPklEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4NndAAAfVRSv0AAAAASUVORK5CYII=', 'base64');
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF');
function upload(bytes = png, name = 'image.png', fields = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries({ title: 'Asset', published: true, ...fields })) body.append(key, String(value));
  body.append('asset', new Blob([bytes]), name);
  return body;
}

test('asset record and file HTTP contract', {
  skip: !binary && 'Set POCKETBASE_BINARY to a local PocketBase v0.40.4 executable',
}, async (t) => {
  const { request, base, adminToken, restart } = await start(t);
  const password = randomBytes(24).toString('hex');
  async function login(id, email) {
    assert.equal((await request('collections/likes_owners/records', { method: 'POST', token: adminToken,
      body: { id, email, password, passwordConfirm: password } })).status, 200);
    return (await request('collections/likes_owners/auth-with-password', { method: 'POST', body: { identity: email, password } })).data.token;
  }
  const token = await login(OWNER_ID, 'asset-owner@example.test');
  const records = 'collections/likes_items/records';
  const save = (body, id) => request(id ? `${records}/${id}` : records, { method: id ? 'PATCH' : 'POST', token, body });
  const fileURL = (item, query = '') => `${base}/api/files/likes_items/${item.id}/${item.asset}${query}`;
  // Observe durable storage via the public superuser backup API, not a DB or
  // filesystem side channel. Python's stdlib reads the downloaded ZIP manifest.
  async function storedFiles() {
    const key = `assets-${randomBytes(8).toString('hex')}.zip`;
    assert.equal((await request('backups', { method: 'POST', token: adminToken, body: { name: key } })).status, 204);
    const ft = await request('files/token', { method: 'POST', token: adminToken });
    let response;
    for (let attempt = 0; attempt < 100; attempt++) {
      response = await fetch(`${base}/api/backups/${key}?token=${ft.data.token}`);
      if (response.ok) break;
      await pause(50);
    }
    assert.equal(response.status, 200);
    const names = JSON.parse(execFileSync('python3', ['-c',
      'import sys,io,zipfile,json; print(json.dumps(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).namelist()))'],
    { input: Buffer.from(await response.arrayBuffer()), encoding: 'utf8' }));
    assert.equal((await request(`backups/${key}`, { method: 'DELETE', token: adminToken })).status, 204);
    return names.filter((name) => name.startsWith('storage/') && !name.endsWith('/')).sort();
  }
  await t.test('reviewed URL preview bytes and provenance save atomically with protected asset lifecycle', async () => {
    const api = createLikesAPI(base);
    const previewProvenance = { fetched: { sourceURL: 'https://example.com/source', finalURL: 'https://example.com/final',
      fetchedAt: '2026-10-01T00:00:00Z', title: 'Fetched title', description: 'Fetched description',
      image: { sourceURL: 'https://example.com/image.png', finalURL: 'https://example.com/image.png', name: 'preview.png', type: 'image/png' } },
      overrides: { title: true, description: false, image: false },
      assetSource: { sourceURL: 'https://example.com/image.png', finalURL: 'https://example.com/image.png', name: 'preview.png',
        type: 'image/png', fetchedAt: '2026-10-01T00:00:00Z', pageURL: 'https://example.com/final' } };
    const before = await storedFiles();
    const item = await api.save(token, { url: 'https://example.com/source', title: 'Owner title', description: 'Fetched description',
      published: false, asset: new File([png], 'preview.png', { type: 'image/png' }), previewProvenance });
    assert.deepEqual(item.previewProvenance, previewProvenance);
    assert.ok([403, 404].includes((await fetch(fileURL(item))).status));
    const ft = await api.fileToken(token);
    assert.deepEqual(Buffer.from(await (await fetch(fileURL(item, `?token=${ft.token}`))).arrayBuffer()), png);
    await restart();
    const persisted = await request(`${records}/${item.id}`, { token });
    assert.equal(persisted.data.title, 'Owner title');
    assert.deepEqual(persisted.data.previewProvenance, previewProvenance);
    assert.equal((await save({ published: true }, item.id)).status, 200);
    assert.deepEqual((await request(`${records}/${item.id}`)).data.previewProvenance, previewProvenance);
    assert.equal((await fetch(fileURL(item, '?thumb=400x400'))).status, 200);
    assert.equal((await save({ asset: '' }, item.id)).status, 200);
    assert.deepEqual(await storedFiles(), before, 'Removing a copied preview removes original and thumbnail');
    assert.equal((await request(`${records}/${item.id}`)).data.url, 'https://example.com/source');
    await api.remove(token, item.id);
  });
  let image;
  await t.test('standalone image upload returns one filename and is publicly downloadable', async () => {
    const result = await save(upload());
    assert.equal(result.status, 200, JSON.stringify(result));
    image = result.data;
    assert.equal(image.url, '');
    assert.match(image.asset, /\.png$/);
    const response = await fetch(fileURL(image));
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  });
  await t.test('all documented formats are accepted with descriptive text and optional source', async () => {
    const formats = [
      ['jpg', '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjI4LjEwMgD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABMAAEBAAAAAAAAAAAAAAAAAAAABgEBAQAAAAAAAAAAAAAAAAAABgcQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAACAAIDASIAAhEAAxEA/9oADAMBAAIRAxEAPwCLAE1/f//Z'],
      ['gif', 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'],
      ['webp', 'UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAgA0JaACdLoB+AADsAD+8Oj3/yC5YXXI1/8gP+QH/ID/+PIAAAA='],
      ['pdf', pdf.toString('base64')],
    ];
    for (const [extension, encoded] of formats) {
      const bytes = Buffer.from(encoded, 'base64');
      const result = await save(upload(bytes, `asset.${extension}`, { description: 'Source attribution', commentary: 'My thoughts' }));
      assert.equal(result.status, 200, JSON.stringify(result));
      assert.equal(result.data.description, 'Source attribution');
      assert.equal(result.data.commentary, 'My thoughts');
      assert.deepEqual(Buffer.from(await (await fetch(fileURL(result.data))).arrayBuffer()), bytes);
    }
  });
  await t.test('extension must be supported and match detected contents, not the multipart MIME header', async () => {
    for (const [bytes, name] of [[png, 'image.svg'], [png, 'image.pdf'], [pdf, 'paper.png'], [png, 'no-extension']]) {
      const result = await save(upload(bytes, name));
      assert.equal(result.status, 400, name);
      assert.ok(result.data.data.asset, JSON.stringify(result));
    }
  });
  await t.test('native size, MIME and single-file validation rejects writes atomically', async () => {
    const max = Buffer.alloc(10 * 1024 * 1024, 32);
    pdf.copy(max);
    const accepted = await save(upload(max, 'limit.PDF', { url: 'https://example.com/source', description: 'Attribution' }));
    assert.equal(accepted.status, 200, JSON.stringify(accepted));
    assert.match(accepted.data.asset, /\.pdf$/);
    assert.equal((await fetch(fileURL(accepted.data))).headers.get('content-length'), String(max.length));
    const before = await storedFiles();
    for (const body of [upload(Buffer.concat([max, Buffer.from('x')]), 'large.pdf'),
      upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'bad.png'),
      upload(png, 'image.png', { url: 'ftp://example.com' }), upload(png, 'image.png', { title: '' })]) {
      const count = (await request(records, { token })).data.totalItems;
      assert.equal((await save(body)).status, 400);
      assert.equal((await request(records, { token })).data.totalItems, count);
    }
    const multiple = upload();
    multiple.append('asset', new Blob([pdf]), 'paper.pdf');
    assert.equal((await save(multiple)).status, 400);
    assert.equal((await save(upload(png, 'invalid.pdf'), image.id)).status, 400);
    assert.equal((await request(`${records}/${image.id}`)).data.asset, image.asset);
    assert.deepEqual(Buffer.from(await (await fetch(fileURL(image))).arrayBuffer()), png);
    assert.deepEqual(await storedFiles(), before, 'Rejected uploads leave no stored originals or thumbnails');
  });
  await t.test('interrupted multipart upload never commits a record or durable asset', async () => {
    const before = await storedFiles();
    const count = (await request(records, { token })).data.totalItems;
    const partial = httpRequest(`${base}/api/${records}`, { method: 'POST', headers: {
      Authorization: token, 'Content-Type': 'multipart/form-data; boundary=abandoned-upload',
    } });
    partial.on('error', () => {}); // Intentional client disconnect.
    partial.write('--abandoned-upload\r\nContent-Disposition: form-data; name="title"\r\n\r\nAbandoned\r\n' +
      '--abandoned-upload\r\nContent-Disposition: form-data; name="asset"; filename="abandoned.png"\r\nContent-Type: image/png\r\n\r\n');
    partial.write(png);
    await pause(50);
    partial.destroy(); // No multipart terminator, no completed record save.
    await pause(100);
    assert.equal((await request(records, { token })).data.totalItems, count);
    assert.deepEqual(await storedFiles(), before);
  });
  await t.test('draft originals and generated thumbnails check current publication and file-token identity', async () => {
    const other = await login('otherowner00001', 'other-assets@example.test');
    async function fileToken(auth) {
      const result = await request('files/token', { method: 'POST', token: auth });
      assert.equal(result.status, 200);
      return result.data.token;
    }
    const ownerFileToken = await fileToken(token);
    const privatePDF = await save(upload(pdf, 'private.pdf', { published: false }));
    assert.equal(privatePDF.status, 200);
    assert.ok([403, 404].includes((await fetch(fileURL(privatePDF.data))).status));
    assert.deepEqual(Buffer.from(await (await fetch(fileURL(privatePDF.data, `?token=${ownerFileToken}`))).arrayBuffer()), pdf);
    const otherFileToken = await fileToken(other);
    // Warm a thumbnail while public; returning to draft must protect cached thumbs too.
    const thumb = await fetch(fileURL(image, '?thumb=400x400'));
    assert.equal(thumb.status, 200);
    assert.match(thumb.headers.get('content-type'), /^image\//);
    assert.notDeepEqual(Buffer.from(await thumb.arrayBuffer()), png, 'A generated thumbnail, not fallback original');
    assert.equal((await save({ published: false }, image.id)).status, 200);
    for (const suffix of ['', '?thumb=400x400']) {
      for (const denied of [undefined, other, otherFileToken]) {
        const url = fileURL(image, suffix + (suffix ? '&' : '?') + new URLSearchParams({ token: denied || '' }));
        assert.ok([403, 404].includes((await fetch(url)).status));
        assert.ok([403, 404].includes((await fetch(fileURL(image, suffix), { headers: denied ? { Authorization: denied } : {} })).status));
      }
      assert.equal((await fetch(fileURL(image, suffix + (suffix ? '&' : '?') + `token=${ownerFileToken}`))).status, 200);
    }
    assert.equal((await save({ published: true }, image.id)).status, 200);
    assert.equal((await fetch(fileURL(image))).status, 200);
    assert.equal((await fetch(fileURL(image, '?thumb=400x400'))).status, 200);
    assert.equal((await save({ published: false }, image.id)).status, 200);
    await restart();
    const persisted = await request(`${records}/${image.id}`, { token });
    assert.equal(persisted.data.asset, image.asset);
    assert.equal(persisted.data.published, false);
    assert.ok([403, 404].includes((await fetch(fileURL(image))).status));
    assert.deepEqual(Buffer.from(await (await fetch(fileURL(image, `?token=${ownerFileToken}`))).arrayBuffer()), png);
    assert.equal((await save({ published: true }, image.id)).status, 200);
  });
  await t.test('replacement, removal and deletion retire originals/thumbs without cross-record sharing', async () => {
    const twin = await save(upload());
    assert.equal(twin.status, 200);
    assert.notEqual(twin.data.asset, image.asset);
    assert.equal((await save({ title: 'Forged reference', asset: image.asset })).status, 400);
    assert.equal((await save({ asset: image.asset }, twin.data.id)).status, 400);
    const before = await storedFiles();
    assert.ok(before.some((name) => name.includes(`thumbs_${image.asset}/`)), 'Thumbnail was durably generated');
    assert.equal((await save(upload(pdf, 'failed-replacement.pdf', { title: '' }), image.id)).status, 400);
    assert.deepEqual(await storedFiles(), before, 'Failed edit preserves original and generated thumbs');
    const replacement = await save(upload(pdf, 'replacement.pdf'), image.id);
    assert.equal(replacement.status, 200, JSON.stringify(replacement));
    assert.equal(replacement.data.created, image.created);
    for (const suffix of ['', '?thumb=400x400']) assert.equal((await fetch(fileURL(image, suffix))).status, 404);
    assert.deepEqual(Buffer.from(await (await fetch(fileURL(twin.data))).arrayBuffer()), png);
    assert.deepEqual(Buffer.from(await (await fetch(fileURL(replacement.data))).arrayBuffer()), pdf);
    const cleared = await save({ asset: '', url: 'https://example.com/source' }, image.id);
    assert.equal(cleared.status, 200);
    assert.equal(cleared.data.asset, '');
    assert.equal((await fetch(fileURL(replacement.data))).status, 404);
    assert.equal((await fetch(fileURL(twin.data, '?thumb=400x400'))).status, 200);
    assert.equal((await request(`${records}/${twin.data.id}`, { method: 'DELETE', token })).status, 204);
    for (const suffix of ['', '?thumb=400x400']) assert.equal((await fetch(fileURL(twin.data, suffix))).status, 404);
    const after = await storedFiles();
    for (const retired of [image.asset, twin.data.asset, replacement.data.asset]) {
      assert.ok(!after.some((name) => name.includes(retired)), `Original and thumbs cleaned: ${retired}`);
    }
    // Restore the fixture for the following invariant test.
    image = (await save(upload(png, 'restored.png', { url: '' }), image.id)).data;
  });
  await t.test('URL or asset is required on create and update, including superuser writes', async () => {
    for (const writer of [token, adminToken]) {
      const result = await request(records, { method: 'POST', token: writer, body: { title: 'Empty' } });
      assert.equal(result.status, 400);
      assert.match(result.data.data.url.message, /URL or an asset/);
    }
    const cleared = await save({ asset: '' }, image.id);
    assert.equal(cleared.status, 400);
    assert.equal((await request(`${records}/${image.id}`)).data.asset, image.asset);
  });
});
