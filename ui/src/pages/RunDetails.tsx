import { useEffect, useMemo, useState } from 'react';
import { Bot, Clock, Eye, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { api, type OperationDetailResult, type OperationLogEntry } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DetailRecord = Record<string, unknown>;
type DetailItem = Record<string, unknown>;

function asRecord(value: unknown): DetailRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as DetailRecord : {};
}

function asArray(value: unknown): DetailItem[] {
  return Array.isArray(value) ? value.filter((item): item is DetailItem => Boolean(item) && typeof item === 'object') : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function formatTime(value?: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusClass(status: OperationLogEntry['status'] | string): string {
  if (status === 'success') return 'sg-status-success';
  if (status === 'error') return 'sg-status-danger';
  if (status === 'skipped') return 'sg-status-warning';
  return 'border-border bg-secondary text-secondary-foreground';
}

function actionIcon(action: string) {
  if (action.includes('dm')) return Inbox;
  if (action.includes('agent')) return Bot;
  if (action.includes('cron')) return Clock;
  return Eye;
}

function operationTitle(action: string): string {
  return action.replace(/_/g, ' ');
}

function SummaryGrid({ metadata }: { metadata?: Record<string, unknown> }) {
  const entries = Object.entries(metadata || {})
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 8);

  if (entries.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{key.replace(/([A-Z])/g, ' $1')}</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{String(value)}</p>
        </div>
      ))}
    </div>
  );
}

