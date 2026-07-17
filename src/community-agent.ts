import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { loadBotConfig } from './config';
import { DiscourseChatMessage, DiscourseClient } from './discourse-client';
import { readDataJSON, writeDataJSON } from './data-store';
import { appendOperationLog } from './operations-log';
import { findProjectGuidelineSnippets } from './project-guidelines';
import { projectMemoryText } from './project-memory';
import { loadProjectLinks } from './links';
import { getProjectContext } from './project-context';
import { sanitizeGeneratedText } from './text-safety';
import { assertAiUsageAllowed, estimateTokens, recordAiUsage } from './usage-guardrails';
import { resolveAnthropicRuntime } from './anthropic-runtime';
import { appDayWindow, APP_TIME_ZONE, APP_TIME_ZONE_LABEL } from './timezone';

const MAX_ANSWERS = parseInt(process.env.RESPONDER_MAX_ANSWERS || process.env.AGENT_MAX_ANSWERS || '4', 10);
const MESSAGE_COUNT = parseInt(process.env.AGENT_MESSAGE_COUNT || '50', 10);
const MIN_CONFIDENCE = Number(process.env.AGENT_MIN_CONFIDENCE || '0.50');
const REPLY_LOOKAHEAD_MINUTES = 45;
const THREAD_SCAN_LIMIT = parseInt(process.env.AGENT_THREAD_SCAN_LIMIT || '6', 10);
const THREAD_MESSAGE_COUNT = parseInt(process.env.AGENT_THREAD_MESSAGE_COUNT || '30', 10);
const DAY_SCAN_MESSAGE_LIMIT = parseInt(process.env.AGENT_DAY_SCAN_MESSAGE_LIMIT || '300', 10);
const DEFAULT_REACTION_EMOJI = process.env.AGENT_REACTION_EMOJI || '+1';
const STATE_FILE = 'output/community-agent-state.json';

export type CommunityAgentSource = 'community';
export type CommunityAgentAction = 'reply' | 'react' | 'human' | 'ignore';

export interface CommunityAgentOptions {
  post?: boolean;
  includeCommunity?: boolean;
  onlyToday?: boolean;
  respectSchedule?: boolean;
  skipProcessed?: boolean;
  markProcessed?: boolean;
  react?: boolean;
  maxAnswers?: number;
  messageCount?: number;
}

export interface CommunityAgentItem {
  id: string;
  source: CommunityAgentSource;
  username: string;
  message: string;
  createdAt: string;
  chatMessageId?: number;
  threadId?: number | null;
  replyToChatMessageId?: number;
  isStaff?: boolean;
  probableReplies?: CommunityAgentReplyEvidence[];
  ignoredReason?: string;
}

export interface CommunityAgentReplyEvidence {
  id: string;
  username: string;
  message: string;
  createdAt: string;
  chatMessageId?: number;
  match: 'direct_reply' | 'mention' | 'staff_followup' | 'nearby_followup';
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
  reacted: boolean;
  reaction?: string;
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
  reacted: number;
  needsHuman: number;
  ignored: number;
  withinSchedule: boolean;
  window: {
    utcDate: string;
    argentinaDate?: string;
    startUtc: string;
    endUtc: string;
    operatingHours: string;
  };
  items: CommunityAgentItem[];
  decisions: CommunityAgentDecision[];
  errors: string[];
}

interface AgentState {
  processed: Record<string, { at: string; action: CommunityAgentAction; posted: boolean; reacted?: boolean }>;
}

interface ClaudeDecision {
  action?: CommunityAgentAction;
  confidence?: number;
  reason?: string;
  reply?: string;
  reaction?: string;
}

