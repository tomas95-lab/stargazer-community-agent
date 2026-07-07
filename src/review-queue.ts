import { readDataJSON } from './data-store';
import { OperationDetailRecord, OperationLogEntry, readOperationLog } from './operations-log';

export type ReviewQueueSource = 'community' | 'dm';
export type ReviewQueuePriority = 'high' | 'medium' | 'low';

export interface ReviewQueueItem {
  id: string;
  runId: string;
  runAt: string;
  source: ReviewQueueSource;
  priority: ReviewQueuePriority;
  username: string;
  message: string;
  reason: string;
  action: 'human' | 'error' | 'pending';
  confidence?: number;
  channelId?: number;
  messageId?: number;
  createdAt?: string;
}

export interface ReviewQueueResult {
  generatedAt: string;
  items: ReviewQueueItem[];
  totals: {
    all: number;
    high: number;
    medium: number;
    low: number;
    community: number;
    dm: number;
  };
}

const DETAIL_LOOKUP_LIMIT = 50;
const DETAIL_DIR = 'output/operation-details';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function priorityFor(action: string, confidence?: number, hasError?: boolean): ReviewQueuePriority {
  if (hasError) return 'high';
  if (action === 'pending') return 'medium';
  if (confidence !== undefined && confidence < 0.4) return 'high';
  return 'medium';
}

function keyFor(item: ReviewQueueItem): string {
  return [
    item.source,
    item.channelId || '',
    item.messageId || '',
    item.username,
    item.createdAt || '',
    item.reason,
  ].join(':');
}

async function readDetailFast(entry: OperationLogEntry): Promise<unknown | undefined> {
  if (!/^[a-z0-9-]{8,80}$/i.test(entry.id)) return undefined;
  try {
    const record = await readDataJSON<OperationDetailRecord>(`${DETAIL_DIR}/${entry.id}.json`);
    return record.detail;
  } catch {
    return undefined;
  }
}

function communityItems(entry: OperationLogEntry, detail: unknown): ReviewQueueItem[] {
  const record = asRecord(detail);
  const decisions = asArray(record.decisions).length
    ? asArray(record.decisions)
    : asArray(asRecord(record.result).decisions);
  const items = asArray(record.items).map(asRecord);

  return decisions.flatMap((rawDecision, index) => {
    const decision = asRecord(rawDecision);
    const action = text(decision.action);
    const hasError = Boolean(decision.error);
    const needsHuman = decision.needsHuman === true || action === 'human' || hasError;
    if (!needsHuman) return [];

    const itemId = text(decision.itemId);
    const original = items.find((candidate) => text(candidate.id) === itemId);
    const messageId = numberValue(decision.chatMessageId) || numberValue(original?.chatMessageId);
    const confidence = numberValue(decision.confidence);

    return [{
      id: `${entry.id}:community:${itemId || index}`,
      runId: entry.id,
      runAt: entry.at,
      source: 'community' as const,
      priority: priorityFor(action, confidence, hasError),
      username: text(decision.username, 'unknown'),
      message: text(decision.message) || text(original?.message, 'No message captured.'),
      reason: text(decision.error) || text(decision.reason, 'Needs human review.'),
      action: hasError ? 'error' as const : 'human' as const,
      confidence,
      messageId,
      createdAt: text(original?.createdAt) || undefined,
    }];
  });
}

function pendingDmMessages(messages: Record<string, unknown>[]): Record<string, unknown>[] {
  const lastOutgoing = messages
    .slice()
    .reverse()
    .find((message) => message.incoming !== true);
  const lastOutgoingAt = lastOutgoing ? Date.parse(text(lastOutgoing.createdAt)) : 0;
  return messages.filter((message) => {
    if (message.incoming !== true) return false;
    if (!lastOutgoing) return true;
    const time = Date.parse(text(message.createdAt));
    return Number.isFinite(time) && time > lastOutgoingAt;
  });
}

