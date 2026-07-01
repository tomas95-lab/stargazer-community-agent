import { useState, useEffect } from 'react';
import { api, type Topic, type PreviewData } from '../api';
import Preview from '../components/Preview';
import PublishButton from '../components/PublishButton';

export default function Dashboard() {
  const [date, setDate] = useState('');
  const [topic, setTopic] = useState<Topic | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'thread' | 'announcement'>('thread');

  useEffect(() => {
    api.getToday().then((res) => {
      setDate(res.date);
      setTopic(res.topic);
      if (res.topic) {
        api.getPreview(res.date).then(setPreview).catch(() => {});
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-gray-500 text-center py-12">Loading...</div>;

  if (!topic) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-2xl font-bold text-gray-300">No topic for today</p>
        <p className="text-gray-500">{date}</p>
        <p className="text-gray-600 text-sm">Go to Topics to create one for today's date.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{preview?.title || topic.title}</h1>
          <p className="text-gray-400 text-sm mt-1">{date} &middot; {topic.topic}</p>
        </div>
        <PublishButton date={date} />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 grid grid-cols-3 gap-6 text-sm">
        <div>
          <span className="text-gray-500 uppercase text-xs font-semibold">Quick Rule</span>
          <p className="text-gray-200 mt-1">{topic.quickRule}</p>
        </div>
        <div>
          <span className="text-gray-500 uppercase text-xs font-semibold">Reminder</span>
          <p className="text-gray-200 mt-1">{topic.reminderTitle}</p>
        </div>
        <div>
          <span className="text-gray-500 uppercase text-xs font-semibold">Tags</span>
          <div className="flex gap-1 mt-1 flex-wrap">
            {(topic.tags || []).map((t) => (
              <span key={t} className="px-2 py-0.5 bg-indigo-900/50 text-indigo-300 text-xs rounded-full">{t}</span>
            ))}
          </div>
        </div>
      </div>

      {preview && (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => setTab('thread')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'thread' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              Thread Preview
            </button>
            <button
              onClick={() => setTab('announcement')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'announcement' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              Announcement Preview
            </button>
          </div>
          <Preview
            content={tab === 'thread' ? preview.thread : preview.announcement}
            label={tab === 'thread' ? 'Daily Thread' : 'Chat Announcement'}
          />
        </>
      )}
    </div>
  );
}
