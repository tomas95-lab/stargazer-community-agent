import { readDataJSON, writeDataJSON } from './data-store';
import type { DiscourseChatMessage } from './discourse-client';
import type { DmReviewMessage, DmReviewResult, DmReviewThreadSummary } from './dm-review-job';
import { appDateParts, appDayWindow } from './timezone';

const FILE = 'data/demo-community-state.json';
const DEMO_QM_USERNAME = 'demo.qm';

interface DemoState {
  date: string;
  nextMessageId: number;
  community: DiscourseChatMessage[];
  dms: DmReviewMessage[];
}

function minutesAgo(minutes: number, now: Date): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

function demoPeer(username: string, name: string) {
  return [
    { id: username.length * 10, username, name },
    { id: 999, username: DEMO_QM_USERNAME, name: 'Demo QM' },
  ];
}

function initialState(now = new Date()): DemoState {
  return {
    date: appDateParts(now).label,
    nextMessageId: 93000,
    community: [
      {
        id: 81001,
        message: 'I completed all onboarding courses, but my dashboard still shows EQ. What should I check next?',
        chat_channel_id: 91001,
        thread_id: 81001,
        user: { id: 101, username: 'alex.demo', name: 'Alex Morgan' },
        created_at: minutesAgo(115, now),
      },
      {
        id: 81002,
        message: 'Where can I find the task instructions, and what should I review before submitting my first task?',
        chat_channel_id: 91001,
        thread_id: 81002,
        user: { id: 102, username: 'priya.demo', name: 'Priya Shah' },
        created_at: minutesAgo(82, now),
      },
      {
        id: 81003,
        message: 'Why was my latest payment lower than I expected? Can you check my account?',
        chat_channel_id: 91001,
        thread_id: 81003,
        user: { id: 103, username: 'marco.demo', name: 'Marco Silva' },
        created_at: minutesAgo(55, now),
      },
      {
        id: 81004,
        message: 'Hey team, the optional calibration session starts in one hour. The recording will be shared afterward.',
        chat_channel_id: 91001,
        user: { id: 999, username: DEMO_QM_USERNAME, name: 'Demo QM', staff: true },
        created_at: minutesAgo(30, now),
      },
    ],
    dms: [
      {
        channelId: 92001,
        channelTitle: 'Sofia Chen and Demo QM',
        messageId: 82001,
        username: 'sofia.demo',
        name: 'Sofia Chen',
        createdAt: minutesAgo(70, now),
        text: 'Hi! I finished the qualification yesterday.',
        peers: demoPeer('sofia.demo', 'Sofia Chen'),
        incoming: true,
      },
      {
        channelId: 92001,
        channelTitle: 'Sofia Chen and Demo QM',
        messageId: 82002,
        username: 'sofia.demo',
        name: 'Sofia Chen',
        createdAt: minutesAgo(67, now),
        text: 'My project dashboard still says pending. Is there another onboarding step?',
        peers: demoPeer('sofia.demo', 'Sofia Chen'),
        incoming: true,
      },
      {
        channelId: 92002,
        channelTitle: 'Omar Diaz and Demo QM',
        messageId: 82003,
        username: 'omar.demo',
        name: 'Omar Diaz',
        createdAt: minutesAgo(42, now),
        text: 'Can you explain why a payment is missing from my account?',
        peers: demoPeer('omar.demo', 'Omar Diaz'),
        incoming: true,
      },
    ],
  };
}

async function readState(now = new Date()): Promise<DemoState> {
  const today = appDateParts(now).label;
  try {
    const state = await readDataJSON<DemoState>(FILE);
    if (state.date === today && Array.isArray(state.community) && Array.isArray(state.dms)) return state;
  } catch {
    // Initialize below.
  }
  const state = initialState(now);
  await writeDataJSON(FILE, state, 'initialize isolated demo community');
  return state;
}

async function saveState(state: DemoState, reason: string): Promise<void> {
  await writeDataJSON(FILE, state, reason);
}

export async function demoCommunityMessages(count = 50): Promise<DiscourseChatMessage[]> {
  const state = await readState();
  return state.community
    .slice()
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
    .slice(-Math.max(1, count));
}

