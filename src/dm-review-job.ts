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
import { writeDataJSON } from './data-store';
import { appendOperationLog } from './operations-log';

const ARG_TIMEZONE = 'America/Argentina/Buenos_Aires';
const DEFAULT_MESSAGE_COUNT = Number(process.env.DM_REVIEW_MESSAGE_COUNT || 50);
const DEFAULT_MAX_CHANNELS = Number(process.env.DM_REVIEW_MAX_CHANNELS || 100);

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
}

export interface DmReviewResult {
  mode: 'dm-review';
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

function shouldScanChannel(channel: DiscourseDirectMessageChannel, window: { start: Date }): boolean {
  const lastAt = lastMessageCreatedAt(channel);
  if (!lastAt) return true;
  const time = new Date(lastAt).getTime();
  return !Number.isFinite(time) || time >= window.start.getTime();
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

function summarizeMessage(channel: DiscourseDirectMessageChannel, message: DiscourseChatMessage): DmReviewMessage {
  return {
    channelId: channel.id,
    channelTitle: channel.title,
    messageId: message.id,
    username: message.user.username,
    name: message.user.name,
    createdAt: message.created_at,
    text: messageText(message),
    peers: directMessagePeers(channel),
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

export async function fetchTodayDmReview(options: DmReviewOptions = {}): Promise<DmReviewResult> {
  const { client, ownUsername } = createClient();
  const window = getArgentinaDayWindow(options.now || new Date());
  const messageCount = options.messageCount ?? DEFAULT_MESSAGE_COUNT;
  const maxChannels = options.maxChannels ?? DEFAULT_MAX_CHANNELS;
  const errors: string[] = [];
  const directChannels = await client.readDirectMessageChannels();
  const channelsToScan = directChannels.filter((channel) => shouldScanChannel(channel, window)).slice(0, maxChannels);
  const messages: DmReviewMessage[] = [];
  let channelsWithTodayMessages = 0;

  for (const channel of channelsToScan) {
    try {
      const channelMessages = await client.readChatMessages(String(channel.id), messageCount);
      const todayIncoming = filterTodayIncomingDmMessages(channelMessages, ownUsername, window);
      if (todayIncoming.length > 0) channelsWithTodayMessages += 1;
      for (const message of todayIncoming) {
        messages.push(summarizeMessage(channel, message));
      }
    } catch (err) {
      errors.push(`Channel ${channel.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  messages.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

  return {
    mode: 'dm-review',
    generatedAt: new Date().toISOString(),
    window: {
      argentinaDate: window.argentinaDate,
      startUtc: window.startUtc,
      endUtc: window.endUtc,
    },
    totalDirectChannels: directChannels.length,
    scannedChannels: channelsToScan.length,
    skippedInactiveChannels: directChannels.length - channelsToScan.length,
    incomingMessages: messages.length,
    channelsWithTodayMessages,
    messages,
    errors,
  };
}

export async function runDmReviewJob(options: DmReviewOptions = {}): Promise<DmReviewResult> {
  const result = await fetchTodayDmReview(options);

  if (options.writeReport !== false) {
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
        channelsWithTodayMessages: result.channelsWithTodayMessages,
        errors: result.errors.length,
      },
    });
  }

  return result;
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
