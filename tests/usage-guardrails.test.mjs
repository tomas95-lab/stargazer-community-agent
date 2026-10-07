import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, platformAiLimits, summarizeAiUsageEvents } from '../dist/usage-guardrails.js';
import { runWithProjectContext } from '../dist/project-context.js';

test('usage guardrails estimate tokens from text length', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  assert.equal(estimateTokens(''), 1);
});

test('blocked attempts remain visible but do not consume the displayed quota', () => {
  const summary = runWithProjectContext({
    projectId: 'money-heist',
    ownerId: 'owner-1',
    source: 'header',
  }, () => summarizeAiUsageEvents([
    {
      id: 'success',
      at: '2026-10-06T12:00:00.000Z',
      utcDate: '2026-10-06',
      projectId: 'money-heist',
      ownerId: 'owner-1',
      feature: 'support_evaluation',
      model: 'gemini-test',
      inputTokens: 1000,
      outputTokens: 100,
      totalTokens: 1100,
      status: 'success',
    },
    {
      id: 'blocked',
      at: '2026-10-06T12:01:00.000Z',
      utcDate: '2026-10-06',
      projectId: 'money-heist',
      ownerId: 'owner-1',
      feature: 'support_evaluation',
      model: 'gemini-test',
      inputTokens: 3000,
      outputTokens: 0,
      totalTokens: 3000,
      status: 'blocked',
    },
  ], new Date('2026-10-06T12:05:00.000Z')));

  assert.equal(summary.today.calls, 1);
  assert.equal(summary.today.totalTokens, 1100);
  assert.equal(summary.recentEvents.length, 2);
});

test('project AI limit overrides the QM default only for that project', () => {
  const moneyHeist = runWithProjectContext({
    projectId: 'money-heist',
    ownerId: 'owner-1',
    source: 'header',
    aiConfig: { provider: 'gemini', dailyTokenLimit: 30_000, dailyCallLimit: 30 },
    automationSettings: { aiDailyTokenLimit: 100_000 },
  }, () => platformAiLimits());
  const regularProject = runWithProjectContext({
    projectId: 'regular-project',
    ownerId: 'owner-1',
    source: 'header',
    aiConfig: { provider: 'gemini', dailyTokenLimit: 30_000, dailyCallLimit: 30 },
  }, () => platformAiLimits());

  assert.equal(moneyHeist.ownerTokenLimit, 100_000);
  assert.equal(regularProject.ownerTokenLimit, 30_000);
  assert.equal(moneyHeist.ownerCallLimit, 30);
});

test('usage summary separates Gemini and Claude calls and tokens', () => {
  const summary = runWithProjectContext({
    projectId: 'provider-usage',
    ownerId: 'owner-1',
    source: 'header',
  }, () => summarizeAiUsageEvents([
    {
      id: 'gemini-call',
      at: '2026-10-07T12:00:00.000Z',
      utcDate: '2026-10-07',
      projectId: 'provider-usage',
      ownerId: 'owner-1',
      feature: 'support_evaluation',
      model: 'gemini-3.5-flash-lite',
      inputTokens: 800,
      outputTokens: 100,
      totalTokens: 900,
      status: 'success',
    },
    {
      id: 'claude-call',
      at: '2026-10-07T12:05:00.000Z',
      utcDate: '2026-10-07',
      projectId: 'provider-usage',
      ownerId: 'owner-1',
      feature: 'message_composer',
      model: 'claude-haiku-4-5',
      inputTokens: 500,
      outputTokens: 80,
      totalTokens: 580,
      status: 'success',
    },
  ], new Date('2026-10-07T12:10:00.000Z')));

  assert.deepEqual(summary.providers.gemini, { calls: 1, inputTokens: 800, outputTokens: 100, totalTokens: 900 });
  assert.deepEqual(summary.providers.claude, { calls: 1, inputTokens: 500, outputTokens: 80, totalTokens: 580 });
  assert.equal(summary.today.calls, 2);
  assert.equal(summary.today.totalTokens, 1480);
  assert.equal(summary.recentEvents[1].provider, 'claude');
});
