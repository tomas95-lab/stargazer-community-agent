import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { loadBotConfig } from './config';
import { DiscourseChatMessage, DiscourseClient } from './discourse-client';
import { readDataJSON, writeDataJSON } from './data-store';
import { appendOperationLog } from './operations-log';
import { loadProjectLinks } from './links';
import {
  CommunityAgentAction,
  evaluateSupportMessage,
  isWithinOperatingHours,
  warRoomAvailabilityDecision,
  warRoomIsOpenDay,
} from './community-agent';
import { DmReviewPeer, directMessagePeers, getArgentinaDayWindow, shouldScanChannel } from './dm-review-job';

const DEFAULT_MESSAGE_COUNT = Number(process.env.DM_REVIEW_MESSAGE_COUNT || 50);
const DEFAULT_MAX_CHANNELS = Number(process.env.DM_REVIEW_MAX_CHANNELS || 100);
const DEFAULT_REQUEST_DELAY_MS = Number(process.env.DM_REVIEW_REQUEST_DELAY_MS || 1500);
const DEFAULT_MAX_ANSWERS = Number(process.env.DM_AGENT_MAX_ANSWERS || process.env.AGENT_MAX_ANSWERS || 4);
const STATE_FILE = 'output/dm-agent-state.json';

export type DmAgentAction = CommunityAgentAction;

export interface DmAgentCandidate {
  id: string;
  channelId: number;
  channelTitle?: string | null;
  peer: DmReviewPeer;
  username: string;
  message: string;
  createdAt: string;
}

export interface DmAgentDecision extends DmAgentCandidate {
  action: DmAgentAction;
  confidence: number;
  reason: string;
  reply: string;
  posted: boolean;
  needsHuman: boolean;
  guidelineSnippets: string[];
  error?: string;
}

export interface DmAgentResult {
  mode: 'suggestion' | 'post';
  generatedAt: string;
  withinSchedule: boolean;
  totalDirectChannels: number;
  scannedChannels: number;
  candidates: number;
  handled: number;
  posted: number;
  needsHuman: number;
  ignored: number;
  decisions: DmAgentDecision[];
  errors: string[];
}

export interface DmAgentOptions {
  post?: boolean;
  messageCount?: number;
  maxChannels?: number;
  requestDelayMs?: number;
  maxAnswers?: number;
  skipProcessed?: boolean;
  markProcessed?: boolean;
  respectSchedule?: boolean;
}

