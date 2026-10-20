import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runProjectAvailabilityJob, PROJECT_AVAILABILITY_SQL, EMPTY_BATCH_MESSAGE } from '../dist/project-availability-job.js';
import { runWithProjectContext } from '../dist/project-context.js';
import { REDASH_OWNER_ID } from '../dist/redash.js';
const require = createRequire(import.meta.url);
const project = '6a96fa0eeb622ed112e30794';
const context = { projectId: project, source: 'header', ownerId: REDASH_OWNER_ID,
  redashDiagnosticsAllowed: true, automationSettings: { autoPost: true },
  botConfig: { discourseApiKey: 'fake-discourse-key', discourseApiClientId: 'test-client',
    communityBaseUrl: 'https://community.outlier.ai', communityChatChannelId: '1234' } };

function setup(t) {
  const state = { saved: {}, sends: [], starts: 0, hasTasks: false, logs: [] };
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-16T18:00:00Z').getTime() });
  const running = new Set();
  t.mock.method(require('../dist/cron-locks.js'), 'withCronRunLock', async (job, key, slot, run, _now, options) => {
    assert.equal(job, 'project-task-availability');
    assert.equal(key, project);
    assert.equal(slot, 'daily');
    assert.equal(options.repeatCompleted, true);
    if (running.has(key)) return { skipped: true, reason: 'already_running' };
    running.add(key);
    try { return { skipped: false, result: await run() }; }
    finally { running.delete(key); }
  });
  t.mock.method(require('../dist/data-store.js'), 'readDataJSONOrDefault', async () => structuredClone(state.saved));
  t.mock.method(require('../dist/data-store.js'), 'writeDataJSON', async (_path, value) => { state.saved = structuredClone(value); });
  t.mock.method(require('../dist/operations-log.js'), 'appendOperationLog', async event => state.logs.push(event));
  t.mock.method(require('../dist/redash-diagnostics.js'), 'activeProjectDiagnosticConnection', async () => ({ key: 'fake-redash-key', queryId: 33 }));
  t.mock.method(require('../dist/redash.js'), 'redashRequest', async (key, path, body) => {
    assert.equal(key, 'fake-redash-key');
    if (path === 'queries/33') return { data_source_id: 30 };
    assert.equal(path, 'query_results');
    assert.equal(body.max_age, 0);
    assert.ok(body.query.includes(project));
    assert.doesNotMatch(body.query, /USER|qualified|COUNT\(/i);
    state.starts++;
    return { query_result: { data: { columns: [], rows: [{ project_id: project, project_has_tasks: state.hasTasks }] } } };
  });
  t.mock.method(require('../dist/discourse-client.js').DiscourseClient.prototype, 'sendChatMessage', async (channel, message) => {
    state.sends.push({ channel, message });
    return { message_id: 100 + state.sends.length };
  });
  return state;
}
const run = overrides => runWithProjectContext({ ...context, ...overrides }, runProjectAvailabilityJob);

test('availability query returns only a scoped boolean, never inventory quantities or contributor data', () => {
  assert.match(PROJECT_AVAILABILITY_SQL, /EXISTS/);
  assert.match(PROJECT_AVAILABILITY_SQL, /PUBLIC\.PROJECTS/);
  assert.match(PROJECT_AVAILABILITY_SQL, /h\.review_level IN \(-1, 0\)/);
  assert.doesNotMatch(PROJECT_AVAILABILITY_SQL, /COUNT\(|USER|qualified|TASKS_REMAINING|\b(?:UPDATE|DELETE|INSERT)\s/i);
  assert.doesNotMatch(EMPTY_BATCH_MESSAGE, /\d|\u2014|Support Assistant/);
  assert.match(EMPTY_BATCH_MESSAGE, /currently EQ/);
  assert.match(EMPTY_BATCH_MESSAGE, /expect to add more tasks soon/);
  assert.match(EMPTY_BATCH_MESSAGE, /work on your secondary projects/);
  assert.doesNotMatch(EMPTY_BATCH_MESSAGE, /review|completed the current batch/i);
});

test('only Tomas active automatic projects can check or publish availability', async t => {
  setup(t);
  t.mock.method(require('../dist/redash-diagnostics.js'), 'activeProjectDiagnosticConnection', async () => { throw new Error('Must not reach credentials'); });
  for (const overrides of [{ ownerId: 'another-qm' }, { redashDiagnosticsAllowed: false },
    { demoMode: true }, { automationPaused: true }, { automationSettings: { autoPost: false } },
    { automationSettings: { autoPost: true, weekdays: [] , startTime: '00:00', endTime: '00:01', timezone: 'UTC' } }]) {
    assert.equal((await run(overrides)).status, 'skipped');
  }
});

test('every run checks availability in the same day without repeating the same empty batch announcement', async t => {
  const state = setup(t);
  assert.equal((await run()).status, 'notified');
  assert.equal((await run()).status, 'already_notified');
  assert.equal(state.starts, 2);
  assert.deepEqual(state.sends, [{ channel: '1234', message: EMPTY_BATCH_MESSAGE }]);
  t.mock.timers.tick(90 * 60000);
  assert.equal((await run()).status, 'already_notified');
  assert.equal(state.starts, 3);
  assert.equal(state.sends.length, 1);
  state.hasTasks = true;
  t.mock.timers.tick(90 * 60000);
  assert.equal((await run()).status, 'available');
  assert.equal(state.saved.notice, undefined);
  state.hasTasks = false;
  t.mock.timers.tick(90 * 60000);
  assert.equal((await run()).status, 'notified');
  assert.equal(state.sends.length, 2);
});

test('manual checks return verified time and the existing announcement without sending duplicates', async t => {
  const state = setup(t);
  const first = await runWithProjectContext(context, () => runProjectAvailabilityJob({ manual: true }));
  assert.equal(first.status, 'notified');
  assert.equal(first.channelId, '1234');
  assert.equal(first.messageId, 101);
  assert.equal(first.observedAt, new Date().toISOString());
  assert.equal(first.noticeSentAt, first.observedAt);
  t.mock.timers.tick(10000);
  const second = await runWithProjectContext(context, () => runProjectAvailabilityJob({ manual: true }));
  assert.equal(second.status, 'already_notified');
  assert.equal(second.messageId, first.messageId);
  assert.equal(second.noticeSentAt, first.noticeSentAt);
  assert.notEqual(second.observedAt, first.observedAt);
  assert.equal(state.sends.length, 1);
  state.hasTasks = true;
  const available = await run();
  assert.equal(available.status, 'available');
  assert.ok(available.observedAt);
  assert.equal(available.messageId, undefined);
  assert.equal(state.saved.noticeSentAt, undefined);
});

test('legacy sent announcements remain linkable without inventing their delivery time', async t => {
  const state = setup(t);
  state.saved = { hasTasks: false, notice: 'sent', channelId: '1234', messageId: 55 };
  const result = await run();
  assert.equal(result.status, 'already_notified');
  assert.equal(result.messageId, 55);
  assert.equal(result.noticeSentAt, undefined);
  assert.equal(state.sends.length, 0);
});

test('manual and cron checks share the same concurrent lock and cannot duplicate the announcement', async t => {
  const state = setup(t);
  const results = await Promise.all([run(), runWithProjectContext(context, () => runProjectAvailabilityJob({ manual: true }))]);
  assert.equal(results.filter(result => result.status === 'notified').length, 1);
  assert.equal(state.starts, 1);
  assert.equal(state.sends.length, 1);
});

test('manual checks can run outside automation hours but cannot bypass pause or user restrictions',async t=>{
  const state=setup(t);
  const manual=overrides=>runWithProjectContext({...context,...overrides},()=>runProjectAvailabilityJob({manual:true}));
  assert.equal((await manual({automationSettings:{autoPost:false,startTime:'00:00',endTime:'00:01',timezone:'UTC'}})).status,'notified');
  assert.equal(state.logs[0].metadata.source,'manual');
  assert.equal((await manual({automationPaused:true})).status,'skipped');
  assert.equal((await manual({ownerId:'other-qm'})).status,'skipped');
  assert.equal(state.sends.length,1);
});

test('missing or invalid project evidence never becomes an empty-batch announcement', async t => {
  const state = setup(t);
  for (const rows of [[], [{ project_id: 'other', project_has_tasks: false }],
    [{ project_id: project, project_has_tasks: 'false' }]]) {
    t.mock.method(require('../dist/redash.js'), 'redashRequest', async (_key, path) => path === 'queries/33'
      ? { data_source_id: 30 } : { query_result: { data: { columns: [], rows } } });
    assert.equal((await run()).status, 'error');
  }
  assert.equal(state.sends.length, 0);
});

test('failed Redash access, disabled diagnostics and missing runtime credentials cannot post', async t => {
  const state = setup(t);
  t.mock.method(require('../dist/redash-diagnostics.js'), 'activeProjectDiagnosticConnection', async () => null);
  assert.equal((await run()).reason, 'diagnostics_disabled');
  t.mock.method(require('../dist/redash-diagnostics.js'), 'activeProjectDiagnosticConnection', async () => ({ key: 'fake', queryId: 33 }));
  t.mock.method(require('../dist/redash.js'), 'redashRequest', async () => { throw new Error('Redash unavailable'); });
  assert.equal((await run()).status, 'error');
  assert.equal(state.sends.length, 0);
});

test('uncertain send is not automatically retried, even on the next day', async t => {
  const state = setup(t);
  let sends = 0;
  t.mock.method(require('../dist/discourse-client.js').DiscourseClient.prototype, 'sendChatMessage', async () => { sends++; throw new Error('Response lost'); });
  assert.equal((await run()).status, 'error');
  assert.equal(state.saved.notice, 'uncertain');
  t.mock.timers.tick(86400000);
  const next = await run();
  assert.equal(next.status, 'already_notified');
  assert.equal(next.reason, 'delivery_requires_verification');
  assert.equal(sends, 1);
});

test('slow availability jobs resume from their saved job instead of rerunning SQL', async t => {
  const state = setup(t);
  let starts = 0;
  let complete = false;
  t.mock.method(require('../dist/redash.js'), 'redashRequest', async (_key, path) => {
    if (path === 'queries/33') return { data_source_id: 30 };
    if (path === 'query_results') { starts++; return { job: { id: 'slow-job' } }; }
    if (path === 'jobs/slow-job') {
      t.mock.timers.tick(21000);
      return { job: complete ? { status: 3, query_result_id: 44 } : { status: 2 } };
    }
    assert.equal(path, 'query_results/44');
    return { query_result: { data: { columns: [], rows: [{ project_id: project, project_has_tasks: true }] } } };
  });
  assert.equal((await run()).status, 'pending');
  assert.equal(state.saved.pendingQuery.jobId, 'slow-job');
  complete = true;
  assert.equal((await run()).status, 'available');
  assert.equal(starts, 1);
  assert.equal(state.saved.pendingQuery, undefined);
  assert.equal(state.sends.length, 0);
});
