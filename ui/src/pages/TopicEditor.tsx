import { useState, useEffect } from 'react';
import { api, type Topic } from '../api';
import TopicForm from '../components/TopicForm';
import Preview from '../components/Preview';

function SyncButton() {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const sync = async () => {
    setStatus('syncing');
    setMsg('');
    try {
      const res = await api.syncToGitHub();
      setMsg(res.message);
      setStatus('ok');
      setTimeout(() => setStatus('idle'), 4000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
      setTimeout(() => setStatus('idle'), 5000);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {msg && (
        <span className={`text-xs ${status === 'error' ? 'text-red-400' : 'text-green-400'}`}>{msg}</span>
      )}
      <button
        onClick={sync}
        disabled={status === 'syncing'}
        className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 border border-gray-600 text-gray-200 text-sm font-medium rounded-xl transition-colors"
      >
        {status === 'syncing' ? (
          <><span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin inline-block" /> Syncing...</>
        ) : (
          <>↑ Sync local changes</>
        )}
      </button>
    </div>
  );
}

export default function TopicEditor() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selected, setSelected] = useState<Topic | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewData, setPreviewData] = useState<{ thread: string; announcement: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.getTopics().then((t) => { setTopics(t); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (t: Topic) => {
    if (creating) {
      await api.createTopic(t);
    } else {
      await api.updateTopic(t.date, t);
    }
    setSelected(null);
    setCreating(false);
    setPreviewData(null);
    load();
  };

  const handleDelete = async (date: string) => {
    if (!confirm(`Delete topic for ${date}?`)) return;
    await api.deleteTopic(date);
    if (selected?.date === date) {
      setSelected(null);
      setPreviewData(null);
    }
    load();
  };

  const handlePreview = async (date: string) => {
    const p = await api.getPreview(date);
    setPreviewData(p);
  };

  const today = new Date().toISOString().split('T')[0];

  const sorted = [...topics].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.filter((t) => t.date >= today);
  const past = sorted.filter((t) => t.date < today).reverse();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Topics</h1>
          <p className="text-gray-500 text-sm mt-1">Manage daily thread topics stored in GitHub.</p>
        </div>
        <div className="flex items-center gap-3">
          <SyncButton />
          <button
            onClick={() => { setCreating(true); setSelected(null); setPreviewData(null); }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm transition-colors"
          >
            + New Topic
          </button>
        </div>
      </div>

      {(selected || creating) && (
        <TopicForm
          topic={selected || undefined}
          onSave={handleSave}
          onCancel={() => { setSelected(null); setCreating(false); }}
        />
      )}

      {previewData && (
        <div className="grid grid-cols-2 gap-4">
          <Preview content={previewData.thread} label="Thread Preview" />
          <Preview content={previewData.announcement} label="Announcement Preview" />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-16 bg-gray-800/40 border border-gray-700 border-dashed rounded-2xl space-y-3">
          <p className="text-4xl">📋</p>
          <p className="text-gray-300 font-semibold">No topics yet</p>
          <p className="text-gray-500 text-sm">Create topics in advance. The publisher uses the one matching today's date.</p>
          <button
            onClick={() => setCreating(true)}
            className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-xl font-medium"
          >
            Create first topic
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold px-1 mb-2">Upcoming</p>
              <TopicTable
                topics={upcoming}
                today={today}
                onPreview={handlePreview}
                onEdit={(t) => { setSelected(t); setCreating(false); setPreviewData(null); }}
                onDelete={handleDelete}
              />
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold px-1 mb-2">Past</p>
              <TopicTable
                topics={past}
                today={today}
                onPreview={handlePreview}
                onEdit={(t) => { setSelected(t); setCreating(false); setPreviewData(null); }}
                onDelete={handleDelete}
                dim
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TopicTable({ topics, today, onPreview, onEdit, onDelete, dim }: {
  topics: Topic[];
  today: string;
  onPreview: (date: string) => void;
  onEdit: (t: Topic) => void;
  onDelete: (date: string) => void;
  dim?: boolean;
}) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden ${dim ? 'opacity-60' : ''}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-left text-xs uppercase text-gray-500">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Topic</th>
            <th className="px-4 py-3">Tags</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr
              key={t.date}
              className={`border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors ${t.date === today ? 'bg-indigo-900/10 border-l-2 border-l-indigo-500' : ''}`}
            >
              <td className="px-4 py-3 font-mono text-gray-300 whitespace-nowrap">
                {t.date}
                {t.date === today && <span className="ml-2 text-xs text-indigo-400 font-bold bg-indigo-900/40 px-1.5 py-0.5 rounded">TODAY</span>}
              </td>
              <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{t.topic}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1 flex-wrap">
                  {(t.tags || []).map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded-full">{tag}</span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => onPreview(t.date)} className="px-2 py-1 text-xs text-gray-400 hover:text-indigo-400 hover:bg-gray-800 rounded transition-colors">Preview</button>
                  <button onClick={() => onEdit(t)} className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors">Edit</button>
                  <button onClick={() => onDelete(t.date)} className="px-2 py-1 text-xs text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded transition-colors">Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
