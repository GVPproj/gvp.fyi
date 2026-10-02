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
