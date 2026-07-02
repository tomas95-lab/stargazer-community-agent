import { useState, useEffect } from 'react';
import { api } from '../api';

const LINK_LABELS: Record<string, string> = {
  guidelines: 'Guidelines',
  templatesZip: 'Stargazer Templates ZIP',
  warRoom: 'War Room',
  validationScript: 'Validation Script',
  stargazerEval: 'Stargazer Eval',
  commonErrorsDocument: 'Common Errors Document',
};

export default function LinkManager() {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLinks().then((l) => { setLinks(l); setLoading(false); });
  }, []);

  const handleSave = async () => {
    await api.updateLinks(links);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500';
  const labelCls = 'block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1';

  if (loading) return <div className="text-gray-500 text-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Link Manager</h1>
          <p className="text-gray-400 text-sm mt-1">Project links used in templates. Edit without touching code.</p>
        </div>
        <button
          onClick={handleSave}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition-colors"
        >
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
        {Object.entries(LINK_LABELS).map(([key, label]) => (
          <div key={key}>
            <label className={labelCls}>{label}</label>
            <div className="flex gap-2">
              <input
                value={links[key] || ''}
                onChange={(e) => setLinks((p) => ({ ...p, [key]: e.target.value }))}
                className={inputCls}
                placeholder="https://..."
              />
              {links[key] && (
                <a
                  href={links[key]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors shrink-0"
                >
                  Open
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Quick Copy</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(LINK_LABELS).map(([key, label]) => (
            links[key] ? (
              <button
                key={key}
                onClick={() => navigator.clipboard.writeText(links[key])}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
              >
                Copy {label}
              </button>
            ) : null
          ))}
        </div>
      </div>
    </div>
  );
}
