import { useState } from 'react';
import { IconFlask, IconLoader2, IconRefresh, IconSparkles } from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import { api, type SandboxResult } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function datetimeLocal(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function statusClass(action: string): string {
  if (action === 'reply' || action === 'react') return 'sg-status-success';
  if (action === 'human') return 'sg-status-warning';
  return 'border-border bg-secondary text-secondary-foreground';
}

export default function TestingSandbox() {
  const [username, setUsername] = useState('sandbox.user');
  const [channel, setChannel] = useState('community');
  const [nowLocal, setNowLocal] = useState(datetimeLocal());
  const [message, setMessage] = useState('Is the War Room open today?');
  const [context, setContext] = useState('');
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const evaluate = async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await api.evaluateSandboxMessage({
        username,
        channel,
        message,
        nowIso: nowLocal ? new Date(nowLocal).toISOString() : undefined,
        context,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setUsername('sandbox.user');
    setChannel('community');
    setNowLocal(datetimeLocal());
    setMessage('Is the War Room open today?');
    setContext('');
    setResult(null);
    setError('');
  };

  return (
    <div className="space-y-6 px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <IconFlask className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold text-foreground">Testing Sandbox</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={reset} variant="outline" disabled={loading}>
            <IconRefresh />
            Reset
          </Button>
          <Button onClick={evaluate} disabled={loading || !message.trim()}>
            {loading ? <IconLoader2 className="animate-spin" /> : <IconSparkles />}
            {loading ? 'Evaluating' : 'Evaluate'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="sg-panel space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div>
              <label className="sg-label mb-1 block">Channel</label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="community">Community</SelectItem>
                  <SelectItem value="dm">DM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="sg-label mb-1 block">Time</label>
              <input
                type="datetime-local"
                value={nowLocal}
                onChange={(event) => setNowLocal(event.target.value)}
                className="sg-input px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="sg-label mb-1 block">Username</label>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="sg-input px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="sg-label mb-1 block">Message</label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="sg-input min-h-36 resize-y px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="sg-label mb-1 block">Context</label>
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              className="sg-input min-h-24 resize-y px-3 py-2 text-sm"
              placeholder="Optional recent chat or DM context."
            />
          </div>
        </section>

        <section className="space-y-4">
          {error && <div className="sg-status-danger rounded-lg border p-4 text-sm">{error}</div>}

          <div className="sg-panel overflow-hidden">
            <div className="sg-panel-header flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                <IconFlask className="size-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Decision</span>
              </div>
              {result && (
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(result.decision.action)}`}>
                    {result.decision.action}
                  </span>
                  <Badge variant="outline">{Math.round(result.decision.confidence * 100)}% confidence</Badge>
                  {result.deterministic && <Badge variant="secondary">deterministic</Badge>}
                </div>
              )}
            </div>

            {result ? (
              <div className="grid min-h-[420px] lg:grid-cols-2">
                <div className="border-b border-border p-5 lg:border-r lg:border-b-0">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Reply</p>
                  {result.decision.reply ? (
                    <div className="prose prose-sm max-w-none text-foreground">
                      <ReactMarkdown>{result.decision.reply}</ReactMarkdown>
                    </div>
                  ) : result.decision.action === 'react' ? (
                    <p className="text-sm text-foreground">React with {result.decision.reaction || '+1'}.</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No reply generated.</p>
                  )}
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Reason</p>
                    <p className="text-sm leading-6 text-foreground">{result.decision.reason}</p>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Guideline snippets</p>
                    <p className="text-sm text-muted-foreground">{result.decision.guidelineSnippets.length} matched</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
                Run an evaluation to see the decision.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
