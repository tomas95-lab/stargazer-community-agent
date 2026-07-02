import { useState, useEffect } from 'react';
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

  useEffect(() => {
    setForm(topic || empty);
  }, [topic]);

  const set = (field: keyof Topic, value: unknown) => setForm((p) => ({ ...p, [field]: value }));
  const setWebinar = (field: string, value: unknown) =>
    setForm((p) => ({ ...p, webinar: { ...p.webinar!, [field]: value } }));

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500';
  const labelCls = 'block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1';

  return (
    <div className="space-y-4 bg-gray-900 border border-gray-700 rounded-xl p-6">
      <div className="grid grid-cols-2 gap-4">
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Bad Example</label>
          <textarea value={form.badExample} onChange={(e) => set('badExample', e.target.value)} className={inputCls} rows={4} />
        </div>
        <div>
          <label className={labelCls}>Good Example</label>
          <textarea value={form.goodExample} onChange={(e) => set('goodExample', e.target.value)} className={inputCls} rows={4} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Tags (comma-separated)</label>
        <input value={(form.tags || []).join(', ')} onChange={(e) => set('tags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} className={inputCls} />
      </div>

      <div className="border border-gray-700 rounded-lg p-4 space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.webinar?.enabled || false} onChange={(e) => setWebinar('enabled', e.target.checked)} className="rounded" />
          Webinar enabled
        </label>
        {form.webinar?.enabled && (
          <div className="grid grid-cols-3 gap-4">
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
            <div className="col-span-3">
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
        <button onClick={() => onSave(form)} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition-colors">
          Save
        </button>
        <button onClick={onCancel} className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold rounded-lg text-sm transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
