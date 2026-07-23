import { CornerDownRight as IconCornerDownRight, MessageCircle as IconMessageCircle, MessagesSquare as IconMessages } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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

function messageTime(item: Pick<CommunityAgentItem, 'createdAt'>): number {
  const time = new Date(item.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatMessageTime(value: string): string {
  return `${formatAppTimeWithSeconds(value)} ${APP_TIME_ZONE_LABEL}`;
}

function buildInboxThreads(items: CommunityAgentItem[]): InboxThread[] {
  const sorted = [...items].sort((a, b) => messageTime(a) - messageTime(b));
  const byChatId = new Map<number, CommunityAgentItem>();
  const byRootId = new Map<string, InboxThread>();

  sorted.forEach((item) => {
    if (item.chatMessageId !== undefined) byChatId.set(item.chatMessageId, item);
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
    const parent = item.replyToChatMessageId !== undefined ? byChatId.get(item.replyToChatMessageId) : undefined;
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
            <IconMessageCircle className="size-4 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <IconCornerDownRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="truncate text-sm font-semibold text-foreground">{item.username}</span>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{formatMessageTime(item.createdAt)}</span>
      </div>
      <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words pr-2 text-sm leading-6 text-muted-foreground">
        {item.message}
      </p>
      {item.ignoredReason && (
        <p className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {item.ignoredReason}
        </p>
      )}
    </div>
  );
}

function EvidenceReply({ reply }: { reply: CommunityAgentReplyEvidence }) {
  return (
    <div className="rounded-md bg-muted/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconCornerDownRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-sm font-semibold text-foreground">{reply.username}</span>
          <Badge tone="green">Reply evidence</Badge>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{formatMessageTime(reply.createdAt)}</span>
      </div>
      <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-muted-foreground">{reply.message}</p>
    </div>
  );
}

function InboxThreadCard({
  thread,
  index,
  candidateIds,
  decision,
}: {
  thread: InboxThread;
  index: number;
  candidateIds: Set<string>;
  decision?: CommunityAgentDecision;
}) {
  const replies = thread.replies;
  const totalReplies = replies.length + thread.evidence.length;

  return (
    <section className="sg-panel overflow-hidden border-t-4 border-t-primary">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/35 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconMessages className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <h3 className="truncate text-sm font-semibold text-foreground">Thread {index + 1}</h3>
          <Badge tone="blue">Community</Badge>
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {totalReplies} {totalReplies === 1 ? 'reply' : 'replies'}
        </span>
      </div>
      <div className="p-4">
        <MessageNode item={thread.root} candidateIds={candidateIds} />
        {totalReplies > 0 && (
          <div className="ml-3 mt-4 space-y-3 border-l-2 border-primary/25 pl-4">
            {replies.map((reply) => (
              <MessageNode key={reply.id} item={reply} candidateIds={candidateIds} depth="reply" />
            ))}
            {thread.evidence.map((reply) => (
              <EvidenceReply key={reply.id} reply={reply} />
            ))}
          </div>
        )}
      </div>
      {decision ? (
        <div className="border-t bg-muted/20 p-4">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Gemini decision</p>
          <DecisionCard decision={decision} embedded />
        </div>
      ) : null}
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
  const [overview, setOverview] = useState<CommunityAgentOverview | null>(null);
  const [result, setResult] = useState<CommunityAgentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [skipProcessed, setSkipProcessed] = useState(true);
  const [post, setPost] = useState(false);
  const [react, setReact] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    api.getCommunityAgentOverview({ includeCommunity: true, messageCount: 50 })
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const candidateIds = useMemo(
    () => new Set((overview?.candidates || []).map((item) => item.id)),
    [overview],
  );
  const inboxThreads = useMemo(() => buildInboxThreads(overview?.items || []), [overview]);
  const decisionsByItem = useMemo(
    () => new Map((result?.decisions || []).map((decision) => [decision.itemId, decision])),
    [result],
  );
  const counts = useMemo(() => {
    const items = overview?.items || [];
    return {
      community: items.filter((item) => item.source === 'community').length,
      withReplies: inboxThreads.filter((thread) => thread.replies.length + thread.evidence.length > 0).length,
    };
  }, [overview, inboxThreads]);

  const run = async () => {
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
      await api.getCommunityAgentOverview({ includeCommunity: true, messageCount: 50 }).then(setOverview);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5 px-4 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Community Agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">{overview?.window.operatingHours || `Agent scans the current ${APP_TIME_ZONE_LABEL} day.`}</p>
        </div>
        <Button
          variant="outline"
          onClick={load}
          disabled={loading || running}
        >
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={overview?.guidelines.available ? 'green' : 'yellow'}>
          {overview?.guidelines.available ? 'Guidelines ready' : 'Guidelines missing'}
        </Badge>
        <span className="text-muted-foreground">{counts.community} messages</span>
        <span className="text-muted-foreground">{counts.withReplies} threads with replies</span>
        <span className="text-muted-foreground">{overview?.candidates.length || 0} pending</span>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
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
        >
          {running ? 'Running Gemini...' : 'Run Gemini'}
        </Button>
      </div>

      {error && <div className="sg-status-danger rounded-lg border p-4 text-sm">{error}</div>}

      {result ? (
        <p className="text-sm text-muted-foreground">
          Last run: {result.handled} handled, {result.posted} posted, {result.reacted} reacted, {result.needsHuman} sent to review.
        </p>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Today Inbox</h2>
          {overview && (
            <p className="text-xs text-muted-foreground">
              {inboxThreads.length} {inboxThreads.length === 1 ? 'thread' : 'threads'}
            </p>
          )}
        </div>
        <div className="space-y-4">
          {loading ? (
            <div className="sg-panel p-5 text-sm text-muted-foreground">Loading...</div>
          ) : inboxThreads.length > 0 ? (
            inboxThreads.map((thread, index) => (
              <InboxThreadCard
                key={thread.id}
                thread={thread}
                index={index}
                candidateIds={candidateIds}
                decision={
                  decisionsByItem.get(thread.root.id)
                  || thread.replies.map((reply) => decisionsByItem.get(reply.id)).find(Boolean)
                }
              />
            ))
          ) : (
            <div className="sg-panel p-5 text-sm text-muted-foreground">No messages found for today.</div>
          )}
        </div>
      </div>

      {overview?.errors.length ? (
        <div className="sg-status-warning space-y-1 rounded-lg border p-4">
          {overview.errors.map((item) => (
            <p key={item} className="text-xs">{item}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
