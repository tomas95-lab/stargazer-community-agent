import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { loadBotConfig } from './config';
import {
  DiscourseChatMessage,
  DiscourseChatUser,
  DiscourseClient,
  DiscourseDirectMessageChannel,
} from './discourse-client';
import { readDataJSON, writeDataJSON } from './data-store';
import { appendOperationLog } from './operations-log';
import { evaluateSupportMessage } from './community-agent';
import { loadProjectLinks } from './links';

const UTC_TIMEZONE = 'UTC';
const DEFAULT_MESSAGE_COUNT = Number(process.env.DM_REVIEW_MESSAGE_COUNT || 50);
const DM_CHANNEL_SCAN_CAP = 5;
const DEFAULT_MAX_CHANNELS = Math.min(Number(process.env.DM_REVIEW_MAX_CHANNELS || DM_CHANNEL_SCAN_CAP), DM_CHANNEL_SCAN_CAP);
const DEFAULT_REQUEST_DELAY_MS = Number(process.env.DM_REVIEW_REQUEST_DELAY_MS || 1500);
const DM_NOTIFICATION_STATE_FILE = 'output/dm-review-notification-state.json';
const DM_AUTO_REPLY_STATE_FILE = 'output/dm-auto-reply-state.json';
const DEFAULT_DM_AUTO_REPLY_MAX = Number(process.env.DM_AUTO_REPLY_MAX || 3);

export interface DmReviewWindow {
  utcDate: string;
  argentinaDate?: string;
  startUtc: string;
  endUtc: string;
}

export interface DmReviewPeer {
  id?: number;
  username: string;
  name?: string;
}

export interface DmReviewMessage {
  channelId: number;
  channelTitle?: string | null;
  messageId: number;
  username: string;
  name?: string;
  createdAt: string;
  text: string;
  peers: DmReviewPeer[];
  incoming: boolean;
}

export interface DmReviewThreadSummary {
  channelId: number;
  channelTitle?: string | null;
  peers: DmReviewPeer[];
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
  pendingIncomingMessages: number;
  needsReply: boolean;
  lastIncomingMessageId?: number;
  lastMessageAt?: string;
}

export interface DmReviewResult {
  mode: 'dm-review';
  scanMode: 'quick' | 'full';
  generatedAt: string;
  window: DmReviewWindow;
  totalDirectChannels: number;
  scannedChannels: number;
  skippedInactiveChannels: number;
  incomingMessages: number;
  pendingIncomingMessages: number;
  unresolvedChannels: number;
  channelsWithTodayMessages: number;
  threads: DmReviewThreadSummary[];
  messages: DmReviewMessage[];
  errors: string[];
  autoReply?: DmAutoReplySummary;
}

export interface DmReviewOptions {
  now?: Date;
  messageCount?: number;
  maxChannels?: number;
  writeReport?: boolean;
  fullScan?: boolean;
  requestDelayMs?: number;
  autoReply?: boolean;
  maxAutoReplies?: number;
}

export interface DmReplyResult {
  ok: boolean;
  channelId: number;
  messageId?: number;
}

export interface DmDraftResult {
  channelId: number;
  action: 'reply' | 'human' | 'ignore';
  confidence: number;
  reason: string;
  reply: string;
  needsHuman: boolean;
  guidelineSnippets: string[];
  lastIncomingMessageId?: number;
  pendingIncomingMessages: number;
  messages: DmReviewMessage[];
}

export interface DmAutoReplyDecision {
  channelId: number;
  action: 'reply' | 'human' | 'ignore';
  posted: boolean;
  confidence: number;
  reason: string;
  username?: string;
  lastIncomingMessageId?: number;
  messageId?: number;
  error?: string;
}

export interface DmAutoReplySummary {
  enabled: boolean;
  checked: number;
  replied: number;
  needsHuman: number;
  ignored: number;
  skippedProcessed: number;
  decisions: DmAutoReplyDecision[];
}