function createClient(): { client: DiscourseClient; channelId: string } {
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

export async function fetchRecentCommunityMessages(count = 20): Promise<DiscourseChatMessage[]> {
  const { client, channelId } = createClient();
  return client.readChatMessages(channelId, count);
}

function todayWindow(now = new Date()): CommunityAgentResult['window'] & { start: Date; end: Date } {
  const window = appDayWindow(now);
  return {
    utcDate: window.date,
    argentinaDate: window.date,
    start: window.start,
    end: window.end,
    startUtc: window.start.toISOString(),
    endUtc: window.end.toISOString(),
    operatingHours: `Agent scans the current ${APP_TIME_ZONE_LABEL} day. Live-support hours come from project guidelines or project memory.`,
  };
}

export function warRoomIsOpenDay(now = new Date()): boolean {
  void now;
  return true;
}

export function isWithinOperatingHours(now = new Date()): boolean {
  const startHour = Number(process.env.AGENT_PST_START_HOUR || process.env.AGENT_UTC_START_HOUR || '');
  const endHour = Number(process.env.AGENT_PST_END_HOUR || process.env.AGENT_UTC_END_HOUR || '');
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return true;
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now));
  return startHour <= endHour
    ? hour >= startHour && hour <= endHour
    : hour >= startHour || hour <= endHour;
}

function isWithinWindow(createdAt: string | undefined, window: { start: Date; end: Date }): boolean {
  if (!createdAt) return false;
  const time = new Date(createdAt).getTime();
  return Number.isFinite(time) && time >= window.start.getTime() && time < window.end.getTime();
}

function messageTime(item: CommunityAgentItem): number {
  return new Date(item.createdAt).getTime();
}

