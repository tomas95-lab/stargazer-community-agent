import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateQualityMetrics } from '../dist/quality-metrics.js';

test('quality metrics aggregate community and DM operations without double counting DM auto reply logs', () => {
  const now = new Date('2026-07-21T18:00:00.000Z');
  const entries = [
    { id: 'a', at: '2026-07-21T15:00:00.000Z', action: 'community_agent', status: 'success', message: '', metadata: { checked: 10, candidates: 4, posted: 2, reacted: 1, needsHuman: 2 } },
    { id: 'b', at: '2026-07-21T16:00:00.000Z', action: 'dm_review', status: 'success', message: '', metadata: { incomingMessages: 3, pendingIncomingMessages: 2, autoReplied: 1, autoNeedsHuman: 1 } },
    { id: 'c', at: '2026-07-21T16:01:00.000Z', action: 'dm_auto_reply', status: 'success', message: '', metadata: { replied: 1 } },
    { id: 'd', at: '2026-07-21T16:02:00.000Z', action: 'message_composer', status: 'error', message: '', metadata: {} },
  ];
  const queue = { items: [
    { action: 'human', confidence: 0.4, runAt: '2026-07-21T15:00:00.000Z', status: 'resolved' },
    { action: 'human', confidence: 0.5, runAt: '2026-07-21T15:10:00.000Z', status: 'open' },
  ], totals: { resolved: 2, open: 1 } };
  const result = aggregateQualityMetrics(entries, queue, 14, now, 500);
  assert.equal(result.totals.messages, 13);
  assert.equal(result.totals.runs, 2);
  assert.equal(result.totals.candidates, 6);
  assert.equal(result.totals.replies, 3);
  assert.equal(result.totals.escalations, 3);
  assert.equal(result.totals.aiTokensToday, 500);
  assert.equal(result.totals.humanResolved, 1);
  assert.equal(result.totals.errors, 0);
  assert.equal(result.rates.responseRate, 50);
  assert.equal(result.rates.resolutionRate, 50);
});
