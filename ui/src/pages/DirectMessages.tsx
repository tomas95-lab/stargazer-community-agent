import { useEffect, useMemo, useState } from 'react';
import {
  CircleAlert as IconAlertCircle,
  Clock as IconClock,
  Inbox as IconInbox,
  Send as IconSend,
  Sparkles as IconSparkles,
  User as IconUser,
} from 'lucide-react';
import { api, type DmDraftResult, type DmReviewMessage, type DmReviewResult, type DmReviewThreadSummary } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { APP_TIME_ZONE_LABEL, formatAppDateTime, formatAppTime } from '@/lib/timezone';

function senderLabel(message: DmReviewMessage): string {
  return message.name ? `${message.name} · ${message.username}` : message.username;
}

function peerLabel(message: DmReviewMessage): string {
  const peers = message.peers.filter((peer) => peer.username !== message.username);
  const visiblePeers = peers.length > 0 ? peers : message.peers;
  return visiblePeers.map((peer) => peer.name || peer.username).join(', ') || message.channelTitle || 'Direct message';
}

function threadLabel(messages: DmReviewMessage[]): string {
  const incoming = messages.find((message) => message.incoming);
  if (incoming) return senderLabel(incoming);
  const first = messages[0];
  return first ? peerLabel(first) : 'Direct message';
}

