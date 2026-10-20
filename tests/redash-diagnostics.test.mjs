import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { runWithProjectContext } from '../dist/project-context.js';
import { isAccountStatusQuestion, inferredContributorEmail, verifiedContributorId, safeDiagnosticDraft, accountDiagnosticDraft, pollAccountDiagnostic } from '../dist/redash-diagnostics.js';
const require = createRequire(import.meta.url);
const id = '123456789012345678901234';
const project = '6a96fa0eeb622ed112e30794';
const base = { contributor_id: id, project_id: project, permission_verified: true, access_disabled: false, quality_disabled: false, throttled: false, project_empty: false, project_has_tasks: true, tag_evidence_checked: true, tag_access_review: false, tag_throttle_hint: false, tag_onboarding_hint: false, tag_unknown: false };

test('confirmed throttle is explained even when project availability is missing', () => {
  const result = safeDiagnosticDraft({ ...base, throttled: true, project_empty: null, project_has_tasks: null }, id, project);
  assert.match(result.reply, /temporarily limited/);
  assert.match(result.reason, /unexpired project-specific throttle/);
});

test('generic drafts explain the actual blocker to the QM without exposing raw evidence', () => {
  for (const [override, expected] of [
    [{ project_empty: null }, /availability was not returned/],
    [{ throttled: null }, /evidence is incomplete/],
    [{ tag_unknown: true }, /unmapped project tag/],
    [{ tag_onboarding_hint: true }, /course completion/],
    [{ tag_throttle_hint: true }, /does not confirm an active throttle/],
  ]) {
    const result = safeDiagnosticDraft({ ...base, ...override }, id, project);
    assert.match(result.reason, expected);
    assert.match(result.reply, /QM needs to verify/);
  }
});

test('confirmed individual non-EQ status produces refresh draft without assuming missing evidence means healthy', () => {
  const healthy = { ...base, individual_eq: false, qualified: true, project_empty: null, project_has_tasks: null, tag_onboarding_hint: true, tag_unknown: true };
  const result = safeDiagnosticDraft(healthy, id, project);
  assert.equal(result.reply, "I don't see any EQ restriction or active throttle on your account. Please refresh the page and try again.");
  assert.equal(result.draftOnly, true);
  for (const override of [{ individual_eq: null }, { individual_eq: true }, { throttled: null }, { throttled: true }, { access_disabled: true }, { tag_access_review: true }, { project_empty: true }]) {
    assert.doesNotMatch(safeDiagnosticDraft({ ...healthy, ...override }, id, project).reply, /Please refresh/);
  }
});

test('account diagnostics recognize EQ and account access questions in English and Spanish', () => {
  for (const message of ['Estoy EQ', 'I am throttled', 'No tengo tareas', 'My account is suspended', 'I am not eligible', 'deshabilitado por quality']) assert.equal(isAccountStatusQuestion(message), true, message);
  assert.equal(isAccountStatusQuestion('Thank you for the webinar!'), false);
});

test('project availability questions activate diagnostics without an individual EQ claim', () => {
  for (const message of ['el proyecto tiene tareas?', 'El proyecto tiene tareas disponibles?',
    'Hay tareas en el proyecto?', 'Quedan tareas para el proyecto?', 'El proyecto esta EQ?',
    'Does the project have tasks?', 'Does the project have any work?', 'Is the project empty?',
    'Are there tasks available in the project?']) assert.equal(isAccountStatusQuestion(message), true, message);
  for (const message of ['Where are the project guidelines?', 'Thanks for reviewing my tasks!']) {
    assert.equal(isAccountStatusQuestion(message), false, message);
  }
});
test('username inference never becomes a confirmed identity without one exact match', () => {
  const email = 'latam.coder499@remotasks.com+outlier';
  assert.equal(inferredContributorEmail('latam.coder499'), email);
  assert.equal(inferredContributorEmail('other-user'), null);
  assert.equal(inferredContributorEmail('latam.coder499 OR 1=1'), null);
  assert.equal(verifiedContributorId([{ contributor_id: id, email }], email), id);
  assert.equal(verifiedContributorId([{ contributor_id: id, email: 'another@example.com' }], email), null);
  assert.equal(verifiedContributorId([{ contributor_id: id, email }, { contributor_id: id, email }], email), null);
});
test('safe drafts withhold task counts and private evidence while allowing approved project causes', () => {
  for (const row of [
    { ...base, project_empty: true, project_has_tasks: false },
    { ...base, project_empty: false, project_has_tasks: true, task_count: 8347 },
    { ...base, quality_disabled: true, disable_reason: 'private internal decision', score: 0.1234 },
    { ...base, throttled: true, throttle_limit: 12345 },
  ]) {
    const result = safeDiagnosticDraft(row, id, project);
    assert.equal(result.draftOnly, true);
    assert.equal(result.action, 'human');
    assert.doesNotMatch(result.reply, /8347|12345|0\.1234|private internal|score/i);
    assert.doesNotMatch(result.reply, /\d/);
  }
  assert.match(safeDiagnosticDraft({ ...base, project_empty: true, project_has_tasks: false }, id, project).reply, /currently EQ/);
  assert.doesNotMatch(safeDiagnosticDraft({ ...base, project_empty: true, project_has_tasks: true }, id, project).reply, /currently EQ/);
});
test('wrong identity, unknown booleans and unrelated project never produce specific account conclusions', () => {
  for (const row of [{ ...base, contributor_id: 'other', throttled: true }, { ...base, project_id: 'other', project_empty: true }, { ...base, permission_verified: false, throttled: true }, { ...base, throttled: 'true' }]) {
    const result = safeDiagnosticDraft(row, id, project);
    assert.match(result.reply, /QM needs to verify/);
  }
});
test('other QMs and demo runs cannot reach Redash diagnostics storage', async t => {
  const db = require('../dist/runtime-db.js');
  t.mock.method(db, 'runtimeDb', () => { throw new Error('Storage must not be reached'); });
  for (const context of [{ projectId: project, source: 'header', ownerId: 'another-qm' }, { projectId: project, source: 'header', redashDiagnosticsAllowed: true, demoMode: true }]) {
    assert.equal(await runWithProjectContext(context, () => accountDiagnosticDraft('latam.coder499', 'Estoy EQ')), null);
  }
});
test('support evaluator returns diagnostic drafts before the normal model reply path', async t => {
  const diagnostics = require('../dist/redash-diagnostics.js');
  const { evaluateSupportMessage } = require('../dist/community-agent.js');
  t.mock.method(diagnostics, 'accountDiagnosticDraft', async () => safeDiagnosticDraft({ ...base, throttled: true }, id, project));
  const result = await evaluateSupportMessage('latam.coder499', 'Estoy EQ', '', '', false);
  assert.equal(result.action, 'human');
  assert.equal(result.draftOnly, true);
  assert.match(result.reply, /temporarily limited/);
});

