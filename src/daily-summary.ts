import { readOperationDetail, readOperationLog, type OperationLogEntry } from './operations-log';

export interface DailySummaryStat {
  label: string;
  value: number;
}

export interface DailySummaryActivity {
  id: string;
  at: string;
  action: string;
  status: OperationLogEntry['status'];
  message: string;
}

export interface DailySummaryPerson {
  username: string;
  source: 'community' | 'dm';
  reason: string;
  message?: string;
  confidence?: number;
}

export interface DailySummaryError {
  id: string;
  at: string;
  action: string;
  message: string;
}

export interface DailySummaryResult {
  mode: 'daily-summary';
  generatedAt: string;
  utcDate: string;
  window: {
    startUtc: string;
    endUtc: string;
  };
  totals: {
    runs: number;
    errors: number;
    dailyThreadsPublished: number;
    communityMessagesChecked: number;
    communityCandidates: number;
    communityRepliesPosted: number;
    communityReactions: number;
    communityNeedsHuman: number;
    dmIncomingMessages: number;
    dmPendingMessages: number;
    dmAutoReplies: number;
    dmNeedsHuman: number;
  };
  status: 'quiet' | 'healthy' | 'attention';
  headline: string;
  highlights: string[];
  attentionItems: DailySummaryPerson[];
  recentActivity: DailySummaryActivity[];
  errors: DailySummaryError[];
}

function utcDateLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayWindow(date = new Date()): { utcDate: string; start: Date; end: Date } {
  const utcDate = utcDateLabel(date);
  const start = new Date(`${utcDate}T00:00:00.000Z`);
  return {
    utcDate,
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}

function isWithinWindow(entry: OperationLogEntry, window: { start: Date; end: Date }): boolean {
  const time = new Date(entry.at).getTime();
  return Number.isFinite(time) && time >= window.start.getTime() && time < window.end.getTime();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueBy<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function entryActivity(entry: OperationLogEntry): DailySummaryActivity {
  return {
    id: entry.id,
    at: entry.at,
    action: entry.action,
    status: entry.status,
    message: entry.message,
  };
}

function communityAttentionFromDetail(detail: unknown): DailySummaryPerson[] {
  const record = asRecord(detail);
  const decisions = asArray(record.decisions).length
    ? asArray(record.decisions)
    : asArray(asRecord(record.result).decisions);

  return decisions.flatMap((raw): DailySummaryPerson[] => {
    const decision = asRecord(raw);
    const action = text(decision.action);
    const hasError = Boolean(decision.error);
    const needsHuman = decision.needsHuman === true || action === 'human' || hasError;
    if (!needsHuman) return [];

    return [{
      username: text(decision.username, 'unknown'),
      source: 'community',
      reason: text(decision.error) || text(decision.reason, 'Needs human review.'),
      message: text(decision.message) || undefined,
      confidence: numberValue(decision.confidence),
    }];
  });
}

function dmAttentionFromDetail(detail: unknown): DailySummaryPerson[] {
  const record = asRecord(detail);
  const result = asRecord(record.result);
  const threads = asArray(result.threads);
  const autoReply = asRecord(result.autoReply);
  const decisions = asArray(autoReply.decisions);
  const items: DailySummaryPerson[] = [];

  for (const rawThread of threads) {
    const thread = asRecord(rawThread);
    if (thread.needsReply !== true && numberValue(thread.pendingIncomingMessages) <= 0) continue;
    items.push({
      username: text(thread.channelTitle, `Channel ${numberValue(thread.channelId)}`),
      source: 'dm',
      reason: `${numberValue(thread.pendingIncomingMessages)} pending incoming DM message(s).`,
    });
  }

  for (const rawDecision of decisions) {
    const decision = asRecord(rawDecision);
    const action = text(decision.action);
    const hasError = Boolean(decision.error);
    if (action !== 'human' && !hasError) continue;
    items.push({
      username: text(decision.username, `Channel ${numberValue(decision.channelId)}`),
      source: 'dm',
      reason: text(decision.error) || text(decision.reason, 'Needs human review.'),
      confidence: numberValue(decision.confidence),
    });
  }

  return items;
}

function dailyThreadCount(entry: OperationLogEntry): number {
  if (entry.action === 'daily_publish_job' && entry.status === 'success') return 1;
  return numberValue(entry.metadata?.published);
}

function highlightLine(label: string, value: number, singular: string, plural: string): string | null {
  if (value <= 0) return null;
  return `${label}: ${value} ${value === 1 ? singular : plural}.`;
}

export async function getDailySummary(date = new Date()): Promise<DailySummaryResult> {
  const window = dayWindow(date);
  const entries = (await readOperationLog(500))
    .filter((entry) => isWithinWindow(entry, window));
  const detailRecords = await Promise.all(entries.map((entry) => readOperationDetail(entry.id).catch(() => null)));

  const totals: DailySummaryResult['totals'] = {
    runs: entries.length,
    errors: entries.filter((entry) => entry.status === 'error').length,
    dailyThreadsPublished: 0,
    communityMessagesChecked: 0,
    communityCandidates: 0,
    communityRepliesPosted: 0,
    communityReactions: 0,
    communityNeedsHuman: 0,
    dmIncomingMessages: 0,
    dmPendingMessages: 0,
    dmAutoReplies: 0,
    dmNeedsHuman: 0,
  };
  const attentionItems: DailySummaryPerson[] = [];

  for (const [index, entry] of entries.entries()) {
    const metadata = entry.metadata || {};
    const detail = detailRecords[index]?.detail;

    totals.dailyThreadsPublished += dailyThreadCount(entry);

    if (entry.action === 'community_agent') {
      totals.communityMessagesChecked += numberValue(metadata.checked);
      totals.communityCandidates += numberValue(metadata.candidates);
      totals.communityRepliesPosted += numberValue(metadata.posted);
      totals.communityReactions += numberValue(metadata.reacted);
      totals.communityNeedsHuman += numberValue(metadata.needsHuman);
      attentionItems.push(...communityAttentionFromDetail(detail));
    }

    if (entry.action === 'dm_review') {
      totals.dmIncomingMessages += numberValue(metadata.incomingMessages);
      totals.dmPendingMessages += numberValue(metadata.pendingIncomingMessages);
      totals.dmAutoReplies += numberValue(metadata.autoReplied);
      totals.dmNeedsHuman += numberValue(metadata.autoNeedsHuman);
      attentionItems.push(...dmAttentionFromDetail(detail));
    }

    if (entry.action === 'dm_auto_reply') {
      totals.dmAutoReplies += numberValue(metadata.replied);
      totals.dmNeedsHuman += numberValue(metadata.needsHuman);
      attentionItems.push(...dmAttentionFromDetail(detail));
    }
  }

  const dedupedAttention = uniqueBy(
    attentionItems,
    (item) => `${item.source}:${item.username}:${item.reason}:${item.message || ''}`,
  ).slice(0, 20);
  const errors = entries
    .filter((entry) => entry.status === 'error')
    .map((entry) => ({
      id: entry.id,
      at: entry.at,
      action: entry.action,
      message: entry.message,
    }))
    .slice(0, 12);
  const highlights = [
    highlightLine('Daily threads', totals.dailyThreadsPublished, 'thread published', 'threads published'),
    highlightLine('Community agent', totals.communityMessagesChecked, 'message checked', 'messages checked'),
    highlightLine('Community replies', totals.communityRepliesPosted, 'reply posted', 'replies posted'),
    highlightLine('Community reactions', totals.communityReactions, 'reaction added', 'reactions added'),
    highlightLine('DM review', totals.dmIncomingMessages, 'incoming DM found', 'incoming DMs found'),
    highlightLine('DM auto-replies', totals.dmAutoReplies, 'reply sent', 'replies sent'),
  ].filter((item): item is string => Boolean(item));

  const status: DailySummaryResult['status'] = errors.length > 0 || dedupedAttention.length > 0
    ? 'attention'
    : entries.length > 0
      ? 'healthy'
      : 'quiet';
  const headline = status === 'attention'
    ? `${dedupedAttention.length + errors.length} item(s) need attention today.`
    : status === 'healthy'
      ? 'Automation ran today with no pending human review found.'
      : 'No automation activity has been recorded for this UTC day yet.';

  return {
    mode: 'daily-summary',
    generatedAt: new Date().toISOString(),
    utcDate: window.utcDate,
    window: {
      startUtc: window.start.toISOString(),
      endUtc: window.end.toISOString(),
    },
    totals,
    status,
    headline,
    highlights,
    attentionItems: dedupedAttention,
    recentActivity: entries.slice(0, 12).map(entryActivity),
    errors,
  };
}
