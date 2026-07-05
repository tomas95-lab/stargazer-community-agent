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

  const inputCls = 'sg-input cursor-not-allowed px-3 py-2 text-sm text-muted-foreground';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <span className="rounded-full border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">Environment managed</span>
      </div>

      <div className="sg-panel space-y-4 p-6">
        {Object.entries(LABELS).map(([key, label]) => (
          <div key={key}>
            <label className="sg-label mb-1 block">{label}</label>
            <input
              type={key === 'DISCOURSE_API_KEY' ? 'password' : 'text'}
              value={config[key] || ''}
              readOnly
              className={inputCls}
            />
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">Settings are read from server environment variables.</p>
    </div>
  );
}
