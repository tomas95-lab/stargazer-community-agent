import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type CommunityAgentDecision,
  type CommunityAgentItem,
  type CommunityAgentOverview,
  type CommunityAgentResult,
} from '../api';

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="sg-panel p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

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

function ItemRow({ item }: { item: CommunityAgentItem }) {
  const replies = item.probableReplies || [];

  return (
    <div className="border-b border-border py-3 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Badge tone="blue">Community</Badge>
          {replies.length > 0 && <Badge tone="green">Answered</Badge>}
          <span className="truncate text-sm font-semibold text-foreground">{item.username}</span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleTimeString()}</span>
      </div>
      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{item.message}</p>
      {replies.length > 0 && (
        <div className="mt-3 space-y-2 border-l-2 border-primary/25 pl-3">
          {replies.map((reply) => (
            <div key={reply.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-foreground">{reply.username}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{new Date(reply.createdAt).toLocaleTimeString()}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{reply.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DecisionCard({ decision }: { decision: CommunityAgentDecision }) {
  const tone = decision.error
    ? 'red'
    : decision.action === 'reply'
      ? 'green'
      : decision.action === 'human'
        ? 'yellow'
        : 'gray';

  return (
    <div className="sg-panel space-y-3 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone="blue">Community</Badge>
            <Badge tone={tone}>{decision.error ? 'Error' : decision.action}</Badge>
            {decision.posted && <Badge tone="green">Posted</Badge>}
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
  const [includeCommunity, setIncludeCommunity] = useState(true);
  const [skipProcessed, setSkipProcessed] = useState(true);
  const [post, setPost] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    api.getCommunityAgentOverview({ includeCommunity, messageCount: 50 })
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    const items = overview?.items || [];
    return {
      community: items.filter((item) => item.source === 'community').length,
      answered: items.filter((item) => (item.probableReplies || []).length > 0).length,
    };
  }, [overview]);

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const next = await api.runCommunityAgent({
        post,
        includeCommunity,
        skipProcessed,
        markProcessed: post,
        maxAnswers: 4,
        messageCount: 50,
      });
      setResult(next);
      await api.getCommunityAgentOverview({ includeCommunity, messageCount: 50 }).then(setOverview);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Community Agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">{overview?.window.operatingHours || 'Agent checks 10:00-19:00 America/Argentina/Buenos_Aires; War Room opens weekdays after 11:15 AM ARG'}</p>
        </div>
        <button
          onClick={load}
          disabled={loading || running}
          className="rounded-md border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Date" value={overview?.window.argentinaDate || '-'} sub="ARG" />
        <Stat label="Guideline" value={overview?.guidelines.available ? 'Ready' : 'Missing'} sub={overview ? `${overview.guidelines.characters} chars` : ''} />
        <Stat label="Community" value={counts.community} sub={`${counts.answered} answered`} />
        <Stat label="Candidates" value={overview?.candidates.length || 0} sub="pending check" />
      </div>

      <div className="sg-panel space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={includeCommunity} onChange={(e) => setIncludeCommunity(e.target.checked)} className="accent-primary" />
            Community
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={skipProcessed} onChange={(e) => setSkipProcessed(e.target.checked)} className="accent-primary" />
            Skip processed
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={post} onChange={(e) => setPost(e.target.checked)} className="accent-primary" />
            Post safe replies
          </label>
        </div>

        <button
          onClick={run}
          disabled={running || loading || !includeCommunity}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {running ? 'Running Claude...' : 'Run Claude'}
        </button>
      </div>

      {error && <div className="sg-status-danger rounded-lg border p-4 text-sm">{error}</div>}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Claude Decisions</h2>
            <p className="text-xs text-muted-foreground">
              {result.handled} handled · {result.posted} posted · {result.needsHuman} human
            </p>
          </div>
          {result.decisions.length === 0 ? (
            <div className="sg-panel p-5 text-sm text-muted-foreground">No pending candidates for Claude.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {result.decisions.map((decision) => (
                <DecisionCard key={decision.itemId} decision={decision} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Today Inbox</h2>
        <div className="sg-panel p-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : overview && overview.items.length > 0 ? (
            overview.items.map((item) => <ItemRow key={item.id} item={item} />)
          ) : (
            <p className="text-sm text-muted-foreground">No messages found for today.</p>
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
