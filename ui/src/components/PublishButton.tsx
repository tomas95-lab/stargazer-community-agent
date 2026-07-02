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
        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition-colors text-sm"
      >
        {status === 'running' ? 'Publishing...' : status === 'done' ? 'Published!' : 'Publish to Community'}
      </button>

      {publishedUrl && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-green-400 font-medium">Published:</span>
          <a href={publishedUrl} target="_blank" rel="noopener" className="text-indigo-400 hover:underline break-all">
            {publishedUrl}
          </a>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-red-950/50 border border-red-700 rounded-xl p-3 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
