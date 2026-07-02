import { useEffect, useState } from 'react';
import { api, Webinar } from '../api';

const EMPTY: Omit<Webinar, 'id'> = {
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
    setForm({ title: w.title, date: w.date, timeUtc: w.timeUtc, timeLabel: w.timeLabel, link: w.link, invitees: w.invitees });
    setInviteesRaw(w.invitees.join('\n'));
    setEditingId(w.id);
  };

  const save = async () => {
    if (!form.title || !form.date || !form.timeUtc || !form.link) {
      setError('Title, date, time (UTC) and link are required.');
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
    .filter((w) => new Date(`${w.date}T${w.timeUtc}:00Z`) >= new Date())
    .sort((a, b) => a.date.localeCompare(b.date));

  const past = webinars
    .filter((w) => new Date(`${w.date}T${w.timeUtc}:00Z`) < new Date())
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Webinar Scheduler</h1>
        <p className="text-gray-400 text-sm mt-1">Schedule webinars — reminder auto-sends 1 hour before via GitHub Actions.</p>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">{editingId ? 'Edit Webinar' : 'Schedule New Webinar'}</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Title</label>
            <input
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="Alignment Webinar"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Date</label>
            <input
              type="date"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Time (UTC)</label>
            <input
              type="time"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              value={form.timeUtc}
              onChange={(e) => setForm({ ...form, timeUtc: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-1">ARG is UTC-3. 12:30 PM ARG = 15:30 UTC</p>
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Time Label (display)</label>
            <input
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="e.g. 12:30 PM ARG"
              value={form.timeLabel}
              onChange={(e) => setForm({ ...form, timeLabel: e.target.value })}
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Zoom Link</label>
            <input
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="https://zoom.us/j/..."
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Invited Contributors <span className="text-gray-500">(one per line, optional)</span></label>
            <textarea
              rows={4}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm font-mono resize-none"
              placeholder="@name1&#10;@name2"
              value={inviteesRaw}
              onChange={(e) => setInviteesRaw(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : editingId ? 'Update' : 'Schedule'}
          </button>
          {editingId && (
            <button onClick={reset} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg">
              Cancel
            </button>
          )}
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Upcoming</h2>
          {upcoming.map((w) => (
            <WebinarCard key={w.id} webinar={w} onEdit={startEdit} onDelete={remove} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Past</h2>
          {past.map((w) => (
            <WebinarCard key={w.id} webinar={w} onEdit={startEdit} onDelete={remove} dim />
          ))}
        </div>
      )}

      {webinars.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-8">No webinars scheduled yet.</p>
      )}
    </div>
  );
}

function WebinarCard({ webinar, onEdit, onDelete, dim }: { webinar: Webinar; onEdit: (w: Webinar) => void; onDelete: (id: string) => void; dim?: boolean }) {
  return (
    <div className={`bg-gray-800 border rounded-xl p-4 flex items-start justify-between gap-4 ${dim ? 'border-gray-700 opacity-50' : 'border-gray-600'}`}>
      <div className="space-y-1 min-w-0">
        <p className="text-white font-medium">{webinar.title}</p>
        <p className="text-gray-400 text-sm">{webinar.date} · {webinar.timeLabel}</p>
        <p className="text-indigo-400 text-xs truncate">{webinar.link}</p>
        {webinar.invitees.length > 0 && (
          <p className="text-gray-500 text-xs">{webinar.invitees.length} invitee{webinar.invitees.length > 1 ? 's' : ''}</p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={() => onEdit(webinar)} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg">Edit</button>
        <button onClick={() => onDelete(webinar.id)} className="px-3 py-1 bg-red-900/50 hover:bg-red-800 text-red-400 text-xs rounded-lg">Delete</button>
      </div>
    </div>
  );
}
