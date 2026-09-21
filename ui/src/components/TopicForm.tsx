import { useState, useEffect } from 'react';
import { Upload } from 'lucide-react';
import type { Topic } from '../api';

interface Props {
  topic?: Topic;
  onSave: (t: Topic) => void;
  onCancel: () => void;
}

const empty: Topic = {
  date: '',
  title: '',
  topic: '',
  reminderTitle: '',
  reminderBody: '',
  goodExample: '',
  badExample: '',
  quickRule: '',
  tags: ['daily_project_announcements'],
  webinar: { enabled: false, mandatory: false, timeLabel: '', link: '' },
};

export default function TopicForm({ topic, onSave, onCancel }: Props) {
  const [form, setForm] = useState<Topic>(topic || empty);
  const [mode, setMode] = useState<'full' | 'structured'>(topic?.content ? 'full' : 'structured');

  useEffect(() => {
    setForm(topic || empty);
    setMode(topic?.content ? 'full' : 'structured');
  }, [topic]);

  const set = (field: keyof Topic, value: unknown) => setForm((p) => ({ ...p, [field]: value }));
  const setWebinar = (field: string, value: unknown) =>
    setForm((p) => ({ ...p, webinar: { ...p.webinar!, [field]: value } }));

  const inputCls = 'sg-input px-3 py-2 text-sm';
  const labelCls = 'sg-label mb-1 block';

  return (
    <div className="sg-panel space-y-4 p-6">
      <div>
        <span className={labelCls}>Thread format</span>
        <div className="inline-flex rounded-md border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setMode('full')}
            className={`rounded px-3 py-1.5 text-sm font-medium ${mode === 'full' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'}`}
          >
            Full Markdown
          </button>
          <button
            type="button"
            onClick={() => setMode('structured')}
            className={`rounded px-3 py-1.5 text-sm font-medium ${mode === 'structured' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'}`}
          >
            Structured
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Full Markdown is published exactly as written. Structured uses the neutral daily-thread layout.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Date</label>
          <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputCls} disabled={!!topic} />
        </div>
        <div>
          <label className={labelCls}>Topic Category</label>
          <input value={form.topic} onChange={(e) => set('topic', e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Title</label>
        <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} />
      </div>

      {mode === 'full' ? (
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <label className="sg-label">Complete thread (Markdown)</label>
            <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-xs font-medium hover:bg-accent">
              <Upload className="size-3.5" />
              Upload Markdown
              <input
                className="sr-only"
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) set('content', await file.text());
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>
          <textarea
            value={form.content || ''}
            onChange={(e) => set('content', e.target.value)}
            className={`${inputCls} min-h-96 font-mono`}
            placeholder="# Welcome to the project&#10;&#10;Write the complete daily thread here..."
          />
        </div>
      ) : (
        <>
          <div>
            <label className={labelCls}>Quick Rule</label>
            <input value={form.quickRule} onChange={(e) => set('quickRule', e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Reminder Title</label>
            <input value={form.reminderTitle} onChange={(e) => set('reminderTitle', e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Reminder Body</label>
            <textarea value={form.reminderBody} onChange={(e) => set('reminderBody', e.target.value)} className={inputCls} rows={4} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Bad Example</label>
              <textarea value={form.badExample} onChange={(e) => set('badExample', e.target.value)} className={inputCls} rows={4} />
            </div>
            <div>
              <label className={labelCls}>Good Example</label>
              <textarea value={form.goodExample} onChange={(e) => set('goodExample', e.target.value)} className={inputCls} rows={4} />
            </div>
          </div>
        </>
      )}

      <div>
        <label className={labelCls}>Chat announcement</label>
        <textarea
          value={form.chatAnnouncement || ''}
          onChange={(e) => set('chatAnnouncement', e.target.value)}
          className={inputCls}
          rows={5}
          placeholder={'Today\'s [**{{projectName}} thread**]({{dailyThreadUrl}}) is ready.\n\nPlease review {{title}} before starting.'}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Optional. Supports Markdown and {'{{dailyThreadUrl}}'}, {'{{projectName}}'}, {'{{title}}'}, and {'{{topic}}'}.
        </p>
      </div>

      <div>
        <label className={labelCls}>Tags (comma-separated)</label>
        <input value={(form.tags || []).join(', ')} onChange={(e) => set('tags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} className={inputCls} />
      </div>

      <div className="sg-panel-muted space-y-3 p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.webinar?.enabled || false} onChange={(e) => setWebinar('enabled', e.target.checked)} className="rounded" />
          Webinar enabled
        </label>
        {form.webinar?.enabled && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.webinar?.mandatory || false} onChange={(e) => setWebinar('mandatory', e.target.checked)} className="rounded" />
              Mandatory
            </label>
            <div>
              <label className={labelCls}>Time Label</label>
              <input value={form.webinar?.timeLabel || ''} onChange={(e) => setWebinar('timeLabel', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Link</label>
              <input value={form.webinar?.link || ''} onChange={(e) => setWebinar('link', e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-3">
              <label className={labelCls}>Invited Emails (one per line)</label>
              <textarea
                value={(form.webinar?.invitees || []).join('\n')}
                onChange={(e) => setWebinar('invitees', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
                className={inputCls}
                rows={3}
                placeholder="email1@example.com&#10;email2@example.com"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={() => onSave(mode === 'full' ? form : { ...form, content: undefined })} className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          Save
        </button>
        <button onClick={onCancel} className="rounded-md border bg-background px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent">
          Cancel
        </button>
      </div>
    </div>
  );
}