interface AgentState {
  processed: Record<string, { at: string; action: DmAgentAction; posted: boolean }>;
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

function isWithinWindow(createdAt: string | undefined, window: { start: Date; end: Date }): boolean {
  if (!createdAt) return false;
  const time = new Date(createdAt).getTime();
  return Number.isFinite(time) && time >= window.start.getTime() && time < window.end.getTime();
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
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
  await writeDataJSON(STATE_FILE, { processed: Object.fromEntries(entries) }, 'update dm agent state');
}

export async function fetchDmAgentCandidates(options: Pick<DmAgentOptions, 'messageCount' | 'maxChannels' | 'requestDelayMs'> = {}): Promise<{
  candidates: DmAgentCandidate[];
  totalDirectChannels: number;
  scannedChannels: number;
  errors: string[];
}> {
  const { client, ownUsername } = createClient();
  const window = getArgentinaDayWindow();
  const messageCount = options.messageCount ?? DEFAULT_MESSAGE_COUNT;
  const maxChannels = options.maxChannels ?? DEFAULT_MAX_CHANNELS;
  const requestDelayMs = Math.max(0, options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS);
  const normalizedOwnUsername = ownUsername.trim().toLowerCase();
  const errors: string[] = [];

  const directChannels = await client.readDirectMessageChannels();
  const channelsToScan = directChannels.filter((channel) => shouldScanChannel(channel, window)).slice(0, maxChannels);
  const candidates: DmAgentCandidate[] = [];

  for (const [index, channel] of channelsToScan.entries()) {
    try {
      if (index > 0) await sleep(requestDelayMs);
      const channelMessages = await client.readChatMessages(String(channel.id), messageCount);
      if (channelMessages.length === 0) continue;

      const sorted = [...channelMessages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const last = sorted[sorted.length - 1];
      if (!last?.user?.username) continue;
      if (last.user.username.trim().toLowerCase() === normalizedOwnUsername) continue;
      if (!isWithinWindow(last.created_at, window)) continue;

      const peers = directMessagePeers(channel);
      const peer =
        peers.find((candidatePeer) => candidatePeer.username.toLowerCase() === last.user.username.toLowerCase()) ||
        { username: last.user.username, name: last.user.name };

      candidates.push({
        id: `dm:${channel.id}:${last.id}`,
        channelId: channel.id,
        channelTitle: channel.title,
        peer,
        username: last.user.username,
        message: messageText(last),
        createdAt: last.created_at,
      });
    } catch (err) {
      errors.push(`Channel ${channel.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    candidates,
    totalDirectChannels: directChannels.length,
    scannedChannels: channelsToScan.length,
    errors,
  };
}

export async function runDmAgent(options: DmAgentOptions = {}): Promise<DmAgentResult> {
  const post = options.post === true;
  const respectSchedule = options.respectSchedule ?? false;
  const skipProcessed = options.skipProcessed ?? true;
  const markProcessed = options.markProcessed ?? (post || respectSchedule);
  const maxAnswers = options.maxAnswers ?? DEFAULT_MAX_ANSWERS;
  const withinSchedule = isWithinOperatingHours();
  const { client } = createClient();

  const fetched = await fetchDmAgentCandidates({
    messageCount: options.messageCount,
    maxChannels: options.maxChannels,
    requestDelayMs: options.requestDelayMs,
  });

  if (respectSchedule && !withinSchedule) {
    await appendOperationLog({
      action: 'dm_agent',
      status: 'skipped',
      message: 'Outside operating hours',
      metadata: { scannedChannels: fetched.scannedChannels },
    });
    return {
      mode: post ? 'post' : 'suggestion',
      generatedAt: new Date().toISOString(),
      withinSchedule,
      totalDirectChannels: fetched.totalDirectChannels,
      scannedChannels: fetched.scannedChannels,
      candidates: 0,
      handled: 0,
      posted: 0,
      needsHuman: 0,
      ignored: 0,
      decisions: [],
      errors: fetched.errors,
    };
  }

  const state = await readState();
  const candidates = fetched.candidates
    .filter((candidate) => !skipProcessed || !state.processed[candidate.id])
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, maxAnswers);

  const { warRoom: warRoomLink } = await loadProjectLinks();
  const isWarRoomOpenDay = warRoomIsOpenDay();
  const decisions: DmAgentDecision[] = [];

  for (const candidate of candidates) {
    try {
      const context = `Direct message conversation with ${candidate.username}.`;
      const decision =
        warRoomAvailabilityDecision(candidate.message, warRoomLink) ||
        (await evaluateSupportMessage(candidate.username, candidate.message, context, warRoomLink, isWarRoomOpenDay));

      let posted = false;
      if (post && decision.action === 'reply') {
        await client.sendChatMessage(String(candidate.channelId), decision.reply);
        posted = true;
      }

      decisions.push({
        ...candidate,
        posted,
        needsHuman: decision.action === 'human',
        ...decision,
      });

      if (markProcessed && decision.action !== 'ignore') {
        state.processed[candidate.id] = { at: new Date().toISOString(), action: decision.action, posted };
      }
    } catch (err) {
      decisions.push({
        ...candidate,
        action: 'human',
        confidence: 0,
        reason: 'Agent failed while analyzing this DM',
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
    action: 'dm_agent',
    status: decisions.length > 0 || fetched.errors.length === 0 ? 'success' : 'error',
    message: post ? 'DM agent run with posting enabled' : 'DM agent run in suggestion mode',
    metadata: {
      scannedChannels: fetched.scannedChannels,
      candidates: candidates.length,
      posted,
      needsHuman,
      errors: fetched.errors,
    },
  });

  return {
    mode: post ? 'post' : 'suggestion',
    generatedAt: new Date().toISOString(),
    withinSchedule,
    totalDirectChannels: fetched.totalDirectChannels,
    scannedChannels: fetched.scannedChannels,
    candidates: candidates.length,
    handled: decisions.length,
    posted,
    needsHuman,
    ignored,
    decisions,
    errors: fetched.errors,
  };
}

if (require.main === module) {
  const post = process.argv.includes('--post');
  runDmAgent({ post, markProcessed: post })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
