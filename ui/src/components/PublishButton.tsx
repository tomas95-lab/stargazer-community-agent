import { useState, useRef } from 'react';

interface Props {
  date: string;
  disabled?: boolean;
}

export default function PublishButton({ date, disabled }: Props) {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [publishedUrl, setPublishedUrl] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  const publish = () => {
    setStatus('running');
    setLogs([]);
    setPublishedUrl('');

    const evtSource = new EventSource(`/api/publish/${date}?_method=POST`);

    fetch(`/api/publish/${date}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postChat: true }),
    }).then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'log' || data.type === 'error') {
              setLogs((prev) => [...prev, data.message]);
              setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
            }
            if (data.type === 'published' || data.type === 'done') {
              setPublishedUrl(data.url || '');
              if (data.type === 'done') setStatus('done');
            }
            if (data.type === 'error') {
              setStatus('error');
            }
          } catch { /* skip malformed lines */ }
        }
      }

      if (status === 'running') setStatus('done');
    }).catch((err) => {
      setLogs((prev) => [...prev, `Error: ${err.message}`]);
      setStatus('error');
    });

    evtSource.close();
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

      {logs.length > 0 && (
        <div ref={logRef} className="bg-gray-900 border border-gray-700 rounded-xl p-4 max-h-72 overflow-auto font-mono text-xs text-gray-300 space-y-1">
          {logs.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
