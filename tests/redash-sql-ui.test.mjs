import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { canUseRedash as backendAllowed, REDASH_OWNER_ID } from '../dist/redash.js';
const require = createRequire(import.meta.url);
require('tsx/cjs');
const { canUseRedash: uiAllowed } = require('../ui/src/lib/redash-access.ts');

test('SQL visibility uses the same exact identity and demo exclusions as backend access', () => {
  const owner = { id: REDASH_OWNER_ID, email: 'tomas.ruiz@contractors.scale.com' };
  for (const [user, allowed] of [[owner, true], [{ ...owner, email: owner.email.toUpperCase() }, true],
    [null, false], [{ ...owner, id: 'another-user' }, false], [{ ...owner, email: 'other@example.com' }, false],
    [{ ...owner, isDemo: true }, false], [{ id: REDASH_OWNER_ID }, false]]) {
    assert.equal(uiAllowed(user), allowed);
    assert.equal(uiAllowed(user), backendAllowed(user));
  }
});