function DmThread({
  messages,
  summary,
  draft,
  draftResult,
  generating,
  sending,
  sent,
  onDraftChange,
  onGenerateDraft,
  onSend,
}: {
  messages: DmReviewMessage[];
  summary?: DmReviewThreadSummary;
  draft: string;
  draftResult?: DmDraftResult;
  generating: boolean;
  sending: boolean;
  sent: boolean;
  onDraftChange: (value: string) => void;
  onGenerateDraft: () => void;
  onSend: () => void;
}) {
  const incomingCount = messages.filter((message) => message.incoming).length;

  return (
    <div className="space-y-4 border-b border-border py-5 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <IconUser className="size-4 shrink-0 text-muted-foreground" />
            <p className="truncate text-sm font-semibold text-foreground">{threadLabel(messages)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{messages.length} today</Badge>
          <Badge variant="secondary">{incomingCount} incoming</Badge>
          {summary?.needsReply ? (
            <Badge className="border-transparent bg-warning text-warning-foreground">
              {summary.pendingIncomingMessages} pending
            </Badge>
          ) : (
            <Badge variant="outline">answered</Badge>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {messages.map((message) => (
          <div
            key={message.messageId}
            className={`max-w-[860px] rounded-lg border px-3 py-2 ${
              message.incoming
                ? 'border-border bg-background text-foreground'
                : 'ml-auto border-muted bg-muted/40 text-foreground'
            }`}
          >
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{message.incoming ? senderLabel(message) : 'You'}</span>
              <span className="flex items-center gap-1">
                <IconClock className="size-3.5" />
                {formatAppTime(message.createdAt)} {APP_TIME_ZONE_LABEL}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
          </div>
        ))}
      </div>

      {draftResult && draftResult.action !== 'reply' ? (
        <div className="sg-status-warning rounded-lg border p-3 text-sm">
          <p className="font-medium">{draftResult.action === 'human' ? 'Needs human review' : 'No pending reply needed'}</p>
          <p className="mt-1 text-xs">{draftResult.reason}</p>
        </div>
      ) : null}

      <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          rows={2}
          placeholder="Write a reply..."
          className="sg-input min-h-20 resize-y px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Button variant="outline" onClick={onGenerateDraft} disabled={generating || sending}>
            <IconSparkles />
            {generating ? 'Thinking...' : 'Draft reply'}
          </Button>
          <Button onClick={onSend} disabled={sending || !draft.trim()}>
            <IconSend />
            {sending ? 'Sending...' : sent ? 'Sent' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DirectMessages() {
  const [result, setResult] = useState<DmReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [draftResults, setDraftResults] = useState<Record<number, DmDraftResult>>({});
  const [generatingDraftId, setGeneratingDraftId] = useState<number | null>(null);
  const [sendingChannelId, setSendingChannelId] = useState<number | null>(null);
  const [sentChannelIds, setSentChannelIds] = useState<Record<number, boolean>>({});

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await api.getDmReview({ messageCount: 50, maxChannels: 5, fullScan: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      setResult(await api.runDmReview({ messageCount: 50, maxChannels: 5, requestDelayMs: 1500 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const groupedMessages = useMemo(() => {
    const messages = result?.messages || [];
    return messages.reduce<Record<string, DmReviewMessage[]>>((acc, message) => {
      const key = String(message.channelId);
      acc[key] = [...(acc[key] || []), message];
      return acc;
    }, {});
  }, [result]);

  const threadSummaries = useMemo(() => {
    const summaries: Record<number, DmReviewThreadSummary> = {};
    for (const thread of result?.threads || []) {
      summaries[thread.channelId] = thread;
    }
    return summaries;
  }, [result]);

  const hasMessages = Boolean(result && result.messages.length > 0);

  const updateDraft = (channelId: number, value: string) => {
    setReplyDrafts((current) => ({ ...current, [channelId]: value }));
  };

  const generateDraft = async (channelId: number) => {
    setGeneratingDraftId(channelId);
    setError('');
    try {
      const result = await api.draftDmReply(channelId, { messageCount: 50 });
      setDraftResults((current) => ({ ...current, [channelId]: result }));
      if (result.action === 'reply' && result.reply.trim()) {
        setReplyDrafts((current) => ({ ...current, [channelId]: result.reply }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingDraftId(null);
    }
  };

  const sendReply = async (channelId: number) => {
    const draft = replyDrafts[channelId] || '';
    if (!draft.trim()) return;
    setSendingChannelId(channelId);
    setError('');
    try {
      await api.sendDmReply(channelId, draft);
      setReplyDrafts((current) => ({ ...current, [channelId]: '' }));
      setSentChannelIds((current) => ({ ...current, [channelId]: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSendingChannelId(null);
    }
  };

  return (
    <div className="space-y-5 px-4 lg:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">DM Review</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">Today only</Badge>
            {result && <Badge variant="secondary">{result.window.utcDate || result.window.argentinaDate} {APP_TIME_ZONE_LABEL}</Badge>}
          </div>
        </div>
        <div>
          <Button onClick={run} disabled={loading || running}>
            <IconInbox />
            {running ? 'Checking...' : 'Check now'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={result?.unresolvedChannels ? 'default' : 'secondary'}>{result?.unresolvedChannels ?? 0} open threads</Badge>
        <span className="text-muted-foreground">{result?.incomingMessages ?? 0} incoming messages</span>
        <span className="text-muted-foreground">{result?.scannedChannels ?? 0} conversations checked</span>
      </div>

      {error && (
        <div className="sg-status-danger flex items-start gap-2 rounded-lg border p-4 text-sm">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">DM Threads</h2>
          {result && <p className="text-xs text-muted-foreground">Updated {formatAppDateTime(result.generatedAt)} {APP_TIME_ZONE_LABEL}</p>}
        </div>

        <div className="sg-panel p-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : hasMessages ? (
            <div className="space-y-6">
              {Object.entries(groupedMessages).map(([channel, messages]) => {
                const channelId = Number(channel);
                return (
                  <DmThread
                    key={channel}
                    messages={messages}
                    summary={threadSummaries[channelId]}
                    draft={replyDrafts[channelId] || ''}
                    draftResult={draftResults[channelId]}
                    generating={generatingDraftId === channelId}
                    sending={sendingChannelId === channelId}
                    sent={Boolean(sentChannelIds[channelId])}
                    onDraftChange={(value) => updateDraft(channelId, value)}
                    onGenerateDraft={() => void generateDraft(channelId)}
                    onSend={() => void sendReply(channelId)}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No DM messages found for today.</p>
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
