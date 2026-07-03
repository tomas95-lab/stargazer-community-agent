import { useState, useEffect } from 'react';
import { api } from '../api';

const LABELS: Record<string, string> = {
  COMMUNITY_BASE_URL: 'Community Base URL',
  COMMUNITY_CATEGORY_ID: 'Category ID',
  COMMUNITY_CATEGORY_SLUG: 'Category Slug',
  COMMUNITY_CHAT_CHANNEL_ID: 'Chat Channel ID',
  DISCOURSE_API_KEY: 'Discourse API Key',
  DISCOURSE_API_CLIENT_ID: 'Discourse API Client ID',
  DISCOURSE_USERNAME: 'Discourse Username',
  DATA_STORE_REQUESTED: 'Data Store Requested',
  DATA_STORE_ACTIVE: 'Data Store Active',
  ANTHROPIC_CONFIGURED: 'Claude Configured',
  ANTHROPIC_MODEL: 'Claude Model',
  CRON_CONFIGURED: 'Cron Configured',
  AGENT_AUTO_POST: 'Agent Auto Post',
};

export default function Settings() {
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getConfig().then(setConfig);
  }, []);

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400 cursor-not-allowed';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <span className="px-3 py-1 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-500">Environment managed</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        {Object.entries(LABELS).map(([key, label]) => (
          <div key={key}>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</label>
            <input
              type={key === 'DISCOURSE_API_KEY' ? 'password' : 'text'}
              value={config[key] || ''}
              readOnly
              className={inputCls}
            />
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-600">Settings are read from server environment variables.</p>
    </div>
  );
}
