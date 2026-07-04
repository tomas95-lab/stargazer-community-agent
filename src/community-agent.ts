import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Anthropic from '@anthropic-ai/sdk';
import { loadBotConfig } from './config';
import {
  DiscourseChatMessage,
  DiscourseClient,
  DiscoursePrivateMessageTopic,
  DiscourseTopicPost,
} from './discourse-client';
import { readDataJSON, writeDataJSON } from './data-store';
import { appendOperationLog } from './operations-log';
import { findProjectGuidelineSnippets } from './project-guidelines';
import { loadProjectLinks } from './links';

const BOT_USERNAME = process.env.DISCOURSE_USERNAME || 'tomas.ruiz_OBIC';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const MAX_ANSWERS = parseInt(process.env.RESPONDER_MAX_ANSWERS || process.env.AGENT_MAX_ANSWERS || '4', 10);
const MESSAGE_COUNT = parseInt(process.env.AGENT_MESSAGE_COUNT || '50', 10);
const MIN_CONFIDENCE = Number(process.env.AGENT_MIN_CONFIDENCE || '0.72');
const STATE_FILE = 'output/community-agent-state.json';
const ARG_TIMEZONE = 'America/Argentina/Buenos_Aires';
const WAR_ROOM_WEEKEND_NOTICE =
  'Note: The War Room is closed on Saturdays and Sundays. Please come back on Monday during 10:00 AM-7:00 PM ARG if you need live support.';

export type CommunityAgentSource = 'community' | 'dm';
export type CommunityAgentAction = 'reply' | 'human' | 'ignore';

export interface CommunityAgentOptions {
  post?: boolean;
  includeCommunity?: boolean;
  includeDms?: boolean;
  onlyToday?: boolean;
  respectSchedule?: boolean;
  skipProcessed?: boolean;
  markProcessed?: boolean;
  maxAnswers?: number;
  messageCount?: number;
}

export interface CommunityAgentItem {
  id: string;
  source: CommunityAgentSource;
  username: string;
  message: string;
  createdAt: string;
  title?: string;
  chatMessageId?: number;
  topicId?: number;
  url?: string;
}

export interface CommunityAgentDecision {
  itemId: string;
  source: CommunityAgentSource;
  username: string;
  message: string;
  action: CommunityAgentAction;
  confidence: number;
  reason: string;
  reply: string;
  posted: boolean;
  needsHuman: boolean;
  guidelineSnippets: string[];
  error?: string;
}

export interface CommunityAgentResult {
  mode: 'suggestion' | 'post';
  checked: number;
  candidates: number;
  handled: number;
  posted: number;
  needsHuman: number;
  ignored: number;
  withinSchedule: boolean;
  window: {
    argentinaDate: string;
    startUtc: string;
    endUtc: string;
    operatingHours: string;
  };
  items: CommunityAgentItem[];
  decisions: CommunityAgentDecision[];
  errors: string[];
}

interface AgentState {
  processed: Record<string, { at: string; action: CommunityAgentAction; posted: boolean }>;
}

interface ClaudeDecision {
  action?: CommunityAgentAction;
  confidence?: number;
  reason?: string;
  reply?: string;
}

function createClient(): { client: DiscourseClient; channelId: string; username: string; baseUrl: string } {
  const config = loadBotConfig();
  return {
    channelId: config.communityChatChannelId,
    username: config.discourseUsername || BOT_USERNAME,
    baseUrl: config.communityBaseUrl.replace(/\/+$/, ''),
    client: new DiscourseClient({
      baseUrl: config.communityBaseUrl,
      apiKey: config.discourseApiKey,
      apiClientId: config.discourseApiClientId,
    }),
  };
}

export async function fetchRecentCommunityMessages(count = 20): Promise<DiscourseChatMessage[]> {
  const { client, channelId } = createClient();
  return client.readChatMessages(channelId, count);
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

function todayWindow(now = new Date()): CommunityAgentResult['window'] & { start: Date; end: Date } {
  const { year, month, day, label } = argentinaDateParts(now);
  const start = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    argentinaDate: label,
    start,
    end,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    operatingHours: '10:00-19:00 America/Argentina/Buenos_Aires; War Room closed Saturdays and Sundays',
  };
}

