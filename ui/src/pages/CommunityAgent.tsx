import {
  Bot,
  CheckCircle2,
  CircleAlert,
  CornerDownRight,
  Hash,
  Inbox,
  MessageCircle,
  MinusCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  type CommunityAgentDecision,
  type CommunityAgentItem,
  type CommunityAgentOverview,
  type CommunityAgentReplyEvidence,
  type CommunityAgentResult,
} from '../api';
import { APP_TIME_ZONE_LABEL, formatAppTimeWithSeconds } from '@/lib/timezone';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePlatform } from '@/platform';

function Badge({ children, tone }: { children: string; tone: 'green' | 'yellow' | 'gray' | 'blue' | 'red' }) {
  const cls = {
    green: 'sg-status-success',
    yellow: 'sg-status-warning',
    gray: 'border-border bg-secondary text-secondary-foreground',
    blue: 'border-primary/20 bg-primary/10 text-primary',
    red: 'sg-status-danger',
  }[tone];

  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

interface InboxThread {
  id: string;
  root: CommunityAgentItem;
  replies: CommunityAgentItem[];
  evidence: CommunityAgentReplyEvidence[];
}

interface ChannelThreadGroup {
  id: string;
  title: string;
  threads: InboxThread[];
  attentionCount: number;
  latestActivity: number;
}

type ThreadFilter = 'attention' | 'answered' | 'skipped' | 'all';
type ThreadState = Exclude<ThreadFilter, 'all'>;

const THREAD_FILTERS: Array<{ value: ThreadFilter; label: string }> = [
  { value: 'attention', label: 'Needs attention' },
  { value: 'answered', label: 'Answered' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'all', label: 'All messages' },
];

function messageTime(item: Pick<CommunityAgentItem, 'createdAt'>): number {
  const time = new Date(item.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatMessageTime(value: string): string {
  return `${formatAppTimeWithSeconds(value)} ${APP_TIME_ZONE_LABEL}`;
}

function buildInboxThreads(items: CommunityAgentItem[]): InboxThread[] {
  const sorted = [...items].sort((a, b) => messageTime(a) - messageTime(b));
  const byChatId = new Map<string, CommunityAgentItem>();
  const byRootId = new Map<string, InboxThread>();

  sorted.forEach((item) => {
    if (item.chatMessageId !== undefined) byChatId.set(`${item.channelId || ''}:${item.chatMessageId}`, item);
  });

  const ensureThread = (root: CommunityAgentItem): InboxThread => {
    const existing = byRootId.get(root.id);
    if (existing) return existing;

    const next: InboxThread = {
      id: root.id,
      root,
      replies: [],
      evidence: [],
    };
    byRootId.set(root.id, next);
    return next;
  };

  for (const item of sorted) {
    const parent = item.replyToChatMessageId !== undefined
      ? byChatId.get(`${item.channelId || ''}:${item.replyToChatMessageId}`)
      : undefined;
    const root = parent || item;
    const thread = ensureThread(root);
    if (item.id !== root.id && !thread.replies.some((reply) => reply.id === item.id)) {
      thread.replies.push(item);
    }
  }

  for (const thread of byRootId.values()) {
    const replyIds = new Set(thread.replies.map((reply) => reply.id));
    thread.evidence = (thread.root.probableReplies || []).filter((reply) => !replyIds.has(reply.id));
    thread.replies.sort((a, b) => messageTime(a) - messageTime(b));
  }

  return Array.from(byRootId.values()).sort((a, b) => messageTime(a.root) - messageTime(b.root));
}

function messageStatus(item: CommunityAgentItem, candidateIds: Set<string>): { label: string; tone: 'green' | 'yellow' | 'gray' | 'blue' } {
  if (candidateIds.has(item.id)) return { label: 'Candidate', tone: 'yellow' };
  if ((item.probableReplies || []).length > 0) return { label: 'Has replies', tone: 'green' };
  if (item.ignoredReason) return { label: 'Skipped', tone: 'gray' };
  return { label: 'Read', tone: 'blue' };
}

function threadState(thread: InboxThread, candidateIds: Set<string>): ThreadState {
  if ([thread.root, ...thread.replies].some((item) => candidateIds.has(item.id))) return 'attention';
  if (thread.replies.length + thread.evidence.length > 0 || (thread.root.probableReplies || []).length > 0) return 'answered';
  return 'skipped';
}

function channelName(item: Pick<CommunityAgentItem, 'channelId' | 'channelTitle'>): string {
  return item.channelTitle || (item.channelId ? `Channel ${item.channelId}` : 'Community');
}

function MessageNode({
  item,
  candidateIds,
  depth = 'root',
}: {
  item: CommunityAgentItem;
  candidateIds: Set<string>;
  depth?: 'root' | 'reply';
}) {
  const status = messageStatus(item, candidateIds);

  return (
    <div className={depth === 'root' ? 'rounded-md bg-background p-4' : 'rounded-md bg-muted/35 p-3'}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {depth === 'root' ? (
            <MessageCircle className="size-4 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <CornerDownRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="truncate text-sm font-semibold text-foreground">{item.username}</span>
          {depth === 'root' ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{formatMessageTime(item.createdAt)}</span>
      </div>
      <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words pr-2 text-sm leading-6 text-muted-foreground">
        {item.message}
      </p>
      {item.ignoredReason && depth === 'root' ? (
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Why was this skipped?</summary>
          <p className="mt-2 border-l-2 border-border pl-3 leading-5">{item.ignoredReason}</p>
        </details>
      ) : null}
    </div>
  );
}

function EvidenceReply({ reply }: { reply: CommunityAgentReplyEvidence }) {
  return (
    <div className="rounded-md bg-muted/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CornerDownRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-sm font-semibold text-foreground">{reply.username}</span>
          <Badge tone="green">Reply evidence</Badge>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{formatMessageTime(reply.createdAt)}</span>
      </div>
      <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-muted-foreground">{reply.message}</p>
    </div>
  );
}

function ThreadStateIcon({ state }: { state: ThreadState }) {
  if (state === 'attention') return <CircleAlert className="size-4 text-amber-600" aria-hidden="true" />;
  if (state === 'answered') return <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />;
  return <MinusCircle className="size-4 text-muted-foreground" aria-hidden="true" />;
}

function ThreadListItem({
  thread,
  selected,
  state,
  onSelect,
}: {
  thread: InboxThread;
  selected: boolean;
  state: ThreadState;
  onSelect: () => void;
}) {
  const replyCount = thread.replies.length + thread.evidence.length;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full border-b px-4 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
        selected ? 'bg-primary/8' : 'bg-background'
      }`}
      aria-current={selected ? 'true' : undefined}
    >
      <div className="flex items-center gap-2">
        <ThreadStateIcon state={state} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{thread.root.username}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatAppTimeWithSeconds(thread.root.createdAt)}</span>
      </div>
      <p className="mt-1.5 line-clamp-2 break-words text-sm leading-5 text-muted-foreground">{thread.root.message}</p>
      {replyCount > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</p>
      ) : null}
    </button>
  );
}

function ThreadDetail({
  thread,
  candidateIds,
  decision,
}: {
  thread: InboxThread;
  candidateIds: Set<string>;
  decision?: CommunityAgentDecision;
}) {
  const replies = thread.replies;
  const totalReplies = replies.length + thread.evidence.length;
  const state = threadState(thread, candidateIds);

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="border-b px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ThreadStateIcon state={state} />
              <h3 className="truncate text-base font-semibold text-foreground">{channelName(thread.root)}</h3>
              {thread.root.channelId ? <span className="text-xs text-muted-foreground">#{thread.root.channelId}</span> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Conversation started by {thread.root.username}</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>{formatMessageTime(thread.root.createdAt)}</p>
            <p className="mt-1">{totalReplies} {totalReplies === 1 ? 'reply' : 'replies'}</p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <MessageNode item={thread.root} candidateIds={candidateIds} />
        {totalReplies > 0 && (
          <div className="ml-4 mt-3 space-y-3 border-l-2 border-border pl-4">
            {replies.map((reply) => (
              <MessageNode key={reply.id} item={reply} candidateIds={candidateIds} depth="reply" />
            ))}
            {thread.evidence.map((reply) => (
              <EvidenceReply key={reply.id} reply={reply} />
            ))}
          </div>
        )}
        {decision ? (
          <div className="mt-5 border-t pt-5">
            <div className="mb-3 flex items-center gap-2">
              <Bot className="size-4 text-primary" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Gemini recommendation</p>
            </div>
            <DecisionCard decision={decision} embedded />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DecisionCard({ decision, embedded = false }: { decision: CommunityAgentDecision; embedded?: boolean }) {
  const tone = decision.error
    ? 'red'
    : decision.action === 'reply'
      ? 'green'
      : decision.action === 'react'
        ? 'blue'
        : decision.action === 'human'
          ? 'yellow'
          : 'gray';

  return (
    <div className={embedded ? 'space-y-3' : 'sg-panel space-y-3 p-5'}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone="blue">Community</Badge>
            <Badge tone={tone}>{decision.error ? 'Error' : decision.action}</Badge>
            {decision.posted && <Badge tone="green">Posted</Badge>}
            {decision.reacted && <Badge tone="green">Reacted</Badge>}
          </div>
          <p className="mt-2 font-semibold text-foreground">{decision.username}</p>
        </div>
        <span className="text-xs text-muted-foreground">{Math.round(decision.confidence * 100)}%</span>
      </div>

      <p className="text-sm text-muted-foreground">{decision.message}</p>

      {decision.reply && (
        <div className="sg-panel-muted p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Agent reply</p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{decision.reply}</p>
        </div>
      )}

      {decision.action === 'react' && (
        <div className="sg-panel-muted p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Reaction</p>
          <p className="text-sm text-foreground">{decision.reaction || '+1'}</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{decision.error || decision.reason}</p>
    </div>
  );
}

export default function CommunityAgent() {
  const { currentProject } = usePlatform();
  const [overview, setOverview] = useState<CommunityAgentOverview | null>(null);
  const [result, setResult] = useState<CommunityAgentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ThreadFilter>('attention');
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [lastScanSeconds, setLastScanSeconds] = useState<number | null>(null);
  const [skipProcessed, setSkipProcessed] = useState(true);
  const [post, setPost] = useState(false);
  const [react, setReact] = useState(false);

  const load = useCallback(() => {
    const startedAt = Date.now();
    setLoading(true);
    setError('');
    api.getCommunityAgentOverview({ includeCommunity: true, messageCount: 50 })
      .then((next) => {
        setOverview(next);
        setLastUpdatedAt(new Date());
        setLastScanSeconds(Math.max(0.1, Math.round((Date.now() - startedAt) / 100) / 10));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const candidateIds = useMemo(
    () => new Set((overview?.candidates || []).map((item) => item.id)),
    [overview],
  );
  const inboxThreads = useMemo(() => buildInboxThreads(overview?.items || []), [overview]);
  const decisionsByItem = useMemo(
    () => new Map((result?.decisions || []).map((decision) => [decision.itemId, decision])),
    [result],
  );
  const threadCounts = useMemo(() => {
    const counts: Record<ThreadFilter, number> = { attention: 0, answered: 0, skipped: 0, all: inboxThreads.length };
    for (const thread of inboxThreads) counts[threadState(thread, candidateIds)] += 1;
    return counts;
  }, [candidateIds, inboxThreads]);
  const counts = useMemo(() => {
    const items = overview?.items || [];
    return {
      community: items.filter((item) => item.source === 'community').length,
      activeChannels: new Set(items.map((item) => item.channelId).filter(Boolean)).size,
    };
  }, [overview]);
  const configuredChannelCount = useMemo(() => {
    const channelIds = currentProject?.settings?.managedChannelIds;
    if (Array.isArray(channelIds) && channelIds.length > 0) return channelIds.length;
    return currentProject?.channelId ? 1 : 0;
  }, [currentProject]);
  const channelOptions = useMemo(() => {
    const channels = new Map<string, string>();
    for (const thread of inboxThreads) {
      if (thread.root.channelId) channels.set(thread.root.channelId, channelName(thread.root));
    }
    return Array.from(channels, ([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [inboxThreads]);
  const filteredThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inboxThreads
      .filter((thread) => filter === 'all' || threadState(thread, candidateIds) === filter)
      .filter((thread) => channelFilter === 'all' || thread.root.channelId === channelFilter)
      .filter((thread) => {
        if (!query) return true;
        return [thread.root, ...thread.replies].some((item) => (
          `${item.username} ${item.message} ${item.channelTitle || ''} ${item.channelId || ''}`.toLowerCase().includes(query)
        ));
      })
      .sort((a, b) => messageTime(b.root) - messageTime(a.root));
  }, [candidateIds, channelFilter, filter, inboxThreads, search]);
  const channelGroups = useMemo<ChannelThreadGroup[]>(() => {
    const groups = new Map<string, ChannelThreadGroup>();
    for (const thread of filteredThreads) {
      const id = thread.root.channelId || 'community';
      const existing = groups.get(id) || {
        id,
        title: channelName(thread.root),
        threads: [],
        attentionCount: 0,
        latestActivity: 0,
      };
      existing.threads.push(thread);
      existing.latestActivity = Math.max(existing.latestActivity, messageTime(thread.root));
      if (threadState(thread, candidateIds) === 'attention') existing.attentionCount += 1;
      groups.set(id, existing);
    }
    return Array.from(groups.values()).sort((a, b) => b.latestActivity - a.latestActivity);
  }, [candidateIds, filteredThreads]);
  const selectedThread = filteredThreads.find((thread) => thread.id === selectedThreadId) || filteredThreads[0] || null;

  useEffect(() => {
    if (selectedThread?.id !== selectedThreadId) setSelectedThreadId(selectedThread?.id || '');
  }, [selectedThread, selectedThreadId]);

  const run = async () => {
    const startedAt = Date.now();
    setRunning(true);
    setError('');
    try {
      const next = await api.runCommunityAgent({
        post,
        react,
        includeCommunity: true,
        skipProcessed,
        markProcessed: post || react,
        maxAnswers: 4,
        messageCount: 50,
      });
      setResult(next);
      await api.getCommunityAgentOverview({ includeCommunity: true, messageCount: 50 }).then((updated) => {
        setOverview(updated);
        setLastUpdatedAt(new Date());
        setLastScanSeconds(Math.max(0.1, Math.round((Date.now() - startedAt) / 100) / 10));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const selectedDecision = selectedThread
    ? decisionsByItem.get(selectedThread.root.id)
      || selectedThread.replies.map((reply) => decisionsByItem.get(reply.id)).find(Boolean)
    : undefined;

  return (
    <div className="space-y-4 px-4 pb-6 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Community Agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review conversations across every active Community channel.</p>
        </div>
        <Button
          variant="outline"
          onClick={load}
          disabled={loading || running}
          size="sm"
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y py-3 text-sm">
        <Badge tone={overview?.guidelines.available ? 'green' : 'yellow'}>
          {overview?.guidelines.channelGuidelines
            ? `${overview.guidelines.channelGuidelines} channel guidelines ready`
            : overview?.guidelines.available ? 'Global guidelines ready' : 'Guidelines missing'}
        </Badge>
        <span><strong className="font-semibold text-foreground">{counts.activeChannels}</strong> <span className="text-muted-foreground">of {configuredChannelCount || counts.activeChannels} channels active</span></span>
        <span><strong className="font-semibold text-foreground">{counts.community}</strong> <span className="text-muted-foreground">messages today</span></span>
        <span><strong className="font-semibold text-foreground">{threadCounts.attention}</strong> <span className="text-muted-foreground">need attention</span></span>
        {lastUpdatedAt ? (
          <span className="ml-auto text-xs text-muted-foreground">
            Updated {formatAppTimeWithSeconds(lastUpdatedAt.toISOString())} {APP_TIME_ZONE_LABEL}
            {lastScanSeconds !== null ? ` in ${lastScanSeconds}s` : ''}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-md border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-foreground">Run options</summary>
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={skipProcessed} onCheckedChange={(checked) => setSkipProcessed(checked === true)} />
              Skip processed
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={post} onCheckedChange={(checked) => setPost(checked === true)} />
              Post safe replies
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={react} onCheckedChange={(checked) => setReact(checked === true)} />
              React to useful messages
            </label>
          </div>
        </details>
        <Button
          onClick={run}
          disabled={running || loading}
          size="sm"
        >
          <Bot />
          {running ? 'Running Gemini...' : 'Run Gemini'}
        </Button>
      </div>

      {error && <div className="sg-status-danger rounded-lg border p-4 text-sm">{error}</div>}

      {result ? (
        <p className="rounded-md border bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground">
          Last run: {result.handled} handled, {result.posted} posted, {result.reacted} reacted, {result.needsHuman} sent to review.
        </p>
      ) : null}

      {overview?.errors.length ? (
        <details className="sg-status-warning rounded-md border px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {overview.errors.length} {overview.errors.length === 1 ? 'scan issue' : 'scan issues'}
          </summary>
          <div className="mt-2 space-y-1 text-xs">
            {overview.errors.map((item) => <p key={item}>{item}</p>)}
          </div>
        </details>
      ) : null}

      <section className="overflow-hidden rounded-md border bg-background">
        <div className="border-b px-4 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2">
              <Inbox className="size-5 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-base font-semibold text-foreground">Today Inbox</h2>
                <p className="text-xs text-muted-foreground">{inboxThreads.length} conversations in the current {APP_TIME_ZONE_LABEL} day</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search conversations"
                  className="pl-9"
                />
              </div>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-full sm:w-56" aria-label="Filter by channel">
                  <SelectValue placeholder="All channels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  {channelOptions.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>{channel.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex max-w-full gap-1 overflow-x-auto" role="tablist" aria-label="Inbox status">
            {THREAD_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === item.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {item.label} <span className="ml-1 opacity-70">{threadCounts[item.value]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-h-[620px] lg:h-[calc(100vh-22rem)] lg:min-h-[560px] lg:grid-cols-[minmax(300px,38%)_minmax(0,1fr)]">
          <div className="min-h-0 border-b lg:border-b-0 lg:border-r">
            <div className="border-b bg-muted/20 px-4 py-2 text-xs font-medium text-muted-foreground">
              {loading
                ? 'Scanning channels...'
                : `${filteredThreads.length} ${filteredThreads.length === 1 ? 'conversation' : 'conversations'} across ${channelGroups.length} ${channelGroups.length === 1 ? 'channel' : 'channels'}`}
            </div>
            <div className="max-h-[420px] overflow-y-auto lg:max-h-none lg:h-[calc(100%-33px)]">
              {loading ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-md bg-muted" />)}
                </div>
              ) : filteredThreads.length > 0 ? (
                channelGroups.map((group) => (
                  <section key={group.id} aria-labelledby={`channel-${group.id}`}>
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-y bg-muted/90 px-4 py-2.5 backdrop-blur-sm first:border-t-0">
                      <Hash className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <h3 id={`channel-${group.id}`} className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                        {group.title}
                      </h3>
                      {group.id !== 'community' ? <span className="font-mono text-[11px] text-muted-foreground">{group.id}</span> : null}
                      {group.attentionCount > 0 ? (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          {group.attentionCount} pending
                        </span>
                      ) : null}
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {group.threads.length} {group.threads.length === 1 ? 'thread' : 'threads'}
                      </span>
                    </div>
                    {group.threads.map((thread) => (
                      <ThreadListItem
                        key={thread.id}
                        thread={thread}
                        state={threadState(thread, candidateIds)}
                        selected={selectedThread?.id === thread.id}
                        onSelect={() => setSelectedThreadId(thread.id)}
                      />
                    ))}
                  </section>
                ))
              ) : (
                <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
                  <CheckCircle2 className="size-8 text-emerald-600" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-foreground">Nothing here</p>
                  <p className="mt-1 max-w-64 text-xs leading-5 text-muted-foreground">
                    {filter === 'attention' ? 'No conversations currently need attention.' : 'No conversations match these filters.'}
                  </p>
                  {filter !== 'all' ? <Button className="mt-3" size="sm" variant="outline" onClick={() => setFilter('all')}>View all</Button> : null}
                </div>
              )}
            </div>
          </div>

          {selectedThread ? (
            <ThreadDetail thread={selectedThread} candidateIds={candidateIds} decision={selectedDecision} />
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <MessageCircle className="size-8" aria-hidden="true" />
              <p className="mt-3 text-sm">Select a conversation to view its thread.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