function minutesBetween(left: CommunityAgentItem, right: CommunityAgentItem): number {
  return (messageTime(right) - messageTime(left)) / 1000 / 60;
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

function isQuestionOrSupportRequest(text: string): boolean {
  const lower = normalizeText(text).trim();

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

function isAnnouncementMessage(text: string): boolean {
  const trimmed = text.trim();
  const lower = normalizeText(trimmed);

  if (trimmed.length < 8) return true;
  if (trimmed.startsWith('🚨')) return true;
  if (/^-{20,}/.test(trimmed)) return true;
  if (/^>\*\*/.test(trimmed) && lower.includes('war room') && lower.includes('link:')) return true;
  if (lower.includes('meeting registration - zoom') && lower.includes('war room')) return true;

  const announcementSignals = [
    'war rooms thread',
    'these are the available war rooms',
    'list in thread',
    'these cbs have',
    'to proceed, you will need to join the war room',
    'we wanted to reach out ahead of time',
    'no need to open a ticket',
    'gracias / obrigado',
    'abrazo / abraco',
  ];

  if (announcementSignals.some((signal) => lower.includes(signal))) return true;

  const startsWithTeamGreeting = /^hey\s+team\b/i.test(trimmed) || /^hi\s+team\b/i.test(trimmed) || /^team[!,\s]/i.test(trimmed);
  const teamAnnouncementSignals = [
    'today',
    'these',
    'assigned',
    'please note',
    'we recommend',
    'we wanted',
    'we already',
    'is up',
    'thank you',
    'gracias',
    'obrigado',
  ];

  return startsWithTeamGreeting && teamAnnouncementSignals.some((signal) => lower.includes(signal));
}

function isPotentiallyUsefulContribution(text: string): boolean {
  const lower = normalizeText(text).trim();
  if (lower.length < 24) return false;

  const usefulSignals = [
    'i fixed',
    'fixed it',
    'solved',
    'solution',
    'worked for me',
    'it works',
    'this worked',
    'i found',
    'for anyone',
    'heads up',
    'update',
    'context',
    'thanks for',
    'thank you for',
    'sharing',
    'resolved',
    'done',
    'got access',
    'access is working',
    'ya funciona',
    'lo pude resolver',
    'me funciono',
    'listo',
  ];

  return usefulSignals.some((signal) => lower.includes(signal));
}

function isWarRoomAvailabilityQuestion(text: string): boolean {
  const lower = normalizeText(text);
  if (!lower.includes('war room')) return false;

  const availabilitySignals = [
    '?',
    'open',
    'available',
    'availability',
    'abierto',
    'abierta',
    'abre',
    'abrira',
    'va a estar',
    'estara',
    'hay war room',
    'is there',
  ];

  return availabilitySignals.some((signal) => lower.includes(signal));
}

function replyTargetId(message: DiscourseChatMessage): number | undefined {
  return message.in_reply_to_id || message.reply_to_msg_id || message.reply_to_message_id;
}

function mentionsAuthor(replyText: string, username: string): boolean {
  const normalizedReply = normalizeText(replyText);
  const normalizedUsername = normalizeText(username).replace(/^@/, '');
  return normalizedReply.includes(`@${normalizedUsername}`) || normalizedReply.includes(normalizedUsername);
}

function hasAnswerSignal(text: string): boolean {
  const lower = normalizeText(text);
  const signals = [
    'yes',
    'yeah',
    'yep',
    'no',
    'not yet',
    'please',
    'you need',
    'you can',
    'you should',
    'try',
    'join',
    'war room',
    'cursor',
    'access',
    'link',
    'open',
    'available',
    'done',
    'fixed',
    'check',
    'si',
    'claro',
    'podes',
    'puedes',
    'tenes que',
    'deberias',
    'entra',
    'abierto',
    'listo',
  ];

  return signals.some((signal) => lower.includes(signal));
}

function isFirstVisibleFollowup(
  question: CommunityAgentItem,
  candidateReply: CommunityAgentItem,
  orderedItems: CommunityAgentItem[],
): boolean {
  const first = orderedItems.find((item) => {
    if (item.id === question.id) return false;
    if (messageTime(item) <= messageTime(question)) return false;
    if (item.username.toLowerCase() === question.username.toLowerCase()) return false;
    if (shouldIgnoreMessage(item.message)) return false;
    return true;
  });

  return first?.id === candidateReply.id;
}

function replyEvidenceFor(
  question: CommunityAgentItem,
  candidateReply: CommunityAgentItem,
  orderedItems: CommunityAgentItem[],
): CommunityAgentReplyEvidence | null {
  if (question.id === candidateReply.id) return null;
  if (candidateReply.username.toLowerCase() === question.username.toLowerCase()) return null;
  if (messageTime(candidateReply) <= messageTime(question)) return null;
  if (shouldIgnoreMessage(candidateReply.message)) return null;

  const directReply =
    question.chatMessageId !== undefined &&
    candidateReply.replyToChatMessageId !== undefined &&
    candidateReply.replyToChatMessageId === question.chatMessageId;
  const mention = mentionsAuthor(candidateReply.message, question.username);
  const staffFollowup = candidateReply.isStaff === true && hasAnswerSignal(candidateReply.message);
  const nearbyFollowup =
    isFirstVisibleFollowup(question, candidateReply, orderedItems) &&
    minutesBetween(question, candidateReply) <= REPLY_LOOKAHEAD_MINUTES &&
    hasAnswerSignal(candidateReply.message);

  let match: CommunityAgentReplyEvidence['match'] | null = null;
  if (directReply) match = 'direct_reply';
  else if (mention) match = 'mention';
  else if (staffFollowup) match = 'staff_followup';
  else if (nearbyFollowup) match = 'nearby_followup';

  if (!match) return null;

  return {
    id: candidateReply.id,
    username: candidateReply.username,
    message: candidateReply.message,
    createdAt: candidateReply.createdAt,
    chatMessageId: candidateReply.chatMessageId,
    match,
  };
}

export function annotateProbableReplies(items: CommunityAgentItem[]): CommunityAgentItem[] {
  const ordered = [...items].sort((a, b) => messageTime(a) - messageTime(b));
  const repliesByItemId = new Map<string, CommunityAgentReplyEvidence[]>();

  for (const item of ordered) {
    if (!isQuestionOrSupportRequest(item.message) || shouldIgnoreMessage(item.message)) continue;

    const replies = ordered
      .map((candidate) => replyEvidenceFor(item, candidate, ordered))
      .filter((reply): reply is CommunityAgentReplyEvidence => Boolean(reply))
      .slice(0, 3);

    const existingReplies = item.probableReplies || [];
    const mergedReplies = [...existingReplies];
    for (const reply of replies) {
      if (!mergedReplies.some((existing) => existing.id === reply.id)) {
        mergedReplies.push(reply);
      }
    }

    if (mergedReplies.length > 0) {
      repliesByItemId.set(item.id, mergedReplies.slice(0, 3));
    }
  }

  return items.map((item) => ({
    ...item,
    probableReplies: repliesByItemId.get(item.id) || [],
  }));
}

function shouldIgnoreAuthor(username: string): boolean {
  const configuredUsername = loadBotConfig().discourseUsername || process.env.DISCOURSE_USERNAME || '';
  if (!configuredUsername) return false;
  return username.toLowerCase() === configuredUsername.toLowerCase();
}

function shouldIgnoreMessage(text: string): boolean {
  return isAnnouncementMessage(text);
}

function baseIgnoreReason(item: CommunityAgentItem): string | null {
  const isOwnAuthor = shouldIgnoreAuthor(item.username);
  const isAnnouncement = isAnnouncementMessage(item.message);
  const isBroadcast = item.message.trim().startsWith('🚨');
  const isTeamAnnouncement = /^hey\s+team\b/i.test(item.message.trim()) || /^hi\s+team\b/i.test(item.message.trim());
  if (isOwnAuthor && isAnnouncement) {
    return 'Manager announcement authored by the configured bot user, not a contributor support request.';
  }
  if (isBroadcast) return 'Broadcast announcement, not a contributor support request.';
  if (isTeamAnnouncement && isAnnouncement) return 'Team announcement, not a contributor support request.';
  if (isAnnouncement) return 'Announcement or thread root, not a contributor support request.';
  if (shouldIgnoreAuthor(item.username)) return 'Authored by the configured manager/bot user.';
  if (item.message.trim().length < 8) return 'Message is too short to evaluate safely.';
  if ((item.probableReplies || []).length > 0) return 'Already has a probable reply in the chat or thread.';
  if (!isQuestionOrSupportRequest(item.message) && !isPotentiallyUsefulContribution(item.message)) {
    return 'No question, support, or useful contribution signal detected.';
  }
  return null;
}

function withIgnoredReasons(items: CommunityAgentItem[]): CommunityAgentItem[] {
  return items.map((item) => ({
    ...item,
    ignoredReason: baseIgnoreReason(item) || undefined,
  }));
}

function threadPreviewReply(message: DiscourseChatMessage): CommunityAgentReplyEvidence | null {
  if (shouldIgnoreMessage(message.message)) return null;

  const preview = message.thread?.preview;
  if (!preview?.last_reply_id || !preview.last_reply_created_at || !preview.last_reply_user?.username) return null;
  if (preview.last_reply_id === message.id) return null;

  const replyText = stripHtml(preview.last_reply_excerpt || '');
  if (!replyText) return null;

  return {
    id: `community:${preview.last_reply_id}`,
    username: preview.last_reply_user.username,
    message: replyText,
    createdAt: preview.last_reply_created_at,
    chatMessageId: preview.last_reply_id,
    match: 'direct_reply',
  };
}

async function readCommunityMessagesForOptions(
  client: DiscourseClient,
  channelId: string,
  options: Required<Pick<CommunityAgentOptions, 'onlyToday' | 'messageCount'>>,
  window: ReturnType<typeof todayWindow>,
): Promise<DiscourseChatMessage[]> {
  const pageSize = Math.min(100, Math.max(1, options.messageCount));
  if (!options.onlyToday) return client.readChatMessages(channelId, pageSize);

  const maxMessages = Math.max(pageSize, DAY_SCAN_MESSAGE_LIMIT);
  const messagesById = new Map<number, DiscourseChatMessage>();
  let targetMessageId: number | undefined;

  while (messagesById.size < maxMessages) {
    const page = await client.readChatMessages(
      channelId,
      pageSize,
      targetMessageId ? { targetMessageId, direction: 'past' } : {},
    );
    if (page.length === 0) break;

    for (const msg of page) {
      if (messagesById.size >= maxMessages) break;
      messagesById.set(msg.id, msg);
    }

    const oldest = page.reduce<DiscourseChatMessage | null>((oldestMsg, msg) => {
      if (!oldestMsg) return msg;
      return new Date(msg.created_at).getTime() < new Date(oldestMsg.created_at).getTime() ? msg : oldestMsg;
    }, null);
    if (!oldest) break;

    const oldestTime = new Date(oldest.created_at).getTime();
    if (Number.isFinite(oldestTime) && oldestTime < window.start.getTime()) break;
    if (oldest.id === targetMessageId) break;

    targetMessageId = oldest.id;
    if (page.length < pageSize) break;
  }

  return Array.from(messagesById.values())
    .filter((msg) => isWithinWindow(msg.created_at, window))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

async function fetchCommunityItems(options: Required<Pick<CommunityAgentOptions, 'includeCommunity' | 'onlyToday' | 'messageCount'>>): Promise<{
  items: CommunityAgentItem[];
  errors: string[];
  window: ReturnType<typeof todayWindow>;
}> {
  const { client, channelId } = createClient();
  const window = todayWindow();
  const items: CommunityAgentItem[] = [];
  const errors: string[] = [];

  if (options.includeCommunity) {
    try {
      const messages = await readCommunityMessagesForOptions(client, channelId, options, window);
      const seenMessageIds = new Set<number>();
      const threadRoots = new Map<number, number>();
      for (const msg of messages) {
        if (options.onlyToday && !isWithinWindow(msg.created_at, window)) continue;
        const previewReply = threadPreviewReply(msg);
        seenMessageIds.add(msg.id);
        if (msg.thread_id) threadRoots.set(msg.thread_id, msg.id);
        items.push({
          id: `community:${msg.id}`,
          source: 'community',
          username: msg.user.username,
          message: msg.message,
          createdAt: msg.created_at,
          chatMessageId: msg.id,
          threadId: msg.thread_id,
          replyToChatMessageId: replyTargetId(msg),
          isStaff: Boolean(msg.user.staff || msg.user.moderator || msg.user.admin),
          probableReplies: previewReply ? [previewReply] : [],
        });
      }

      const threadIds = Array.from(threadRoots.keys()).slice(0, Math.max(0, THREAD_SCAN_LIMIT));
      for (const threadId of threadIds) {
        try {
          const threadMessages = await client.readChatThreadMessages(channelId, threadId, THREAD_MESSAGE_COUNT);
          const rootMessageId = threadRoots.get(threadId);
          for (const msg of threadMessages) {
            if (seenMessageIds.has(msg.id)) continue;
            if (options.onlyToday && !isWithinWindow(msg.created_at, window)) continue;
            seenMessageIds.add(msg.id);
            const previewReply = threadPreviewReply(msg);
            items.push({
              id: `community:${msg.id}`,
              source: 'community',
              username: msg.user.username,
              message: msg.message,
              createdAt: msg.created_at,
              chatMessageId: msg.id,
              threadId: msg.thread_id || threadId,
              replyToChatMessageId: replyTargetId(msg) || rootMessageId,
              isStaff: Boolean(msg.user.staff || msg.user.moderator || msg.user.admin),
              probableReplies: previewReply ? [previewReply] : [],
            });
          }
        } catch (err) {
          errors.push(`community thread ${threadId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`community: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { items: withIgnoredReasons(annotateProbableReplies(items)), errors, window };
}

function relevantItems(items: CommunityAgentItem[]): CommunityAgentItem[] {
  return items.filter((item) => {
    if (shouldIgnoreAuthor(item.username)) return false;
    if (shouldIgnoreMessage(item.message)) return false;
    if ((item.probableReplies || []).length > 0) return false;
    return isQuestionOrSupportRequest(item.message) || isPotentiallyUsefulContribution(item.message);
  });
}

function candidatePriority(item: CommunityAgentItem): number {
  return isQuestionOrSupportRequest(item.message) ? 0 : 1;
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

function anthropicUsage(response: unknown): { inputTokens?: number; outputTokens?: number } {
  const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  return {
    inputTokens: usage?.input_tokens,
    outputTokens: usage?.output_tokens,
  };
}

function removeWarRoomLink(reply: string, warRoomLink: string): string {
  return reply
    .replaceAll(warRoomLink, '')
    .replace(/War Room link:\s*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const NON_ENGLISH_REPLY_PATTERN = /[ñáéíóúü¿¡]|\b(hola|gracias|por favor|disculpa|ay[uú]dame|necesito|equipo|acceso)\b/i;

function looksNonEnglish(reply: string): boolean {
  return NON_ENGLISH_REPLY_PATTERN.test(reply);
}

function cleanGeneratedReply(reply: string): string {
  const lines = sanitizeGeneratedText(reply).trim().split(/\n/);
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim().toLowerCase();
    if (!(last.includes('support') && last.includes('assistant'))) break;
    lines.pop();
  }
  return lines.join('\n').trim();
}

function withWarRoomSupportInfo(reply: string, warRoomLink: string, canUseWarRoomLink: boolean): string {
  const trimmed = cleanGeneratedReply(reply);
  if (!trimmed) return trimmed;

  if (!canUseWarRoomLink || !warRoomLink) {
    return removeWarRoomLink(trimmed, warRoomLink);
  }

  return trimmed;
}

function cleanReactionEmoji(value: string): string {
  const trimmed = value.trim().replace(/^:+|:+$/g, '');
  if (!trimmed || trimmed.length > 32) return DEFAULT_REACTION_EMOJI;
  return /^[a-z0-9_+\-]+$/i.test(trimmed) ? trimmed : DEFAULT_REACTION_EMOJI;
}

export function warRoomAvailabilityDecision(
  message: string,
  warRoomLink: string,
  now = new Date(),
): Omit<CommunityAgentDecision, 'itemId' | 'source' | 'username' | 'message' | 'posted' | 'reacted' | 'needsHuman'> | null {
  void message;
  void warRoomLink;
  void now;
  return null;
}

export async function evaluateSupportMessage(
  username: string,
  message: string,
  context: string,
  warRoomLink: string,
  canUseWarRoomLink: boolean,
): Promise<Omit<CommunityAgentDecision, 'itemId' | 'source' | 'username' | 'message' | 'posted' | 'reacted' | 'needsHuman'>> {
  const snippets = await findProjectGuidelineSnippets(message, 4);
  const memory = await projectMemoryText(25);
  const anthropicRuntime = resolveAnthropicRuntime();
  const anthropic = anthropicRuntime.client;
  const projectName = getProjectContext().projectName || 'the active project';
  const warRoomInstruction = canUseWarRoomLink && warRoomLink
    ? `A War Room link is configured for this project: ${warRoomLink}. Include it only when live support is clearly relevant and supported by project memory, project guidelines, or recent context. Do not state live-support hours, weekdays, weekends, or room names unless they are present in project memory, project guidelines, or recent context.`
    : 'No War Room link is configured for this project. Do not include a War Room link.';
  const systemPrompt = [
    `You are a community management agent for ${projectName}.`,
    'Always write user-facing replies in English, even if the incoming message is Spanish, Portuguese, or any other language.',
    'Never write the reply in Spanish.',
    'Never use the em dash character U+2014. Use commas, parentheses, or a regular hyphen instead.',
    'Use the provided project memory, project guideline excerpts, and recent chat context as the source of truth.',
    'You may answer only when the answer is clearly supported by the provided project memory, project guideline excerpts, or by the recent chat context.',
    'Use action "react" only when the incoming contributor message is useful, constructive, or confirms a resolution, and no text reply is needed.',
    `For action "react", use reaction "${DEFAULT_REACTION_EMOJI}" unless there is a clearly better positive reaction. Do not put reaction-only acknowledgements in the reply field.`,
    'If the information is missing, sensitive, about pay, account policy, deadlines, eligibility policy, or you are not confident, choose action "human".',
    'Keep replies under 4 short sentences.',
    'Do not add a footer, attribution, or assistant name.',
    warRoomInstruction,
    'Return only valid JSON with keys: action ("reply", "react", "human", or "ignore"), confidence (0 to 1), reason, reply, reaction.',
  ].filter(Boolean).join(' ');
  const userPrompt = [
    `Today/context:\n${context || 'No recent context.'}`,
    `Project memory:\n${memory || 'No project memory available.'}`,
    `Project guideline excerpts:\n${snippets.length ? snippets.join('\n\n---\n\n') : 'No guideline text available.'}`,
    `Incoming message from ${username}:\n${message}`,
  ].join('\n\n');

  await assertAiUsageAllowed('support_evaluation', estimateTokens(`${systemPrompt}\n\n${userPrompt}`), 450);
  const response = await anthropic.messages.create({
    model: anthropicRuntime.model,
    max_tokens: 450,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  const rawResponseText = anthropicText(response);
  const usage = anthropicUsage(response);
  await recordAiUsage({
    feature: 'support_evaluation',
    model: anthropicRuntime.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    inputText: `${systemPrompt}\n\n${userPrompt}`,
    outputText: rawResponseText,
  });

  const parsed = extractJson(rawResponseText);
  const action: CommunityAgentAction =
    parsed.action === 'reply' || parsed.action === 'react' || parsed.action === 'human' || parsed.action === 'ignore'
      ? parsed.action
      : 'human';
  const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
  const rawReply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
  const nonEnglishReply = action === 'reply' && looksNonEnglish(rawReply);
  const hasKnowledgeSupport = snippets.length > 0 || memory.trim().length > 0;
  const finalAction =
    action === 'reply' && (!rawReply || confidence < MIN_CONFIDENCE || !hasKnowledgeSupport || nonEnglishReply)
      ? 'human'
      : action === 'react' && confidence < MIN_CONFIDENCE
        ? 'ignore'
      : action;
  const rawReaction = typeof parsed.reaction === 'string' ? parsed.reaction.trim() : '';
  const reply = finalAction === 'reply'
    ? cleanGeneratedReply(withWarRoomSupportInfo(rawReply, warRoomLink, canUseWarRoomLink))
    : cleanGeneratedReply(rawReply);

  return {
    action: finalAction,
    confidence,
    reason: nonEnglishReply
      ? 'Claude reply failed the English-only check, escalated to human'
      : typeof parsed.reason === 'string'
        ? parsed.reason
        : 'No reason returned',
    reply,
    reaction: finalAction === 'react' ? cleanReactionEmoji(rawReaction || DEFAULT_REACTION_EMOJI) : undefined,
    guidelineSnippets: snippets,
  };
}

async function postDecision(client: DiscourseClient, channelId: string, reply: string, item: CommunityAgentItem): Promise<boolean> {
  await client.sendChatMessage(channelId, reply, {
    inReplyToId: item.chatMessageId,
    threadId: item.threadId,
  });
  return true;
}

async function reactToDecision(
  client: DiscourseClient,
  channelId: string,
  item: CommunityAgentItem,
  emoji: string,
): Promise<boolean> {
  if (!item.chatMessageId) return false;
  await client.reactToChatMessage(channelId, item.chatMessageId, cleanReactionEmoji(emoji || DEFAULT_REACTION_EMOJI), 'add');
  return true;
}

export async function fetchCommunityAgentItems(options: CommunityAgentOptions = {}): Promise<{
  items: CommunityAgentItem[];
  candidates: CommunityAgentItem[];
  errors: string[];
  window: CommunityAgentResult['window'];
}> {
  const result = await fetchCommunityItems({
    includeCommunity: options.includeCommunity ?? true,
    onlyToday: options.onlyToday ?? true,
    messageCount: options.messageCount ?? MESSAGE_COUNT,
  });

  const candidates = relevantItems(result.items);
  return {
    items: result.items,
    candidates,
    errors: result.errors,
    window: {
      utcDate: result.window.utcDate,
      argentinaDate: result.window.utcDate,
      startUtc: result.window.startUtc,
      endUtc: result.window.endUtc,
      operatingHours: result.window.operatingHours,
    },
  };
}

export async function runCommunityAgent(options: CommunityAgentOptions = {}): Promise<CommunityAgentResult> {
  const post = options.post === true;
  const react = options.react === true;
  const includeCommunity = options.includeCommunity ?? true;
  const onlyToday = options.onlyToday ?? true;
  const respectSchedule = options.respectSchedule ?? false;
  const skipProcessed = options.skipProcessed ?? true;
  const markProcessed = options.markProcessed ?? (post || react || respectSchedule);
  const maxAnswers = options.maxAnswers ?? MAX_ANSWERS;
  const messageCount = options.messageCount ?? MESSAGE_COUNT;
  const withinSchedule = isWithinOperatingHours();
  const { client, channelId } = createClient();

  const fetched = await fetchCommunityItems({ includeCommunity, onlyToday, messageCount });
  const window = {
    utcDate: fetched.window.utcDate,
    argentinaDate: fetched.window.utcDate,
    startUtc: fetched.window.startUtc,
    endUtc: fetched.window.endUtc,
    operatingHours: fetched.window.operatingHours,
  };

  if (respectSchedule && !withinSchedule) {
    const result: CommunityAgentResult = {
      mode: post || react ? 'post' : 'suggestion',
      checked: fetched.items.length,
      candidates: 0,
      handled: 0,
      posted: 0,
      reacted: 0,
      needsHuman: 0,
      ignored: 0,
      withinSchedule,
      window,
      items: fetched.items,
      decisions: [],
      errors: fetched.errors,
    };
    await appendOperationLog({
      action: 'community_agent',
      status: 'skipped',
      message: 'Outside operating hours',
      metadata: { window },
    }, {
      type: 'community_agent',
      options: { post, react, includeCommunity, onlyToday, respectSchedule, skipProcessed, markProcessed, maxAnswers, messageCount },
      result,
      items: fetched.items,
      candidates: [],
      decisions: [],
    });
    return result;
  }

  const state = await readState();
  const candidates = relevantItems(fetched.items)
    .filter((item) => !skipProcessed || !state.processed[item.id])
    .sort((a, b) => candidatePriority(a) - candidatePriority(b) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, maxAnswers);

  const context = fetched.items
    .slice(-12)
    .map((item) => `[${item.source}/${item.username}]: ${item.message.slice(0, 220)}`)
    .join('\n');

  const { warRoom: warRoomLink } = await loadProjectLinks();
  const canUseWarRoomLink = Boolean(warRoomLink);
  const decisions: CommunityAgentDecision[] = [];

  for (const item of candidates) {
    try {
      const decision = warRoomAvailabilityDecision(item.message, warRoomLink) ||
        await evaluateSupportMessage(item.username, item.message, context, warRoomLink, canUseWarRoomLink);
      let posted = false;
      let reacted = false;
      if (post && decision.action === 'reply') {
        posted = await postDecision(client, channelId, decision.reply, item);
      }
      if (react && decision.action === 'react') {
        reacted = await reactToDecision(client, channelId, item, decision.reaction || DEFAULT_REACTION_EMOJI);
      }

      decisions.push({
        itemId: item.id,
        source: item.source,
        username: item.username,
        message: item.message,
        posted,
        reacted,
        needsHuman: decision.action === 'human',
        ...decision,
      });

      if (markProcessed && decision.action !== 'ignore') {
        state.processed[item.id] = { at: new Date().toISOString(), action: decision.action, posted, reacted };
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
        reacted: false,
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
  const reacted = decisions.filter((decision) => decision.reacted).length;
  const needsHuman = decisions.filter((decision) => decision.needsHuman).length;
  const ignored = decisions.filter((decision) => decision.action === 'ignore').length;
  const result: CommunityAgentResult = {
    mode: post || react ? 'post' : 'suggestion',
    checked: fetched.items.length,
    candidates: candidates.length,
    handled: decisions.length,
    posted,
    reacted,
    needsHuman,
    ignored,
    withinSchedule,
    window,
    items: fetched.items,
    decisions,
    errors: fetched.errors,
  };

  await appendOperationLog({
    action: 'community_agent',
    status: decisions.length > 0 || fetched.errors.length === 0 ? 'success' : 'error',
    message: post ? 'Community agent run with posting enabled' : 'Community agent run in suggestion mode',
    metadata: {
      checked: fetched.items.length,
      candidates: candidates.length,
      posted,
      reacted,
      needsHuman,
      candidateUsers: candidates.map((item) => item.username),
      postedUsers: decisions.filter((decision) => decision.posted).map((decision) => decision.username),
      reactedUsers: decisions.filter((decision) => decision.reacted).map((decision) => decision.username),
      humanUsers: decisions.filter((decision) => decision.needsHuman).map((decision) => decision.username),
      errors: fetched.errors,
    },
  }, {
    type: 'community_agent',
    options: { post, react, includeCommunity, onlyToday, respectSchedule, skipProcessed, markProcessed, maxAnswers, messageCount },
    result,
    items: fetched.items,
    candidates,
    decisions,
  });

  return result;
}
