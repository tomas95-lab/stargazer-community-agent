import { useEffect, useState } from 'react';
import { GraduationCap, Video } from 'lucide-react';
import { api } from '../api';
import type { Webinar } from '../api';
import { appDateTimeToDate } from '@/lib/timezone';

const EMPTY: Omit<Webinar, 'id'> = {
  type: 'webinar',
  title: '',
  date: '',
  timeUtc: '',
  timeLabel: '',
  link: '',
  invitees: [],
};

export default function WebinarScheduler() {
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [form, setForm] = useState<Omit<Webinar, 'id'>>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inviteesRaw, setInviteesRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getWebinars().then(setWebinars).catch(console.error);
  }, []);

  const reset = () => {
    setForm(EMPTY);
    setInviteesRaw('');
    setEditingId(null);
    setError('');
  };

  const startEdit = (w: Webinar) => {
    setForm({ type: w.type, title: w.title, date: w.date, timeUtc: w.timeUtc, timeLabel: w.timeLabel, link: w.link, invitees: w.invitees });
    setInviteesRaw(w.invitees.join('\n'));
    setEditingId(w.id);
  };

  const save = async () => {
    if (!form.title || !form.date || !form.timeUtc || !form.link) {
      setError('Title, date, time (PST) and link are required.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = { ...form, invitees: inviteesRaw.split('\n').map((s) => s.trim()).filter(Boolean) };
    try {
      if (editingId) {
        const updated = await api.updateWebinar(editingId, payload);
        setWebinars((prev) => prev.map((w) => (w.id === editingId ? updated : w)));
      } else {
        const created = await api.createWebinar(payload);
        setWebinars((prev) => [...prev, created]);
      }
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await api.deleteWebinar(id);
    setWebinars((prev) => prev.filter((w) => w.id !== id));
  };

  const upcoming = webinars
    .filter((w) => appDateTimeToDate(w.date, w.timeUtc) >= new Date())
    .sort((a, b) => a.date.localeCompare(b.date));

  const past = webinars
    .filter((w) => appDateTimeToDate(w.date, w.timeUtc) < new Date())
    .sort((a, b) => b.date.localeCompare(a.date));

  const inputCls = 'sg-input px-3 py-2 text-sm';
  const labelCls = 'sg-label mb-1 block';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 lg:px-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Sessions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Schedule webinars and onboarding sessions used by reminders.</p>
        </div>
      </div>

      <div className="sg-panel space-y-4 p-6">
        <h2 className="text-lg font-semibold text-foreground">{editingId ? 'Edit Webinar' : 'Schedule New Webinar'}</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Type</label>
            <div className="flex gap-2">
              {(['webinar', 'onboarding'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, type: t })}
                  className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors ${form.type === t ? 'bg-primary text-primary-foreground' : 'border bg-background text-foreground hover:bg-accent'}`}
                >
                  {t === 'webinar' ? (
                    <>
                      <Video className="size-4" />
                      Webinar
                    </>
                  ) : (
                    <>
                      <GraduationCap className="size-4" />
                      Onboarding
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Title</label>
            <input
              className={inputCls}
              placeholder={form.type === 'onboarding' ? 'New Contributor Onboarding' : 'Alignment Webinar'}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div>
            <label className={labelCls}>Date</label>
            <input
              type="date"
              className={inputCls}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>

          <div>
            <label className={labelCls}>Time (PST)</label>
            <input
              type="time"
              className={inputCls}
              value={form.timeUtc}
              onChange={(e) => setForm({ ...form, timeUtc: e.target.value })}
            />
            <p className="mt-1 text-xs text-muted-foreground">Use PST for all scheduled times.</p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Time Label (display)</label>
            <input
              className={inputCls}
              placeholder="e.g. 08:30 PST"
              value={form.timeLabel}
              onChange={(e) => setForm({ ...form, timeLabel: e.target.value })}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Zoom Link</label>
            <input
              className={inputCls}
              placeholder="https://zoom.us/j/..."
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Invited Contributors <span className="text-muted-foreground">(one per line, optional)</span></label>
            <textarea
              rows={4}
              className={`${inputCls} resize-none font-mono`}
              placeholder="@name1&#10;@name2"
              value={inviteesRaw}
              onChange={(e) => setInviteesRaw(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : editingId ? 'Update' : 'Schedule'}
          </button>
          {editingId && (
            <button onClick={reset} className="rounded-md border bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent">
              Cancel
            </button>
          )}
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="sg-label">Upcoming</h2>
          {upcoming.map((w) => (
            <WebinarCard key={w.id} webinar={w} onEdit={startEdit} onDelete={remove} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="sg-label">Past</h2>
          {past.map((w) => (
            <WebinarCard key={w.id} webinar={w} onEdit={startEdit} onDelete={remove} dim />
          ))}
        </div>
      )}

      {webinars.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No sessions scheduled yet.</p>
      )}
    </div>
  );
}

function WebinarCard({ webinar, onEdit, onDelete, dim }: { webinar: Webinar; onEdit: (w: Webinar) => void; onDelete: (id: string) => void; dim?: boolean }) {
  return (
    <div className={`sg-panel flex items-start justify-between gap-4 p-4 ${dim ? 'opacity-50' : ''}`}>
      <div className="space-y-1 min-w-0">
      <div className="flex items-center gap-2">
        {webinar.type === 'onboarding' ? (
          <GraduationCap className="size-4 text-primary" />
        ) : (
          <Video className="size-4 text-primary" />
        )}
        <p className="font-medium text-foreground">{webinar.title}</p>
      </div>
      <p className="text-sm text-muted-foreground">{webinar.date} · {webinar.timeLabel}</p>
        <p className="truncate text-xs text-primary">{webinar.link}</p>
        {webinar.invitees.length > 0 && (
          <p className="text-xs text-muted-foreground">{webinar.invitees.length} invitee{webinar.invitees.length > 1 ? 's' : ''}</p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={() => onEdit(webinar)} className="rounded-md border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent">Edit</button>
        <button onClick={() => onDelete(webinar.id)} className="rounded-md px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10">Delete</button>
      </div>
    </div>
  );
}
