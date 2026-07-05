import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { api, type CommsTemplate } from '../api';

interface Props {
  template: CommsTemplate;
  onBack: () => void;
}

export default function CommsForm({ template, onBack }: Props) {
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

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-4">
          <div className="sg-panel space-y-4 p-4">
            {template.variables.map((v) => (
              <div key={v.key}>
                <label className={labelCls}>
                  {v.label}
                  {v.required && <span className="ml-1 text-danger">*</span>}
                </label>
                {v.placeholder?.includes('\n') ? (
                  <textarea
                    value={vars[v.key] ?? ''}
                    onChange={(e) => setVars((p) => ({ ...p, [v.key]: e.target.value }))}
                    className={inputCls}
                    rows={3}
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

        <div className="col-span-2 space-y-4">
          {sendStatus === 'error' && (
            <div className="sg-status-danger rounded-lg border p-3 text-sm">
              Failed to send: {sendError}
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
                <ReactMarkdown>{preview}</ReactMarkdown>
              ) : (
                <p className="italic text-muted-foreground">Fill in the required fields to generate a preview.</p>
              )}
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