function CommunityDetail({ detail }: { detail: DetailRecord }) {
  const result = asRecord(detail.result);
  const items = asArray(detail.items);
  const candidates = asArray(detail.candidates);
  const decisions = asArray(detail.decisions);
  const decisionByItem = new Map(decisions.map((decision) => [asString(decision.itemId), decision]));
  const candidateIds = new Set(candidates.map((item) => asString(item.id)));

  return (
    <div className="space-y-5">
      <SummaryGrid metadata={{
        checked: result.checked,
        candidates: result.candidates,
        handled: result.handled,
        posted: result.posted,
        needsHuman: result.needsHuman,
        ignored: result.ignored,
      }} />

      <section className="sg-panel overflow-hidden">
        <div className="sg-panel-header px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Messages Read</h3>
        </div>
        <div className="divide-y divide-border">
          {items.length ? items.map((item) => {
            const id = asString(item.id);
            const decision = decisionByItem.get(id);
            const probableReplies = asArray(item.probableReplies);
            const status = decision
              ? asString(decision.action)
              : probableReplies.length > 0
                ? 'answered'
                : candidateIds.has(id)
                  ? 'candidate'
                  : 'ignored';

            return (
              <div key={id || `${asString(item.username)}-${asString(item.createdAt)}`} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="secondary">{asString(item.source, 'community')}</Badge>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(status === 'ignored' ? 'skipped' : status === 'human' ? 'skipped' : 'success')}`}>
                      {status}
                    </span>
                    <span className="truncate text-sm font-semibold text-foreground">{asString(item.username, 'unknown')}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatTime(asString(item.createdAt))}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{asString(item.message)}</p>
                {decision && (
                  <div className="mt-3 rounded-md border border-border bg-surface p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Decision</p>
                    <p className="mt-1 text-sm text-foreground">{asString(decision.reason)}</p>
                    {asString(decision.reply) && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{asString(decision.reply)}</p>
                    )}
                  </div>
                )}
              </div>
            );
          }) : (
            <p className="p-4 text-sm text-muted-foreground">No messages were captured for this run.</p>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {decisions.map((decision, index) => (
          <div key={`${asString(decision.itemId)}-${index}`} className="sg-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(asString(decision.action) === 'reply' ? 'success' : asString(decision.action) === 'human' ? 'skipped' : 'skipped')}`}>
                  {asString(decision.action)}
                </span>
                {decision.posted === true && <Badge variant="secondary">posted</Badge>}
              </div>
              <span className="text-xs text-muted-foreground">{Math.round(asNumber(decision.confidence) * 100)}%</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">{asString(decision.username)}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{asString(decision.message)}</p>
            {asString(decision.reply) && (
              <div className="mt-3 rounded-md border border-border bg-surface p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Reply</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{asString(decision.reply)}</p>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{asString(decision.error) || asString(decision.reason)}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function DmDetail({ detail }: { detail: DetailRecord }) {
  const result = asRecord(detail.result);
  const messages = asArray(result.messages);
  const autoReply = asRecord(result.autoReply);
  const decisions = asArray(autoReply.decisions);
  const decisionsByChannel = new Map(decisions.map((decision) => [String(decision.channelId), decision]));
  const grouped = messages.reduce<Record<string, DetailItem[]>>((acc, message) => {
    const key = String(message.channelId || 'unknown');
    acc[key] = [...(acc[key] || []), message];
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <SummaryGrid metadata={{
        scannedChannels: result.scannedChannels,
        incomingMessages: result.incomingMessages,
        channelsWithTodayMessages: result.channelsWithTodayMessages,
        autoReplied: autoReply.replied,
        autoNeedsHuman: autoReply.needsHuman,
        errors: asArray(result.errors).length,
      }} />

      <div className="grid gap-4">
        {Object.entries(grouped).length ? Object.entries(grouped).map(([channelId, channelMessages]) => {
          const decision = decisionsByChannel.get(channelId);
          const first = channelMessages[0] || {};
          return (
            <section key={channelId} className="sg-panel overflow-hidden">
              <div className="sg-panel-header flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {asString(first.channelTitle) || `Channel ${channelId}`}
                  </h3>
                  <p className="text-xs text-muted-foreground">{channelMessages.length} messages</p>
                </div>
                {decision && (
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(decision.posted === true ? 'success' : asString(decision.action) === 'human' ? 'skipped' : 'skipped')}`}>
                    {asString(decision.action)}{decision.posted === true ? ' posted' : ''}
                  </span>
                )}
              </div>
              <div className="divide-y divide-border">
                {channelMessages.map((message) => (
                  <div key={String(message.messageId)} className={cn('p-4', message.incoming ? 'bg-background' : 'bg-surface')}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{asString(message.username)}</p>
                      <span className="text-xs text-muted-foreground">{formatTime(asString(message.createdAt))}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{asString(message.text)}</p>
                  </div>
                ))}
              </div>
              {decision && (
                <div className="border-t border-border p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Auto Reply Decision</p>
                  <p className="mt-1 text-sm text-foreground">{asString(decision.reason)}</p>
                  {decision.messageId !== undefined && <p className="mt-1 text-xs text-muted-foreground">Sent message ID: {String(decision.messageId)}</p>}
                </div>
              )}
            </section>
          );
        }) : (
          <div className="sg-panel p-5 text-sm text-muted-foreground">No DM messages were captured for this run.</div>
        )}
      </div>
    </div>
  );
}

function DmAutoReplyDetail({ detail }: { detail: DetailRecord }) {
  const result = asRecord(detail.result);
  const decisions = asArray(result.decisions || detail.decisions);

  return (
    <div className="space-y-5">
      <SummaryGrid metadata={{
        checked: result.checked,
        replied: result.replied,
        needsHuman: result.needsHuman,
        ignored: result.ignored,
        skippedProcessed: result.skippedProcessed,
      }} />

      <div className="grid gap-4 md:grid-cols-2">
        {decisions.length ? decisions.map((decision, index) => (
          <div key={`${String(decision.channelId)}-${String(decision.lastIncomingMessageId)}-${index}`} className="sg-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(decision.posted === true ? 'success' : asString(decision.action) === 'human' ? 'skipped' : 'skipped')}`}>
                  {asString(decision.action)}
                </span>
                {decision.posted === true && <Badge variant="secondary">posted</Badge>}
              </div>
              <span className="text-xs text-muted-foreground">{Math.round(asNumber(decision.confidence) * 100)}%</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">{asString(decision.username, `Channel ${String(decision.channelId)}`)}</p>
            <p className="mt-2 text-sm text-muted-foreground">{asString(decision.reason)}</p>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <p>Channel: {String(decision.channelId || '-')}</p>
              <p>Last incoming message: {String(decision.lastIncomingMessageId || '-')}</p>
              {decision.messageId !== undefined && <p>Sent message ID: {String(decision.messageId)}</p>}
              {asString(decision.error) && <p className="text-danger">{asString(decision.error)}</p>}
            </div>
          </div>
        )) : (
          <div className="sg-panel p-5 text-sm text-muted-foreground">No auto-reply decisions were captured for this run.</div>
        )}
      </div>
    </div>
  );
}

function GenericDetail({ detail }: { detail: unknown }) {
  return (
    <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-4 text-xs text-foreground">
      {JSON.stringify(detail, null, 2)}
    </pre>
  );
}

function DetailPanel({ selected }: { selected: OperationDetailResult | null }) {
  if (!selected) {
    return <div className="sg-panel p-6 text-sm text-muted-foreground">Select a run to inspect its detail.</div>;
  }

  const detail = asRecord(selected.detail);
  const type = asString(detail.type);

  return (
    <div className="space-y-4">
      <div className="sg-panel p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(selected.entry.status)}`}>
                {selected.entry.status}
              </span>
              <h2 className="text-lg font-semibold capitalize text-foreground">{operationTitle(selected.entry.action)}</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{selected.entry.message}</p>
          </div>
          <span className="text-xs text-muted-foreground">{formatTime(selected.entry.at)}</span>
        </div>
      </div>

      {!selected.hasDetail ? (
        <div className="sg-panel p-5">
          <p className="text-sm text-muted-foreground">This run does not have a saved detail payload. New Community Agent and DM Review runs will include full details.</p>
          <div className="mt-4">
            <SummaryGrid metadata={selected.entry.metadata} />
          </div>
        </div>
      ) : type === 'community_agent' ? (
        <CommunityDetail detail={detail} />
      ) : type === 'dm_review' ? (
        <DmDetail detail={detail} />
      ) : type === 'dm_auto_reply' ? (
        <DmAutoReplyDetail detail={detail} />
      ) : (
        <GenericDetail detail={selected.detail} />
      )}
    </div>
  );
}

export default function RunDetails() {
  const [entries, setEntries] = useState<OperationLogEntry[]>([]);
  const [selected, setSelected] = useState<OperationDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getOperations(100);
      setEntries(result.entries);
      if (!selected && result.entries[0]) {
        await openRun(result.entries[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const openRun = async (entry: OperationLogEntry) => {
    setDetailLoading(true);
    setError('');
    try {
      setSelected(await api.getOperationDetail(entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => ({
    total: entries.length,
    errors: entries.filter((entry) => entry.status === 'error').length,
    detailed: entries.filter((entry) => ['community_agent', 'dm_review', 'dm_auto_reply'].includes(entry.action)).length,
  }), [entries]);

  return (
    <div className="space-y-6 px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Run Details</h1>
          <p className="mt-1 text-sm text-muted-foreground">Inspect executions, decisions, messages read, and posting outcomes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{counts.total} runs</Badge>
          <Badge variant={counts.errors ? 'destructive' : 'secondary'}>{counts.errors} errors</Badge>
          <Badge variant="outline">{counts.detailed} agent runs</Badge>
          <Button onClick={() => void load()} disabled={loading} variant="outline" size="sm">
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Refresh
          </Button>
        </div>
      </div>

      {error && <div className="sg-status-danger rounded-lg border p-4 text-sm">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <aside className="sg-panel overflow-hidden">
          <div className="sg-panel-header px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Recent Runs</h2>
          </div>
          <div className="max-h-[760px] overflow-auto">
            {loading && entries.length === 0 ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading runs
              </div>
            ) : entries.length ? (
              entries.map((entry) => {
                const Icon = actionIcon(entry.action);
                const active = selected?.entry.id === entry.id;
                return (
                  <button
                    key={entry.id}
                    onClick={() => void openRun(entry)}
                    className={cn(
                      'flex w-full gap-3 border-b border-border p-4 text-left transition-colors last:border-0 hover:bg-surface',
                      active && 'bg-accent/70'
                    )}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold capitalize text-foreground">{operationTitle(entry.action)}</p>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(entry.status)}`}>
                          {entry.status}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.message}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{formatTime(entry.at)}</p>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="p-4 text-sm text-muted-foreground">No runs found.</p>
            )}
          </div>
        </aside>

        <main className="min-w-0">
          {detailLoading ? (
            <div className="sg-panel flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading run detail
            </div>
          ) : (
            <DetailPanel selected={selected} />
          )}
        </main>
      </div>
    </div>
  );
}
