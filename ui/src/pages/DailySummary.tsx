import { useEffect, useMemo, useState } from 'react';
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconInbox,
  IconMessageCircle,
  IconRefresh,
  IconReportAnalytics,
  IconRobot,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { api, type DailySummaryPerson, type DailySummaryResult } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { APP_TIME_ZONE_LABEL, formatAppDateTime, todayAppDate } from '@/lib/timezone';

function statusClass(value: string): string {
  if (value === 'healthy' || value === 'success') return 'sg-status-success';
  if (value === 'attention' || value === 'error') return 'sg-status-danger';
  return 'border-border bg-secondary text-secondary-foreground';
}

function sourceIcon(source: DailySummaryPerson['source']) {
  return source === 'dm' ? IconInbox : IconMessageCircle;
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="sg-panel p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function AttentionItem({ item }: { item: DailySummaryPerson }) {
  const Icon = sourceIcon(item.source);
  return (
    <div className="border-b border-border p-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-4 text-primary" />
        <p className="font-semibold text-foreground">{item.username}</p>
        <Badge variant="outline">{item.source}</Badge>
        {typeof item.confidence === 'number' && (
          <Badge variant="secondary">{Math.round(item.confidence * 100)}%</Badge>
        )}
      </div>
      {item.message && <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{item.message}</p>}
      <p className="mt-2 text-sm text-foreground">{item.reason}</p>
    </div>
  );
}

export default function DailySummary() {
  const [date, setDate] = useState(todayAppDate());
  const [summary, setSummary] = useState<DailySummaryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (nextDate = date) => {
    setLoading(true);
    setError('');
    try {
      setSummary(await api.getDailySummary(nextDate));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(date);
  }, []);

  const status = summary?.status || 'quiet';
  const totals = summary?.totals;
  const botActions = useMemo(() => {
    if (!totals) return 0;
    return totals.communityRepliesPosted + totals.communityReactions + totals.dmAutoReplies;
  }, [totals]);

  return (
    <div className="space-y-6 px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <IconReportAnalytics className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold text-foreground">Daily Summary</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {summary ? `Generated ${formatAppDateTime(summary.generatedAt)} ${APP_TIME_ZONE_LABEL}` : `${APP_TIME_ZONE_LABEL} day summary`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="sg-input h-9 w-[150px] px-3 text-sm"
          />
          <Button onClick={() => void load()} disabled={loading} variant="outline" size="sm">
            <IconRefresh className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>
      </div>

      {error && <div className="sg-status-danger rounded-lg border p-4 text-sm">{error}</div>}

      <section className="sg-panel p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(status)}`}>
                {status}
              </span>
              <Badge variant="outline">{summary?.utcDate || date} {APP_TIME_ZONE_LABEL}</Badge>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-foreground">
              {summary?.headline || 'Loading summary...'}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/review">
                <IconAlertTriangle />
                Review Queue
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/runs">
                <IconClock />
                Run Details
              </Link>
            </Button>
          </div>
        </div>

        {summary?.highlights.length ? (
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            {summary.highlights.map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground">
                <IconCheck className="size-4 text-primary" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Stat label="Runs" value={totals?.runs ?? '-'} />
        <Stat label="Daily Threads" value={totals?.dailyThreadsPublished ?? '-'} />
        <Stat label="Community" value={totals?.communityMessagesChecked ?? '-'} sub="checked" />
        <Stat label="Bot Actions" value={botActions || '-'} sub="posts, reactions, DMs" />
        <Stat label="Incoming DMs" value={totals?.dmIncomingMessages ?? '-'} />
        <Stat label="Needs Human" value={(totals?.communityNeedsHuman || 0) + (totals?.dmNeedsHuman || 0)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="sg-panel overflow-hidden p-0">
          <div className="sg-panel-header flex items-center justify-between gap-3 px-5 py-3">
            <div className="flex items-center gap-2">
              <IconAlertTriangle className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Needs Human Review</h2>
            </div>
            <Badge variant="secondary">{summary?.attentionItems.length || 0}</Badge>
          </div>
          {loading && !summary ? (
            <p className="p-5 text-sm text-muted-foreground">Loading summary...</p>
          ) : summary?.attentionItems.length ? (
            summary.attentionItems.map((item) => <AttentionItem key={`${item.source}-${item.username}-${item.reason}`} item={item} />)
          ) : (
            <p className="p-5 text-sm text-muted-foreground">No human review items found for this {APP_TIME_ZONE_LABEL} day.</p>
          )}
        </section>

        <section className="space-y-6">
          <div className="sg-panel overflow-hidden p-0">
            <div className="sg-panel-header flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex items-center gap-2">
                <IconRobot className="size-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Bot Activity</h2>
              </div>
            </div>
            <div className="divide-y divide-border">
              {summary?.recentActivity.length ? summary.recentActivity.map((entry) => (
                <div key={entry.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold capitalize text-foreground">{entry.action.replace(/_/g, ' ')}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(entry.status)}`}>
                      {entry.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{formatAppDateTime(entry.at)} {APP_TIME_ZONE_LABEL}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{entry.message}</p>
                </div>
              )) : (
                <p className="p-5 text-sm text-muted-foreground">No activity recorded for this {APP_TIME_ZONE_LABEL} day.</p>
              )}
            </div>
          </div>

          <div className="sg-panel overflow-hidden p-0">
            <div className="sg-panel-header flex items-center justify-between gap-3 px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">Errors</h2>
              <Badge variant={summary?.errors.length ? 'destructive' : 'secondary'}>{summary?.errors.length || 0}</Badge>
            </div>
            <div className="divide-y divide-border">
              {summary?.errors.length ? summary.errors.map((item) => (
                <div key={item.id} className="p-4">
                  <p className="text-sm font-semibold capitalize text-foreground">{item.action.replace(/_/g, ' ')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatAppDateTime(item.at)} {APP_TIME_ZONE_LABEL}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{item.message}</p>
                </div>
              )) : (
                <p className="p-5 text-sm text-muted-foreground">No errors recorded for this {APP_TIME_ZONE_LABEL} day.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
