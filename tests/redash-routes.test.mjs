import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('tsx/cjs');

test('every Redash route denies other users and admin-token callers before storage or network', async () => {
  let user = null;
  const router = require('../server/routes/redash.ts').createRedashRouter(async () => user);
  for (const identity of [null, { id: 'different-user', email: 'tomas.ruiz@contractors.scale.com' }]) {
    user = identity;
    for (const [method, path] of [['GET', ''], ['GET', '/data-sources'], ['PUT', '/connection'], ['DELETE', '/connection'], ['POST', '/queries'], ['DELETE', '/queries/test'], ['POST', '/queries/test/run'], ['GET', '/jobs/test'], ['POST', '/diagnostics/prepare'], ['PUT', '/diagnostics'], ['POST', '/diagnostics/preview'], ['POST', '/diagnostics/preview/poll']]) {
      const response = await new Promise((resolve, reject) => {
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ code: this.statusCode, body }); } };
        router.handle({ method, url: path || '/', headers: { 'x-admin-token': 'anything' } }, res, () => reject(new Error('Access guard was bypassed')));
      });
      assert.equal(response.code, 403, `${method} ${path}`);
      assert.deepEqual(response.body, { error: 'Access denied.' });
    }
  }
});
