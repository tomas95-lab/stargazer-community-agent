import { useEffect, useMemo, useState } from 'react';
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconInbox,
  IconRefresh,
  IconUser,
} from '@tabler/icons-react';
import { api, type DmAgentDecision, type DmAgentResult, type DmReviewMessage, type DmReviewResult } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function DecisionTone(decision: DmAgentDecision): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (decision.error) return 'destructive';
  if (decision.action === 'reply') return 'default';
  if (decision.action === 'human') return 'secondary';
  return 'outline';
}

function DmDecisionCard({ decision }: { decision: DmAgentDecision }) {
  return (
    <div className="sg-panel space-y-3 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={DecisionTone(decision)}>{decision.error ? 'Error' : decision.action}</Badge>
            {decision.posted && <Badge className="border-transparent bg-success text-success-foreground">Posted</Badge>}
          </div>
          <p className="mt-2 font-semibold text-foreground">{decision.peer.name || decision.username}</p>
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

function formatArgTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatArgDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof IconInbox;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="sg-panel flex min-h-28 flex-col justify-between p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function senderLabel(message: DmReviewMessage): string {
  return message.name ? `${message.name} · ${message.username}` : message.username;
}

function peerLabel(message: DmReviewMessage): string {
  const peers = message.peers.filter((peer) => peer.username !== message.username);
  const visiblePeers = peers.length > 0 ? peers : message.peers;
  return visiblePeers.map((peer) => peer.name || peer.username).join(', ') || message.channelTitle || 'Direct message';
}

function DmRow({ message }: { message: DmReviewMessage }) {
  return (
    <div className="grid gap-3 border-b border-border py-4 last:border-0 md:grid-cols-[minmax(180px,240px)_1fr_auto] md:items-start">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <IconUser className="size-4 shrink-0 text-muted-foreground" />
          <p className="truncate text-sm font-semibold text-foreground">{senderLabel(message)}</p>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{peerLabel(message)}</p>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{message.text}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground md:justify-end">
        <IconClock className="size-3.5" />
        <span>{formatArgTime(message.createdAt)} ARG</span>
      </div>
    </div>
  );
}

export default function DirectMessages() {
  const [result, setResult] = useState<DmReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [reportSaved, setReportSaved] = useState(false);

  const [agentResult, setAgentResult] = useState<DmAgentResult | null>(null);
  const [agentCandidateCount, setAgentCandidateCount] = useState<number | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentError, setAgentError] = useState('');
  const [post, setPost] = useState(false);
  const [skipProcessed, setSkipProcessed] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    setReportSaved(false);
    try {
      setResult(await api.getDmReview({ messageCount: 50, maxChannels: 100 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadAgentOverview = async () => {
    try {
      const overview = await api.getDmAgentOverview({ messageCount: 50, maxChannels: 100 });
      setAgentCandidateCount(overview.candidates.length);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void load();
    void loadAgentOverview();
  }, []);

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      setResult(await api.runDmReview({ messageCount: 50, maxChannels: 100, requestDelayMs: 1500 }));
      setReportSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const runAgent = async () => {
    setAgentRunning(true);
    setAgentError('');
    try {
      const next = await api.runDmAgent({
        post,
        skipProcessed,
        markProcessed: post,
        maxAnswers: 4,
        messageCount: 50,
        maxChannels: 100,
      });
      setAgentResult(next);
      await loadAgentOverview();
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentRunning(false);
    }
  };

  const groupedMessages = useMemo(() => {
    const messages = result?.messages || [];
    return messages.reduce<Record<string, DmReviewMessage[]>>((acc, message) => {
      const key = message.channelTitle || String(message.channelId);
      acc[key] = [...(acc[key] || []), message];
      return acc;
    }, {});
  }, [result]);

  const hasMessages = Boolean(result && result.messages.length > 0);

  return (
    <div className="space-y-6 px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">DM Review</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">Today only</Badge>
            {result && <Badge variant="outline">{result.scanMode === 'full' ? 'Full scan' : 'Quick preview'}</Badge>}
            {result && <Badge variant="secondary">{result.window.argentinaDate} ARG</Badge>}
            {reportSaved && (
              <Badge className="border-transparent bg-success text-success-foreground">
                <IconCheck />
                Report saved
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading || running}>
            <IconRefresh />
            Refresh
          </Button>
          <Button onClick={run} disabled={loading || running}>
            <IconInbox />
            {running ? 'Checking...' : 'Check now'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={IconInbox} label="Incoming" value={result?.incomingMessages ?? '-'} sub="DMs today" />
        <Stat icon={IconUser} label="Channels" value={result?.scannedChannels ?? '-'} sub={`${result?.totalDirectChannels ?? '-'} total`} />
        <Stat icon={IconClock} label="Window" value={result?.window.argentinaDate || '-'} sub={result ? `${formatArgDateTime(result.window.startUtc)} - ${formatArgDateTime(result.window.endUtc)}` : 'ARG day'} />
        <Stat icon={IconCheck} label="Matched" value={result?.channelsWithTodayMessages ?? '-'} sub={`${result?.skippedInactiveChannels ?? '-'} inactive skipped`} />
      </div>

      {error && (
        <div className="sg-status-danger flex items-start gap-2 rounded-lg border p-4 text-sm">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">DM Agent</h2>
          <p className="text-xs text-muted-foreground">{agentCandidateCount ?? '-'} pending reply</p>
        </div>

        <div className="sg-panel space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={skipProcessed} onChange={(e) => setSkipProcessed(e.target.checked)} className="accent-primary" />
              Skip processed
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={post} onChange={(e) => setPost(e.target.checked)} className="accent-primary" />
              Send safe replies
            </label>
          </div>

          <Button onClick={runAgent} disabled={agentRunning}>
            {agentRunning ? 'Running Claude...' : 'Run Claude'}
          </Button>

          {agentError && (
            <div className="sg-status-danger flex items-start gap-2 rounded-lg border p-4 text-sm">
              <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{agentError}</span>
            </div>
          )}

          {agentResult && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {agentResult.handled} handled · {agentResult.posted} sent · {agentResult.needsHuman} need a human
              </p>
              {agentResult.decisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending DMs for Claude.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {agentResult.decisions.map((decision) => (
                    <DmDecisionCard key={decision.id} decision={decision} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Incoming DMs</h2>
          {result && <p className="text-xs text-muted-foreground">Updated {formatArgDateTime(result.generatedAt)} ARG</p>}
        </div>

        <div className="sg-panel p-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : hasMessages ? (
            <div className="space-y-6">
              {Object.entries(groupedMessages).map(([channel, messages]) => (
                <div key={channel}>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-foreground">{channel}</p>
                    <Badge variant="outline">{messages.length}</Badge>
                  </div>
                  <div>
                    {messages.map((message) => (
                      <DmRow key={message.messageId} message={message} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No incoming DMs found for today.</p>
          )}
        </div>
      </section>

      {result?.errors.length ? (
        <div className="sg-status-warning space-y-1 rounded-lg border p-4">
          {result.errors.map((item) => (
            <p key={item} className="text-xs">{item}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