interface DmReviewNotificationState {
  utcDate: string;
  argentinaDate?: string;
  notifiedMessageIds: number[];
}

interface DmAutoReplyState {
  processed: Record<string, {
    at: string;
    action: 'reply' | 'human' | 'ignore';
    posted: boolean;
    channelId: number;
    lastIncomingMessageId: number;
  }>;
}

function utcDateParts(date: Date): { year: number; month: number; day: number; label: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: UTC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  return {
    year,
    month,
    day,
    label: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

export function getUtcDayWindow(now = new Date()): DmReviewWindow & { start: Date; end: Date } {
  const { year, month, day, label } = utcDateParts(now);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    utcDate: label,
    argentinaDate: label,
    start,
    end,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

function isWithinWindow(createdAt: string | undefined, window: { start: Date; end: Date }): boolean {
  if (!createdAt) return false;
  const time = new Date(createdAt).getTime();
  return Number.isFinite(time) && time >= window.start.getTime() && time < window.end.getTime();
}

function lastMessageCreatedAt(channel: DiscourseDirectMessageChannel): string | undefined {
  return channel.last_message_created_at || channel.last_message?.created_at;
}

export function shouldScanChannel(channel: DiscourseDirectMessageChannel, window: { start: Date }): boolean {
  const lastAt = lastMessageCreatedAt(channel);
  if (!lastAt) return true;
  const time = new Date(lastAt).getTime();
  return !Number.isFinite(time) || time >= window.start.getTime();
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function messageText(message: DiscourseChatMessage): string {
  return (message.message || stripHtml(message.cooked || message.excerpt || '')).trim();
}

function channelLastMessageText(message: DiscourseDirectMessageChannel['last_message'] | undefined): string {
  return (message?.message || stripHtml(message?.cooked || message?.excerpt || '')).trim();
}

function addUsers(target: Map<string, DmReviewPeer>, users: DiscourseChatUser[] | undefined): void {
  if (!Array.isArray(users)) return;
  for (const user of users) {
    if (!user?.username) continue;
    const peer: DmReviewPeer = { username: user.username };
    if (user.id !== undefined) peer.id = user.id;
    if (user.name !== undefined) peer.name = user.name;
    target.set(user.username, peer);
  }
}

export function directMessagePeers(channel: DiscourseDirectMessageChannel): DmReviewPeer[] {
  const users = new Map<string, DmReviewPeer>();
  addUsers(users, channel.users);
  addUsers(users, channel.chatable?.users);
  addUsers(users, channel.chatable?.direct_message_users);
  addUsers(users, channel.chatable?.participants);
  addUsers(users, channel.chatable?.group_users);
  return Array.from(users.values());
}

export function filterTodayIncomingDmMessages(
  messages: DiscourseChatMessage[],
  ownUsername: string,
  window: { start: Date; end: Date }
): DiscourseChatMessage[] {
  const normalizedOwnUsername = ownUsername.trim().toLowerCase();

  return messages.filter((message) => {
    if (!isWithinWindow(message.created_at, window)) return false;
    if (!normalizedOwnUsername) return true;
    return message.user?.username?.trim().toLowerCase() !== normalizedOwnUsername;
  });
}

export function filterTodayDmMessages(
  messages: DiscourseChatMessage[],
  window: { start: Date; end: Date }
): DiscourseChatMessage[] {
  return messages.filter((message) => isWithinWindow(message.created_at, window));
}

function isIncomingMessage(message: DiscourseChatMessage, ownUsername: string): boolean {
  const normalizedOwnUsername = ownUsername.trim().toLowerCase();
  if (!normalizedOwnUsername) return true;
  return message.user?.username?.trim().toLowerCase() !== normalizedOwnUsername;
}

function summarizeMessage(
  channel: DiscourseDirectMessageChannel,
  message: DiscourseChatMessage,
  ownUsername: string
): DmReviewMessage {
  return {
    channelId: channel.id,
    channelTitle: channel.title,
    messageId: message.id,
    username: message.user.username,
    name: message.user.name,
    createdAt: message.created_at,
    text: messageText(message),
    peers: directMessagePeers(channel),
    incoming: isIncomingMessage(message, ownUsername),
  };
}

function summarizeChannelLastMessage(
  channel: DiscourseDirectMessageChannel,
  ownUsername: string,
  window: { start: Date; end: Date }
): DmReviewMessage | null {
  const lastMessage = channel.last_message;
  if (!lastMessage || !isWithinWindow(lastMessage.created_at, window)) return null;

  const normalizedOwnUsername = ownUsername.trim().toLowerCase();
  const incoming = !normalizedOwnUsername || lastMessage.user?.username?.trim().toLowerCase() !== normalizedOwnUsername;

  const text = channelLastMessageText(lastMessage);
  if (!text) return null;

  const peers = directMessagePeers(channel);
  const peer = peers[0] || { username: channel.title || 'unknown' };

  return {
    channelId: channel.id,
    channelTitle: channel.title,
    messageId: lastMessage.id,
    username: lastMessage.user?.username || peer.username,
    name: lastMessage.user?.name || peer.name,
    createdAt: lastMessage.created_at,
    text,
    peers,
    incoming,
  };
}

function createClient(): { client: DiscourseClient; ownUsername: string } {
  const config = loadBotConfig();
  return {
    ownUsername: config.discourseUsername,
    client: new DiscourseClient({
      baseUrl: config.communityBaseUrl,
      apiKey: config.discourseApiKey,
      apiClientId: config.discourseApiClientId,
    }),
  };
}

async function readDmReviewNotificationState(utcDate: string): Promise<DmReviewNotificationState> {
  try {
    const state = await readDataJSON<DmReviewNotificationState>(DM_NOTIFICATION_STATE_FILE);
    if ((state.utcDate || state.argentinaDate) !== utcDate) {
      return { utcDate, argentinaDate: utcDate, notifiedMessageIds: [] };
    }
    return {
      utcDate,
      argentinaDate: utcDate,
      notifiedMessageIds: Array.isArray(state.notifiedMessageIds) ? state.notifiedMessageIds : [],
    };
  } catch {
    return { utcDate, argentinaDate: utcDate, notifiedMessageIds: [] };
  }
}

async function updateDmReviewNotificationState(result: DmReviewResult): Promise<{
  newIncomingMessages: DmReviewMessage[];
}> {
  const incoming = result.messages.filter((message) => message.incoming);
  const state = await readDmReviewNotificationState(result.window.utcDate);
  const knownIds = new Set(state.notifiedMessageIds);
  const newIncomingMessages = incoming.filter((message) => !knownIds.has(message.messageId));
  const nextIds = Array.from(new Set([...state.notifiedMessageIds, ...incoming.map((message) => message.messageId)])).slice(-500);

  if (nextIds.join(',') !== state.notifiedMessageIds.join(',')) {
    await writeDataJSON(
      DM_NOTIFICATION_STATE_FILE,
      { utcDate: result.window.utcDate, argentinaDate: result.window.utcDate, notifiedMessageIds: nextIds },
      `update dm notification state ${result.window.utcDate}`
    );
  }

  return { newIncomingMessages };
}

async function readDmAutoReplyState(): Promise<DmAutoReplyState> {
  try {
    const state = await readDataJSON<DmAutoReplyState>(DM_AUTO_REPLY_STATE_FILE);
    return {
      processed: state && typeof state.processed === 'object' && state.processed ? state.processed : {},
    };
  } catch {
    return { processed: {} };
  }
}

async function writeDmAutoReplyState(state: DmAutoReplyState): Promise<void> {
  const entries = Object.entries(state.processed)
    .sort(([, left], [, right]) => right.at.localeCompare(left.at))
    .slice(0, 500);

  await writeDataJSON(
    DM_AUTO_REPLY_STATE_FILE,
    { processed: Object.fromEntries(entries) },
    'update dm auto reply state'
  );
}

function dmAutoReplyKey(channelId: number, lastIncomingMessageId: number): string {
  return `${channelId}:${lastIncomingMessageId}`;
}

export async function fetchTodayDmReview(options: DmReviewOptions = {}): Promise<DmReviewResult> {
  const { client, ownUsername } = createClient();
  const window = getUtcDayWindow(options.now || new Date());
  const messageCount = options.messageCount ?? DEFAULT_MESSAGE_COUNT;
  const maxChannels = Math.min(Math.max(1, options.maxChannels ?? DEFAULT_MAX_CHANNELS), DM_CHANNEL_SCAN_CAP);
  const fullScan = options.fullScan ?? true;
  const requestDelayMs = Math.max(0, options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS);
  const errors: string[] = [];
  const directChannels = await client.readDirectMessageChannels();
  const channelsToScan = directChannels.filter((channel) => shouldScanChannel(channel, window)).slice(0, maxChannels);
  const messages: DmReviewMessage[] = [];
  let channelsWithTodayMessages = 0;

  for (const [index, channel] of channelsToScan.entries()) {
    try {
      if (!fullScan) {
        const latest = summarizeChannelLastMessage(channel, ownUsername, window);
        if (latest) {
          channelsWithTodayMessages += 1;
          messages.push(latest);
        }
        continue;
      }

      if (index > 0) await sleep(requestDelayMs);

      const channelMessages = await client.readChatMessages(String(channel.id), messageCount);
      const todayMessages = filterTodayDmMessages(channelMessages, window);
      if (todayMessages.length > 0) channelsWithTodayMessages += 1;
      for (const message of todayMessages) {
        messages.push(summarizeMessage(channel, message, ownUsername));
      }
    } catch (err) {
      errors.push(`Channel ${channel.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  messages.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  const threads = summarizeDmThreads(messages);

  return {
    mode: 'dm-review',
    scanMode: fullScan ? 'full' : 'quick',
    generatedAt: new Date().toISOString(),
    window: {
      utcDate: window.utcDate,
      argentinaDate: window.utcDate,
      startUtc: window.startUtc,
      endUtc: window.endUtc,
    },
    totalDirectChannels: directChannels.length,
    scannedChannels: channelsToScan.length,
    skippedInactiveChannels: directChannels.length - channelsToScan.length,
    incomingMessages: messages.filter((message) => message.incoming).length,
    pendingIncomingMessages: threads.reduce((sum, thread) => sum + thread.pendingIncomingMessages, 0),
    unresolvedChannels: threads.filter((thread) => thread.needsReply).length,
    channelsWithTodayMessages,
    threads,
    messages,
    errors,
  };
}

export async function runDmReviewJob(options: DmReviewOptions = {}): Promise<DmReviewResult> {
  const result = await fetchTodayDmReview({ ...options, fullScan: options.fullScan ?? true });

  if (options.autoReply === true) {
    result.autoReply = await runDmAutoRepliesFromReview(result, options);
  }

  if (options.writeReport !== false) {
    const notificationState = await updateDmReviewNotificationState(result);
    const newIncomingMessages = notificationState.newIncomingMessages;

    await writeDataJSON(
      `output/dm-review-${result.window.utcDate}.json`,
      result,
      `review direct messages ${result.window.utcDate}`
    );

    await appendOperationLog({
      action: 'dm_review',
      status: result.errors.length > 0 ? 'error' : result.incomingMessages > 0 ? 'success' : 'skipped',
      message:
        result.incomingMessages > 0
          ? `Found ${result.incomingMessages} incoming DM(s) for ${result.window.utcDate}.`
          : `No incoming DMs found for ${result.window.utcDate}.`,
      metadata: {
        utcDate: result.window.utcDate,
        argentinaDate: result.window.utcDate,
        totalDirectChannels: result.totalDirectChannels,
        scannedChannels: result.scannedChannels,
        incomingMessages: result.incomingMessages,
        pendingIncomingMessages: result.pendingIncomingMessages,
        unresolvedChannels: result.unresolvedChannels,
        newIncomingMessages: newIncomingMessages.length,
        newIncomingMessageIds: newIncomingMessages.map((message) => message.messageId),
        newDmSenders: Array.from(new Set(newIncomingMessages.map((message) => message.username))),
        channelsWithTodayMessages: result.channelsWithTodayMessages,
        autoReplyEnabled: result.autoReply?.enabled || false,
        autoReplied: result.autoReply?.replied || 0,
        autoNeedsHuman: result.autoReply?.needsHuman || 0,
        errors: result.errors.length,
      },
    }, {
      type: 'dm_review',
      options: {
        messageCount: options.messageCount ?? DEFAULT_MESSAGE_COUNT,
        maxChannels: options.maxChannels ?? DEFAULT_MAX_CHANNELS,
        fullScan: options.fullScan ?? true,
        autoReply: options.autoReply === true,
        maxAutoReplies: options.maxAutoReplies ?? DEFAULT_DM_AUTO_REPLY_MAX,
      },
      result,
      newIncomingMessages,
    });
  }

  return result;
}

export async function sendDirectMessageReply(channelId: number, message: string): Promise<DmReplyResult> {
  const trimmed = message.trim();
  if (!Number.isFinite(channelId) || channelId <= 0) throw new Error('Invalid DM channel ID');
  if (!trimmed) throw new Error('Reply message is required');

  const { client } = createClient();
  const response = await client.sendChatMessage(String(channelId), trimmed);
  const messageId = response.message_id || response.id;

  await appendOperationLog({
    action: 'dm_reply',
    status: 'success',
    message: `Sent DM reply to channel ${channelId}.`,
    metadata: {
      channelId,
      messageId,
    },
  });

  return {
    ok: true,
    channelId,
    messageId,
  };
}

function formatUtcTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: UTC_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function messageTime(message: DmReviewMessage): number {
  return new Date(message.createdAt).getTime();
}

function buildDmContext(messages: DmReviewMessage[]): string {
  return messages
    .slice()
    .sort((left, right) => messageTime(left) - messageTime(right))
    .map((message) => {
      const direction = message.incoming ? 'user' : 'manager';
      return `[${formatUtcTime(message.createdAt)} UTC/${direction}/${message.username}]: ${message.text.slice(0, 700)}`;
    })
    .join('\n');
}

function pendingIncomingMessages(messages: DmReviewMessage[]): DmReviewMessage[] {
  const incoming = messages.filter((message) => message.incoming);
  const lastOutgoing = [...messages].reverse().find((message) => !message.incoming);
  return incoming.filter((message) => !lastOutgoing || messageTime(message) > messageTime(lastOutgoing));
}

function summarizeDmThreads(messages: DmReviewMessage[]): DmReviewThreadSummary[] {
  const summaries: DmReviewThreadSummary[] = [];
  for (const [channelId, threadMessages] of groupedMessagesByChannel(messages).entries()) {
    const ordered = threadMessages.slice().sort((left, right) => messageTime(left) - messageTime(right));
    const incoming = ordered.filter((message) => message.incoming);
    const pending = pendingIncomingMessages(ordered);
    const lastIncoming = incoming[incoming.length - 1];
    const lastMessage = ordered[ordered.length - 1];

    summaries.push({
      channelId,
      channelTitle: lastMessage?.channelTitle,
      peers: lastMessage?.peers || [],
      totalMessages: ordered.length,
      incomingMessages: incoming.length,
      outgoingMessages: ordered.length - incoming.length,
      pendingIncomingMessages: pending.length,
      needsReply: pending.length > 0,
      lastIncomingMessageId: lastIncoming?.messageId,
      lastMessageAt: lastMessage?.createdAt,
    });
  }

  return summaries.sort((left, right) => (right.lastMessageAt || '').localeCompare(left.lastMessageAt || ''));
}

async function evaluateDirectMessageThread(
  channelId: number,
  messages: DmReviewMessage[],
  now = new Date(),
  logDraft = true
): Promise<DmDraftResult> {
  const orderedMessages = messages.slice().sort((left, right) => messageTime(left) - messageTime(right));
  const incoming = orderedMessages.filter((message) => message.incoming);
  const pendingIncoming = pendingIncomingMessages(orderedMessages);
  const lastIncoming = pendingIncoming[pendingIncoming.length - 1] || incoming[incoming.length - 1];

  if (!lastIncoming || pendingIncoming.length === 0) {
    return {
      channelId,
      action: 'ignore',
      confidence: 1,
      reason: 'No pending incoming DM after the latest outgoing reply.',
      reply: '',
      needsHuman: false,
      guidelineSnippets: [],
      lastIncomingMessageId: lastIncoming?.messageId,
      pendingIncomingMessages: 0,
      messages: orderedMessages,
    };
  }

  const { warRoom: warRoomLink } = await loadProjectLinks();
  const pendingText = pendingIncoming
    .map((message) => `${message.username}: ${message.text}`)
    .join('\n\n');
  const window = getUtcDayWindow(now);
  const context = `Private DM thread from ${window.utcDate} UTC:\n${buildDmContext(orderedMessages) || 'No messages today.'}`;
  const deterministicDecision = await evaluateSupportMessage(
    lastIncoming.username,
    pendingText,
    context,
    warRoomLink,
    Boolean(warRoomLink),
  );
  const action = deterministicDecision.action === 'react' ? 'ignore' : deterministicDecision.action;

  if (logDraft) {
    await appendOperationLog({
      action: 'dm_draft',
      status: action === 'reply' ? 'success' : action === 'human' ? 'skipped' : 'success',
      message: `Claude DM draft evaluated channel ${channelId}.`,
      metadata: {
        channelId,
        action,
        confidence: deterministicDecision.confidence,
        pendingIncomingMessages: pendingIncoming.length,
        lastIncomingMessageId: lastIncoming.messageId,
      },
    });
  }

  return {
    channelId,
    action,
    confidence: deterministicDecision.confidence,
    reason: action === 'ignore' && deterministicDecision.action === 'react'
      ? 'Claude suggested a reaction, but DM reactions are not supported by this workflow.'
      : deterministicDecision.reason,
    reply: action === 'reply' ? deterministicDecision.reply : '',
    needsHuman: action === 'human',
    guidelineSnippets: deterministicDecision.guidelineSnippets,
    lastIncomingMessageId: lastIncoming.messageId,
    pendingIncomingMessages: pendingIncoming.length,
    messages: orderedMessages,
  };
}

export async function draftDirectMessageReply(
  channelId: number,
  options: Pick<DmReviewOptions, 'messageCount' | 'now'> = {}
): Promise<DmDraftResult> {
  if (!Number.isFinite(channelId) || channelId <= 0) throw new Error('Invalid DM channel ID');

  const { client, ownUsername } = createClient();
  const window = getUtcDayWindow(options.now || new Date());
  const messageCount = options.messageCount ?? DEFAULT_MESSAGE_COUNT;
  const directChannels = await client.readDirectMessageChannels();
  const channel = directChannels.find((item) => item.id === channelId) || { id: channelId };
  const rawMessages = await client.readChatMessages(String(channelId), messageCount);
  const messages = filterTodayDmMessages(rawMessages, window)
    .map((message) => summarizeMessage(channel, message, ownUsername))
    .sort((left, right) => messageTime(left) - messageTime(right));

  return evaluateDirectMessageThread(channelId, messages, options.now || new Date(), true);
}

function groupedMessagesByChannel(messages: DmReviewMessage[]): Map<number, DmReviewMessage[]> {
  const grouped = new Map<number, DmReviewMessage[]>();
  for (const message of messages) {
    grouped.set(message.channelId, [...(grouped.get(message.channelId) || []), message]);
  }
  return grouped;
}

async function runDmAutoRepliesFromReview(
  result: DmReviewResult,
  options: Pick<DmReviewOptions, 'maxAutoReplies' | 'now'> = {}
): Promise<DmAutoReplySummary> {
  const maxAutoReplies = Math.min(Math.max(0, options.maxAutoReplies ?? DEFAULT_DM_AUTO_REPLY_MAX), DM_CHANNEL_SCAN_CAP);
  const state = await readDmAutoReplyState();
  const decisions: DmAutoReplyDecision[] = [];
  const now = options.now || new Date();
  let checked = 0;
  let replied = 0;
  let needsHuman = 0;
  let ignored = 0;
  let skippedProcessed = 0;
  let stateChanged = false;

  for (const [channelId, messages] of groupedMessagesByChannel(result.messages).entries()) {
    const orderedMessages = messages.slice().sort((left, right) => messageTime(left) - messageTime(right));
    const pending = pendingIncomingMessages(orderedMessages);
    const lastIncoming = pending[pending.length - 1];
    if (!lastIncoming) continue;

    checked += 1;
    const key = dmAutoReplyKey(channelId, lastIncoming.messageId);
    if (state.processed[key]) {
      skippedProcessed += 1;
      continue;
    }

    if (replied >= maxAutoReplies) {
      break;
    }

    try {
      const decision = await evaluateDirectMessageThread(channelId, orderedMessages, now, false);
      let posted = false;
      let sentMessageId: number | undefined;

      if (decision.action === 'reply' && decision.reply.trim()) {
        const sent = await sendDirectMessageReply(channelId, decision.reply);
        posted = true;
        sentMessageId = sent.messageId;
        replied += 1;
      } else if (decision.action === 'human') {
        needsHuman += 1;
      } else {
        ignored += 1;
      }

      decisions.push({
        channelId,
        action: decision.action,
        posted,
        confidence: decision.confidence,
        reason: decision.reason,
        username: lastIncoming.username,
        lastIncomingMessageId: lastIncoming.messageId,
        messageId: sentMessageId,
      });

      state.processed[key] = {
        at: new Date().toISOString(),
        action: decision.action,
        posted,
        channelId,
        lastIncomingMessageId: lastIncoming.messageId,
      };
      stateChanged = true;
    } catch (err) {
      decisions.push({
        channelId,
        action: 'human',
        posted: false,
        confidence: 0,
        reason: 'DM auto-reply failed while evaluating this thread',
        username: lastIncoming.username,
        lastIncomingMessageId: lastIncoming.messageId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (stateChanged) {
    await writeDmAutoReplyState(state);
  }

  const summary = {
    enabled: true,
    checked,
    replied,
    needsHuman,
    ignored,
    skippedProcessed,
    decisions,
  };

  await appendOperationLog({
    action: 'dm_auto_reply',
    status: decisions.some((decision) => decision.error) ? 'error' : replied > 0 ? 'success' : 'skipped',
    message:
      replied > 0
        ? `Auto-replied to ${replied} DM thread(s).`
        : 'No safe DM auto-replies sent.',
    metadata: {
      checked,
      replied,
      needsHuman,
      ignored,
      skippedProcessed,
      repliedUsers: decisions.filter((decision) => decision.posted).map((decision) => decision.username),
      humanUsers: decisions.filter((decision) => decision.action === 'human' && !decision.posted).map((decision) => decision.username),
      errors: decisions.filter((decision) => decision.error).length,
    },
  }, {
    type: 'dm_auto_reply',
    result: summary,
    decisions,
  });

  return summary;
}

if (require.main === module) {
  runDmReviewJob()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
