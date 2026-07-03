import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type CommunityAgentDecision,
  type CommunityAgentItem,
  type CommunityAgentOverview,
  type CommunityAgentResult,
} from '../api';

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function Badge({ children, tone }: { children: string; tone: 'green' | 'yellow' | 'gray' | 'blue' | 'red' }) {
  const cls = {
    green: 'bg-green-900/40 text-green-300 border-green-700/50',
    yellow: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
    gray: 'bg-gray-800 text-gray-300 border-gray-700',
    blue: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/50',
    red: 'bg-red-900/40 text-red-300 border-red-700/50',
  }[tone];

  return <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${cls}`}>{children}</span>;
}

function ItemRow({ item }: { item: CommunityAgentItem }) {
  return (
    <div className="border-b border-gray-800 last:border-0 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Badge tone={item.source === 'dm' ? 'yellow' : 'blue'}>{item.source === 'dm' ? 'DM' : 'Community'}</Badge>
          <span className="text-sm font-semibold text-white truncate">{item.username}</span>
          {item.title && <span className="text-xs text-gray-500 truncate">{item.title}</span>}
        </div>
        <span className="text-xs text-gray-600 shrink-0">{new Date(item.createdAt).toLocaleTimeString()}</span>
      </div>
      <p className="text-sm text-gray-400 mt-2 line-clamp-3">{item.message}</p>
      {item.url && (
        <a href={item.url} target="_blank" rel="noopener" className="text-xs text-indigo-400 hover:underline mt-2 inline-block">
          Open DM
        </a>
      )}
    </div>
  );
}

function DecisionCard({ decision }: { decision: CommunityAgentDecision }) {
  const tone = decision.error
    ? 'red'
    : decision.action === 'reply'
      ? 'green'
      : decision.action === 'human'
        ? 'yellow'
        : 'gray';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone={decision.source === 'dm' ? 'yellow' : 'blue'}>{decision.source === 'dm' ? 'DM' : 'Community'}</Badge>
            <Badge tone={tone}>{decision.error ? 'Error' : decision.action}</Badge>
            {decision.posted && <Badge tone="green">Posted</Badge>}
          </div>
          <p className="text-white font-semibold mt-2">{decision.username}</p>
        </div>
        <span className="text-xs text-gray-500">{Math.round(decision.confidence * 100)}%</span>
      </div>

      <p className="text-sm text-gray-400">{decision.message}</p>

      {decision.reply && (
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Claude reply</p>
          <p className="text-sm text-gray-200 whitespace-pre-wrap">{decision.reply}</p>
        </div>
      )}

      <p className="text-xs text-gray-500">{decision.error || decision.reason}</p>
    </div>
  );
}

export default function CommunityAgent() {
  const [overview, setOverview] = useState<CommunityAgentOverview | null>(null);
  const [result, setResult] = useState<CommunityAgentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [includeDms, setIncludeDms] = useState(true);
  const [includeCommunity, setIncludeCommunity] = useState(true);
  const [skipProcessed, setSkipProcessed] = useState(true);
  const [post, setPost] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    api.getCommunityAgentOverview({ includeDms, includeCommunity, messageCount: 50 })
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    const items = overview?.items || [];
    return {
      dms: items.filter((item) => item.source === 'dm').length,
      community: items.filter((item) => item.source === 'community').length,
    };
  }, [overview]);

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const next = await api.runCommunityAgent({
        post,
        includeDms,
        includeCommunity,
        skipProcessed,
        markProcessed: post,
        maxAnswers: 4,
        messageCount: 50,
      });
      setResult(next);
      await api.getCommunityAgentOverview({ includeDms, includeCommunity, messageCount: 50 }).then(setOverview);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Community Agent</h1>
          <p className="text-sm text-gray-500 mt-1">{overview?.window.operatingHours || '10:00-19:00 America/Argentina/Buenos_Aires'}</p>
        </div>
        <button
          onClick={load}
          disabled={loading || running}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 font-semibold rounded-lg text-sm transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Date" value={overview?.window.argentinaDate || '-'} sub="ARG" />
        <Stat label="Guideline" value={overview?.guidelines.available ? 'Ready' : 'Missing'} sub={overview ? `${overview.guidelines.characters} chars` : ''} />
        <Stat label="DMs" value={counts.dms} sub="unread today" />
        <Stat label="Community" value={counts.community} sub="today" />
        <Stat label="Candidates" value={overview?.candidates.length || 0} sub="Claude check" />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={includeCommunity} onChange={(e) => setIncludeCommunity(e.target.checked)} className="accent-indigo-600" />
            Community
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={includeDms} onChange={(e) => setIncludeDms(e.target.checked)} className="accent-indigo-600" />
            DMs
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={skipProcessed} onChange={(e) => setSkipProcessed(e.target.checked)} className="accent-indigo-600" />
            Skip processed
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={post} onChange={(e) => setPost(e.target.checked)} className="accent-indigo-600" />
            Post safe replies
          </label>
        </div>

        <button
          onClick={run}
          disabled={running || loading || (!includeCommunity && !includeDms)}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
        >
          {running ? 'Running Claude...' : 'Run Claude'}
        </button>
      </div>

      {error && <div className="bg-red-950/40 border border-red-900 text-red-300 rounded-xl p-4 text-sm">{error}</div>}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Claude Decisions</h2>
            <p className="text-xs text-gray-500">
              {result.handled} handled · {result.posted} posted · {result.needsHuman} human
            </p>
          </div>
          {result.decisions.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-gray-500 text-sm">No pending candidates for Claude.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {result.decisions.map((decision) => (
                <DecisionCard key={decision.itemId} decision={decision} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-white">Today Inbox</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : overview && overview.items.length > 0 ? (
            overview.items.map((item) => <ItemRow key={item.id} item={item} />)
          ) : (
            <p className="text-gray-500 text-sm">No messages found for today.</p>
          )}
        </div>
      </div>

      {overview?.errors.length ? (
        <div className="bg-yellow-950/30 border border-yellow-900/70 rounded-xl p-4 space-y-1">
          {overview.errors.map((item) => (
            <p key={item} className="text-xs text-yellow-300">{item}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
