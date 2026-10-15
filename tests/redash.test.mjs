import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRedashDataSource } from '../dist/redash.js';

test('database is resolved automatically without guessing between accessible sources', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify([{ id: 7, name: 'Database' }])));
  assert.equal(await resolveRedashDataSource('test'), 7);
  mock.mock.mockImplementation(async url => new Response(JSON.stringify(url.includes('data_sources') ? [{ id: 7 }, { id: 9 }] : { results: [{ data_source_id: 9 }] })));
  assert.equal(await resolveRedashDataSource('test'), 9);
  mock.mock.mockImplementation(async url => new Response(JSON.stringify(url.includes('data_sources') ? [{ id: 7 }, { id: 9 }] : { results: [] })));
  await assert.rejects(resolveRedashDataSource('test'), /last-used database/);
});
import { canUseRedash, REDASH_OWNER_ID, redashId, redashRequest, validateRedashConnection, redashParameters, normalizeRedashResult } from '../dist/redash.js';

test('nested Redash results render task attempts including structured responses', () => {
  const rows = [{ attempt_id: 'attempt-test', task_id: '6aac373d12b4deab10a6b001', attempted_at: '2026-10-15', review_status: 'pending', response: { text: 'test' } }];
  const columns = Object.keys(rows[0]).map(name => ({ name, type: 'string' }));
  const result = normalizeRedashResult({ id: 123, data: { rows, columns }, retrieved_at: '2026-10-15T12:00:00Z' });
  assert.deepEqual(result.rows, rows);
  assert.equal(result.columns.length, 5);
  assert.equal(result.retrieved_at, '2026-10-15T12:00:00Z');
  assert.equal(normalizeRedashResult({ data: { rows: [], columns } }).rows.length, 0);
  assert.deepEqual(normalizeRedashResult({ rows, columns }).rows, rows);
  for (const value of [null, {}, { data: {} }, { data: { rows: null, columns } }]) assert.throws(() => normalizeRedashResult(value), /invalid/);
});

test('queries run without contributor parameters and preserve arbitrary Redash defaults', () => {
  assert.deepEqual(redashParameters({}), {});
  const definition = { options: { parameters: [{ name: 'project', value: 'alpha' }, { name: 'range', value: { start: '2026-01-01', end: '2026-02-01' } }] } };
  assert.deepEqual(redashParameters(definition, { project: 'beta' }), { project: 'beta', range: { start: '2026-01-01', end: '2026-02-01' } });
  assert.throws(() => redashParameters({}, []), /JSON object/);
});

test('connection validates query API access, including users without saved queries', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://redash.scale.com/api/queries?page_size=1');
    assert.equal(options.headers.Authorization, 'Key test-secret');
    return new Response(JSON.stringify({ results: [], count: 0 }));
  });
  await validateRedashConnection('test-secret');
});
test('connection rejects unexpected payloads and Redash server failures', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  await assert.rejects(validateRedashConnection('test-secret'), /unexpected query list/);
  mock.mock.mockImplementation(async () => new Response('private stack trace', { status: 500 }));
  await assert.rejects(validateRedashConnection('test-secret'), /server error/);
});

test('Redash access requires Tomas authenticated ID and email, never another QM or demo', () => {
  assert.equal(canUseRedash({ id: REDASH_OWNER_ID, email: 'tomas.ruiz@contractors.scale.com' }), true);
  assert.equal(canUseRedash({ id: 'another-qm', email: 'tomas.ruiz@contractors.scale.com' }), false);
  assert.equal(canUseRedash({ id: REDASH_OWNER_ID, email: 'another@scale.com' }), false);
  assert.equal(canUseRedash({ id: REDASH_OWNER_ID, email: 'tomas.ruiz@contractors.scale.com', isDemo: true }), false);
  assert.equal(canUseRedash(null), false);
});
test('Redash IDs reject path manipulation', () => {
  assert.equal(redashId('123'), 123);
  for (const value of ['../users/me', 0, -1, 1.2, 'https://evil.example', null]) assert.throws(() => redashId(value));
});
test('Redash uses fixed host, authorization header, structured parameters and refuses redirects', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://redash.scale.com/api/queries/123/results');
    assert.equal(options.headers.Authorization, 'Key test-secret');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), { parameters: { outlier_id: 'test123' }, max_age: 0 });
    return new Response(JSON.stringify({ query_result: { rows: [] } }));
  });
  const result = await redashRequest('test-secret', 'queries/123/results', { parameters: { outlier_id: 'test123' }, max_age: 0 });
  assert.deepEqual(result.query_result.rows, []);
});
test('Redash error bodies cannot leak credentials or PII', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('test-secret private result', { status: 403 }));
  await assert.rejects(redashRequest('test-secret', 'users/me'), error => {
    assert.doesNotMatch(error.message, /test-secret|private result/);
    return /permissions/.test(error.message);
  });
});
