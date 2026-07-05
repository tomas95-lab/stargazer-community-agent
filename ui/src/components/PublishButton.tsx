import { useState } from 'react';

interface Props {
  date: string;
  disabled?: boolean;
}

export default function PublishButton({ date, disabled }: Props) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [publishedUrl, setPublishedUrl] = useState('');
  const [error, setError] = useState('');

  const publish = async () => {
    setStatus('running');
    setPublishedUrl('');
    setError('');

    try {
      const res = await fetch(`/api/publish/${date}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postChat: true }),
      });

      const data = await res.json() as { ok?: boolean; url?: string; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error || 'Unknown error');
        setStatus('error');
        return;
      }

      setPublishedUrl(data.url || '');
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={publish}
        disabled={disabled || status === 'running'}
        className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {status === 'running' ? 'Publishing...' : status === 'done' ? 'Published!' : 'Publish to Community'}
      </button>

      {publishedUrl && (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-success">Published:</span>
          <a href={publishedUrl} target="_blank" rel="noopener" className="break-all text-primary hover:underline">
            {publishedUrl}
          </a>
        </div>
      )}

      {status === 'error' && (
        <div className="sg-status-danger rounded-lg border p-3 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
