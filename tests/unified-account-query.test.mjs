import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { UNIFIED_DIAGNOSTIC_SQL, UNIFIED_DIAGNOSTIC_PARAMETERS } from '../dist/unified-account-query.js';
import { unifiedModelEvidence, unifiedAccountDraft } from '../dist/unified-account-draft.js';
import { sealDiagnosticDraft } from '../dist/diagnostic-disclosure.js';
import { startAccountDiagnostic, pollAccountDiagnostic } from '../dist/redash-diagnostics.js';
import { runWithProjectContext } from '../dist/project-context.js';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
const require = createRequire(import.meta.url);
const project = '6a96fa0eeb622ed112e30794';
const id = '123456789012345678901234';
const context = { projectId: project, source: 'header', projectName: 'Money Heist', redashDiagnosticsAllowed: true };

test('unified SQL scopes identity, project and role; computes both metrics and buckets in one SELECT', () => {
  const params = [...new Set([...UNIFIED_DIAGNOSTIC_SQL.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]))].sort();
  assert.deepEqual(params, [...UNIFIED_DIAGNOSTIC_PARAMETERS].sort());
  assert.doesNotMatch(UNIFIED_DIAGNOSTIC_SQL, /TASKS_REMAINING|\b(?:UPDATE|DELETE|INSERT|DROP)\s/i);
  for (const field of ['overall_qms', 'recent_qms', 'recent_pdr', 'current_bucket', 'expected_bucket', 'tier_matches_performance', 'task_limit', 'window_hours', 'throttle_expires_at', 'project_has_tasks', 'role_has_tasks']) {
    assert.ok(UNIFIED_DIAGNOSTIC_SQL.includes(`"${field}"`), field);
  }
  assert.match(UNIFIED_DIAGNOSTIC_SQL, /permission\), -1\) >= 0, 2, 3/);
  assert.match(UNIFIED_DIAGNOSTIC_SQL, /"recent_defects" \* 3 >= "recent_graded"/);
  assert.match(UNIFIED_DIAGNOSTIC_SQL, /"recent_defects" \* 3 <= "recent_graded"/);
  assert.match(UNIFIED_DIAGNOSTIC_SQL, /COUNT\(\*\) FROM identity_matches\) = 1/);
});

test('model projection keeps approved metrics but excludes identifiers, raw tags and arbitrary columns', () => {
  const evidence = unifiedModelEvidence({ contributor_id: id, project_id: project, email: 'secret@example.com',
    project_tags: ['money_heist_disabled'], raw_secret: 'sk-secret', overall_qms: 2.25,
    recent_qms: 7/3, recent_scores: '[2,2,3]', disabled_tag: true });
  assert.equal(evidence.overall_qms, 2.25);
  assert.deepEqual(evidence.recent_scores, [2,2,3]);
  assert.equal(evidence.disabled_tag, true);
  assert.doesNotMatch(JSON.stringify(evidence), /123456|6a96|secret|money_heist_disabled/);
});

test('generated diagnostic retains real wording and scores through route and agent sealing, never auto-posts', () => {
  const reply = 'You were reallocated from Money Heist due to quality considerations (average score: 2.25).';
  const result = sealDiagnosticDraft(sealDiagnosticDraft({ diagnosticVersion: 3, reply, reason: 'Tag de disable confirmado; QMS general 2.25.', extra: 'secret' }));
  assert.equal(result.reply, reply);
  assert.equal(result.draftOnly, true);
  assert.equal(result.action, 'human');
  assert.equal(result.extra, undefined);
  const rejected = sealDiagnosticDraft({ diagnosticVersion: 3, reply: `Contact ${id}`, reason: 'Private identifier' });
  assert.doesNotMatch(rejected.reply, /123456/);
});

