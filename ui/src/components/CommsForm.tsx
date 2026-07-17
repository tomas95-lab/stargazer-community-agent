import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { api, type CommsTemplate } from '../api';
import { APP_TIME_ZONE_LABEL, todayAppDate } from '@/lib/timezone';

interface Props {
  template: CommsTemplate;
  onBack: () => void;
  onScheduled?: () => void;
}

const MULTILINE_VARIABLE_KEYS = new Set([
  'announcement',
  'body',
  'content',
  'details',
  'inviteeList',
  'keyPoints',
  'message',
  'notes',
  'recap',
  'summary',
  'text',
]);

function isMultilineVariable(template: CommsTemplate, key: string, placeholder?: string, defaultValue?: string): boolean {
  return (
    template.category === 'custom' ||
    MULTILINE_VARIABLE_KEYS.has(key) ||
    Boolean(placeholder?.includes('\n') || defaultValue?.includes('\n'))
  );
}

export default function CommsForm({ template, onBack, onScheduled }: Props) {
  const [vars, setVars] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of template.variables) {
      init[v.key] = v.defaultValue ?? '';
    }
    return init;
  });
  const [preview, setPreview] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [sendError, setSendError] = useState('');
  const [scheduleDate, setScheduleDate] = useState(todayAppDate());
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduleChannelId, setScheduleChannelId] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [scheduleError, setScheduleError] = useState('');

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const v of template.variables) {
      init[v.key] = v.defaultValue ?? '';
    }
    setVars(init);
    setPreview('');
    setErrors([]);
  }, [template.id]);

  const generate = useCallback(async () => {
    const result = await api.renderComms(template.id, vars);
    if ('errors' in result) {
      setErrors(result.errors);
      setPreview('');
    } else {
      setErrors([]);
      setPreview(result.output);
    }
  }, [template.id, vars]);

  useEffect(() => {
    generate();
  }, [generate]);

  const copy = async () => {
    if (!preview) return;
    await navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendToChat = async () => {
    if (!preview) return;
    setSending(true);
    setSendStatus('idle');
    setSendError('');
    try {
      await api.sendToChat(preview);
      setSendStatus('ok');
      setTimeout(() => setSendStatus('idle'), 3000);
    } catch (err) {
      setSendStatus('error');
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const scheduleMessage = async () => {
    if (!preview) return;
    setScheduling(true);
    setScheduleStatus('idle');
    setScheduleError('');
    try {
      await api.scheduleMessage({
        message: preview,
        scheduledDate: scheduleDate,
        scheduledTime: scheduleTime,
        channelId: scheduleChannelId.trim() || undefined,
      });
      setScheduleStatus('ok');
      onScheduled?.();
      setTimeout(() => setScheduleStatus('idle'), 3000);
    } catch (err) {
      setScheduleStatus('error');
      setScheduleError(err instanceof Error ? err.message : String(err));
    } finally {
      setScheduling(false);
    }
  };

  const exportMd = () => {
    if (!preview) return;
    const blob = new Blob([preview], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.id}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls = 'sg-input px-3 py-2 text-sm';
  const labelCls = 'sg-label mb-1 block';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm font-medium text-primary hover:underline">
          Back
        </button>
        <div>
          <h2 className="text-xl font-semibold text-foreground">{template.name}</h2>
          <p className="text-sm text-muted-foreground">{template.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-4">
          <div className="sg-panel space-y-4 p-4">
            {template.variables.map((v) => (
              <div key={v.key}>
                <label className={labelCls}>
                  {v.label}
                  {v.required && <span className="ml-1 text-danger">*</span>}
                </label>
                {isMultilineVariable(template, v.key, v.placeholder, v.defaultValue) ? (
                  <textarea
                    value={vars[v.key] ?? ''}
                    onChange={(e) => setVars((p) => ({ ...p, [v.key]: e.target.value }))}
                    className={inputCls}
                    rows={template.category === 'custom' ? 12 : 4}
                    placeholder={v.placeholder}
                  />
                ) : (
                  <input
                    value={vars[v.key] ?? ''}
                    onChange={(e) => setVars((p) => ({ ...p, [v.key]: e.target.value }))}
                    className={inputCls}
                    placeholder={v.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {sendStatus === 'error' && (
            <div className="sg-status-danger rounded-lg border p-3 text-sm">
              Failed to send: {sendError}
            </div>
          )}

          {scheduleStatus === 'error' && (
            <div className="sg-status-danger rounded-lg border p-3 text-sm">
              Failed to schedule: {scheduleError}
            </div>
          )}

          {errors.length > 0 && (
            <div className="sg-status-danger space-y-1 rounded-lg border p-4">
              {errors.map((e, i) => (
                <p key={i} className="text-sm">{e}</p>
              ))}
            </div>
          )}

          <div className="sg-panel overflow-hidden">
            <div className="sg-panel-header flex items-center justify-between px-4 py-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Preview</span>
              <div className="flex gap-2">
                <button
                  onClick={copy}
                  disabled={!preview}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={exportMd}
                  disabled={!preview}
                  className="rounded-md border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  Export .md
                </button>
                <button
                  onClick={sendToChat}
                  disabled={!preview || sending}
                  className="rounded-md bg-success px-3 py-1 text-xs font-medium text-success-foreground transition-colors hover:bg-success/90 disabled:opacity-50"
                >
                  {sending ? 'Sending...' : sendStatus === 'ok' ? 'Sent!' : 'Send to Chat'}
                </button>
              </div>
            </div>
            <div className="prose prose-sm min-h-48 max-w-none p-5 text-foreground">
              {preview ? (
                template.category === 'custom' ? (
                  <div className="whitespace-pre-wrap break-words text-sm leading-6">{preview}</div>
                ) : (
                  <ReactMarkdown>{preview}</ReactMarkdown>
                )
              ) : (
                <p className="italic text-muted-foreground">Fill in the required fields to generate a preview.</p>
              )}
            </div>
          </div>

          <div className="sg-panel p-4">
            <div className="mb-3 flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Schedule send</span>
              <span className="text-xs text-muted-foreground">The scheduled job will post this preview when the selected {APP_TIME_ZONE_LABEL} time is due.</span>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end">
              <div>
                <label className={labelCls}>Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(event) => setScheduleDate(event.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Time ({APP_TIME_ZONE_LABEL})</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(event) => setScheduleTime(event.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Channel ID</label>
                <input
                  value={scheduleChannelId}
                  onChange={(event) => setScheduleChannelId(event.target.value)}
                  className={inputCls}
                  placeholder="Default project channel"
                />
              </div>
              <button
                onClick={scheduleMessage}
                disabled={!preview || scheduling}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {scheduling ? 'Scheduling...' : scheduleStatus === 'ok' ? 'Scheduled!' : 'Schedule'}
              </button>
            </div>
          </div>

          <div className="sg-panel overflow-hidden">
            <div className="sg-panel-header px-4 py-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Raw text</span>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs text-muted-foreground">
              {preview || 'No preview'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
