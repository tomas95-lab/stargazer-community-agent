import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { api, type CommsTemplate } from '../api';

const TONE_LABELS: Record<string, string> = {
  friendly: 'Friendly',
  firm: 'Firm',
  urgent: 'Urgent',
  formal: 'Formal',
  slack_casual: 'Slack Casual',
};

const AUDIENCE_LABELS: Record<string, string> = {
  all_contributors: 'All Contributors',
  reviewers_only: 'Reviewers Only',
  qma_only: 'QMA Only',
  invited_contributors: 'Invited Contributors',
  new_contributors: 'New Contributors',
  throttled_contributors: 'Throttled Contributors',
  specific_users: 'Specific Users',
};

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
  const [tone, setTone] = useState(template.defaultTone);
  const [audience, setAudience] = useState(template.audience[0] ?? 'all_contributors');

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const v of template.variables) {
      init[v.key] = v.defaultValue ?? '';
    }
    setVars(init);
    setPreview('');
    setErrors([]);
    setTone(template.defaultTone);
    setAudience(template.audience[0] ?? 'all_contributors');
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

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500';
  const labelCls = 'block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">
          ← Back
        </button>
        <div>
          <h2 className="text-xl font-bold text-white">{template.name}</h2>
          <p className="text-gray-400 text-sm">{template.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
            <div>
              <label className={labelCls}>Tone</label>
              <select value={tone} onChange={(e) => setTone(e.target.value)} className={inputCls}>
                {template.supportedTones.map((t) => (
                  <option key={t} value={t}>{TONE_LABELS[t] ?? t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Audience</label>
              <select value={audience} onChange={(e) => setAudience(e.target.value)} className={inputCls}>
                {template.audience.map((a) => (
                  <option key={a} value={a}>{AUDIENCE_LABELS[a] ?? a}</option>
                ))}
              </select>
            </div>

            {template.variables.map((v) => (
              <div key={v.key}>
                <label className={labelCls}>
                  {v.label}
                  {v.required && <span className="text-red-400 ml-1">*</span>}
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
            <div className="bg-red-950/50 border border-red-700 rounded-xl p-3 text-red-400 text-sm">
              Failed to send: {sendError}
            </div>
          )}

          {errors.length > 0 && (
            <div className="bg-red-950/50 border border-red-700 rounded-xl p-4 space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-red-400 text-sm">{e}</p>
              ))}
            </div>
          )}

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Preview</span>
              <div className="flex gap-2">
                <button
                  onClick={copy}
                  disabled={!preview}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={exportMd}
                  disabled={!preview}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 disabled:text-gray-500 text-gray-200 text-xs font-medium rounded-lg transition-colors"
                >
                  Export .md
                </button>
                <button
                  onClick={sendToChat}
                  disabled={!preview || sending}
                  className="px-3 py-1 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {sending ? 'Sending...' : sendStatus === 'ok' ? 'Sent!' : 'Send to Chat'}
                </button>
              </div>
            </div>
            <div className="p-5 prose prose-invert prose-sm max-w-none min-h-48">
              {preview ? (
                <ReactMarkdown>{preview}</ReactMarkdown>
              ) : (
                <p className="text-gray-600 italic">Fill in the required fields to generate a preview.</p>
              )}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-gray-800 border-b border-gray-700">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Raw text</span>
            </div>
            <pre className="p-4 text-xs text-gray-400 whitespace-pre-wrap font-mono overflow-auto max-h-64">
              {preview || '—'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