function dmReviewItems(entry: OperationLogEntry, detail: unknown): ReviewQueueItem[] {
  const record = asRecord(detail);
  const result = asRecord(record.result);
  const messages = asArray(result.messages).map(asRecord);
  const grouped = new Map<number, Record<string, unknown>[]>();

  for (const message of messages) {
    const channelId = numberValue(message.channelId);
    if (!channelId) continue;
    grouped.set(channelId, [...(grouped.get(channelId) || []), message]);
  }

  const items: ReviewQueueItem[] = [];
  for (const [channelId, channelMessages] of grouped.entries()) {
    const pending = pendingDmMessages(channelMessages);
    const latest = pending[pending.length - 1];
    if (!latest) continue;

    items.push({
      id: `${entry.id}:dm-pending:${channelId}:${numberValue(latest.messageId) || 'latest'}`,
      runId: entry.id,
      runAt: entry.at,
      source: 'dm',
      priority: 'medium',
      username: text(latest.username, 'unknown'),
      message: pending.map((message) => text(message.text)).filter(Boolean).join('\n\n') || 'Pending DM message.',
      reason: `${pending.length} incoming DM message(s) after the latest outgoing reply.`,
      action: 'pending',
      channelId,
      messageId: numberValue(latest.messageId),
      createdAt: text(latest.createdAt) || undefined,
    });
  }

  return items;
}

function dmAutoReplyItems(entry: OperationLogEntry, detail: unknown): ReviewQueueItem[] {
  const record = asRecord(detail);
  const decisions = asArray(record.decisions).length
    ? asArray(record.decisions)
    : asArray(asRecord(record.result).decisions);

  return decisions.flatMap((rawDecision, index) => {
    const decision = asRecord(rawDecision);
    const action = text(decision.action);
    const hasError = Boolean(decision.error);
    if (action !== 'human' && !hasError) return [];
    const confidence = numberValue(decision.confidence);
    const channelId = numberValue(decision.channelId);
    const messageId = numberValue(decision.lastIncomingMessageId);

    return [{
      id: `${entry.id}:dm-auto:${channelId || index}:${messageId || 'latest'}`,
      runId: entry.id,
      runAt: entry.at,
      source: 'dm' as const,
      priority: priorityFor(action, confidence, hasError),
      username: text(decision.username, 'unknown'),
      message: 'DM auto-reply could not safely respond from the available context.',
      reason: text(decision.error) || text(decision.reason, 'Needs human review.'),
      action: hasError ? 'error' as const : 'human' as const,
      confidence,
      channelId,
      messageId,
    }];
  });
}

function metadataFallbackItems(entry: OperationLogEntry): ReviewQueueItem[] {
  const metadata = entry.metadata || {};
  const humanUsers = asArray(metadata.humanUsers).map((item) => text(item)).filter(Boolean);
  return humanUsers.map((username, index) => ({
    id: `${entry.id}:metadata:${index}:${username}`,
    runId: entry.id,
    runAt: entry.at,
    source: entry.action.startsWith('dm') ? 'dm' : 'community',
    priority: 'medium',
    username,
    message: 'Run metadata did not include the original message.',
    reason: 'Needs human review from automation metadata.',
    action: 'human',
  }));
}

export async function getReviewQueue(limit = 150): Promise<ReviewQueueResult> {
  const entries = await readOperationLog(limit);
  const byKey = new Map<string, ReviewQueueItem>();
  const relevantEntries = entries
    .filter((entry) => ['community_agent', 'dm_review', 'dm_auto_reply'].includes(entry.action))
    .slice(0, DETAIL_LOOKUP_LIMIT);
  const details = await Promise.all(relevantEntries.map((entry) => readDetailFast(entry)));

  for (const [index, entry] of relevantEntries.entries()) {
    const detail = details[index];
    const items = detail
      ? entry.action === 'community_agent'
        ? communityItems(entry, detail)
        : entry.action === 'dm_review'
          ? dmReviewItems(entry, detail)
          : dmAutoReplyItems(entry, detail)
      : metadataFallbackItems(entry);

    for (const item of items) {
      const key = keyFor(item);
      if (!byKey.has(key)) byKey.set(key, item);
    }
  }

  const items = Array.from(byKey.values())
    .sort((left, right) => {
      const priorityOrder: Record<ReviewQueuePriority, number> = { high: 0, medium: 1, low: 2 };
      return priorityOrder[left.priority] - priorityOrder[right.priority] || right.runAt.localeCompare(left.runAt);
    })
    .slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    items,
    totals: {
      all: items.length,
      high: items.filter((item) => item.priority === 'high').length,
      medium: items.filter((item) => item.priority === 'medium').length,
      low: items.filter((item) => item.priority === 'low').length,
      community: items.filter((item) => item.source === 'community').length,
      dm: items.filter((item) => item.source === 'dm').length,
    },
  };
}
