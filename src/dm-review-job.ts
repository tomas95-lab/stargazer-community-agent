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
import {
  evaluateSupportMessage,
  warRoomAvailabilityDecision,
  warRoomIsOpenDay,
} from './community-agent';
import { loadProjectLinks } from './links';

const ARG_TIMEZONE = 'America/Argentina/Buenos_Aires';
const DEFAULT_MESSAGE_COUNT = Number(process.env.DM_REVIEW_MESSAGE_COUNT || 50);
const DM_CHANNEL_SCAN_CAP = 5;
const DEFAULT_MAX_CHANNELS = Math.min(Number(process.env.DM_REVIEW_MAX_CHANNELS || DM_CHANNEL_SCAN_CAP), DM_CHANNEL_SCAN_CAP);
const DEFAULT_REQUEST_DELAY_MS = Number(process.env.DM_REVIEW_REQUEST_DELAY_MS || 1500);
const DM_NOTIFICATION_STATE_FILE = 'output/dm-review-notification-state.json';

export interface DmReviewWindow {
  argentinaDate: string;
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

export interface DmReviewResult {
  mode: 'dm-review';
  scanMode: 'quick' | 'full';
  generatedAt: string;
  window: DmReviewWindow;
  totalDirectChannels: number;
  scannedChannels: number;
  skippedInactiveChannels: number;
  incomingMessages: number;
  channelsWithTodayMessages: number;
  messages: DmReviewMessage[];
  errors: string[];
}

export interface DmReviewOptions {
  now?: Date;
  messageCount?: number;
  maxChannels?: number;
  writeReport?: boolean;
  fullScan?: boolean;
  requestDelayMs?: number;
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

interface DmReviewNotificationState {
  argentinaDate: string;
  notifiedMessageIds: number[];
}

function argentinaDateParts(date: Date): { year: number; month: number; day: number; label: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARG_TIMEZONE,
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

export function getArgentinaDayWindow(now = new Date()): DmReviewWindow & { start: Date; end: Date } {
  const { year, month, day, label } = argentinaDateParts(now);
  const start = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
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

async function readDmReviewNotificationState(argentinaDate: string): Promise<DmReviewNotificationState> {
  try {
    const state = await readDataJSON<DmReviewNotificationState>(DM_NOTIFICATION_STATE_FILE);
    if (state.argentinaDate !== argentinaDate) {
      return { argentinaDate, notifiedMessageIds: [] };
    }
    return {
      argentinaDate,
      notifiedMessageIds: Array.isArray(state.notifiedMessageIds) ? state.notifiedMessageIds : [],
    };
  } catch {
    return { argentinaDate, notifiedMessageIds: [] };
  }
}

async function updateDmReviewNotificationState(result: DmReviewResult): Promise<{
  newIncomingMessages: DmReviewMessage[];
}> {
  const incoming = result.messages.filter((message) => message.incoming);
  const state = await readDmReviewNotificationState(result.window.argentinaDate);
  const knownIds = new Set(state.notifiedMessageIds);
  const newIncomingMessages = incoming.filter((message) => !knownIds.has(message.messageId));
  const nextIds = Array.from(new Set([...state.notifiedMessageIds, ...incoming.map((message) => message.messageId)])).slice(-500);

  if (nextIds.join(',') !== state.notifiedMessageIds.join(',')) {
    await writeDataJSON(
      DM_NOTIFICATION_STATE_FILE,
      { argentinaDate: result.window.argentinaDate, notifiedMessageIds: nextIds },
      `update dm notification state ${result.window.argentinaDate}`
    );
  }

  return { newIncomingMessages };
}

export async function fetchTodayDmReview(options: DmReviewOptions = {}): Promise<DmReviewResult> {
  const { client, ownUsername } = createClient();
  const window = getArgentinaDayWindow(options.now || new Date());
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

  return {
    mode: 'dm-review',
    scanMode: fullScan ? 'full' : 'quick',
    generatedAt: new Date().toISOString(),
    window: {
      argentinaDate: window.argentinaDate,
      startUtc: window.startUtc,
      endUtc: window.endUtc,
    },
    totalDirectChannels: directChannels.length,
    scannedChannels: channelsToScan.length,
    skippedInactiveChannels: directChannels.length - channelsToScan.length,
    incomingMessages: messages.filter((message) => message.incoming).length,
    channelsWithTodayMessages,
    messages,
    errors,
  };
}

export async function runDmReviewJob(options: DmReviewOptions = {}): Promise<DmReviewResult> {
  const result = await fetchTodayDmReview({ ...options, fullScan: options.fullScan ?? true });

  if (options.writeReport !== false) {
    const notificationState = await updateDmReviewNotificationState(result);
    const newIncomingMessages = notificationState.newIncomingMessages;

    await writeDataJSON(
      `output/dm-review-${result.window.argentinaDate}.json`,
      result,
      `review direct messages ${result.window.argentinaDate}`
    );

    await appendOperationLog({
      action: 'dm_review',
      status: result.errors.length > 0 ? 'error' : result.incomingMessages > 0 ? 'success' : 'skipped',
      message:
        result.incomingMessages > 0
          ? `Found ${result.incomingMessages} incoming DM(s) for ${result.window.argentinaDate}.`
          : `No incoming DMs found for ${result.window.argentinaDate}.`,
      metadata: {
        argentinaDate: result.window.argentinaDate,
        totalDirectChannels: result.totalDirectChannels,
        scannedChannels: result.scannedChannels,
        incomingMessages: result.incomingMessages,
        newIncomingMessages: newIncomingMessages.length,
        newIncomingMessageIds: newIncomingMessages.map((message) => message.messageId),
        newDmSenders: Array.from(new Set(newIncomingMessages.map((message) => message.username))),
        channelsWithTodayMessages: result.channelsWithTodayMessages,
        errors: result.errors.length,
      },
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

function formatArgTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ARG_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function messageTime(message: DmReviewMessage): number {
  return new Date(message.createdAt).getTime();
}

function buildDmContext(messages: DmReviewMessage[]): string {
  return messages
    .sort((left, right) => messageTime(left) - messageTime(right))
    .map((message) => {
      const direction = message.incoming ? 'user' : 'manager';
      return `[${formatArgTime(message.createdAt)} ARG/${direction}/${message.username}]: ${message.text.slice(0, 700)}`;
    })
    .join('\n');
}

export async function draftDirectMessageReply(
  channelId: number,
  options: Pick<DmReviewOptions, 'messageCount' | 'now'> = {}
): Promise<DmDraftResult> {
  if (!Number.isFinite(channelId) || channelId <= 0) throw new Error('Invalid DM channel ID');

  const { client, ownUsername } = createClient();
  const window = getArgentinaDayWindow(options.now || new Date());
  const messageCount = options.messageCount ?? DEFAULT_MESSAGE_COUNT;
  const directChannels = await client.readDirectMessageChannels();
  const channel = directChannels.find((item) => item.id === channelId) || { id: channelId };
  const rawMessages = await client.readChatMessages(String(channelId), messageCount);
  const messages = filterTodayDmMessages(rawMessages, window)
    .map((message) => summarizeMessage(channel, message, ownUsername))
    .sort((left, right) => messageTime(left) - messageTime(right));

  const incoming = messages.filter((message) => message.incoming);
  const lastOutgoing = [...messages].reverse().find((message) => !message.incoming);
  const pendingIncoming = incoming.filter((message) => !lastOutgoing || messageTime(message) > messageTime(lastOutgoing));
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
      messages,
    };
  }

  const { warRoom: warRoomLink } = await loadProjectLinks();
  const pendingText = pendingIncoming
    .map((message) => `${message.username}: ${message.text}`)
    .join('\n\n');
  const context = `Private DM thread from ${window.argentinaDate} ARG:\n${buildDmContext(messages) || 'No messages today.'}`;
  const deterministicDecision =
    warRoomAvailabilityDecision(pendingText, warRoomLink, options.now || new Date()) ||
    await evaluateSupportMessage(lastIncoming.username, pendingText, context, warRoomLink, warRoomIsOpenDay(options.now || new Date()));

  await appendOperationLog({
    action: 'dm_draft',
    status: deterministicDecision.action === 'reply' ? 'success' : deterministicDecision.action === 'human' ? 'skipped' : 'success',
    message: `Claude DM draft evaluated channel ${channelId}.`,
    metadata: {
      channelId,
      action: deterministicDecision.action,
      confidence: deterministicDecision.confidence,
      pendingIncomingMessages: pendingIncoming.length,
      lastIncomingMessageId: lastIncoming.messageId,
    },
  });

  return {
    channelId,
    action: deterministicDecision.action,
    confidence: deterministicDecision.confidence,
    reason: deterministicDecision.reason,
    reply: deterministicDecision.action === 'reply' ? deterministicDecision.reply : '',
    needsHuman: deterministicDecision.action === 'human',
    guidelineSnippets: deterministicDecision.guidelineSnippets,
    lastIncomingMessageId: lastIncoming.messageId,
    pendingIncomingMessages: pendingIncoming.length,
    messages,
  };
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
