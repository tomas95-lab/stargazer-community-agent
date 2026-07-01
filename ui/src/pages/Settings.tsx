import { useState, useEffect } from 'react';
import { api } from '../api';

const LABELS: Record<string, string> = {
  HEADLESS: 'Headless Mode',
  SLOW_MO: 'Slow Motion (ms)',
  COMMUNITY_BASE_URL: 'Community Base URL',
  COMMUNITY_NEW_TOPIC_URL: 'New Topic URL',
  COMMUNITY_CATEGORY_ID: 'Category ID',
  COMMUNITY_CATEGORY_SLUG: 'Category Slug',
  COMMUNITY_CHAT_URL: 'Chat URL',
  BROWSER_PROFILE_PATH: 'Browser Profile Path',
};

export default function Settings() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.getConfig().then(setConfig); }, []);

  const handleSave = async () => {
    await api.updateConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <button
          onClick={handleSave}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition-colors"
        >
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        {Object.entries(LABELS).map(([key, label]) => (
          <div key={key}>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</label>
            {key === 'HEADLESS' ? (
              <select
                value={config[key] || 'false'}
                onChange={(e) => setConfig((p) => ({ ...p, [key]: e.target.value }))}
                className={inputCls}
              >
                <option value="false">No (show browser)</option>
                <option value="true">Yes (headless)</option>
              </select>
            ) : (
              <input
                value={config[key] || ''}
                onChange={(e) => setConfig((p) => ({ ...p, [key]: e.target.value }))}
                className={inputCls}
              />
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-600">These settings are saved to the .env file. The server must be restarted for some changes to take effect.</p>
    </div>
  );
}
