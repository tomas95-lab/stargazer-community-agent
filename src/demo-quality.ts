import type { OperationLogEntry } from './operations-log';
import type { ReviewQueueResult } from './review-queue';

export function demoQualityInputs(days: number, now: Date) {
  const entries: OperationLogEntry[] = [];
  const items: ReviewQueueResult['items'] = [];
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  for (let offset = 0; offset < days; offset++) {
    const day = new Date(start.getTime() - offset * 86400000);
    const date = day.toISOString().slice(0, 10);
    const variation = Math.floor(day.getTime() / 86400000) % 7;
    const checked = 24 + variation * 4;
    const candidates = 18 + variation * 2;
    const escalations = 3 + variation % 3;
    const at = new Date(Math.min(day.getTime() + 12 * 3600000, now.getTime())).toISOString();
    entries.push({ id: `demo-community-${date}`, at, action: 'community_agent', status: 'success',
      message: 'Fictional Aurora community run',
      metadata: { checked, candidates, posted: candidates - escalations, reacted: 2 + variation, needsHuman: escalations } });
    entries.push({ id: `demo-dm-${date}`, at, action: 'dm_review', status: 'success',
      message: 'Fictional Aurora DM review',
      metadata: { incomingMessages: 8 + variation, pendingIncomingMessages: 6 + variation,
        autoReplied: 5 + variation, autoNeedsHuman: 1 } });
    for (let n = 0; n < escalations + 1; n++) items.push({
      id: `demo-review-${date}-${n}`, runId: `demo-community-${date}`, runAt: at,
      source: n === escalations ? 'dm' : 'community', priority: 'medium',
      username: 'contributor.demo', message: 'Fictional support question', reason: 'Simulated QM review',
      action: 'human', confidence: 0.45 + n * 0.05,
      status: offset > 1 || n > 0 ? 'resolved' : 'open',
    });
  }
  const queue: ReviewQueueResult = { generatedAt: now.toISOString(), items,
    totals: { all: items.length, open: items.filter(item => item.status === 'open').length,
      resolved: items.filter(item => item.status === 'resolved').length, dismissed: 0, high: 0,
      medium: items.length, low: 0, community: items.filter(item => item.source === 'community').length,
      dm: items.filter(item => item.source === 'dm').length } };
  return { entries, queue, aiTokensToday: 0 };
}
