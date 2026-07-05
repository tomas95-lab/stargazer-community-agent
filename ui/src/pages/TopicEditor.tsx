import { useState, useEffect } from 'react';
import { ClipboardList, Loader2, Upload } from 'lucide-react';
import { api, type Topic } from '../api';
import TopicForm from '../components/TopicForm';
import Preview from '../components/Preview';
import { Button } from '@/components/ui/button';

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
        <span className={`text-xs ${status === 'error' ? 'text-danger' : 'text-success'}`}>{msg}</span>
      )}
      <button
        onClick={sync}
        disabled={status === 'syncing'}
        className="flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
      >
        {status === 'syncing' ? (
          <><span className="inline-block size-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" /> Syncing...</>
        ) : (
          <>
            <Upload className="size-3" />
            Sync local changes
          </>
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
          <h1 className="text-2xl font-semibold text-foreground">Topics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage daily thread topics stored in GitHub.</p>
        </div>
        <div className="flex items-center gap-3">
          <SyncButton />
          <button
            onClick={() => { setCreating(true); setSelected(null); setPreviewData(null); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New Topic
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Preview content={previewData.thread} label="Thread Preview" />
          <Preview content={previewData.announcement} label="Announcement Preview" />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : topics.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border bg-card/60 py-16 text-center">
          <ClipboardList className="mx-auto size-9 text-primary" />
          <p className="font-semibold text-foreground">No topics yet</p>
          <p className="text-sm text-muted-foreground">Create topics in advance. The publisher uses the one matching today's date.</p>
          <Button
            onClick={() => setCreating(true)}
            className="mt-2"
          >
            Create first topic
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div className="space-y-1">
              <p className="sg-label mb-2 px-1">Upcoming</p>
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
              <p className="sg-label mb-2 px-1">Past</p>
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
    <div className={`sg-panel overflow-hidden ${dim ? 'opacity-60' : ''}`}>
      <div className="overflow-x-auto">
        <table className="sg-table">
          <thead>
            <tr className="text-left">
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
                className={`transition-colors ${t.date === today ? 'border-l-2 border-l-primary bg-accent/45' : ''}`}
              >
                <td className="whitespace-nowrap px-4 py-3 font-mono text-foreground">
                  {t.date}
                  {t.date === today && <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">TODAY</span>}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-foreground">{t.topic}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {(t.tags || []).map((tag) => (
                      <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{tag}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => onPreview(t.date)} className="rounded px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent">Preview</button>
                    <button onClick={() => onEdit(t)} className="rounded px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent">Edit</button>
                    <button onClick={() => onDelete(t.date)} className="rounded px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
