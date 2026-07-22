import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMS_JSON_EXAMPLE, mergeCommsTemplates, validateCommsPayload } from '../dist/comms/template-import.js';

test('comms import accepts an array and a templates wrapper', () => {
  const direct = validateCommsPayload(COMMS_JSON_EXAMPLE);
  const wrapped = validateCommsPayload({ templates: COMMS_JSON_EXAMPLE });
  assert.equal(direct.ok, true);
  assert.equal(wrapped.ok, true);
  assert.equal(direct.templates[0].id, 'aurora_daily_check_in');
});

test('comms import reports invalid categories and undeclared placeholders', () => {
  const result = validateCommsPayload([{
    ...COMMS_JSON_EXAMPLE[0],
    category: 'unknown',
    variables: [],
  }]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.path === 'category'));
  assert.ok(result.errors.some((error) => error.path === 'body' && error.message.includes('dailyThreadLink')));
});

test('comms import rejects duplicate template IDs', () => {
  const result = validateCommsPayload([COMMS_JSON_EXAMPLE[0], COMMS_JSON_EXAMPLE[0]]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.message.includes('Duplicate template ID')));
});

test('comms import append updates by ID and keeps other templates', () => {
  const existing = [{ ...COMMS_JSON_EXAMPLE[0], id: 'existing', name: 'Existing' }, COMMS_JSON_EXAMPLE[0]];
  const incoming = [{ ...COMMS_JSON_EXAMPLE[0], name: 'Updated' }];
  const result = mergeCommsTemplates(existing, incoming, 'append');
  assert.equal(result.created, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.templates.length, 2);
  assert.equal(result.templates.find((template) => template.id === 'aurora_daily_check_in')?.name, 'Updated');
});