test('account diagnostic executes bound queries using verified sender identity and never forwards raw evidence', async t => {
  const oldKey = process.env.PLATFORM_ENCRYPTION_KEY;
  process.env.PLATFORM_ENCRYPTION_KEY = 'test-only-diagnostic-secret';
  t.after(() => { if (oldKey === undefined) delete process.env.PLATFORM_ENCRYPTION_KEY; else process.env.PLATFORM_ENCRYPTION_KEY = oldKey; });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(process.env.PLATFORM_ENCRYPTION_KEY).digest(), iv);
  const encrypted = Buffer.concat([cipher.update('fake-redash-key', 'utf8'), cipher.final()]);
  const ciphertext = `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
  const db = require('../dist/runtime-db.js');
  t.mock.method(db, 'runtimeDbConfigured', () => true);
  t.mock.method(db, 'runtimeDb', () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
    key_ciphertext: ciphertext,
    queries: ['identity', 'status'].map((role, index) => ({ queryId: index + 1, diagnosticRole: role, diagnosticProjectId: project, diagnosticEnabled: true, diagnosticVersion: 2 })),
  }, error: null }) }) }) }) }));
  const calls = [];
  t.mock.method(require('../dist/redash.js'), 'redashRequest', async (key, path, body) => {
    assert.equal(key, 'fake-redash-key');
    calls.push({ path, body });
    const row = path.includes('/1/') ? { contributor_id: id, email: 'latam.coder499@remotasks.com+outlier' } : { ...base, project_has_tasks: true, project_empty: false, throttled: true, secret: 'private-value', task_count: 8347 };
    return { query_result: { data: { columns: Object.keys(row).map(name => ({ name })), rows: [row] } } };
  });
  const result = await runWithProjectContext({ projectId: project, source: 'header', redashDiagnosticsAllowed: true }, () => accountDiagnosticDraft('latam.coder499', 'Estoy EQ. Another person is latam.coder123'));
  assert.equal(result.action, 'human');
  assert.equal(result.draftOnly, true);
  assert.equal(calls[0].body.parameters.email_primary, 'latam.coder499@remotasks.com+outlier');
  assert.deepEqual(calls[1].body.parameters, { contributor_id: id, project_id: project, project_tag_prefix: 'money_heist' });
  assert.doesNotMatch(JSON.stringify(result), /fake-redash-key|private-value|8347|123456789012345678901234/);
});

test('verified Money Heist disable policy explains quality reassignment for any matched contributor without private details', () => {
  for (const contributorId of ['111111111111111111111111', '222222222222222222222222']) {
    const result = safeDiagnosticDraft({ ...base, contributor_id: contributorId, tag_access_review: true }, contributorId, project);
    assert.match(result.reply, /reassigned from Money Heist due to quality requirements/);
    assert.doesNotMatch(result.reply, /disabled|tag|score|\d/);
    assert.equal(result.draftOnly, true);
  }
  assert.match(safeDiagnosticDraft({ ...base, tag_throttle_hint: true }, id, project).reply, /QM needs to verify/);
  assert.match(safeDiagnosticDraft({ ...base, tag_evidence_checked: false }, id, project).reply, /QM needs to verify/);
  const otherProject = 'abcdefabcdefabcdefabcdef';
  const other = safeDiagnosticDraft({ ...base, project_id: otherProject, tag_access_review: true }, id, otherProject);
  assert.doesNotMatch(other.reply, /Money Heist|quality requirements|reassigned/);
  assert.match(safeDiagnosticDraft({ ...base, access_disabled: true }, id, project).reply, /quality requirements/);
});

test('preview polling rejects expired sessions and other project contexts before query access', async () => {
  for (const task of [
    { ownerId: 'other', projectId: project, expires: Date.now() + 60000, phase: 'identity', jobId: 'test' },
    { ownerId: 'b6f44318-a33e-4d01-958c-5d591d9267bc', projectId: 'other', expires: Date.now() + 60000, phase: 'identity', jobId: 'test' },
    { ownerId: 'b6f44318-a33e-4d01-958c-5d591d9267bc', projectId: project, expires: 0, phase: 'identity', jobId: 'test' },
  ]) await assert.rejects(runWithProjectContext({ projectId: project, source: 'header', redashDiagnosticsAllowed: true }, () => pollAccountDiagnostic(task)), /expired or is not authorized/);
});
