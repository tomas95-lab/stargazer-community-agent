import { randomUUID } from 'crypto';
import { loadBotConfig } from './config';
import { readDataJSON, writeDataJSON } from './data-store';
import { DiscourseClient } from './discourse-client';
import { appendOperationLog } from './operations-log';
import { assertProjectAutomationActive } from './project-context';
import { APP_TIME_ZONE_LABEL, zonedTimeToUtc } from './timezone';
import { runtimeDb, runtimeDbConfigured, runtimeScope, runtimeTableMissing } from './runtime-db';

const FILE = 'data/scheduled-messages.json';

export type ScheduledMessageStatus = 'pending' | 'sent' | 'cancelled' | 'error';

export interface ScheduledMessage {
  id: string;
  message: string;
  channelId?: string;
  scheduledDate: string;
  scheduledTime: string;
  scheduledFor: string;
  status: ScheduledMessageStatus;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  messageId?: number;
  error?: string;
}

export interface ScheduledMessageInput {
  message: string;
  channelId?: string;
  scheduledDate: string;
  scheduledTime: string;
}

export interface ScheduledMessagesRunResult {
  mode: 'scheduled-messages';
  generatedAt: string;
  checked: number;
  due: number;
  sent: number;
  failed: number;
  skipped: number;
  messages: ScheduledMessage[];
  errors: string[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validateDate(value: string): [number, number, number] {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('Scheduled date must use YYYY-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error('Scheduled date is invalid.');
  }
  return [year, month, day];
}

function validateTime(value: string): [number, number] {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new Error(`Scheduled time must use HH:mm ${APP_TIME_ZONE_LABEL}.`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('Scheduled time is invalid.');
  }
  return [hours, minutes];
}

export function scheduledDateTimeToUtc(date: string, time: string): Date {
  const [year, month, day] = validateDate(date);
  const [hours, minutes] = validateTime(time);
  return zonedTimeToUtc(year, month, day, hours, minutes, 0);
}

function sortMessages(messages: ScheduledMessage[]): ScheduledMessage[] {
  const rank: Record<ScheduledMessageStatus, number> = {
    pending: 0,
    error: 1,
    sent: 2,
    cancelled: 3,
  };
  return messages.slice().sort((left, right) => {
    const statusDiff = rank[left.status] - rank[right.status];
    if (statusDiff !== 0) return statusDiff;
    return left.scheduledFor.localeCompare(right.scheduledFor);
  });
}

async function readMessages(): Promise<ScheduledMessage[]> {
  if (runtimeDbConfigured()) {
    try {
      const { data, error } = await runtimeDb().from('scheduled_messages').select('*')
        .eq('project_key', runtimeScope().projectKey).order('scheduled_for', { ascending: true });
      if (error) throw new Error(error.message);
      return sortMessages((data || []).map((row) => ({
        id: row.id,
        message: row.message,
        channelId: row.channel_id || undefined,
        scheduledDate: row.scheduled_date,
        scheduledTime: row.scheduled_time,
        scheduledFor: row.scheduled_for,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        sentAt: row.sent_at || undefined,
        messageId: row.discourse_message_id || undefined,
        error: row.error || undefined,
      })) as ScheduledMessage[]);
    } catch (err) {
      if (!runtimeTableMissing(err)) throw err;
    }
  }
  try {
    const messages = await readDataJSON<ScheduledMessage[]>(FILE);
    return Array.isArray(messages) ? sortMessages(messages) : [];
  } catch {
    return [];
  }
}

async function writeMessages(messages: ScheduledMessage[], reason: string): Promise<ScheduledMessage[]> {
  const sorted = sortMessages(messages);
  if (runtimeDbConfigured()) {
    try {
      const scope = runtimeScope();
      const { error } = await runtimeDb().from('scheduled_messages').upsert(sorted.map((item) => ({
        id: item.id,
        project_key: scope.projectKey,
        owner_id: scope.ownerId,
        message: item.message,
        channel_id: item.channelId || null,
        scheduled_date: item.scheduledDate,
        scheduled_time: item.scheduledTime,
        scheduled_for: item.scheduledFor,
        status: item.status,
        sent_at: item.sentAt || null,
        discourse_message_id: item.messageId || null,
        error: item.error || null,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      })));
      if (error) throw new Error(error.message);
      return sorted;
    } catch (err) {
      if (!runtimeTableMissing(err)) throw err;
    }
  }
  await writeDataJSON(FILE, sorted, reason);
  return sorted;
}

export async function listScheduledMessages(): Promise<ScheduledMessage[]> {
  return readMessages();
}

export async function createScheduledMessage(input: ScheduledMessageInput): Promise<ScheduledMessage> {
  const message = text(input.message);
  const channelId = text(input.channelId);
  const scheduledDate = text(input.scheduledDate);
  const scheduledTime = text(input.scheduledTime);

  if (!message) throw new Error('Message is required.');
  if (!scheduledDate) throw new Error('Scheduled date is required.');
  if (!scheduledTime) throw new Error(`Scheduled time is required in ${APP_TIME_ZONE_LABEL}.`);

  const scheduledFor = scheduledDateTimeToUtc(scheduledDate, scheduledTime).toISOString();
  const now = new Date().toISOString();
  const item: ScheduledMessage = {
    id: randomUUID(),
    message,
    ...(channelId ? { channelId } : {}),
    scheduledDate,
    scheduledTime,
    scheduledFor,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  const messages = await readMessages();
  await writeMessages([item, ...messages], `schedule chat message ${scheduledDate} ${scheduledTime} ${APP_TIME_ZONE_LABEL}`);
  await appendOperationLog({
    action: 'schedule_chat_message',
    status: 'success',
    message: `Scheduled chat message for ${scheduledDate} ${scheduledTime} ${APP_TIME_ZONE_LABEL}`,
    metadata: {
      id: item.id,
      channelId: item.channelId,
      scheduledFor,
      messageLength: item.message.length,
    },
  });
  return item;
}

export async function cancelScheduledMessage(id: string): Promise<ScheduledMessage> {
  const messages = await readMessages();
  const index = messages.findIndex((item) => item.id === id);
  if (index === -1) throw new Error('Scheduled message not found.');
  const item = messages[index];
  if (item.status !== 'pending') throw new Error('Only pending scheduled messages can be cancelled.');

  const updated: ScheduledMessage = {
    ...item,
    status: 'cancelled',
    updatedAt: new Date().toISOString(),
  };
  messages[index] = updated;
  await writeMessages(messages, `cancel scheduled chat message ${id}`);
  await appendOperationLog({
    action: 'cancel_scheduled_chat_message',
    status: 'success',
    message: `Cancelled scheduled chat message ${id}`,
    metadata: { id, scheduledFor: item.scheduledFor },
  });
  return updated;
}

export async function deleteScheduledMessage(id: string): Promise<void> {
  const messages = await readMessages();
  const filtered = messages.filter((item) => item.id !== id);
  if (filtered.length === messages.length) throw new Error('Scheduled message not found.');
  if (runtimeDbConfigured()) {
    try {
      const { error } = await runtimeDb().from('scheduled_messages').delete().eq('project_key', runtimeScope().projectKey).eq('id', id);
      if (error) throw new Error(error.message);
      return;
    } catch (err) {
      if (!runtimeTableMissing(err)) throw err;
    }
  }
  await writeMessages(filtered, `delete scheduled chat message ${id}`);
}

function createDiscourseClient(): { client: DiscourseClient; channelId: string } {
  const config = loadBotConfig();
  return {
    channelId: config.communityChatChannelId,
    client: new DiscourseClient({
      baseUrl: config.communityBaseUrl,
      apiKey: config.discourseApiKey,
      apiClientId: config.discourseApiClientId,
    }),
  };
}

export async function processDueScheduledMessages(now = new Date()): Promise<ScheduledMessagesRunResult> {
  assertProjectAutomationActive();
  const messages = await readMessages();
  const nowMs = now.getTime();
  const pending = messages.filter((item) => item.status === 'pending');
  const due = pending.filter((item) => new Date(item.scheduledFor).getTime() <= nowMs);
  const errors: string[] = [];
  let sent = 0;
  let failed = 0;
  let clientBundle: { client: DiscourseClient; channelId: string } | null = null;

  for (const item of due) {
    const index = messages.findIndex((candidate) => candidate.id === item.id);
    if (index === -1) continue;

    try {
      clientBundle ||= createDiscourseClient();
      const channelId = item.channelId || clientBundle.channelId;
      const response = await clientBundle.client.sendChatMessage(channelId, item.message);
      messages[index] = {
        ...item,
        status: 'sent',
        sentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageId: response.message_id || response.id || 0,
        error: undefined,
      };
      sent += 1;
      await appendOperationLog({
        action: 'scheduled_chat_message',
        status: 'success',
        message: `Sent scheduled chat message ${item.id}`,
        metadata: {
          id: item.id,
          channelId,
          scheduledFor: item.scheduledFor,
          messageId: messages[index].messageId,
          messageLength: item.message.length,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      messages[index] = {
        ...item,
        status: 'error',
        error: message,
        updatedAt: new Date().toISOString(),
      };
      errors.push(`${item.id}: ${message}`);
      failed += 1;
      await appendOperationLog({
        action: 'scheduled_chat_message',
        status: 'error',
        message,
        metadata: {
          id: item.id,
          channelId: item.channelId,
          scheduledFor: item.scheduledFor,
          messageLength: item.message.length,
        },
      });
    }
  }

  const saved = due.length > 0
    ? await writeMessages(messages, 'process due scheduled chat messages')
    : messages;

  return {
    mode: 'scheduled-messages',
    generatedAt: new Date().toISOString(),
    checked: pending.length,
    due: due.length,
    sent,
    failed,
    skipped: Math.max(0, pending.length - due.length),
    messages: saved,
    errors,
  };
}
