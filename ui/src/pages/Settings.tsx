import { useState, useEffect } from 'react';
import { api, adminAuth } from '../api';

const LABELS: Record<string, string> = {
  COMMUNITY_BASE_URL: 'Community Base URL',
  COMMUNITY_CATEGORY_ID: 'Category ID',
  COMMUNITY_CATEGORY_SLUG: 'Category Slug',
  COMMUNITY_CHAT_CHANNEL_ID: 'Chat Channel ID',
  DISCOURSE_API_KEY: 'Discourse API Key',
  DISCOURSE_API_CLIENT_ID: 'Discourse API Client ID',
  DISCOURSE_USERNAME: 'Discourse Username',
  ADMIN_AUTH_CONFIGURED: 'Admin Auth Configured',
  DATA_STORE_REQUESTED: 'Data Store Requested',
  DATA_STORE_ACTIVE: 'Data Store Active',
  ANTHROPIC_CONFIGURED: 'Claude Configured',
  ANTHROPIC_MODEL: 'Claude Model',
  CRON_CONFIGURED: 'Cron Configured',
  AGENT_AUTO_POST: 'Agent Auto Post',
};

export default function Settings() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [adminToken, setAdminToken] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);

  useEffect(() => {
    api.getConfig().then(setConfig);
    setAdminToken(adminAuth.getToken());
  }, []);

  const saveAdminToken = () => {
    adminAuth.setToken(adminToken);
    setAdminToken(adminAuth.getToken());
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);
  };

  const clearAdminToken = () => {
    adminAuth.clearToken();
    setAdminToken('');
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);
  };

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400 cursor-not-allowed';
  const editableInputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <span className="px-3 py-1 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-500">Environment managed</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Admin Token</label>
          <input
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            className={editableInputCls}
            placeholder="Stored locally in this browser"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={saveAdminToken}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition-colors"
          >
            Save token
          </button>
          <button
            onClick={clearAdminToken}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold rounded-lg text-sm transition-colors"
          >
            Clear
          </button>
          {tokenSaved && <span className="text-xs text-green-400">Updated</span>}
        </div>

        <p className="text-xs text-gray-600">
          Required for publishing, sending chat messages, syncing, and editing data. It must match the server `ADMIN_TOKEN`.
        </p>
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

      <p className="text-xs text-gray-600">Settings are read from server environment variables. Saving editable config is intentionally disabled until the admin/auth layer is added.</p>
    </div>
  );
}