test('Gemini receives both averages and history; usage is counted and model text is preserved', async t => {
  const guidelines = require('../dist/project-guidelines.js');
  t.mock.method(guidelines, 'findProjectGuidelineSnippets', async () => ['Original project instructions']);
  t.mock.method(guidelines, 'projectGuidelineAiBrief', async () => '');
  t.mock.method(require('../dist/project-memory.js'), 'relevantProjectMemoryText', async () => 'QM project facts');
  const ai = require('../dist/ai-runtime.js');
  const usage = require('../dist/usage-guardrails.js');
  const calls = [];
  t.mock.method(usage, 'assertAiUsageAllowed', async () => 'reservation');
  t.mock.method(usage, 'recordAiUsage', async event => { calls.push(event); });
  t.mock.method(ai, 'generateAiText', async request => {
    const payload = JSON.parse(request.prompt);
    assert.equal(payload.evidence.overall_qms, 2.25);
    assert.equal(payload.evidence.recent_qms, 7/3);
    assert.equal(payload.conversation, 'Previous assistant: explanation already given.');
    assert.deepEqual(payload.guidelineExcerpts, ['Original project instructions']);
    assert.equal(payload.projectMemory, 'QM project facts');
    assert.equal(Object.hasOwn(payload,'optionalBrief'),false);
    return { text: JSON.stringify({ reply: 'I appreciate you taking the feedback on board. I cannot restore access myself.', qm_reason: 'Seguimiento sin prometer reactivacion.' }), model: 'gemini-test', inputTokens: 100, outputTokens: 30 };
  });
  const result = await unifiedAccountDraft({ overall_qms: 2.25, recent_qms: 7/3 }, 'Money Heist', 'Can I have another chance?', 'Previous assistant: explanation already given.');
  assert.equal(result.draftOnly, true);
  assert.match(result.reply, /cannot restore/);
  assert.equal(calls[0].model, 'gemini-test');
  assert.equal(calls[0].inputTokens, 100);
});

test('v3 uses one project-bound query, polls once and never invokes legacy identity/status queries', async t => {
  const oldKey = process.env.PLATFORM_ENCRYPTION_KEY;
  process.env.PLATFORM_ENCRYPTION_KEY = 'test-unified-only';
  t.after(() => { if(oldKey === undefined) delete process.env.PLATFORM_ENCRYPTION_KEY; else process.env.PLATFORM_ENCRYPTION_KEY = oldKey; });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(process.env.PLATFORM_ENCRYPTION_KEY).digest(), iv);
  const encrypted = Buffer.concat([cipher.update('fake-key'),cipher.final()]);
  const ciphertext = `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
  const db = require('../dist/runtime-db.js');
  t.mock.method(db, 'runtimeDbConfigured', () => true);
  t.mock.method(db, 'runtimeDb', () => ({ from: () => ({select: () => ({eq: () => ({maybeSingle: async () => ({ data: {
    key_ciphertext: ciphertext, queries: [{queryId: 33, diagnosticRole: 'unified', diagnosticProjectId: project, diagnosticVersion: 3, diagnosticEnabled: false}],
  }})})})}) }));
  const paths = [];
  t.mock.method(require('../dist/redash.js'), 'redashRequest', async (_key,path,body) => {
    paths.push(path);
    if(path==='queries/33/results') {
      assert.equal(body.parameters.project_id, project);
      assert.equal(body.parameters.email_primary, 'latam.coder779@remotasks.com+outlier');
      return {job:{id:'job-test'}};
    }
    if(path==='jobs/job-test') return {job:{status:3,query_result_id:44}};
    if(path==='query_results/44') return {query_result:{data:{columns:[],rows:[{contributor_id:id,project_id:project,identity_matches:1,overall_qms:2.25}]}}};
    throw new Error('Unexpected query');
  });
  t.mock.method(require('../dist/unified-account-draft.js'), 'unifiedAccountDraft', async () => sealDiagnosticDraft({diagnosticVersion:3,reply:'Your average score is 2.25.',reason:'Test confirmed.'}));
  const initial = await runWithProjectContext(context, () => startAccountDiagnostic('latam.coder779','I am EQ',true));
  assert.equal(initial.task.version,3);
  const complete = await runWithProjectContext(context, () => pollAccountDiagnostic(initial.task));
  assert.equal(complete.draft.reply, 'Your average score is 2.25.');
  assert.deepEqual(paths,['queries/33/results','jobs/job-test','query_results/44']);
  assert.equal(await runWithProjectContext(context, () => startAccountDiagnostic('latam.coder779','I am EQ')),null);
});