export async function appendDemoCommunityReply(
  message: string,
  parent: { chatMessageId?: number; threadId?: number | null },
): Promise<number> {
  const state = await readState();
  const id = state.nextMessageId++;
  state.community.push({
    id,
    message: message.trim(),
    chat_channel_id: 91001,
    thread_id: parent.threadId || parent.chatMessageId || id,
    in_reply_to_id: parent.chatMessageId,
    user: { id: 999, username: DEMO_QM_USERNAME, name: 'Demo QM', staff: true },
    created_at: new Date().toISOString(),
  });
  await saveState(state, `simulate Community reply ${id}`);
  return id;
}

export async function appendDemoCommunityMessage(message: string): Promise<number> {
  const state = await readState();
  const id = state.nextMessageId++;
  state.community.push({
    id,
    message: message.trim(),
    chat_channel_id: 91001,
    user: { id: 999, username: DEMO_QM_USERNAME, name: 'Demo QM', staff: true },
    created_at: new Date().toISOString(),
  });
  await saveState(state, `simulate Community message ${id}`);
  return id;
}

function summarizeThread(channelId: number, messages: DmReviewMessage[]): DmReviewThreadSummary {
  const ordered = messages.slice().sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  const lastOutgoingIndex = ordered.map((message) => message.incoming).lastIndexOf(false);
  const pending = ordered.slice(lastOutgoingIndex + 1).filter((message) => message.incoming);
  const incoming = ordered.filter((message) => message.incoming);
  return {
    channelId,
    channelTitle: ordered[0]?.channelTitle,
    peers: ordered[0]?.peers || [],
    totalMessages: ordered.length,
    incomingMessages: incoming.length,
    outgoingMessages: ordered.length - incoming.length,
    pendingIncomingMessages: pending.length,
    needsReply: pending.length > 0,
    lastIncomingMessageId: incoming[incoming.length - 1]?.messageId,
    lastMessageAt: ordered[ordered.length - 1]?.createdAt,
  };
}

export async function demoDmReview(now = new Date()): Promise<DmReviewResult> {
  const state = await readState(now);
  const messages = state.dms.slice().sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  const byChannel = new Map<number, DmReviewMessage[]>();
  for (const message of messages) byChannel.set(message.channelId, [...(byChannel.get(message.channelId) || []), message]);
  const threads = [...byChannel.entries()].map(([channelId, items]) => summarizeThread(channelId, items));
  const window = appDayWindow(now);
  return {
    mode: 'dm-review',
    scanMode: 'full',
    generatedAt: now.toISOString(),
    window: { utcDate: window.date, argentinaDate: window.date, startUtc: window.start.toISOString(), endUtc: window.end.toISOString() },
    totalDirectChannels: threads.length,
    scannedChannels: threads.length,
    skippedInactiveChannels: 0,
    incomingMessages: messages.filter((message) => message.incoming).length,
    pendingIncomingMessages: threads.reduce((sum, thread) => sum + thread.pendingIncomingMessages, 0),
    unresolvedChannels: threads.filter((thread) => thread.needsReply).length,
    channelsWithTodayMessages: threads.length,
    threads,
    messages,
    errors: [],
  };
}

export async function demoDmMessages(channelId: number): Promise<DmReviewMessage[]> {
  const state = await readState();
  return state.dms
    .filter((message) => message.channelId === channelId)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

export async function appendDemoDmReply(channelId: number, message: string): Promise<number> {
  const state = await readState();
  const existing = state.dms.find((item) => item.channelId === channelId);
  if (!existing) throw new Error('Demo DM channel not found.');
  const id = state.nextMessageId++;
  state.dms.push({
    channelId,
    channelTitle: existing.channelTitle,
    messageId: id,
    username: DEMO_QM_USERNAME,
    name: 'Demo QM',
    createdAt: new Date().toISOString(),
    text: message.trim(),
    peers: existing.peers,
    incoming: false,
  });
  await saveState(state, `simulate DM reply ${id}`);
  return id;
}
