import { readDataJSON, writeDataJSON } from './data-store';
import { OperationLogEntry, readOperationDetail, readOperationLog } from './operations-log';
import { runtimeDb, runtimeDbConfigured, runtimeScope, runtimeTableMissing } from './runtime-db';

export type ReviewQueueSource = 'community' | 'dm';
export type ReviewQueuePriority = 'high' | 'medium' | 'low';
export type ReviewQueueStatus = 'open' | 'resolved' | 'dismissed';

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
  status: ReviewQueueStatus;
  statusUpdatedAt?: string;
  statusNote?: string;
}

export interface ReviewQueueResult {
  generatedAt: string;
  items: ReviewQueueItem[];
  totals: {
    all: number;
    open: number;
    resolved: number;
    dismissed: number;
    high: number;
    medium: number;
    low: number;
    community: number;
    dm: number;
  };
}

const DETAIL_LOOKUP_LIMIT = 50;
const STATE_FILE = 'output/review-queue-state.json';

interface ReviewQueueStateRecord {
  status: ReviewQueueStatus;
  updatedAt: string;
  note?: string;
}

interface ReviewQueueState {
  items: Record<string, ReviewQueueStateRecord>;
}

export interface ReviewQueueOptions {
  includeResolved?: boolean;
}

export interface ReviewQueueStatusUpdate {
  id: string;
  status: ReviewQueueStatus;
  note?: string;
  updatedAt: string;
}

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

function isQueueStatus(value: unknown): value is ReviewQueueStatus {
  return value === 'open' || value === 'resolved' || value === 'dismissed';
}

function normalizeStatusRecord(value: unknown): ReviewQueueStateRecord | null {
  const record = asRecord(value);
  const status = record.status;
  if (!isQueueStatus(status)) return null;
  return {
    status,
    updatedAt: text(record.updatedAt) || new Date(0).toISOString(),
    note: text(record.note) || undefined,
  };
}

async function readReviewQueueState(): Promise<ReviewQueueState> {
  if (runtimeDbConfigured()) {
    try {
      const { data, error } = await runtimeDb().from('review_queue_status').select('*').eq('project_key', runtimeScope().projectKey);
      if (error) throw new Error(error.message);
      return { items: Object.fromEntries((data || []).map((row) => [row.item_id, { status: row.status, updatedAt: row.updated_at, note: row.note || undefined }])) };
    } catch (err) {
      if (!runtimeTableMissing(err)) throw err;
    }
  }
  try {
    const raw = await readDataJSON<ReviewQueueState>(STATE_FILE);
    const items = Object.entries(asRecord(raw.items)).reduce<Record<string, ReviewQueueStateRecord>>((acc, [id, value]) => {
      const record = normalizeStatusRecord(value);
      if (record) acc[id] = record;
      return acc;
    }, {});
    return { items };
  } catch {
    return { items: {} };
  }
}

async function writeReviewQueueState(state: ReviewQueueState): Promise<void> {
  const entries = Object.entries(state.items)
    .sort(([, left], [, right]) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 1000);
  await writeDataJSON(STATE_FILE, { items: Object.fromEntries(entries) }, 'update review queue state');
}

function withStatus(item: ReviewQueueItem, state: ReviewQueueState): ReviewQueueItem {
  const record = state.items[item.id];
  return {
    ...item,
    status: record?.status || 'open',
    statusUpdatedAt: record?.updatedAt,
    statusNote: record?.note,
  };
}

async function readDetailFast(entry: OperationLogEntry): Promise<unknown | undefined> {
  if (!/^[a-z0-9-]{8,80}$/i.test(entry.id)) return undefined;
  try {
    const record = await readOperationDetail(entry.id);
    return record?.detail;
  } catch {
    return undefined;
  }
}

export interface KnowledgeGap {
  id: string;
  reason: string;
  occurrences: number;
  sources: ReviewQueueSource[];
  examples: string[];
}

export async function getKnowledgeGaps(limit = 8): Promise<KnowledgeGap[]> {
  const queue = await getReviewQueue(500, { includeResolved: true });
  const groups = new Map<string, KnowledgeGap>();
  for (const item of queue.items.filter((candidate) => candidate.action === 'human')) {
    const key = item.reason.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) || 'unknown';
    const current = groups.get(key) || { id: key, reason: item.reason, occurrences: 0, sources: [], examples: [] };
    current.occurrences += 1;
    if (!current.sources.includes(item.source)) current.sources.push(item.source);
    if (current.examples.length < 3 && !current.examples.includes(item.message)) current.examples.push(item.message);
    groups.set(key, current);
  }
  return [...groups.values()].sort((left, right) => right.occurrences - left.occurrences).slice(0, Math.max(1, limit));
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
      status: 'open',
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
      status: 'open',
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
      status: 'open',
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
    status: 'open',
  }));
}

export async function updateReviewQueueItemStatus(
  id: string,
  status: ReviewQueueStatus,
  note = '',
): Promise<ReviewQueueStatusUpdate> {
  const trimmedId = text(id);
  if (!trimmedId || trimmedId.length > 260) throw new Error('Review queue item id is required.');
  if (!isQueueStatus(status)) throw new Error('Invalid review queue status.');

  const state = await readReviewQueueState();
  const updatedAt = new Date().toISOString();

  if (runtimeDbConfigured()) {
    try {
      const scope = runtimeScope();
      if (status === 'open') {
        const { error } = await runtimeDb().from('review_queue_status').delete().eq('project_key', scope.projectKey).eq('item_id', trimmedId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await runtimeDb().from('review_queue_status').upsert({ project_key: scope.projectKey, item_id: trimmedId, status, note: text(note), updated_at: updatedAt });
        if (error) throw new Error(error.message);
      }
      return { id: trimmedId, status, note: text(note) || undefined, updatedAt };
    } catch (err) {
      if (!runtimeTableMissing(err)) throw err;
    }
  }

  if (status === 'open') {
    delete state.items[trimmedId];
  } else {
    state.items[trimmedId] = {
      status,
      updatedAt,
      note: text(note) || undefined,
    };
  }

  await writeReviewQueueState(state);

  return {
    id: trimmedId,
    status,
    note: text(note) || undefined,
    updatedAt,
  };
}

export async function getReviewQueue(limit = 150, options: ReviewQueueOptions = {}): Promise<ReviewQueueResult> {
  const [entries, state] = await Promise.all([
    readOperationLog(limit),
    readReviewQueueState(),
  ]);
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

  const allItems = Array.from(byKey.values())
    .map((item) => withStatus(item, state))
    .sort((left, right) => {
      const priorityOrder: Record<ReviewQueuePriority, number> = { high: 0, medium: 1, low: 2 };
      if (left.status !== right.status) return left.status === 'open' ? -1 : right.status === 'open' ? 1 : 0;
      return priorityOrder[left.priority] - priorityOrder[right.priority] || right.runAt.localeCompare(left.runAt);
    });
  const items = allItems
    .filter((item) => options.includeResolved || item.status === 'open')
    .slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    items,
    totals: {
      all: items.length,
      open: allItems.filter((item) => item.status === 'open').length,
      resolved: allItems.filter((item) => item.status === 'resolved').length,
      dismissed: allItems.filter((item) => item.status === 'dismissed').length,
      high: items.filter((item) => item.priority === 'high').length,
      medium: items.filter((item) => item.priority === 'medium').length,
      low: items.filter((item) => item.priority === 'low').length,
      community: items.filter((item) => item.source === 'community').length,
      dm: items.filter((item) => item.source === 'dm').length,
    },
  };
}
