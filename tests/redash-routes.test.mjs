import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('tsx/cjs');

test('every Redash route denies other users and admin-token callers before storage or network', async () => {
  let user = null;
  const router = require('../server/routes/redash.ts').createRedashRouter(async () => user);
  for (const identity of [null, { id: 'different-user', email: 'tomas.ruiz@contractors.scale.com' },
    { id: 'b6f44318-a33e-4d01-958c-5d591d9267bc', email: 'another-qm@example.com' },
    { id: 'b6f44318-a33e-4d01-958c-5d591d9267bc', email: 'tomas.ruiz@contractors.scale.com', isDemo: true }]) {
    user = identity;
    for (const [method, path] of [['GET', ''], ['GET', '/data-sources'], ['PUT', '/connection'], ['DELETE', '/connection'], ['POST', '/queries'], ['GET', '/queries/test/sql'], ['DELETE', '/queries/test'], ['POST', '/queries/test/run'], ['GET', '/jobs/test'], ['POST', '/diagnostics/prepare'], ['PUT', '/diagnostics'], ['POST', '/diagnostics/preview'], ['POST', '/diagnostics/preview/poll'], ['POST', '/availability/check']]) {
      const response = await new Promise((resolve, reject) => {
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ code: this.statusCode, body }); } };
        router.handle({ method, url: path || '/', headers: { 'x-admin-token': 'anything' } }, res, () => reject(new Error('Access guard was bypassed')));
      });
      assert.equal(response.code, 403, `${method} ${path}`);
      assert.deepEqual(response.body, { error: 'Access denied.' });
    }
  }
});

test('only Tomas can read saved query SQL, without credentials, defaults, results or executing queries', async t => {
  const owner = { id: 'b6f44318-a33e-4d01-958c-5d591d9267bc', email: 'tomas.ruiz@contractors.scale.com' };
  const env = { SUPABASE_URL: 'https://sql-viewer-test.supabase.co', SUPABASE_SECRET_KEY: 'test-service-key', PLATFORM_ENCRYPTION_KEY: 'sql-viewer-test-only' };
  for (const [name, value] of Object.entries(env)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  const ciphertext = require('../server/platform-store.ts').encryptSecret('test-redash-key');
  const sql = "SELECT '{{project_id}}' AS project_id";
  const calls = [];
  let missingSql = false;
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    assert.equal(options?.method || 'GET', 'GET', 'Viewing SQL must never execute or update a query');
    if (url.hostname === 'sql-viewer-test.supabase.co') {
      assert.equal(url.pathname, '/rest/v1/private_redash_connections');
      assert.equal(url.searchParams.get('owner_id'), `eq.${owner.id}`);
      return new Response(JSON.stringify({ key_ciphertext: ciphertext, queries: [{ id: 'saved', queryId: 33, name: 'My diagnostic' }] }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    assert.equal(url.origin, 'https://redash.scale.com');
    assert.equal(url.pathname, '/api/queries/33');
    assert.equal(new Headers(options.headers).get('authorization'), 'Key test-redash-key');
    return new Response(JSON.stringify({ id: 33, query: missingSql ? null : sql,
      api_key: 'PRIVATE_QUERY_KEY', latest_query_data: { rows: ['PRIVATE_CONTRIBUTOR_DATA'] },
      options: { parameters: [{ name: 'project_id', value: 'PRIVATE_DEFAULT' }] }, user: { email: 'private@example.com' },
    }), { headers: { 'content-type': 'application/json' } });
  });
  const router = require('../server/routes/redash.ts').createRedashRouter(async () => owner);
  const read = id => new Promise((resolve, reject) => {
    const headers = {};
    const res = { statusCode: 200, setHeader(name, value) { headers[name.toLowerCase()] = value; },
      status(code) { this.statusCode = code; return this; }, json(body) { resolve({ code: this.statusCode, headers, body }); } };
    router.handle({ method: 'GET', url: `/queries/${id}/sql`, headers: {} }, res, () => reject(new Error('SQL route not registered')));
  });
  const found = await read('saved');
  assert.equal(found.code, 200);
  assert.equal(found.headers['cache-control'], 'no-store');
  assert.deepEqual(found.body, { id: 'saved', queryId: 33, name: 'My diagnostic', sql, parameters: ['project_id'] });
  assert.doesNotMatch(JSON.stringify(found.body), /test-redash-key|PRIVATE_|private@example|ciphertext/);
  const before = calls.filter(path => path.startsWith('/api/')).length;
  assert.equal((await read('33')).code, 404, 'Arbitrary Redash IDs must not bypass the saved-query registry');
  assert.equal(calls.filter(path => path.startsWith('/api/')).length, before);
  missingSql = true;
  const invalid = await read('saved');
  assert.equal(invalid.code, 400);
  assert.match(invalid.body.error, /SQL/);
});
