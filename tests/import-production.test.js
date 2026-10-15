import assert from 'node:assert/strict';
import test from 'node:test';
import { importCatalogue } from '../scripts/import-catalogue.mjs';
import { importEditorial } from '../scripts/import-editorial.mjs';

const production = 'https://pocketbase-fly-starter.fly.dev';

for (const importer of [importCatalogue, importEditorial]) {
  test(`${importer.name} permits only explicit production opt-in or existing loopback`, async t => {
    const stopped = new Error('Stopped at first mocked inventory read');
    let calls = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      throw stopped;
    };
    t.after(() => { globalThis.fetch = realFetch; });
    const run = (endpoint, extra = {}) => importer({ endpoint, token: 'test-only', inventory: [], ...extra });

    for (const allowProduction of [undefined, false, 'true']) {
      await assert.rejects(run(production, { allowProduction, publish: true }), /loopback/);
    }
    for (const endpoint of [
      'https://other.example',
      'http://pocketbase-fly-starter.fly.dev',
      `${production}.evil.example`,
      `${production}:8090`,
      `${production}/api`,
      `${production}/?query=1`,
      `${production}/#fragment`,
      `${production}/?`,
      `${production}/#`,
      'https://user@pocketbase-fly-starter.fly.dev',
      'https://user:password@pocketbase-fly-starter.fly.dev',
      'http://localhost:8090',
      'https://127.0.0.1',
      'http://127.0.0.1:8090/api',
    ]) {
      await assert.rejects(run(endpoint, { allowProduction: true }), /loopback/);
    }
    await assert.rejects(run(production, { allowProduction: true, token: '' }));
    assert.equal(calls, 0, 'Rejected configurations must not fetch');

    for (const publish of [false, true]) {
      for (const endpoint of [production, `${production}/`, `${production}:443/`]) {
        await assert.rejects(run(endpoint, { allowProduction: true, publish }), error => error === stopped);
      }
    }
    for (const endpoint of ['http://127.0.0.1:8090', 'http://[::1]:8090']) {
      for (const allowProduction of [false, true]) {
        await assert.rejects(run(endpoint, { allowProduction }), error => error === stopped);
      }
    }
    assert.equal(calls, 10);
  });
}
