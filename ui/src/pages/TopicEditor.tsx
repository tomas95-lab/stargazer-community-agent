import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { CheckCircle2, ClipboardList, FileJson, Loader2, Upload, XCircle } from 'lucide-react';
import { api, type Topic, type TopicImportError, type TopicImportSchema } from '../api';
import TopicForm from '../components/TopicForm';
import Preview from '../components/Preview';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

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

function ImportErrors({ errors }: { errors: TopicImportError[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
        <XCircle className="size-4" />
        Fix these JSON issues
      </div>
      <div className="max-h-44 overflow-auto">
        {errors.map((error, index) => (
          <p key={`${error.index}-${error.path}-${index}`} className="text-sm text-destructive">
            {error.index >= 0 ? `Row ${error.index + 1}` : 'JSON'} / {error.path}: {error.message}
          </p>
        ))}
      </div>
    </div>
  );
}

function TopicsImportPanel({ onImported }: { onImported: () => void }) {
  const [schema, setSchema] = useState<TopicImportSchema | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<TopicImportError[]>([]);
  const [validCount, setValidCount] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getTopicsImportSchema()
      .then((result) => {
        setSchema(result);
        setJsonText(JSON.stringify(result.example, null, 2));
      })
      .catch(() => undefined);
  }, []);

  const parsedPayload = () => {
    try {
      return { payload: JSON.parse(jsonText), error: '' };
    } catch (err) {
      return {
        payload: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const validate = async () => {
    setValidating(true);
    setMessage('');
    const parsed = parsedPayload();
    if (parsed.error) {
      setErrors([{ index: -1, path: '$', message: parsed.error }]);
      setValidCount(null);
      setValidating(false);
      return false;
    }
    try {
      const result = await api.validateTopicsImport(parsed.payload);
      setErrors(result.errors);
      setValidCount(result.ok ? result.topics.length : null);
      return result.ok;
    } catch (err) {
      setErrors([{ index: -1, path: '$', message: err instanceof Error ? err.message : String(err) }]);
      setValidCount(null);
      return false;
    } finally {
      setValidating(false);
    }
  };

  const importTopics = async () => {
    const ok = await validate();
    if (!ok) return;
    setImporting(true);
    setMessage('');
    const parsed = parsedPayload();
    try {
      const result = await api.importTopics(parsed.payload, mode);
      setMessage(`${result.imported} topics imported. Created ${result.created}, updated ${result.updated}. Total: ${result.total}.`);
      onImported();
    } catch (err) {
      setErrors([{ index: -1, path: '$', message: err instanceof Error ? err.message : String(err) }]);
    } finally {
      setImporting(false);
    }
  };

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setJsonText(await file.text());
    setErrors([]);
    setValidCount(null);
    setMessage(`Loaded ${file.name}.`);
    event.currentTarget.value = '';
  };

  const example = useMemo(() => JSON.stringify(schema?.example || [], null, 2), [schema]);

  return (
    <Card className="rounded-lg p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileJson className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Import topics JSON</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a JSON array or an object with a <code>topics</code> array. Dates must use YYYY-MM-DD.
          </p>
        </div>
        <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground">
          <Upload className="size-4" />
          Upload JSON
          <input className="sr-only" type="file" accept=".json,application/json" onChange={loadFile} />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="grid gap-3">
          <Textarea
            className="min-h-80 font-mono text-xs"
            value={jsonText}
            onChange={(event) => {
              setJsonText(event.target.value);
              setErrors([]);
              setValidCount(null);
              setMessage('');
            }}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} />
                Add/update by date
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                Replace all
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={validate} disabled={validating || !jsonText.trim()}>
                {validating ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Validate
              </Button>
              <Button type="button" onClick={importTopics} disabled={importing || !jsonText.trim()}>
                {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Import
              </Button>
            </div>
          </div>
          <ImportErrors errors={errors} />
          {validCount !== null && errors.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
              <CheckCircle2 className="size-4" />
              Valid JSON. {validCount} topics ready to import.
            </div>
          ) : null}
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>

        <div className="rounded-md border bg-muted/30 p-3">
          <p className="mb-2 text-sm font-medium">Expected structure</p>
          <div className="mb-3 grid gap-1 text-xs text-muted-foreground">
            {schema?.requiredFields.map((field) => (
              <span key={field}>{field}: required string</span>
            ))}
            <span>tags: optional string[]</span>
            <span>webinar: optional object</span>
          </div>
          <pre className="max-h-80 overflow-auto rounded-md bg-background p-3 text-xs text-muted-foreground">
            {example}
          </pre>
        </div>
      </div>
    </Card>
  );
}

export default function TopicEditor() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selected, setSelected] = useState<Topic | null>(null);
  const [creating, setCreating] = useState(false);
  const [showImport, setShowImport] = useState(false);
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Topics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage daily thread topics stored in GitHub.</p>
        </div>
        <div className="flex items-center gap-3">
          <SyncButton />
          <Button type="button" variant="outline" onClick={() => setShowImport((value) => !value)}>
            <FileJson className="size-4" />
            Import JSON
          </Button>
          <button
            onClick={() => { setCreating(true); setSelected(null); setPreviewData(null); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New Topic
          </button>
        </div>
      </div>

      {showImport ? <TopicsImportPanel onImported={load} /> : null}

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
                  <div className="flex flex-wrap gap-1">
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
