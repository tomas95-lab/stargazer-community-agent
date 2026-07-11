import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { loadBotConfig } from './config';
import {
  DiscourseChatMessage,
  DiscourseClient,
  DiscourseDirectMessageChannel,
} from './discourse-client';
import { normalizeProjectMemory, ProjectMemoryFact } from './project-memory';

type TrainingSource = 'community' | 'dm';

interface TrainingMessage {
  id: string;
  source: TrainingSource;
  channelId: string;
  channelTitle?: string | null;
  threadId?: number | null;
  username: string;
  createdAt: string;
  text: string;
  own: boolean;
  peers: string[];
}

interface ManagerReplySample {
  source: TrainingSource;
  channelId: string;
  channelTitle?: string | null;
  createdAt: string;
  category: string;
  context: string[];
  reply: string;
}

interface CategorySummary {
  category: string;
  managerReplies: number;
  incomingMessages: number;
  commonSignals: string[];
}

interface TrainingAnalysis {
  generatedAt: string;
  since: string;
  until: string;
  scanned: {
    communityMessages: number;
    dmMessages: number;
    dmChannels: number;
    managerReplies: number;
    managerBroadcasts: number;
  };
  style: {
    averageReplyCharacters: number;
    shortReplyRate: number;
    englishOnlyRate: number;
    usesWarRoomLinkRate: number;
    usesPleaseRate: number;
    usesNoFooterRate: number;
    emDashCount: number;
    commonOpeners: string[];
  };
  categories: CategorySummary[];
  samples: ManagerReplySample[];
  memoryFacts: ProjectMemoryFact[];
  errors: string[];
}

const OUTPUT_DIR = path.resolve(__dirname, '../output/training');
const PROJECT_MEMORY_FILE = path.resolve(__dirname, '../data/project-memory.json');
const WAR_ROOM_MEETING_ID = '91510346485';
const DEFAULT_PAGE_SIZE = Number(process.env.TRAINING_SCAN_PAGE_SIZE || 100);
const DEFAULT_MAX_PAGES = Number(process.env.TRAINING_SCAN_MAX_PAGES || 20);
const DEFAULT_MAX_DM_CHANNELS = Number(process.env.TRAINING_SCAN_MAX_DM_CHANNELS || 80);
const DEFAULT_REQUEST_DELAY_MS = Number(process.env.TRAINING_SCAN_REQUEST_DELAY_MS || 900);

function boolArg(name: string): boolean {
  return process.argv.includes(name);
}

function numericArg(name: string, fallback: number): number {
  const prefix = `${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function cleanText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(new RegExp(`https://\\S*${WAR_ROOM_MEETING_ID}\\S*`, 'gi'), '[war-room-link]')
    .trim();
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isSpanishLike(value: string): boolean {
  return /[ñáéíóúü¿¡]|\b(hola|gracias|por favor|necesito|puedo|puedes|ayuda|acceso|curso|equipo)\b/i.test(value);
}

function isBroadcast(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('🚨') ||
    trimmed.startsWith('Hey everyone') ||
    trimmed.startsWith('Hey team') ||
    trimmed.startsWith('Team,');
}

function isTrainingNoise(value: string): boolean {
  const lower = normalizeText(value);
  return lower.includes('ignore this message') ||
    lower.includes('test from daily thread bot') ||
    lower.includes('daily thread bot api');
}

function inferCategory(text: string): string {
  const lower = normalizeText(text);
  const checks: Array<[string, string[]]> = [
    ['cursor_access_step_0', ['cursor', 'access', 'acceso', 'step 0', 'eq', 'ineligible', 'unlock']],
    ['war_room_availability', ['war room', 'zoom', 'breakout', 'open now', 'closed', '11:15']],
    ['model_setup', ['qwen', 'sonnet', 'claude', 'model']],
    ['task_throttle', ['throttle', '24hr', '24-hour', 'one task', '1 task']],
    ['course_onboarding', ['course', 'onboarding', 'training', 'enroll']],
    ['rubric_quality', ['rubric', 'criterion', 'criteria', 'atomic', 'self-contain']],
    ['test_quality', ['f2p', 'p2p', 'test', 'phase 1', 'phase 2', 'gold patch']],
    ['prompt_quality', ['prompt', 'issue', 'over-specified', 'bug injection', 'feature request']],
    ['docker_validation', ['docker', 'run_script', 'parse_results', 'base.dockerfile', 'instance.dockerfile']],
    ['webinar', ['webinar', 'session', 'attendance', 'recording']],
    ['sensitive_policy', ['pay', 'payment', 'account', 'deadline', 'eligibility']],
  ];

  return checks.find(([, signals]) => signals.some((signal) => lower.includes(signal)))?.[0] || 'general_support';
}

function conversationKey(message: TrainingMessage): string {
  return [
    message.source,
    message.channelId,
    message.threadId || 'main',
  ].join(':');
}

function messageTime(value: string): number {
  return new Date(value).getTime();
}

function words(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9:.-]+/g)
    .filter((word) => word.length >= 4);
}

