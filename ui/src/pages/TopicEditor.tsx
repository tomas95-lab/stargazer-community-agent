import { useState, useEffect } from 'react';
import { api, type Topic } from '../api';
import TopicForm from '../components/TopicForm';
import Preview from '../components/Preview';

export default function TopicEditor() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selected, setSelected] = useState<Topic | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewData, setPreviewData] = useState<{ thread: string; announcement: string } | null>(null);

  const load = () => api.getTopics().then(setTopics);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Topics</h1>
        <button
          onClick={() => { setCreating(true); setSelected(null); setPreviewData(null); }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition-colors"
        >
          + New Topic
        </button>
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

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs uppercase text-gray-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Topic</th>
              <th className="px-4 py-3">Tags</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr
                key={t.date}
                className={`border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors ${t.date === today ? 'bg-indigo-900/10' : ''}`}
              >
                <td className="px-4 py-3 font-mono text-gray-300">
                  {t.date}
                  {t.date === today && <span className="ml-2 text-xs text-indigo-400 font-semibold">TODAY</span>}
                </td>
                <td className="px-4 py-3 text-gray-200">{t.title}</td>
                <td className="px-4 py-3 text-gray-400">{t.topic}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {(t.tags || []).map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded-full">{tag}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => handlePreview(t.date)} className="text-gray-400 hover:text-indigo-400 text-xs">Preview</button>
                  <button onClick={() => { setSelected(t); setCreating(false); setPreviewData(null); }} className="text-gray-400 hover:text-white text-xs">Edit</button>
                  <button onClick={() => handleDelete(t.date)} className="text-gray-400 hover:text-red-400 text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
