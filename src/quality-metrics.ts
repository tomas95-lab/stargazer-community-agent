import { readOperationLog, OperationLogEntry } from './operations-log';
import { getReviewQueue, ReviewQueueResult } from './review-queue';
import { getAiUsageSummary } from './usage-guardrails';

export interface QualityDay {
  date: string;
  messages: number;
  replies: number;
  escalations: number;
  errors: number;
}

export interface QualityMetrics {
  generatedAt: string;
  windowDays: number;
  totals: {
    runs: number;
    messages: number;
    candidates: number;
    replies: number;
    reactions: number;
    escalations: number;
    humanResolved: number;
    errors: number;
    aiTokensToday: number;
  };
  rates: {
    responseRate: number;
    escalationRate: number;
    resolutionRate: number;
    errorRate: number;
    averageEscalationConfidence: number | null;
  };
  daily: QualityDay[];
  recommendations: string[];
}

function count(metadata: Record<string, unknown> | undefined, key: string): number {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

export function aggregateQualityMetrics(
  entries: OperationLogEntry[],
  queue: Pick<ReviewQueueResult, 'items' | 'totals'>,
  windowDays = 14,
  now = new Date(),
  aiTokensToday = 0,
): QualityMetrics {
  const days = Math.max(1, Math.min(90, Math.floor(windowDays)));
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days + 1);
  start.setUTCHours(0, 0, 0, 0);
  const dailyMap = new Map<string, QualityDay>();
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    dailyMap.set(key, { date: key, messages: 0, replies: 0, escalations: 0, errors: 0 });
  }

  let messages = 0;
  let candidates = 0;
  let replies = 0;
  let reactions = 0;
  let escalations = 0;
  let errors = 0;
  let runs = 0;

  for (const entry of entries) {
    if (Date.parse(entry.at) < start.getTime()) continue;
    const day = dailyMap.get(entry.at.slice(0, 10));
    if (!day) continue;
    const metadata = entry.metadata || {};
    let relevantRun = false;
    if (entry.action === 'community_agent') {
      relevantRun = true;
      runs += 1;
      const entryMessages = count(metadata, 'checked');
      const entryCandidates = count(metadata, 'candidates');
      const entryReplies = count(metadata, 'posted');
      const entryReactions = count(metadata, 'reacted');
      const entryEscalations = count(metadata, 'needsHuman');
      messages += entryMessages;
      candidates += entryCandidates;
      replies += entryReplies;
      reactions += entryReactions;
      escalations += entryEscalations;
      day.messages += entryMessages;
      day.replies += entryReplies;
      day.escalations += entryEscalations;
    } else if (entry.action === 'dm_review') {
      relevantRun = true;
      runs += 1;
      const entryMessages = count(metadata, 'incomingMessages');
      const entryCandidates = count(metadata, 'pendingIncomingMessages');
      const entryReplies = count(metadata, 'autoReplied');
      const entryEscalations = count(metadata, 'autoNeedsHuman');
      messages += entryMessages;
      candidates += entryCandidates;
      replies += entryReplies;
      escalations += entryEscalations;
      day.messages += entryMessages;
      day.replies += entryReplies;
      day.escalations += entryEscalations;
    }
    const entryErrors = !relevantRun ? 0 : entry.status === 'error'
      ? Math.max(1, count(metadata, 'errors'))
      : count(metadata, 'errors');
    errors += entryErrors;
    day.errors += entryErrors;
  }

  const confidenceValues = queue.items
    .filter((item) => Date.parse(item.runAt) >= start.getTime() && item.action === 'human' && typeof item.confidence === 'number')
    .map((item) => item.confidence as number);
  const windowQueueItems = queue.items.filter((item) => Date.parse(item.runAt) >= start.getTime());
  const resolvedItems = windowQueueItems.filter((item) => item.status === 'resolved').length;
  const openItems = windowQueueItems.filter((item) => item.status === 'open').length;
  const averageEscalationConfidence = confidenceValues.length
    ? Math.round((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) * 1000) / 1000
    : null;
  const responseRate = rate(replies, candidates);
  const escalationRate = rate(escalations, candidates);
  const resolutionRate = rate(resolvedItems, resolvedItems + openItems);
  const errorRate = rate(errors, runs);
  const recommendations: string[] = [];
  if (escalationRate > 35) recommendations.push('Review Knowledge Gaps: the agent is escalating more than one third of candidate messages.');
  if (openItems > 10) recommendations.push('Clear the Human Review Queue to prevent unresolved support from accumulating.');
  if (errorRate > 10) recommendations.push('Open Run Details and resolve recurring automation errors before increasing autonomy.');
  if (runs === 0) recommendations.push('No Community or DM agent runs were found in this window. Run an agent scan or verify the project scheduler.');
  if (candidates > 0 && replies === 0) recommendations.push('Check response policy, confidence threshold, and project guidelines before enabling automatic replies.');
  if (!recommendations.length) recommendations.push('Quality signals are stable. Continue reviewing escalations and updating project context.');

  return {
    generatedAt: now.toISOString(),
    windowDays: days,
    totals: { runs, messages, candidates, replies, reactions, escalations, humanResolved: resolvedItems, errors, aiTokensToday },
    rates: { responseRate, escalationRate, resolutionRate, errorRate, averageEscalationConfidence },
    daily: [...dailyMap.values()],
    recommendations,
  };
}

export async function getQualityMetrics(windowDays = 14): Promise<QualityMetrics> {
  const [entries, queue, usage] = await Promise.all([
    readOperationLog(500),
    getReviewQueue(500, { includeResolved: true }),
    getAiUsageSummary(),
  ]);
  return aggregateQualityMetrics(entries, queue, windowDays, new Date(), usage.today.totalTokens);
}