function argentinaDayOfWeek(now = new Date()): number {
  const shortDay = new Intl.DateTimeFormat('en-US', {
    timeZone: ARG_TIMEZONE,
    weekday: 'short',
  }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(shortDay);
}

function isArgentinaWeekend(now = new Date()): boolean {
  const day = argentinaDayOfWeek(now);
  return day === 0 || day === 6;
}

function warRoomIsOpenDay(now = new Date()): boolean {
  return !isArgentinaWeekend(now);
}

function isWithinOperatingHours(now = new Date()): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ARG_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  const minutes = hour * 60 + minute;
  return minutes >= 10 * 60 && minutes <= 19 * 60;
}

function isWithinWindow(createdAt: string | undefined, window: { start: Date; end: Date }): boolean {
  if (!createdAt) return false;
  const time = new Date(createdAt).getTime();
  return Number.isFinite(time) && time >= window.start.getTime() && time < window.end.getTime();
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

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isQuestionOrSupportRequest(text: string, source: CommunityAgentSource): boolean {
  const lower = normalizeText(text).trim();
  if (source === 'dm') return true;

  const supportSignals = [
    '?',
    'como',
    'que ',
    'cuando',
    'puedo',
    'help',
    'ayuda',
    'problema',
    'error',
    'stuck',
    'bloque',
    'cursor',
    'access',
    'acceso',
    'ineligible',
    'eq',
    'empty queue',
    'onboarding',
    'course',
    'war room',
  ];

  return supportSignals.some((signal) => lower.includes(signal));
}

function shouldIgnoreAuthor(username: string): boolean {
  return username.toLowerCase() === BOT_USERNAME.toLowerCase();
}

function shouldIgnoreMessage(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length < 8 || trimmed.startsWith('🚨') || trimmed.startsWith('Hey team');
}

function topicUrl(baseUrl: string, topic: DiscoursePrivateMessageTopic): string | undefined {
  if (!topic.slug) return `${baseUrl}/t/${topic.id}`;
  return `${baseUrl}/t/${topic.slug}/${topic.id}`;
}

async function fetchCommunityItems(options: Required<Pick<CommunityAgentOptions, 'includeCommunity' | 'includeDms' | 'onlyToday' | 'messageCount'>>): Promise<{
  items: CommunityAgentItem[];
  errors: string[];
  window: ReturnType<typeof todayWindow>;
}> {
  const { client, channelId, username, baseUrl } = createClient();
  const window = todayWindow();
  const items: CommunityAgentItem[] = [];
  const errors: string[] = [];

  if (options.includeCommunity) {
    try {
      const messages = await client.readChatMessages(channelId, options.messageCount);
      for (const msg of messages) {
        if (options.onlyToday && !isWithinWindow(msg.created_at, window)) continue;
        items.push({
          id: `community:${msg.id}`,
          source: 'community',
          username: msg.user.username,
          message: msg.message,
          createdAt: msg.created_at,
          chatMessageId: msg.id,
        });
      }
    } catch (err) {
      errors.push(`community: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (options.includeDms && username) {
    try {
      const unreadTopics = await client.readPrivateMessages(username, 'unread', options.messageCount);
      for (const topic of unreadTopics) {
        const topicDate = topic.last_posted_at || topic.bumped_at || topic.created_at;
        if (options.onlyToday && !isWithinWindow(topicDate, window)) continue;

        try {
          const details = await client.readTopic(topic.id);
          const posts = details.post_stream?.posts || [];
          const lastIncoming = [...posts]
            .reverse()
            .find((post) => !shouldIgnoreAuthor(post.username) && (!options.onlyToday || isWithinWindow(post.created_at, window)));
          if (!lastIncoming) continue;

          items.push({
            id: `dm:${topic.id}:${lastIncoming.id || lastIncoming.created_at}`,
            source: 'dm',
            username: lastIncoming.username,
            message: postText(lastIncoming),
            createdAt: lastIncoming.created_at,
            title: details.title || topic.title,
            topicId: topic.id,
            url: topicUrl(baseUrl, topic),
          });
        } catch (err) {
          errors.push(`dm topic ${topic.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`dm unread: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { items, errors, window };
}

function postText(post: DiscourseTopicPost): string {
  if (post.raw?.trim()) return post.raw.trim();
  return stripHtml(post.cooked || '');
}

function relevantItems(items: CommunityAgentItem[]): CommunityAgentItem[] {
  return items.filter((item) => {
    if (shouldIgnoreAuthor(item.username)) return false;
    if (shouldIgnoreMessage(item.message)) return false;
    return isQuestionOrSupportRequest(item.message, item.source);
  });
}

async function readState(): Promise<AgentState> {
  try {
    return await readDataJSON<AgentState>(STATE_FILE);
  } catch {
    return { processed: {} };
  }
}

async function writeState(state: AgentState): Promise<void> {
  const entries = Object.entries(state.processed)
    .sort(([, a], [, b]) => b.at.localeCompare(a.at))
    .slice(0, 500);
  await writeDataJSON(STATE_FILE, { processed: Object.fromEntries(entries) }, 'update community agent state');
}

function extractJson(text: string): ClaudeDecision {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Claude returned non-JSON content: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text.slice(start, end + 1)) as ClaudeDecision;
}

function anthropicText(response: { content?: Array<{ type: string; text?: string }> }): string {
  const block = response.content?.find((item) => item.type === 'text');
  return block?.text || '';
}

function replyIncludesWarRoomLink(reply: string, warRoomLink: string): boolean {
  const normalizedReply = normalizeText(reply);
  const normalizedLink = normalizeText(warRoomLink);
  return (
    normalizedReply.includes(normalizedLink) ||
    normalizedReply.includes('91510346485') ||
    normalizedReply.includes('war room')
  );
}

function removeWarRoomLink(reply: string, warRoomLink: string): string {
  return reply
    .replaceAll(warRoomLink, '')
    .replace(/War Room link:\s*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function replyReferencesLiveSupport(reply: string, warRoomLink: string): boolean {
  const normalized = normalizeText(reply);
  const normalizedLink = normalizeText(warRoomLink);
  return (
    normalized.includes(normalizedLink) ||
    normalized.includes('91510346485') ||
    normalized.includes('war room') ||
    normalized.includes('live support') ||
    normalized.includes('zoom')
  );
}

function appendWeekendNotice(reply: string): string {
  const trimmed = reply.trim();
  const normalized = normalizeText(trimmed);
  if (
    normalized.includes('war room is closed on saturdays and sundays') ||
    normalized.includes('war room is closed on weekends') ||
    normalized.includes('war room is closed during weekends')
  ) {
    return trimmed;
  }
  return trimmed ? `${trimmed}\n\n${WAR_ROOM_WEEKEND_NOTICE}` : WAR_ROOM_WEEKEND_NOTICE;
}

function removeWeekdayFallbacks(reply: string): string {
  return reply
    .replace(/(?:^|\s+)If today is a weekday,[^.?!]*(?:[.?!]|$)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function withWarRoomSupportInfo(reply: string, warRoomLink: string, isWarRoomOpenDay: boolean): string {
  const trimmed = reply.trim();
  if (!trimmed) return trimmed;

  if (!isWarRoomOpenDay) {
    const referencedLiveSupport = replyReferencesLiveSupport(trimmed, warRoomLink);
    const cleaned = removeWeekdayFallbacks(removeWarRoomLink(trimmed, warRoomLink));
    if (referencedLiveSupport) {
      return appendWeekendNotice(cleaned);
    }
    return cleaned;
  }

  if (replyIncludesWarRoomLink(trimmed, warRoomLink)) return trimmed;
  return `${trimmed}\n\nWar Room link:\n${warRoomLink}`;
}

async function askClaude(
  item: CommunityAgentItem,
  context: string,
  warRoomLink: string,
  isWarRoomOpenDay: boolean,
): Promise<Omit<CommunityAgentDecision, 'itemId' | 'source' | 'username' | 'message' | 'posted' | 'needsHuman'>> {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const snippets = await findProjectGuidelineSnippets(`${item.title || ''}\n${item.message}`, 4);
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 450,
    system:
      [
        'You are a community management agent for Stargazer Axiom.',
        'Always write user-facing replies in English, even if the incoming message is Spanish, Portuguese, or any other language.',
        'Never write the reply in Spanish.',
        'You may answer only when the answer is clearly supported by the provided project guideline excerpts or by the recent chat context.',
        'If the information is missing, sensitive, about pay, account policy, deadlines, eligibility policy, or you are not confident, choose action "human".',
        'Keep replies under 4 short sentences.',
        isWarRoomOpenDay
          ? `When you choose action "reply", include the War Room Zoom link for live support: ${warRoomLink}.`
          : 'The War Room is closed on Saturdays and Sundays. Do not include the War Room Zoom link. If your reply mentions War Room, Zoom, or live support in any way, explicitly say in English that the War Room is closed on weekends and to come back on Monday during 10:00 AM-7:00 PM ARG.',
        'Return only valid JSON with keys: action ("reply", "human", or "ignore"), confidence (0 to 1), reason, reply.',
      ].join(' '),
    messages: [
      {
        role: 'user',
        content: [
          `Today/context:\n${context || 'No recent context.'}`,
          `Project guideline excerpts:\n${snippets.length ? snippets.join('\n\n---\n\n') : 'No guideline text available.'}`,
          `Incoming ${item.source === 'dm' ? 'DM' : 'community chat message'} from ${item.username}:\n${item.message}`,
        ].join('\n\n'),
      },
    ],
  });

  const parsed = extractJson(anthropicText(response));
  const action: CommunityAgentAction =
    parsed.action === 'reply' || parsed.action === 'human' || parsed.action === 'ignore' ? parsed.action : 'human';
  const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
  const rawReply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
  const finalAction =
    action === 'reply' && (!rawReply || confidence < MIN_CONFIDENCE || snippets.length === 0) ? 'human' : action;
  const reply = finalAction === 'reply' ? withWarRoomSupportInfo(rawReply, warRoomLink, isWarRoomOpenDay) : rawReply;

  return {
    action: finalAction,
    confidence,
    reason: typeof parsed.reason === 'string' ? parsed.reason : 'No reason returned',
    reply,
    guidelineSnippets: snippets,
  };
}

async function postDecision(client: DiscourseClient, channelId: string, item: CommunityAgentItem, reply: string): Promise<boolean> {
  if (item.source === 'community') {
    await client.sendChatMessage(channelId, reply);
    return true;
  }

  if (item.topicId) {
    await client.replyToTopic(item.topicId, reply);
    return true;
  }

  return false;
}

export async function fetchCommunityAgentItems(options: CommunityAgentOptions = {}): Promise<{
  items: CommunityAgentItem[];
  candidates: CommunityAgentItem[];
  errors: string[];
  window: CommunityAgentResult['window'];
}> {
  const result = await fetchCommunityItems({
    includeCommunity: options.includeCommunity ?? true,
    includeDms: options.includeDms ?? true,
    onlyToday: options.onlyToday ?? true,
    messageCount: options.messageCount ?? MESSAGE_COUNT,
  });

  const candidates = relevantItems(result.items);
  return {
    items: result.items,
    candidates,
    errors: result.errors,
    window: {
      argentinaDate: result.window.argentinaDate,
      startUtc: result.window.startUtc,
      endUtc: result.window.endUtc,
      operatingHours: result.window.operatingHours,
    },
  };
}

export async function runCommunityAgent(options: CommunityAgentOptions = {}): Promise<CommunityAgentResult> {
  const post = options.post === true;
  const includeCommunity = options.includeCommunity ?? true;
  const includeDms = options.includeDms ?? true;
  const onlyToday = options.onlyToday ?? true;
  const respectSchedule = options.respectSchedule ?? false;
  const skipProcessed = options.skipProcessed ?? true;
  const markProcessed = options.markProcessed ?? (post || respectSchedule);
  const maxAnswers = options.maxAnswers ?? MAX_ANSWERS;
  const messageCount = options.messageCount ?? MESSAGE_COUNT;
  const withinSchedule = isWithinOperatingHours();
  const { client, channelId } = createClient();

  const fetched = await fetchCommunityItems({ includeCommunity, includeDms, onlyToday, messageCount });
  const window = {
    argentinaDate: fetched.window.argentinaDate,
    startUtc: fetched.window.startUtc,
    endUtc: fetched.window.endUtc,
    operatingHours: fetched.window.operatingHours,
  };

  if (respectSchedule && !withinSchedule) {
    await appendOperationLog({
      action: 'community_agent',
      status: 'skipped',
      message: 'Outside operating hours',
      metadata: { window },
    });
    return {
      mode: post ? 'post' : 'suggestion',
      checked: fetched.items.length,
      candidates: 0,
      handled: 0,
      posted: 0,
      needsHuman: 0,
      ignored: 0,
      withinSchedule,
      window,
      items: fetched.items,
      decisions: [],
      errors: fetched.errors,
    };
  }

  const state = await readState();
  const candidates = relevantItems(fetched.items)
    .filter((item) => !skipProcessed || !state.processed[item.id])
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, maxAnswers);

  const context = fetched.items
    .slice(-12)
    .map((item) => `[${item.source}/${item.username}]: ${item.message.slice(0, 220)}`)
    .join('\n');

  const { warRoom: warRoomLink } = await loadProjectLinks();
  const isWarRoomOpenDay = warRoomIsOpenDay();
  const decisions: CommunityAgentDecision[] = [];

  for (const item of candidates) {
    try {
      const decision = await askClaude(item, context, warRoomLink, isWarRoomOpenDay);
      let posted = false;
      if (post && decision.action === 'reply') {
        posted = await postDecision(client, channelId, item, decision.reply);
      }

      decisions.push({
        itemId: item.id,
        source: item.source,
        username: item.username,
        message: item.message,
        posted,
        needsHuman: decision.action === 'human',
        ...decision,
      });

      if (markProcessed && decision.action !== 'ignore') {
        state.processed[item.id] = { at: new Date().toISOString(), action: decision.action, posted };
      }
    } catch (err) {
      decisions.push({
        itemId: item.id,
        source: item.source,
        username: item.username,
        message: item.message,
        action: 'human',
        confidence: 0,
        reason: 'Agent failed while analyzing this message',
        reply: '',
        posted: false,
        needsHuman: true,
        guidelineSnippets: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (markProcessed) {
    await writeState(state).catch((err) => {
      fetched.errors.push(`state: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  const posted = decisions.filter((decision) => decision.posted).length;
  const needsHuman = decisions.filter((decision) => decision.needsHuman).length;
  const ignored = decisions.filter((decision) => decision.action === 'ignore').length;

  await appendOperationLog({
    action: 'community_agent',
    status: decisions.length > 0 || fetched.errors.length === 0 ? 'success' : 'error',
    message: post ? 'Community agent run with posting enabled' : 'Community agent run in suggestion mode',
    metadata: {
      checked: fetched.items.length,
      candidates: candidates.length,
      posted,
      needsHuman,
      errors: fetched.errors,
    },
  });

  return {
    mode: post ? 'post' : 'suggestion',
    checked: fetched.items.length,
    candidates: candidates.length,
    handled: decisions.length,
    posted,
    needsHuman,
    ignored,
    withinSchedule,
    window,
    items: fetched.items,
    decisions,
    errors: fetched.errors,
  };
}
