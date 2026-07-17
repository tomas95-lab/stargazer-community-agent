import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconArchive,
  IconArrowRight,
  IconCircleCheck,
  IconInbox,
  IconMessageCircle,
  IconRefresh,
  IconRotateClockwise,
} from '@tabler/icons-react';
import { api, type ReviewQueueItem, type ReviewQueueResult } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function formatUtcDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function priorityClass(priority: ReviewQueueItem['priority']): string {
  if (priority === 'high') return 'sg-status-danger';
  if (priority === 'medium') return 'sg-status-warning';
  return 'border-border bg-secondary text-secondary-foreground';
}

function statusClass(status: ReviewQueueItem['status']): string {
  if (status === 'open') return 'sg-status-warning';
  if (status === 'resolved') return 'sg-status-success';
  return 'border-border bg-secondary text-secondary-foreground';
}

function sourceIcon(source: ReviewQueueItem['source']) {
  return source === 'dm' ? IconInbox : IconMessageCircle;
}

function composerLink(item: ReviewQueueItem): string {
  const params = new URLSearchParams({
    channel: item.source === 'dm' ? 'dm' : 'community',
    audience: item.username,
    prompt: `Draft a safe English reply for this ${item.source} message. Original message:\n\n${item.message}\n\nReason for human review:\n${item.reason}`,
  });
  return `/composer?${params.toString()}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sg-panel p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function QueueItem({
  item,
  updating,
  onStatus,
}: {
  item: ReviewQueueItem;
  updating: boolean;
  onStatus: (item: ReviewQueueItem, status: ReviewQueueItem['status']) => void;
}) {
  const Icon = sourceIcon(item.source);
  return (
    <div className={`border-b border-border p-5 last:border-0 ${item.status !== 'open' ? 'bg-muted/20' : ''}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="size-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">{item.username}</p>
            <Badge variant="outline">{item.source}</Badge>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(item.status)}`}>
              {item.status}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${priorityClass(item.priority)}`}>
              {item.priority}
            </span>
            {typeof item.confidence === 'number' && (
              <Badge variant="secondary">{Math.round(item.confidence * 100)}% confidence</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Run {formatUtcDate(item.runAt)} UTC
            {item.channelId ? ` · Channel ${item.channelId}` : ''}
            {item.messageId ? ` · Message ${item.messageId}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.status === 'open' ? (
            <>
              <Button onClick={() => onStatus(item, 'resolved')} disabled={updating} variant="outline" size="sm">
                <IconCircleCheck />
                Resolve
              </Button>
              <Button onClick={() => onStatus(item, 'dismissed')} disabled={updating} variant="outline" size="sm">
                <IconArchive />
                Dismiss
              </Button>
            </>
          ) : (
            <Button onClick={() => onStatus(item, 'open')} disabled={updating} variant="outline" size="sm">
              <IconRotateClockwise />
              Reopen
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to={`/runs`}>
              Run Details
              <IconArrowRight />
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to={composerLink(item)}>
              Draft Reply
              <IconArrowRight />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-md border border-border bg-background p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Message</p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{item.message}</p>
        </div>
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Reason</p>
          <p className="text-sm leading-6 text-foreground">{item.reason}</p>
        </div>
      </div>
    </div>
  );
}

export default function ReviewQueue() {
  const [result, setResult] = useState<ReviewQueueResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await api.getReviewQueue(150, { includeResolved: showClosed }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [showClosed]);

  const updateStatus = async (item: ReviewQueueItem, status: ReviewQueueItem['status']) => {
    setUpdatingId(item.id);
    setError('');
    try {
      await api.updateReviewQueueStatus(item.id, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingId('');
    }
  };

  const grouped = useMemo(() => {
    const items = result?.items || [];
    return {
      high: items.filter((item) => item.priority === 'high'),
      other: items.filter((item) => item.priority !== 'high'),
    };
  }, [result]);

  return (
    <div className="space-y-6 px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <IconAlertTriangle className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold text-foreground">Human Review Queue</h1>
          </div>
          {result && <p className="mt-2 text-sm text-muted-foreground">Updated {formatUtcDate(result.generatedAt)} UTC</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowClosed((value) => !value)} variant={showClosed ? 'secondary' : 'outline'}>
            {showClosed ? 'Hide closed' : 'Show closed'}
          </Button>
          <Button onClick={load} disabled={loading} variant="outline">
            <IconRefresh />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        <Stat label="Open" value={result?.totals.open ?? '-'} />
        <Stat label="High" value={result?.totals.high ?? '-'} />
        <Stat label="Community" value={result?.totals.community ?? '-'} />
        <Stat label="DM" value={result?.totals.dm ?? '-'} />
        <Stat label="Resolved" value={result?.totals.resolved ?? '-'} />
        <Stat label="Dismissed" value={result?.totals.dismissed ?? '-'} />
      </div>

      {error && <div className="sg-status-danger rounded-lg border p-4 text-sm">{error}</div>}

      <section className="sg-panel overflow-hidden p-0">
        {loading && !result ? (
          <p className="p-5 text-sm text-muted-foreground">Loading review queue...</p>
        ) : result?.items.length ? (
          <>
            {grouped.high.length > 0 && (
              <div className="border-b border-border bg-danger/5 px-5 py-3">
                <p className="text-xs font-semibold uppercase text-danger">High priority</p>
              </div>
            )}
            {grouped.high.map((item) => (
              <QueueItem key={item.id} item={item} updating={updatingId === item.id} onStatus={updateStatus} />
            ))}
            {grouped.other.length > 0 && grouped.high.length > 0 && (
              <div className="border-y border-border bg-muted/40 px-5 py-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Other items</p>
              </div>
            )}
            {grouped.other.map((item) => (
              <QueueItem key={item.id} item={item} updating={updatingId === item.id} onStatus={updateStatus} />
            ))}
          </>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">
            {showClosed ? 'No review items found in recent runs.' : 'No open human review items found in recent runs.'}
          </p>
        )}
      </section>
    </div>
  );
}