function topSignals(texts: string[], limit = 8): string[] {
  const ignored = new Set([
    'this', 'that', 'with', 'from', 'have', 'your', 'will', 'please', 'should', 'would',
    'they', 'them', 'there', 'here', 'into', 'once', 'because', 'about', 'already',
    'thanks', 'thank', 'need', 'needs', 'make', 'more', 'when', 'what',
  ]);
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const word of words(text)) {
      if (ignored.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function peersFromChannel(channel: DiscourseDirectMessageChannel): string[] {
  const users = [
    ...(channel.users || []),
    ...(channel.chatable?.users || []),
    ...(channel.chatable?.direct_message_users || []),
    ...(channel.chatable?.participants || []),
    ...(channel.chatable?.group_users || []),
  ];
  return [...new Set(users.map((user) => user.username).filter(Boolean))];
}

function lastMessageAt(channel: DiscourseDirectMessageChannel): string | undefined {
  return channel.last_message_created_at || channel.last_message?.created_at;
}

async function fetchChannelHistory(params: {
  client: DiscourseClient;
  channelId: string;
  since: Date;
  pageSize: number;
  maxPages: number;
  requestDelayMs: number;
}): Promise<DiscourseChatMessage[]> {
  const seen = new Map<number, DiscourseChatMessage>();
  let targetMessageId: number | undefined;

  for (let page = 0; page < params.maxPages; page += 1) {
    if (page > 0) await sleep(params.requestDelayMs);
    const messages = await params.client.readChatMessages(
      params.channelId,
      params.pageSize,
      targetMessageId ? { targetMessageId, direction: 'past' } : {}
    );
    if (messages.length === 0) break;

    for (const message of messages) {
      seen.set(message.id, message);
    }

    const ordered = [...messages].sort((left, right) => messageTime(left.created_at) - messageTime(right.created_at));
    const oldest = ordered[0];
    if (!oldest) break;
    targetMessageId = oldest.id;

    if (messageTime(oldest.created_at) < params.since.getTime()) break;
  }

  return [...seen.values()]
    .filter((message) => messageTime(message.created_at) >= params.since.getTime())
    .sort((left, right) => messageTime(left.created_at) - messageTime(right.created_at));
}

async function fetchCommunityMessages(params: {
  client: DiscourseClient;
  channelId: string;
  ownUsername: string;
  since: Date;
  pageSize: number;
  maxPages: number;
  requestDelayMs: number;
  errors: string[];
}): Promise<TrainingMessage[]> {
  const baseMessages = await fetchChannelHistory(params);
  const messages = new Map<string, TrainingMessage>();

  for (const message of baseMessages) {
    const text = messageText(message);
    if (!text) continue;
    messages.set(`community:${message.id}`, {
      id: `community:${message.id}`,
      source: 'community',
      channelId: params.channelId,
      threadId: message.thread_id,
      username: message.user.username,
      createdAt: message.created_at,
      text,
      own: message.user.username.toLowerCase() === params.ownUsername.toLowerCase(),
      peers: [],
    });
  }

  const threadIds = [...new Set(baseMessages.map((message) => message.thread_id).filter(Boolean))] as number[];
  for (const threadId of threadIds.slice(0, 30)) {
    try {
      await sleep(Math.max(250, Math.floor(params.requestDelayMs / 2)));
      const threadMessages = await params.client.readChatThreadMessages(params.channelId, threadId, 80);
      for (const message of threadMessages) {
        if (messageTime(message.created_at) < params.since.getTime()) continue;
        const text = messageText(message);
        if (!text) continue;
        messages.set(`community:${message.id}`, {
          id: `community:${message.id}`,
          source: 'community',
          channelId: params.channelId,
          threadId,
          username: message.user.username,
          createdAt: message.created_at,
          text,
          own: message.user.username.toLowerCase() === params.ownUsername.toLowerCase(),
          peers: [],
        });
      }
    } catch (err) {
      params.errors.push(`community thread ${threadId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return [...messages.values()].sort((left, right) => messageTime(left.createdAt) - messageTime(right.createdAt));
}

async function fetchDmMessages(params: {
  client: DiscourseClient;
  ownUsername: string;
  since: Date;
  pageSize: number;
  maxPages: number;
  maxChannels: number;
  requestDelayMs: number;
  errors: string[];
}): Promise<{ messages: TrainingMessage[]; scannedChannels: number }> {
  const directChannels = await params.client.readDirectMessageChannels();
  const activeChannels = directChannels
    .filter((channel) => {
      const lastAt = lastMessageAt(channel);
      if (!lastAt) return true;
      return messageTime(lastAt) >= params.since.getTime();
    })
    .sort((left, right) => messageTime(lastMessageAt(right) || '') - messageTime(lastMessageAt(left) || ''))
    .slice(0, params.maxChannels);

  const result: TrainingMessage[] = [];
  for (const [index, channel] of activeChannels.entries()) {
    try {
      if (index > 0) await sleep(params.requestDelayMs);
      const rawMessages = await fetchChannelHistory({
        client: params.client,
        channelId: String(channel.id),
        since: params.since,
        pageSize: params.pageSize,
        maxPages: params.maxPages,
        requestDelayMs: params.requestDelayMs,
      });
      const peers = peersFromChannel(channel);
      for (const message of rawMessages) {
        const text = messageText(message);
        if (!text) continue;
        result.push({
          id: `dm:${channel.id}:${message.id}`,
          source: 'dm',
          channelId: String(channel.id),
          channelTitle: channel.title,
          username: message.user.username,
          createdAt: message.created_at,
          text,
          own: message.user.username.toLowerCase() === params.ownUsername.toLowerCase(),
          peers,
        });
      }
    } catch (err) {
      params.errors.push(`dm channel ${channel.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    messages: result.sort((left, right) => messageTime(left.createdAt) - messageTime(right.createdAt)),
    scannedChannels: activeChannels.length,
  };
}

function buildSamples(messages: TrainingMessage[]): ManagerReplySample[] {
  const grouped = new Map<string, TrainingMessage[]>();
  for (const message of messages) {
    grouped.set(conversationKey(message), [...(grouped.get(conversationKey(message)) || []), message]);
  }

  const samples: ManagerReplySample[] = [];
  for (const threadMessages of grouped.values()) {
    const ordered = threadMessages.slice().sort((left, right) => messageTime(left.createdAt) - messageTime(right.createdAt));
    for (const message of ordered) {
      if (!message.own || isBroadcast(message.text) || isTrainingNoise(message.text)) continue;
      const prior = ordered
        .filter((candidate) =>
          !candidate.own &&
          messageTime(candidate.createdAt) < messageTime(message.createdAt) &&
          messageTime(message.createdAt) - messageTime(candidate.createdAt) <= 8 * 60 * 60 * 1000
        )
        .slice(-4);
      if (prior.length === 0) continue;
      samples.push({
        source: message.source,
        channelId: message.channelId,
        channelTitle: message.channelTitle,
        createdAt: message.createdAt,
        category: inferCategory(`${prior.map((item) => item.text).join(' ')} ${message.text}`),
        context: prior.map((item) => cleanText(`${item.username}: ${item.text}`).slice(0, 500)),
        reply: cleanText(message.text).slice(0, 900),
      });
    }
  }

  return samples.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function summarizeCategories(messages: TrainingMessage[], samples: ManagerReplySample[]): CategorySummary[] {
  const incomingByCategory = new Map<string, string[]>();
  for (const message of messages.filter((item) => !item.own)) {
    const category = inferCategory(message.text);
    incomingByCategory.set(category, [...(incomingByCategory.get(category) || []), message.text]);
  }

  const repliesByCategory = new Map<string, ManagerReplySample[]>();
  for (const sample of samples) {
    repliesByCategory.set(sample.category, [...(repliesByCategory.get(sample.category) || []), sample]);
  }

  const categories = new Set([...incomingByCategory.keys(), ...repliesByCategory.keys()]);
  return [...categories]
    .map((category) => {
      const incoming = incomingByCategory.get(category) || [];
      const replies = repliesByCategory.get(category) || [];
      return {
        category,
        managerReplies: replies.length,
        incomingMessages: incoming.length,
        commonSignals: topSignals([...incoming, ...replies.map((reply) => reply.reply)], 8),
      };
    })
    .sort((left, right) => right.managerReplies - left.managerReplies || right.incomingMessages - left.incomingMessages);
}

function commonOpeners(replies: TrainingMessage[]): string[] {
  const counts = new Map<string, number>();
  for (const reply of replies) {
    const opener = cleanText(reply.text)
      .split(/[.!?\n]/)[0]
      .trim()
      .slice(0, 80);
    if (!opener || opener.length < 4) continue;
    counts.set(opener, (counts.get(opener) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([opener]) => opener);
}

function rate(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100) / 100;
}

function buildMemoryFacts(analysis: Omit<TrainingAnalysis, 'memoryFacts'>): ProjectMemoryFact[] {
  const source = `history scan ${analysis.generatedAt.slice(0, 10)}`;
  const facts: ProjectMemoryFact[] = [
    {
      id: 'manager-style-concise',
      title: 'Manager answer style',
      body: 'Mirror the manager style: direct, concise, supportive, and operational. Prefer 1-3 short sentences, say exactly what action the contributor should take, and avoid generic apologies or long explanations.',
      source,
    },
    {
      id: 'manager-style-english',
      title: 'Manager language pattern',
      body: 'The manager answers contributors in English. Keep all automatic community and DM replies in English even when the incoming message is Spanish or Portuguese.',
      source,
    },
    {
      id: 'manager-style-no-footer',
      title: 'No assistant footer',
      body: 'Do not add a signature, footer, attribution, or assistant name to automated replies.',
      source,
    },
    {
      id: 'manager-style-war-room',
      title: 'War Room support pattern',
      body: 'When live support is relevant and it is a weekday after 11:15 AM ARG, tell contributors to join the War Room and then join the breakout room called Stargazer - Team. On weekends, say the War Room is closed and ask them to come back Monday between 11:15 AM and 7:00 PM ARG.',
      source,
    },
    {
      id: 'manager-style-uncertain-human',
      title: 'Escalate uncertain cases',
      body: 'If the message asks about account policy, eligibility decisions, payment, deadlines, personal status, or anything not supported by guidelines or memory, route to a human instead of guessing.',
      source,
    },
  ];

  const categoryNames = new Set(analysis.categories.filter((category) => category.managerReplies > 0).map((category) => category.category));
  if (categoryNames.has('cursor_access_step_0')) {
    facts.push({
      id: 'learned-cursor-access-flow',
      title: 'Cursor access support flow',
      body: 'For contributors who completed courses but are EQ, ineligible, locked, or missing Cursor access, the expected step is to enter the War Room and ask the team to check or unlock access. This is Step 0.',
      source,
    });
  }
  if (categoryNames.has('model_setup')) {
    facts.push({
      id: 'learned-model-setup',
      title: 'Current model setup',
      body: 'The project moved away from Qwen. Contributors should use Claude Sonnet 4.6 for Stargazer tasks and make sure their Cursor configuration follows the current project guidelines.',
      source,
    });
  }
  if (categoryNames.has('task_throttle')) {
    facts.push({
      id: 'learned-task-throttle',
      title: 'Initial task throttle',
      body: 'The 1-task-per-24-hours throttle is automatic at the beginning and should not be promised as manually removable. The team evaluates quality after contributors complete enough tasks.',
      source,
    });
  }
  if (categoryNames.has('rubric_quality') || categoryNames.has('test_quality') || categoryNames.has('prompt_quality')) {
    facts.push({
      id: 'learned-quality-help',
      title: 'Quality question handling',
      body: 'For rubric, prompt, F2P, P2P, Docker, or validation-script questions, give a short conceptual answer only when the guideline clearly supports it. For repo-specific implementation review, ask the contributor to use the War Room.',
      source,
    });
  }

  return facts;
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

async function applyMemoryFacts(facts: ProjectMemoryFact[]): Promise<void> {
  let existing: unknown = {};
  try {
    existing = JSON.parse(await fs.readFile(PROJECT_MEMORY_FILE, 'utf-8'));
  } catch {
    existing = {};
  }

  const normalized = normalizeProjectMemory(existing);
  const byId = new Map(normalized.facts.map((fact) => [fact.id, fact]));
  for (const fact of facts) byId.set(fact.id, fact);

  const next = normalizeProjectMemory({
    updatedAt: new Date().toISOString(),
    facts: [...byId.values()],
  });
  await writeJson(PROJECT_MEMORY_FILE, next);
}

async function main(): Promise<void> {
  const days = numericArg('--days', 14);
  const pageSize = numericArg('--page-size', DEFAULT_PAGE_SIZE);
  const maxPages = numericArg('--max-pages', DEFAULT_MAX_PAGES);
  const maxDmChannels = numericArg('--max-dm-channels', DEFAULT_MAX_DM_CHANNELS);
  const requestDelayMs = numericArg('--delay-ms', DEFAULT_REQUEST_DELAY_MS);
  const applyMemory = boolArg('--apply-memory');
  const since = daysAgo(days);
  const errors: string[] = [];

  const config = loadBotConfig();
  const client = new DiscourseClient({
    baseUrl: config.communityBaseUrl,
    apiKey: config.discourseApiKey,
    apiClientId: config.discourseApiClientId,
  });

  const communityMessages = await fetchCommunityMessages({
    client,
    channelId: config.communityChatChannelId,
    ownUsername: config.discourseUsername,
    since,
    pageSize,
    maxPages,
    requestDelayMs,
    errors,
  });

  const dmResult = await fetchDmMessages({
    client,
    ownUsername: config.discourseUsername,
    since,
    pageSize,
    maxPages,
    maxChannels: maxDmChannels,
    requestDelayMs,
    errors,
  });

  const messages = [...communityMessages, ...dmResult.messages]
    .sort((left, right) => messageTime(left.createdAt) - messageTime(right.createdAt));
  const managerReplies = messages.filter((message) => message.own && !isBroadcast(message.text) && !isTrainingNoise(message.text));
  const managerBroadcasts = messages.filter((message) => message.own && isBroadcast(message.text) && !isTrainingNoise(message.text));
  const samples = buildSamples(messages);
  const categories = summarizeCategories(messages, samples);
  const replyTexts = managerReplies.map((message) => message.text);
  const generatedAt = new Date().toISOString();
  const analysisWithoutFacts = {
    generatedAt,
    since: since.toISOString(),
    until: generatedAt,
    scanned: {
      communityMessages: communityMessages.length,
      dmMessages: dmResult.messages.length,
      dmChannels: dmResult.scannedChannels,
      managerReplies: managerReplies.length,
      managerBroadcasts: managerBroadcasts.length,
    },
    style: {
      averageReplyCharacters: Math.round(replyTexts.reduce((sum, text) => sum + cleanText(text).length, 0) / Math.max(1, replyTexts.length)),
      shortReplyRate: rate(replyTexts.filter((text) => cleanText(text).length <= 350).length, replyTexts.length),
      englishOnlyRate: rate(replyTexts.filter((text) => !isSpanishLike(text)).length, replyTexts.length),
      usesWarRoomLinkRate: rate(replyTexts.filter((text) => text.includes(WAR_ROOM_MEETING_ID) || normalizeText(text).includes('war room')).length, replyTexts.length),
      usesPleaseRate: rate(replyTexts.filter((text) => normalizeText(text).includes('please')).length, replyTexts.length),
      usesNoFooterRate: rate(replyTexts.filter((text) => !normalizeText(text).includes('support assistant')).length, replyTexts.length),
      emDashCount: replyTexts.filter((text) => text.includes('—')).length,
      commonOpeners: commonOpeners(managerReplies),
    },
    categories,
    samples: samples.slice(-80),
    errors,
  };
  const memoryFacts = buildMemoryFacts(analysisWithoutFacts);
  const analysis: TrainingAnalysis = {
    ...analysisWithoutFacts,
    memoryFacts,
  };

  const stamp = generatedAt.slice(0, 10);
  const rawPath = path.join(OUTPUT_DIR, `manager-training-raw-${stamp}.json`);
  const analysisPath = path.join(OUTPUT_DIR, `manager-training-analysis-${stamp}.json`);
  await writeJson(rawPath, { generatedAt, since: since.toISOString(), messages });
  await writeJson(analysisPath, analysis);

  if (applyMemory) {
    await applyMemoryFacts(memoryFacts);
  }

  console.log(JSON.stringify({
    generatedAt,
    since: since.toISOString(),
    communityMessages: communityMessages.length,
    dmMessages: dmResult.messages.length,
    dmChannels: dmResult.scannedChannels,
    managerReplies: managerReplies.length,
    managerBroadcasts: managerBroadcasts.length,
    categories: categories.slice(0, 10).map((category) => ({
      category: category.category,
      managerReplies: category.managerReplies,
      incomingMessages: category.incomingMessages,
    })),
    memoryFacts: memoryFacts.map((fact) => fact.id),
    rawPath,
    analysisPath,
    appliedMemory: applyMemory,
    errors,
  }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
