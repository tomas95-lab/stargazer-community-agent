import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Topic, type PreviewData, type Webinar } from '../api';
import Preview from '../components/Preview';
import PublishButton from '../components/PublishButton';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
      <p className="text-3xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function NextWebinarCard({ webinar }: { webinar: Webinar }) {
  const dt = new Date(`${webinar.date}T${webinar.timeUtc}:00Z`);
  const diffMs = dt.getTime() - Date.now();
  const diffH = Math.floor(diffMs / 1000 / 60 / 60);
  const diffD = Math.floor(diffH / 24);
  const timeLeft = diffD > 0 ? `in ${diffD}d ${diffH % 24}h` : diffH > 0 ? `in ${diffH}h` : 'soon';

  return (
    <div className="bg-indigo-900/20 border border-indigo-700/50 rounded-2xl p-5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-indigo-400 uppercase tracking-wider font-semibold">Next Webinar</p>
        <span className="text-xs bg-indigo-600/30 text-indigo-300 px-2 py-0.5 rounded-full">{timeLeft}</span>
      </div>
      <p className="text-white font-semibold">{webinar.title}</p>
      <p className="text-gray-400 text-sm">{webinar.date} · {webinar.timeLabel}</p>
      <a href={webinar.link} target="_blank" rel="noopener" className="text-indigo-400 text-xs hover:underline truncate block">
        {webinar.link}
      </a>
      {webinar.invitees.length > 0 && (
        <p className="text-gray-500 text-xs">{webinar.invitees.length} invitee{webinar.invitees.length > 1 ? 's' : ''}</p>
      )}
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700 hover:border-gray-600 rounded-2xl p-4 transition-all text-center"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs text-gray-400 font-medium">{label}</span>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [date, setDate] = useState('');
  const [topic, setTopic] = useState<Topic | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [allTopics, setAllTopics] = useState<Topic[]>([]);
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'thread' | 'announcement'>('thread');

  useEffect(() => {
    Promise.all([
      api.getToday(),
      api.getTopics(),
      api.getWebinars(),
    ]).then(([today, topics, wbns]) => {
      setDate(today.date);
      setTopic(today.topic);
      setAllTopics(topics);
      setWebinars(wbns);
      if (today.topic) {
        api.getPreview(today.date).then(setPreview).catch(() => {});
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const nextWebinar = webinars
    .filter((w) => new Date(`${w.date}T${w.timeUtc}:00Z`) > new Date())
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const upcomingTopics = allTopics.filter((t) => t.date >= date).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Stargazer Comms</h1>
          <p className="text-gray-400 text-sm mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <a
          href="https://github.com/tomasruiz653/community_bot/actions"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-gray-300 text-sm transition-colors"
        >
          <span>⚙️</span> GitHub Actions
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Today" value={topic ? '✓ Ready' : '✗ Missing'} sub={date} />
        <StatCard label="Upcoming Topics" value={upcomingTopics} sub="scheduled" />
        <StatCard label="Webinars" value={webinars.length} sub="total scheduled" />
        <StatCard label="Auto-Publish" value="9:30 AM" sub="Mon–Fri via GitHub" />
      </div>

      {nextWebinar && <NextWebinarCard webinar={nextWebinar} />}

      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Quick Actions</p>
        <div className="grid grid-cols-4 gap-3">
          <QuickAction icon="📝" label="Manage Topics" onClick={() => navigate('/topics')} />
          <QuickAction icon="💬" label="Send a Comm" onClick={() => navigate('/comms')} />
          <QuickAction icon="🎯" label="Schedule Webinar" onClick={() => navigate('/webinars')} />
          <QuickAction icon="🔗" label="Edit Links" onClick={() => navigate('/links')} />
        </div>
      </div>

      {!topic && (
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-2xl p-6 flex items-start gap-4">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-yellow-300 font-semibold">No topic for today ({date})</p>
            <p className="text-yellow-500/80 text-sm mt-1">The bot won't publish anything at 9:30 AM — it will use the first available topic as fallback.</p>
            <button onClick={() => navigate('/topics')} className="mt-3 text-sm text-yellow-400 hover:text-yellow-300 underline">
              Create today's topic →
            </button>
          </div>
        </div>
      )}

      {topic && (
        <div className="space-y-4">
          <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Today's Thread</p>
                <h2 className="text-xl font-bold text-white">{preview?.title || topic.title}</h2>
                <p className="text-gray-400 text-sm">{topic.topic}</p>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {(topic.tags || []).map((t) => (
                    <span key={t} className="px-2 py-0.5 bg-indigo-900/50 text-indigo-300 text-xs rounded-full">{t}</span>
                  ))}
                </div>
              </div>
              <div className="shrink-0">
                <PublishButton date={date} />
              </div>
            </div>
          </div>

          {preview && (
            <div className="space-y-3">
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
                  Announcement
                </button>
              </div>
              <Preview
                content={tab === 'thread' ? preview.thread : preview.announcement}
                label={tab === 'thread' ? 'Daily Thread' : 'Chat Announcement'}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
